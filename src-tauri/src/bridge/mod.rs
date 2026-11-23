//! One command table for every transport.
//!
//! The desktop app calls these through Tauri commands; the browser dev mode calls them over a
//! WebSocket (`crate::web`). Both end up in [`dispatch`], so a feature is written once.

#[cfg(test)]
mod tests;

use std::sync::Arc;

use serde::Deserialize;
use serde_json::{json, Value};

use crate::app_info;
use crate::pty::PtyManager;

/// Every command name [`dispatch`] understands. Keep in step with `invoke_handler` in `lib.rs`.
pub const COMMANDS: &[&str] = &[
    "app_info",
    "pty_spawn",
    "pty_write",
    "pty_resize",
    "pty_kill",
];

/// Pushes an event to the client's channel number `channel`.
pub type EventSink = Arc<dyn Fn(u32, Value) + Send + Sync>;

/// The state commands work on.
#[derive(Default, Clone)]
pub struct Backend {
    pub pty: PtyManager,
}

/// What a command did besides its answer, so a transport can clean up after its client.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Effects {
    pub spawned_pty: Option<String>,
    pub killed_pty: Option<String>,
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

/// Run `cmd` with JSON `input`. Events for channels named in `input` go to `sink`.
pub fn dispatch(
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
        other => return Err(format!("unknown command {other}")),
    };
    Ok((answer, effects))
}
