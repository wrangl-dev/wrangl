//! A small MCP server (stdio, newline-delimited JSON-RPC) that gives agents the chain tools.
//!
//! Wrangl starts it for every chat as `<wrangl executable> --mcp`, and passes it to the agent in
//! `session/new`, so any ACP agent can read Robinhood Chain without its own setup.

use std::future::Future;

use schemars::JsonSchema;
use serde_json::{json, Value};
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncWrite, AsyncWriteExt};

use super::client::{self, Sources};
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

/// Every tool this server lists.
#[must_use]
pub fn tool_specs() -> Vec<Value> {
    ALL.into_iter().map(tool_spec).collect()
}

fn tool_named(name: &str) -> Option<ChainTool> {
    ALL.into_iter().find(|t| t.name() == name)
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
    R: FnOnce(ChainTool, Value) -> F,
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
pub async fn serve<I, O>(input: I, mut output: O, sources: Sources) -> std::io::Result<()>
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
            Ok(message) => handle(&message, |tool, args| client::run(&sources, tool, args)).await,
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
    ))
}
