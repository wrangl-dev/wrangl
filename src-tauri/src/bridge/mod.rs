//! One command table for every transport.
//!
//! The desktop app calls these through one Tauri command (`bridge` in `lib.rs`); the browser dev
//! mode calls them over a WebSocket (`crate::web`). Both end up in [`dispatch`], so a feature is
//! written once.

#[cfg(test)]
mod tests;

use std::sync::Arc;

use serde::Deserialize;
use serde_json::{json, Value};

use crate::agents::registry::{current_platform, launch_for};
use crate::agents::session::{AgentEvent, AgentSessions};
use crate::agents::{install, RegistryStore};
use crate::app_info;
use crate::pty::PtyManager;

/// Every command name [`dispatch`] understands.
pub const COMMANDS: &[&str] = &[
    "app_info",
    "pty_spawn",
    "pty_write",
    "pty_resize",
    "pty_kill",
    "agent_list",
    "agent_start",
    "agent_prompt",
    "agent_cancel",
    "agent_permission",
    "agent_authenticate",
    "agent_stop",
    "agent_login",
];

/// Pushes an event to the client's channel number `channel`.
pub type EventSink = Arc<dyn Fn(u32, Value) + Send + Sync>;

/// The state commands work on.
#[derive(Default, Clone)]
pub struct Backend {
    pub pty: PtyManager,
    pub agents: RegistryStore,
    pub chats: AgentSessions,
}

/// What a command did besides its answer, so a transport can clean up after its client.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Effects {
    pub spawned_pty: Option<String>,
    pub killed_pty: Option<String>,
    pub started_chat: Option<String>,
    pub stopped_chat: Option<String>,
}

/// Tauri serialises a `Channel` argument as `"__CHANNEL__:<id>"`; the browser client does too.
pub fn parse_channel(value: &Value) -> Result<u32, String> {
    value
        .as_str()
        .and_then(|s| s.strip_prefix("__CHANNEL__:"))
        .and_then(|n| n.parse().ok())
        .ok_or_else(|| format!("expected a channel, got {value}"))
}

fn args<T: for<'de> Deserialize<'de>>(cmd: &str, value: Value) -> Result<T, String> {
    serde_json::from_value(value).map_err(|e| format!("{cmd}: bad arguments: {e}"))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpawnArgs {
    cols: u16,
    rows: u16,
    #[serde(default)]
    cwd: Option<String>,
    on_event: Value,
}

#[derive(Deserialize)]
struct WriteArgs {
    id: String,
    data: String,
}

#[derive(Deserialize)]
struct ResizeArgs {
    id: String,
    cols: u16,
    rows: u16,
}

#[derive(Deserialize)]
struct KillArgs {
    id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartArgs {
    agent_id: String,
    cwd: String,
    on_event: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatArgs {
    session_id: String,
    #[serde(default)]
    text: String,
    #[serde(default)]
    request_id: String,
    #[serde(default)]
    option_id: Option<String>,
    #[serde(default)]
    method_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginArgs {
    session_id: String,
    method_id: String,
    cols: u16,
    rows: u16,
    on_event: Value,
}

#[derive(Deserialize, Default)]
struct AgentListArgs {
    #[serde(default)]
    refresh: bool,
}

/// Run `cmd` with JSON `input`. Events for channels named in `input` go to `sink`.
pub async fn dispatch(
    backend: &Backend,
    cmd: &str,
    input: Value,
    sink: &EventSink,
) -> Result<(Value, Effects), String> {
    let mut effects = Effects::default();
    let answer = match cmd {
        "app_info" => serde_json::to_value(app_info::current()).map_err(|e| e.to_string())?,
        "pty_spawn" => {
            let a: SpawnArgs = args(cmd, input)?;
            let channel = parse_channel(&a.on_event)?;
            let sink = Arc::clone(sink);
            let id = backend.pty.spawn_shell(
                a.cols,
                a.rows,
                a.cwd.map(std::path::PathBuf::from),
                move |event| match serde_json::to_value(&event) {
                    Ok(v) => sink(channel, v),
                    Err(e) => log::warn!("[bridge] could not encode a terminal event: {e}"),
                },
            )?;
            effects.spawned_pty = Some(id.clone());
            json!(id)
        }
        "pty_write" => {
            let a: WriteArgs = args(cmd, input)?;
            backend.pty.write(&a.id, &a.data)?;
            Value::Null
        }
        "pty_resize" => {
            let a: ResizeArgs = args(cmd, input)?;
            backend.pty.resize(&a.id, a.cols, a.rows)?;
            Value::Null
        }
        "pty_kill" => {
            let a: KillArgs = args(cmd, input)?;
            backend.pty.kill(&a.id);
            effects.killed_pty = Some(a.id);
            Value::Null
        }
        "agent_list" => {
            let a: AgentListArgs = if input.is_null() {
                AgentListArgs::default()
            } else {
                args(cmd, input)?
            };
            let list = backend.agents.list(a.refresh).await?;
            serde_json::to_value(list).map_err(|e| e.to_string())?
        }
        "agent_start" => {
            let a: StartArgs = args(cmd, input)?;
            let channel = parse_channel(&a.on_event)?;
            let cwd = std::path::PathBuf::from(&a.cwd);
            if !cwd.is_dir() {
                return Err(format!("{} is not a folder", a.cwd));
            }
            let registry = backend.agents.load(false).await?;
            let agent = registry
                .agents
                .iter()
                .find(|x| x.id == a.agent_id)
                .ok_or_else(|| format!("no agent {} in the registry", a.agent_id))?;
            let launch = launch_for(agent, &current_platform())
                .ok_or_else(|| format!("{} has no build for this computer", agent.name))?;
            let root = crate::paths::data_dir()
                .ok_or_else(|| "no data folder to install agents into".to_string())?;
            let sink = Arc::clone(sink);
            let emit = move |event: AgentEvent| {
                sink(channel, serde_json::to_value(&event).unwrap_or(Value::Null));
            };
            let installing = emit.clone();
            let line =
                install::command_line(&root, &agent.id, &agent.version, &launch, move || {
                    installing(AgentEvent::Status {
                        state: "installing".into(),
                    });
                })
                .await?;
            let id = backend.chats.start(line, cwd, Arc::new(emit));
            effects.started_chat = Some(id.clone());
            json!(id)
        }
        "agent_prompt" => {
            let a: ChatArgs = args(cmd, input)?;
            backend.chats.prompt(&a.session_id, a.text)?;
            Value::Null
        }
        "agent_cancel" => {
            let a: ChatArgs = args(cmd, input)?;
            backend.chats.cancel(&a.session_id)?;
            Value::Null
        }
        "agent_permission" => {
            let a: ChatArgs = args(cmd, input)?;
            backend
                .chats
                .respond_permission(&a.session_id, &a.request_id, a.option_id)?;
            Value::Null
        }
        "agent_authenticate" => {
            let a: ChatArgs = args(cmd, input)?;
            backend.chats.authenticate(&a.session_id, a.method_id)?;
            Value::Null
        }
        "agent_login" => {
            let a: LoginArgs = args(cmd, input)?;
            let channel = parse_channel(&a.on_event)?;
            let login = backend.chats.login_command(&a.session_id, &a.method_id)?;
            let mut command = portable_pty::CommandBuilder::new(&login.program);
            command.args(&login.args);
            for (k, v) in &login.env {
                command.env(k, v);
            }
            command.env("TERM", "xterm-256color");
            let sink = Arc::clone(sink);
            let id = backend.pty.spawn(command, a.cols, a.rows, move |event| {
                sink(channel, serde_json::to_value(&event).unwrap_or(Value::Null));
            })?;
            effects.spawned_pty = Some(id.clone());
            json!(id)
        }
        "agent_stop" => {
            let a: ChatArgs = args(cmd, input)?;
            backend.chats.stop(&a.session_id);
            effects.stopped_chat = Some(a.session_id);
            Value::Null
        }
        other => return Err(format!("unknown command {other}")),
    };
    Ok((answer, effects))
}
