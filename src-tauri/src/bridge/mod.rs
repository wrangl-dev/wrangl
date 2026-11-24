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
    "files_search",
    "portfolio_get",
    "watchlist_get",
    "watchlist_add",
    "watchlist_remove",
    "watchlist_alerts",
    "history_list",
    "history_load",
    "history_save",
    "history_delete",
    "agent_prompt",
    "agent_cancel",
    "agent_permission",
    "agent_authenticate",
    "agent_stop",
    "agent_login",
    "settings_get",
    "settings_set",
    "chain_test_rpc",
    "wallet_status",
    "wallet_open_signer",
    "wallet_disconnect",
    "wallet_reject",
];

/// Pushes an event to the client's channel number `channel`.
pub type EventSink = Arc<dyn Fn(u32, Value) + Send + Sync>;

/// The state commands work on.
#[derive(Default, Clone)]
pub struct Backend {
    pub pty: PtyManager,
    pub agents: RegistryStore,
    pub chats: AgentSessions,
    pub settings: crate::settings::SettingsStore,
    pub wallet: crate::wallet::WalletHandle,
    pub history: crate::history::HistoryStore,
    pub watchlist: crate::watchlist::WatchlistStore,
}

/// What a command did besides its answer, so a transport can clean up after its client.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Effects {
    pub spawned_pty: Option<String>,
    pub killed_pty: Option<String>,
    pub started_chat: Option<String>,
    pub stopped_chat: Option<String>,
}

/// The user's RPC and market key from Settings, else the public sources.
fn chain_sources(backend: &Backend) -> crate::chain::client::Sources {
    let saved = backend.settings.load();
    crate::chain::client::Sources::from_settings(
        saved.rpc_url().as_deref(),
        saved.coingecko_key().as_deref(),
    )
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
    /// The agent's session id from an earlier run, to continue that conversation.
    #[serde(default)]
    resume: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct WatchArgs {
    #[serde(default)]
    address: Option<String>,
    #[serde(default)]
    above: Option<f64>,
    #[serde(default)]
    below: Option<f64>,
}

#[derive(Deserialize)]
struct FilesSearchArgs {
    cwd: String,
    #[serde(default)]
    query: String,
}

#[derive(Deserialize)]
struct HistoryArgs {
    #[serde(default)]
    id: String,
    #[serde(default)]
    record: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatArgs {
    session_id: String,
    #[serde(default)]
    text: String,
    /// The project folder, to resolve `files` in.
    #[serde(default)]
    cwd: Option<String>,
    /// Project-relative paths mentioned with `@`.
    #[serde(default)]
    files: Vec<String>,
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
#[serde(rename_all = "camelCase")]
struct TestRpcArgs {
    /// A URL typed but not saved yet; missing tests the saved one (or the public RPC).
    #[serde(default)]
    rpc_url: Option<String>,
}

#[derive(Deserialize)]
struct WalletRejectArgs {
    id: String,
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
            let mut tool_env: Vec<(String, String)> = backend
                .settings
                .load()
                .tool_env()
                .into_iter()
                .map(|(k, v)| (k.to_string(), v))
                .collect();
            match backend.wallet.agent_endpoint() {
                Ok((url, token)) => {
                    tool_env.push((crate::chain::mcp::WALLET_URL_ENV.into(), url));
                    tool_env.push((crate::chain::mcp::WALLET_TOKEN_ENV.into(), token));
                }
                Err(e) => log::warn!("[wallet] tools start without the wallet: {e}"),
            }
            let id = backend
                .chats
                .start(line, cwd, tool_env, a.resume, Arc::new(emit));
            effects.started_chat = Some(id.clone());
            json!(id)
        }
        "files_search" => {
            let a: FilesSearchArgs = args(cmd, input)?;
            let root = std::path::PathBuf::from(&a.cwd);
            if !root.is_dir() {
                return Err(format!("{} is not a folder", a.cwd));
            }
            // Walking a big folder takes a moment; keep it off the async workers.
            let found = tokio::task::spawn_blocking(move || {
                crate::files::search(&root, &a.query, crate::files::RESULT_LIMIT)
            })
            .await
            .map_err(|e| e.to_string())?;
            json!(found)
        }
        "portfolio_get" => {
            let a: WatchArgs = if input.is_null() {
                WatchArgs::default()
            } else {
                args(cmd, input)?
            };
            let owner = a
                .address
                .or_else(|| backend.wallet.address())
                .ok_or_else(|| "connect a wallet first (Wallet in the sidebar)".to_string())?;
            let sources = chain_sources(backend);
            let mut tokens = crate::chain::portfolio::top_tokens_cached(&sources)
                .await
                .unwrap_or_else(|e| {
                    log::warn!("[portfolio] top tokens: {e}");
                    vec![]
                });
            for w in backend.watchlist.load() {
                if !tokens.iter().any(|t| t.address == w.address) {
                    tokens.push(crate::chain::portfolio::TokenInfo {
                        address: w.address,
                        symbol: w.symbol,
                        name: w.name,
                        decimals: w.decimals,
                    });
                }
            }
            serde_json::to_value(
                crate::chain::portfolio::portfolio(&sources, &owner, tokens).await?,
            )
            .map_err(|e| e.to_string())?
        }
        "watchlist_get" => {
            let items = backend.watchlist.load();
            let addresses: Vec<String> = items.iter().map(|i| i.address.clone()).collect();
            let (markets, market_error) = if addresses.is_empty() {
                (vec![], None)
            } else {
                match crate::chain::portfolio::markets(&chain_sources(backend), &addresses).await {
                    Ok(m) => (m, None),
                    Err(e) => {
                        log::warn!("[watchlist] market data: {e}");
                        (vec![], Some(e))
                    }
                }
            };
            json!({ "items": items, "markets": markets, "marketError": market_error })
        }
        "watchlist_add" => {
            let a: WatchArgs = args(cmd, input)?;
            let address = a
                .address
                .ok_or_else(|| "give a token address".to_string())?;
            let info =
                crate::chain::portfolio::token_info(&chain_sources(backend), &address).await?;
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_or(0, |d| u64::try_from(d.as_millis()).unwrap_or(0));
            json!(backend.watchlist.add(crate::watchlist::WatchItem {
                address: info.address,
                symbol: info.symbol,
                name: info.name,
                decimals: info.decimals,
                added_at: now,
                alert_above: None,
                alert_below: None,
            })?)
        }
        "watchlist_remove" => {
            let a: WatchArgs = args(cmd, input)?;
            let address = a
                .address
                .ok_or_else(|| "give a token address".to_string())?;
            json!(backend.watchlist.remove(&address)?)
        }
        "watchlist_alerts" => {
            let a: WatchArgs = args(cmd, input)?;
            let address = a
                .address
                .ok_or_else(|| "give a token address".to_string())?;
            json!(backend.watchlist.set_alerts(&address, a.above, a.below)?)
        }
        "history_list" => json!(backend.history.list()?),
        "history_load" => {
            let a: HistoryArgs = args(cmd, input)?;
            backend.history.load(&a.id)?
        }
        "history_save" => {
            let a: HistoryArgs = args(cmd, input)?;
            backend.history.save(&a.record)?;
            Value::Null
        }
        "history_delete" => {
            let a: HistoryArgs = args(cmd, input)?;
            backend.history.delete(&a.id)?;
            Value::Null
        }
        "agent_prompt" => {
            let a: ChatArgs = args(cmd, input)?;
            let mut files = vec![];
            if !a.files.is_empty() {
                let root = std::path::PathBuf::from(
                    a.cwd
                        .as_deref()
                        .ok_or_else(|| "files need the project folder".to_string())?,
                );
                for rel in &a.files {
                    let path = crate::files::resolve(&root, rel)?;
                    files.push((rel.clone(), crate::files::file_uri(&path)?));
                }
            }
            backend.chats.prompt(&a.session_id, a.text, files)?;
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
            backend.wallet.cancel_session(&a.session_id);
            effects.stopped_chat = Some(a.session_id);
            Value::Null
        }
        "settings_get" => {
            serde_json::to_value(backend.settings.load().view()).map_err(|e| e.to_string())?
        }
        "settings_set" => {
            let patch: crate::settings::SettingsPatch = args(cmd, input)?;
            let mut settings = backend.settings.load();
            settings.apply(patch)?;
            backend.settings.save(&settings)?;
            log::info!("[settings] saved; rpc set: {}", settings.view().rpc_url_set);
            serde_json::to_value(settings.view()).map_err(|e| e.to_string())?
        }
        "chain_test_rpc" => {
            let a: TestRpcArgs = if input.is_null() {
                TestRpcArgs::default()
            } else {
                args(cmd, input)?
            };
            let saved = backend.settings.load();
            let url = match a
                .rpc_url
                .map(|u| u.trim().to_string())
                .filter(|u| !u.is_empty())
            {
                Some(url) => {
                    crate::settings::validate_rpc_url(&url)?;
                    Some(url)
                }
                None => saved.rpc_url(),
            };
            let sources = crate::chain::client::Sources::from_settings(url.as_deref(), None);
            crate::chain::client::run(&sources, crate::chain::tools::ChainTool::Status, json!({}))
                .await?
        }
        "wallet_status" => {
            serde_json::to_value(backend.wallet.snapshot()).map_err(|e| e.to_string())?
        }
        "wallet_open_signer" => {
            backend.wallet.open_signer()?;
            Value::Null
        }
        "wallet_disconnect" => {
            backend.wallet.set_address(None)?;
            serde_json::to_value(backend.wallet.snapshot()).map_err(|e| e.to_string())?
        }
        "wallet_reject" => {
            let a: WalletRejectArgs = args(cmd, input)?;
            backend
                .wallet
                .resolve(&a.id, crate::wallet::TxOutcome::Rejected);
            serde_json::to_value(backend.wallet.snapshot()).map_err(|e| e.to_string())?
        }
        other => return Err(format!("unknown command {other}")),
    };
    Ok((answer, effects))
}
