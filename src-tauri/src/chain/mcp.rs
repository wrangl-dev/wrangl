//! A small MCP server (stdio, newline-delimited JSON-RPC) that gives agents the chain and
//! wallet tools.
//!
//! Wrangl starts it for every chat as `<wrangl executable> --mcp`, and passes it to the agent in
//! `session/new`, so any ACP agent can read Robinhood Chain without its own setup.

use std::future::Future;

use schemars::JsonSchema;
use serde_json::{json, Value};
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncWrite, AsyncWriteExt};

use super::client::{self, Sources};
use crate::wallet::tools::{
    WalletSendTransactionInput, WalletTool, ADDRESS_DESCRIPTION, SEND_TRANSACTION_DESCRIPTION,
};

use super::tools::{
    ChainBalanceInput, ChainCallInput, ChainNewPoolsInput, ChainTokenInput, ChainTool,
    ChainTxInput, BALANCE_DESCRIPTION, CALL_DESCRIPTION, NEW_POOLS_DESCRIPTION, STATUS_DESCRIPTION,
    TOKEN_DESCRIPTION, TX_DESCRIPTION,
};

/// The flag that runs a Wrangl executable as this server.
pub const MCP_FLAG: &str = "--mcp";
/// The server's name, as agents show it (tools appear as `wrangl` / `chain_*`).
pub const SERVER_NAME: &str = "wrangl";
const PROTOCOL_VERSION: &str = "2025-06-18";

/// Which chat this tool server belongs to (its proposals end with the chat).
pub const CHAT_ID_ENV: &str = "WRANGL_CHAT_ID";
/// The app's local signing server, and its secret, for the wallet tools.
pub const WALLET_URL_ENV: &str = "WRANGL_WALLET_URL";
pub const WALLET_TOKEN_ENV: &str = "WRANGL_WALLET_TOKEN";

/// A tool this server runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tool {
    Chain(ChainTool),
    Wallet(WalletTool),
}

impl Tool {
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::Chain(t) => t.name(),
            Self::Wallet(t) => t.name(),
        }
    }
}

const WALLET: [WalletTool; 2] = [WalletTool::Address, WalletTool::SendTransaction];

const ALL: [ChainTool; 6] = [
    ChainTool::Status,
    ChainTool::Token,
    ChainTool::Balance,
    ChainTool::Tx,
    ChainTool::NewPools,
    ChainTool::Call,
];

fn schema<T: JsonSchema>() -> Value {
    let mut s = serde_json::to_value(schemars::schema_for!(T)).unwrap_or_else(|_| json!({}));
    if let Some(obj) = s.as_object_mut() {
        obj.remove("$schema");
        obj.remove("title");
    }
    s
}

fn tool_spec(tool: ChainTool) -> Value {
    let (description, input_schema) = match tool {
        ChainTool::Status => (
            STATUS_DESCRIPTION,
            json!({ "type": "object", "properties": {} }),
        ),
        ChainTool::Token => (TOKEN_DESCRIPTION, schema::<ChainTokenInput>()),
        ChainTool::Balance => (BALANCE_DESCRIPTION, schema::<ChainBalanceInput>()),
        ChainTool::Tx => (TX_DESCRIPTION, schema::<ChainTxInput>()),
        ChainTool::NewPools => (NEW_POOLS_DESCRIPTION, schema::<ChainNewPoolsInput>()),
        ChainTool::Call => (CALL_DESCRIPTION, schema::<ChainCallInput>()),
    };
    json!({
        "name": tool.name(),
        "description": description,
        "inputSchema": input_schema,
        "annotations": { "readOnlyHint": true, "openWorldHint": true },
    })
}

fn wallet_spec(tool: WalletTool) -> Value {
    let (description, input_schema, read_only) = match tool {
        WalletTool::Address => (
            ADDRESS_DESCRIPTION,
            json!({ "type": "object", "properties": {} }),
            true,
        ),
        WalletTool::SendTransaction => (
            SEND_TRANSACTION_DESCRIPTION,
            schema::<WalletSendTransactionInput>(),
            false,
        ),
    };
    json!({
        "name": tool.name(),
        "description": description,
        "inputSchema": input_schema,
        "annotations": { "readOnlyHint": read_only, "openWorldHint": true },
    })
}

/// Every tool this server lists.
#[must_use]
pub fn tool_specs() -> Vec<Value> {
    ALL.into_iter()
        .map(tool_spec)
        .chain(WALLET.into_iter().map(wallet_spec))
        .collect()
}

fn tool_named(name: &str) -> Option<Tool> {
    ALL.into_iter()
        .map(Tool::Chain)
        .chain(WALLET.into_iter().map(Tool::Wallet))
        .find(|t| t.name() == name)
}

fn reply(id: &Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn error(id: &Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

/// Answer one JSON-RPC message. `None` for notifications. `run` executes a tool, so tests can
/// answer without the network.
pub async fn handle<R, F>(message: &Value, run: R) -> Option<Value>
where
    R: FnOnce(Tool, Value) -> F,
    F: Future<Output = Result<Value, String>>,
{
    let id = message.get("id")?.clone();
    let method = message["method"].as_str().unwrap_or_default();
    Some(match method {
        "initialize" => reply(
            &id,
            json!({
                "protocolVersion": message["params"]["protocolVersion"]
                    .as_str()
                    .unwrap_or(PROTOCOL_VERSION),
                "capabilities": { "tools": {} },
                "serverInfo": { "name": SERVER_NAME, "version": env!("CARGO_PKG_VERSION") },
                "instructions": "Read-only Robinhood Chain (chain id 4663) tools. Nothing here signs or sends a transaction; the user signs in their own wallet.",
            }),
        ),
        "ping" => reply(&id, json!({})),
        "tools/list" => reply(&id, json!({ "tools": tool_specs() })),
        "tools/call" => {
            let name = message["params"]["name"].as_str().unwrap_or_default();
            let Some(tool) = tool_named(name) else {
                return Some(error(&id, -32602, &format!("unknown tool {name}")));
            };
            let args = message["params"]["arguments"].clone();
            let args = if args.is_null() { json!({}) } else { args };
            // Tool failures are results the agent can read, not protocol errors.
            let (text, is_error) = match run(tool, args).await {
                Ok(v) => (serde_json::to_string_pretty(&v).unwrap_or_default(), false),
                Err(e) => (json!({ "error": e }).to_string(), true),
            };
            reply(
                &id,
                json!({ "content": [{ "type": "text", "text": text }], "isError": is_error }),
            )
        }
        other => error(&id, -32601, &format!("method not found: {other}")),
    })
}

/// Serve until `input` ends.
pub async fn serve<I, O>(
    input: I,
    mut output: O,
    sources: Sources,
    wallet: WalletLink,
) -> std::io::Result<()>
where
    I: AsyncBufRead + Unpin,
    O: AsyncWrite + Unpin,
{
    let mut lines = input.lines();
    while let Some(line) = lines.next_line().await? {
        if line.trim().is_empty() {
            continue;
        }
        let answer = match serde_json::from_str::<Value>(&line) {
            Ok(message) => {
                handle(&message, |tool, args| {
                    let (sources, wallet) = (&sources, &wallet);
                    async move {
                        match tool {
                            Tool::Chain(t) => client::run(sources, t, args).await,
                            Tool::Wallet(t) => wallet.run(t, args).await,
                        }
                    }
                })
                .await
            }
            Err(e) => Some(error(&Value::Null, -32700, &format!("parse error: {e}"))),
        };
        if let Some(answer) = answer {
            output.write_all(answer.to_string().as_bytes()).await?;
            output.write_all(b"\n").await?;
            output.flush().await?;
        }
    }
    Ok(())
}

/// Run this process as the MCP server on stdin/stdout, with settings from the environment.
pub fn run_stdio() -> std::io::Result<()> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;
    runtime.block_on(serve(
        tokio::io::BufReader::new(tokio::io::stdin()),
        tokio::io::stdout(),
        Sources::from_env(),
        WalletLink::from_env(),
    ))
}

/// The wallet tools' way to the app: its local signing server, with the secret Wrangl passed in.
#[derive(Debug, Clone, Default)]
pub struct WalletLink {
    url: Option<String>,
    token: String,
    chat_id: String,
}

/// How long a proposal may wait for the user to sign.
const SIGN_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30 * 60);

impl WalletLink {
    #[must_use]
    pub fn new(url: Option<String>, token: String, chat_id: String) -> Self {
        Self {
            url,
            token,
            chat_id,
        }
    }

    #[must_use]
    pub fn from_env() -> Self {
        Self::new(
            std::env::var(WALLET_URL_ENV).ok(),
            std::env::var(WALLET_TOKEN_ENV).unwrap_or_default(),
            std::env::var(CHAT_ID_ENV).unwrap_or_default(),
        )
    }

    /// Run a wallet tool through the app.
    pub async fn run(&self, tool: WalletTool, args: Value) -> Result<Value, String> {
        let url = self
            .url
            .as_deref()
            .ok_or("the wallet is only available inside Wrangl")?;
        let client = reqwest::Client::builder()
            .timeout(SIGN_TIMEOUT)
            .build()
            .map_err(|e| e.to_string())?;
        let request = match tool {
            WalletTool::Address => client.get(format!("{url}/agent/address")),
            WalletTool::SendTransaction => {
                let input: WalletSendTransactionInput =
                    serde_json::from_value(args).map_err(|e| format!("invalid arguments: {e}"))?;
                client
                    .post(format!("{url}/agent/propose"))
                    .json(&json!({ "chatId": self.chat_id, "input": input }))
            }
        };
        let response = request
            .header("x-wrangl-token", &self.token)
            .send()
            .await
            .map_err(|e| format!("could not reach Wrangl's wallet: {}", e.without_url()))?;
        let status = response.status();
        let body = response.text().await.map_err(|e| e.to_string())?;
        if status.is_success() {
            serde_json::from_str(&body).map_err(|e| format!("bad answer from Wrangl: {e}"))
        } else {
            Err(body)
        }
    }
}
