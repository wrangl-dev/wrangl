use serde_json::{json, Value};

use super::client::Sources;
use super::mcp::{handle, serve, tool_specs, Tool, WalletLink};
use super::tools::ChainTool;

async fn ask(message: Value) -> Option<Value> {
    handle(&message, |tool, args| async move {
        match tool {
            Tool::Chain(ChainTool::Status) => Ok(json!({ "chain_id": 4663 })),
            _ => Err(format!("{} got {args}", tool.name())),
        }
    })
    .await
}

#[test]
fn lists_chain_wallet_swap_and_research_tools() {
    let tools = tool_specs();
    let names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
    assert_eq!(
        names,
        [
            "chain_status",
            "chain_token",
            "chain_balance",
            "chain_tx",
            "chain_new_pools",
            "chain_call",
            "wallet_address",
            "wallet_send_transaction",
            "swap_quote",
            "swap_tokens",
            "token_search",
            "pools_trending",
            "pools_top",
            "launchpads",
            "launches",
            "pool_info",
            "pool_trades",
            "price_chart",
            "token_profile",
            "token_report",
            "pons_launch",
            "dev_launches"
        ]
    );
    for t in &tools {
        assert_eq!(t["inputSchema"]["type"], "object", "{t}");
        let proposes = t["name"] == "wallet_send_transaction" || t["name"] == "swap_tokens";
        assert_eq!(t["annotations"]["readOnlyHint"], !proposes, "{t}");
        assert!(t["description"].as_str().unwrap().len() > 40);
    }
    let send = &tools[7]["inputSchema"];
    assert_eq!(send["required"], json!(["to", "description"]));
    let token = &tools[1]["inputSchema"];
    assert!(token["properties"]["address"].is_object(), "{token}");
    assert_eq!(token["required"], json!(["address"]));
}

#[tokio::test]
async fn answers_initialize_list_and_calls() {
    let init = ask(json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": { "protocolVersion": "2025-03-26" } }))
    .await
    .unwrap();
    assert_eq!(init["result"]["protocolVersion"], "2025-03-26");
    assert_eq!(init["result"]["serverInfo"]["name"], "wrangl");
    assert!(init["result"]["capabilities"]["tools"].is_object());

    assert!(
        ask(json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }))
            .await
            .is_none(),
        "notifications get no answer"
    );

    let list = ask(json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }))
        .await
        .unwrap();
    assert_eq!(list["result"]["tools"].as_array().map(Vec::len), Some(22));

    let ok = ask(json!({ "jsonrpc": "2.0", "id": 3, "method": "tools/call",
        "params": { "name": "chain_status" } }))
    .await
    .unwrap();
    assert_eq!(ok["result"]["isError"], false);
    assert!(ok["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("4663"));

    let failed = ask(json!({ "jsonrpc": "2.0", "id": 4, "method": "tools/call",
        "params": { "name": "chain_tx", "arguments": { "hash": "0x1" } } }))
    .await
    .unwrap();
    assert_eq!(
        failed["result"]["isError"], true,
        "tool errors are readable results"
    );

    let unknown = ask(json!({ "jsonrpc": "2.0", "id": 5, "method": "tools/call",
        "params": { "name": "send_eth" } }))
    .await
    .unwrap();
    assert_eq!(unknown["error"]["code"], -32602);

    let missing = ask(json!({ "jsonrpc": "2.0", "id": 6, "method": "resources/list" }))
        .await
        .unwrap();
    assert_eq!(missing["error"]["code"], -32601);
}

#[tokio::test]
async fn serves_newline_delimited_json_until_input_ends() {
    let input = concat!(
        r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#,
        "\n\n",
        "not json\n",
        r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#,
        "\n"
    );
    let mut out = Vec::new();
    serve(
        input.as_bytes(),
        &mut out,
        Sources::public(),
        WalletLink::default(),
    )
    .await
    .unwrap();
    let lines: Vec<Value> = String::from_utf8(out)
        .unwrap()
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();
    assert_eq!(lines.len(), 3);
    assert_eq!(lines[0]["id"], 1);
    assert_eq!(lines[1]["error"]["code"], -32700);
    assert_eq!(
        lines[2]["result"]["tools"].as_array().map(Vec::len),
        Some(22)
    );
}

#[test]
fn settings_choose_the_sources() {
    assert_eq!(Sources::public().rpc_label(), "public");
    let own = Sources::from_settings(Some(" https://rpc.example/key "), Some("cg-key"));
    assert_eq!(own.rpc_label(), "your ROBINHOOD_RPC_URL");
    let junk = Sources::from_settings(Some("not a url"), Some("  "));
    assert_eq!(junk.rpc_label(), "public");
}

#[tokio::test]
async fn wallet_tools_explain_when_there_is_no_wrangl_to_ask() {
    let err = WalletLink::default()
        .run(crate::wallet::tools::WalletTool::Address, json!({}))
        .await
        .unwrap_err();
    assert!(err.contains("only available inside Wrangl"), "{err}");
}
