//! `Chain` frames: the read-only Robinhood Chain tools. Chain reads go to
//! the calling project's `ROBINHOOD_RPC_URL` secret when it is set, else to
//! the public RPC; market reads go to GeckoTerminal, or to CoinGecko's
//! on-chain API when the project has a `COINGECKO_API_KEY`. Secret values
//! never leave this module: replies and logs name only which source
//! answered.

use std::sync::OnceLock;
use std::time::Duration;

use serde_json::{json, Value};

use super::HostPlanServer;
use crate::acp::host_mcp::chain_tools::{
    call_with_address, code_facts, decode_address, decode_string, decode_u64, format_units,
    hex_to_decimal, is_burn_owner, parse_address, parse_calldata, parse_tx_hash, ChainBalanceInput,
    ChainCallInput, ChainNewPoolsInput, ChainTokenInput, ChainTool, ChainTxInput, CHAIN_ID,
    COINGECKO_ONCHAIN_API, COINGECKO_SECRET, EIP1967_IMPLEMENTATION_SLOT, GECKOTERMINAL_API,
    MARKET_NETWORK, PUBLIC_RPC_URL, RPC_SECRET, SEL_BALANCE_OF, SEL_DECIMALS, SEL_NAME, SEL_OWNER,
    SEL_SYMBOL, SEL_TOTAL_SUPPLY,
};
use crate::acp::host_mcp::FrameReply;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_TOKENS: usize = 20;
const MAX_POOLS: usize = 20;

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            // The public RPC refuses some default library user agents.
            .user_agent(concat!("wrangl-chain-tools/", env!("CARGO_PKG_VERSION")))
            .build()
            .unwrap_or_default()
    })
}

/// Where this call's reads go. `rpc_label` / `market_label` are what the
/// agent is told; the URL and key stay here.
pub(super) struct Sources {
    rpc_url: String,
    pub(super) rpc_label: &'static str,
    market_root: &'static str,
    market_key: Option<String>,
    market_label: &'static str,
}

impl Sources {
    fn public() -> Self {
        Self {
            rpc_url: PUBLIC_RPC_URL.to_string(),
            rpc_label: "public",
            market_root: GECKOTERMINAL_API,
            market_key: None,
            market_label: "geckoterminal",
        }
    }
}

impl HostPlanServer {
    pub(super) async fn chain_call(
        &self,
        session_id: &str,
        tool: Option<ChainTool>,
        input: Option<Value>,
    ) -> FrameReply {
        let Some(tool) = tool else {
            return FrameReply::err("a chain frame needs a tool");
        };
        let sources = self.chain_sources(session_id).await;
        let input = input.unwrap_or(Value::Null);
        let answer = match tool {
            ChainTool::Status => status(&sources).await,
            ChainTool::Token => match parse::<ChainTokenInput>(input) {
                Ok(input) => token(&sources, input).await,
                Err(e) => Err(e),
            },
            ChainTool::Balance => match parse::<ChainBalanceInput>(input) {
                Ok(input) => balance(&sources, input).await,
                Err(e) => Err(e),
            },
            ChainTool::Tx => match parse::<ChainTxInput>(input) {
                Ok(input) => tx(&sources, input).await,
                Err(e) => Err(e),
            },
            ChainTool::NewPools => match parse::<ChainNewPoolsInput>(input) {
                Ok(input) => new_pools(&sources, input).await,
                Err(e) => Err(e),
            },
            ChainTool::Call => match parse::<ChainCallInput>(input) {
                Ok(input) => call(&sources, input).await,
                Err(e) => Err(e),
            },
        };
        match answer {
            Ok(result) => FrameReply::ok_with(result),
            Err(message) => {
                log::info!(
                    "[host-mcp] {} failed (rpc {}): {message}",
                    tool.name(),
                    sources.rpc_label
                );
                FrameReply {
                    result: Some(json!({ "error": message, "rpc": sources.rpc_label })),
                    ..FrameReply::err(message)
                }
            }
        }
    }

    /// The project's own RPC and market key when it set them, else the
    /// public sources. Any vault failure falls back to public: a read-only
    /// lookup should not fail because a keychain is locked.
    pub(super) async fn chain_sources(&self, session_id: &str) -> Sources {
        let mut sources = Sources::public();
        let (Some(service), Some(caller)) = (self.automation_service(), self.caller(session_id))
        else {
            return sources;
        };
        let project_id = caller.project_id;
        let secrets = tokio::task::spawn_blocking(move || {
            let store = service.engine().secrets();
            let names = store.list_names(&project_id).unwrap_or_default();
            let wanted: Vec<String> = [RPC_SECRET, COINGECKO_SECRET]
                .into_iter()
                .filter(|name| names.iter().any(|n| n == name))
                .map(str::to_string)
                .collect();
            store.resolve(&project_id, &wanted).unwrap_or_default()
        })
        .await
        .unwrap_or_default();
        if let Some(url) = secrets.get(RPC_SECRET).filter(|u| u.starts_with("http")) {
            sources.rpc_url = url.clone();
            sources.rpc_label = "project secret ROBINHOOD_RPC_URL";
        }
        if let Some(key) = secrets.get(COINGECKO_SECRET).filter(|k| !k.is_empty()) {
            sources.market_root = COINGECKO_ONCHAIN_API;
            sources.market_key = Some(key.clone());
            sources.market_label = "coingecko (project secret COINGECKO_API_KEY)";
        }
        sources
    }
}

fn parse<T: serde::de::DeserializeOwned>(input: Value) -> Result<T, String> {
    serde_json::from_value(input).map_err(|e| format!("invalid arguments: {e}"))
}

// ---------------------------------------------------------------------------
// Transport.

/// One JSON-RPC batch; each item is the call's result or its error text, in
/// request order.
pub(super) async fn rpc_batch(
    sources: &Sources,
    calls: &[(&str, Value)],
) -> Result<Vec<Result<Value, String>>, String> {
    let body: Vec<Value> = calls
        .iter()
        .enumerate()
        .map(|(id, (method, params))| {
            json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })
        })
        .collect();
    let response = client()
        .post(&sources.rpc_url)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            format!(
                "RPC ({}) unreachable: {}",
                sources.rpc_label,
                e.without_url()
            )
        })?;
    let status = response.status();
    if !status.is_success() {
        let hint = if status.as_u16() == 429 {
            " (rate limited: set your own ROBINHOOD_RPC_URL under Automations > Project secrets)"
        } else {
            ""
        };
        return Err(format!(
            "RPC ({}) answered HTTP {status}{hint}",
            sources.rpc_label
        ));
    }
    let replies: Value = response.json().await.map_err(|e| {
        format!(
            "RPC ({}) sent invalid JSON: {}",
            sources.rpc_label,
            e.without_url()
        )
    })?;
    let replies = match replies {
        Value::Array(items) => items,
        // A provider without batch support answers with one error object.
        other => {
            return Err(format!(
                "RPC ({}) did not answer the batch: {}",
                sources.rpc_label,
                other["error"]["message"]
                    .as_str()
                    .unwrap_or("unexpected reply")
            ))
        }
    };
    let mut out: Vec<Result<Value, String>> =
        vec![Err("no reply for this call".to_string()); calls.len()];
    for reply in replies {
        let Some(id) = reply["id"].as_u64().and_then(|i| usize::try_from(i).ok()) else {
            continue;
        };
        if id >= out.len() {
            continue;
        }
        out[id] = match reply.get("error") {
            Some(error) if !error.is_null() => Err(error["message"]
                .as_str()
                .unwrap_or("call failed")
                .to_string()),
            _ => Ok(reply["result"].clone()),
        };
    }
    Ok(out)
}

async fn market_get(sources: &Sources, path: &str) -> Result<Value, String> {
    let url = format!("{}/networks/{MARKET_NETWORK}/{path}", sources.market_root);
    let mut request = client().get(url).header("accept", "application/json");
    if let Some(key) = &sources.market_key {
        request = request.header("x-cg-demo-api-key", key);
    }
    let response = request
        .send()
        .await
        .map_err(|e| format!("{} unreachable: {}", sources.market_label, e.without_url()))?;
    let status = response.status();
    if status.as_u16() == 404 {
        return Err(format!(
            "{} has no market data for this",
            sources.market_label
        ));
    }
    if !status.is_success() {
        return Err(format!("{} answered HTTP {status}", sources.market_label));
    }
    response.json().await.map_err(|e| {
        format!(
            "{} sent invalid JSON: {}",
            sources.market_label,
            e.without_url()
        )
    })
}

fn string_result(value: &Result<Value, String>) -> Option<&str> {
    value.as_ref().ok().and_then(Value::as_str)
}

// ---------------------------------------------------------------------------
// Tools.

async fn status(sources: &Sources) -> Result<Value, String> {
    let replies = rpc_batch(
        sources,
        &[
            ("eth_chainId", json!([])),
            ("eth_blockNumber", json!([])),
            ("eth_gasPrice", json!([])),
        ],
    )
    .await?;
    let chain_id = string_result(&replies[0]).and_then(decode_u64);
    let gas_wei = string_result(&replies[2]).and_then(hex_to_decimal);
    let mut out = json!({
        "rpc": sources.rpc_label,
        "chain_id": chain_id,
        "latest_block": string_result(&replies[1]).and_then(decode_u64),
        "gas_price_gwei": gas_wei.map(|wei| format_units(&wei, 9)),
    });
    if chain_id != Some(CHAIN_ID) {
        out["warning"] = json!(format!(
            "this RPC is not Robinhood Chain mainnet (expected chain id {CHAIN_ID})"
        ));
    }
    Ok(out)
}

async fn token(sources: &Sources, input: ChainTokenInput) -> Result<Value, String> {
    let address = parse_address(&input.address)?;
    let call = |selector: &str| {
        (
            "eth_call",
            json!([{ "to": address, "data": format!("0x{selector}") }, "latest"]),
        )
    };
    let replies = rpc_batch(
        sources,
        &[
            ("eth_getCode", json!([address, "latest"])),
            call(SEL_NAME),
            call(SEL_SYMBOL),
            call(SEL_DECIMALS),
            call(SEL_TOTAL_SUPPLY),
            call(SEL_OWNER),
            (
                "eth_getStorageAt",
                json!([address, EIP1967_IMPLEMENTATION_SLOT, "latest"]),
            ),
        ],
    )
    .await?;
    let code = string_result(&replies[0]).unwrap_or("0x");
    if code.len() <= 2 {
        return Ok(json!({
            "address": address,
            "is_contract": false,
            "note": "no code at this address: it is a wallet or nothing is deployed here",
            "rpc": sources.rpc_label,
        }));
    }
    let decimals = string_result(&replies[3]).and_then(decode_u64);
    let supply_raw = string_result(&replies[4]).and_then(hex_to_decimal);
    let owner = string_result(&replies[5]).and_then(decode_address);
    let implementation = string_result(&replies[6])
        .and_then(decode_address)
        .filter(|a| !is_burn_owner(a));
    let facts = code_facts(code);
    // The code that actually runs: an EIP-1967 implementation or a clone's target.
    let behind = implementation.clone().or_else(|| facts.clone_of.clone());
    let mut out = json!({
        "address": address,
        "is_contract": true,
        "name": string_result(&replies[1]).and_then(decode_string),
        "symbol": string_result(&replies[2]).and_then(decode_string),
        "decimals": decimals,
        "total_supply_raw": supply_raw,
        "total_supply": match (&supply_raw, decimals) {
            (Some(raw), Some(d)) => Some(format_units(raw, u32::try_from(d).unwrap_or(0))),
            _ => None,
        },
        "owner": owner,
        "ownership_renounced": owner.as_deref().map(is_burn_owner),
        "eip1967_implementation": implementation,
        "code": facts,
        "rpc": sources.rpc_label,
        "note": "privileged_functions are read from the bytecode's dispatcher (for a proxy or \
    clone, from its implementation too, under implementation_code). Hints, not an audit.",
    });
    if let Some(target) = &behind {
        out["implementation_code"] = match rpc_batch(
            sources,
            &[("eth_getCode", json!([target, "latest"]))],
        )
        .await
        {
            Ok(replies) => match string_result(&replies[0]) {
                Some(code) if code.len() > 2 => {
                    json!({ "address": target, "facts": code_facts(code) })
                }
                _ => json!({ "address": target, "error": "no code at the implementation address" }),
            },
            Err(e) => json!({ "address": target, "error": e }),
        };
    }
    if input.market.unwrap_or(true) {
        out["market"] =
            match market_get(sources, &format!("tokens/{address}?include=top_pools")).await {
                Ok(body) => token_market(&body, sources.market_label),
                Err(e) => json!({ "error": e }),
            };
    }
    Ok(out)
}

fn token_market(body: &Value, source: &str) -> Value {
    let attributes = &body["data"]["attributes"];
    let pools: Vec<Value> = body["included"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter(|item| item["type"] == "pool")
                .take(5)
                .map(|pool| {
                    let a = &pool["attributes"];
                    json!({
                        "name": a["name"],
                        "address": a["address"],
                        "reserve_usd": a["reserve_in_usd"],
                        "volume_24h_usd": a["volume_usd"]["h24"],
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    json!({
        "source": source,
        "price_usd": attributes["price_usd"],
        "fdv_usd": attributes["fdv_usd"],
        "market_cap_usd": attributes["market_cap_usd"],
        "total_reserve_usd": attributes["total_reserve_in_usd"],
        "volume_24h_usd": attributes["volume_usd"]["h24"],
        "top_pools": pools,
    })
}

async fn balance(sources: &Sources, input: ChainBalanceInput) -> Result<Value, String> {
    let wallet = parse_address(&input.address)?;
    if input.tokens.len() > MAX_TOKENS {
        return Err(format!("at most {MAX_TOKENS} tokens per call"));
    }
    let tokens = input
        .tokens
        .iter()
        .map(|t| parse_address(t))
        .collect::<Result<Vec<_>, _>>()?;
    let mut calls: Vec<(&str, Value)> = vec![("eth_getBalance", json!([wallet, "latest"]))];
    for token in &tokens {
        let call = |data: String| ("eth_call", json!([{ "to": token, "data": data }, "latest"]));
        calls.push(call(call_with_address(SEL_BALANCE_OF, &wallet)));
        calls.push(call(format!("0x{SEL_DECIMALS}")));
        calls.push(call(format!("0x{SEL_SYMBOL}")));
    }
    let replies = rpc_batch(sources, &calls).await?;
    let native_raw = match &replies[0] {
        Ok(Value::String(hex)) => hex_to_decimal(hex),
        Ok(_) => None,
        Err(e) => return Err(format!("eth_getBalance failed: {e}")),
    };
    let token_rows: Vec<Value> = tokens
        .iter()
        .enumerate()
        .map(|(i, token)| {
            let base = 1 + i * 3;
            let raw = string_result(&replies[base]).and_then(hex_to_decimal);
            let decimals = string_result(&replies[base + 1]).and_then(decode_u64);
            let mut row = json!({
                "token": token,
                "symbol": string_result(&replies[base + 2]).and_then(decode_string),
                "decimals": decimals,
                "raw": raw,
                "amount": match (&raw, decimals) {
                    (Some(r), Some(d)) => Some(format_units(r, u32::try_from(d).unwrap_or(0))),
                    _ => None,
                },
            });
            if let Err(e) = &replies[base] {
                row["error"] = json!(format!("balanceOf failed: {e}"));
            }
            row
        })
        .collect();
    Ok(json!({
        "address": wallet,
        "eth": native_raw.as_deref().map(|raw| format_units(raw, 18)),
        "eth_wei": native_raw,
        "tokens": token_rows,
        "rpc": sources.rpc_label,
    }))
}

async fn tx(sources: &Sources, input: ChainTxInput) -> Result<Value, String> {
    let hash = parse_tx_hash(&input.hash)?;
    let replies = rpc_batch(
        sources,
        &[
            ("eth_getTransactionByHash", json!([hash])),
            ("eth_getTransactionReceipt", json!([hash])),
        ],
    )
    .await?;
    let tx = replies[0]
        .clone()
        .map_err(|e| format!("eth_getTransactionByHash: {e}"))?;
    if tx.is_null() {
        return Ok(json!({ "hash": hash, "found": false, "rpc": sources.rpc_label }));
    }
    let receipt = replies[1].clone().unwrap_or(Value::Null);
    let value_wei = tx["value"].as_str().and_then(hex_to_decimal);
    let input_data = tx["input"].as_str().unwrap_or("0x");
    let status = match receipt["status"].as_str() {
        Some("0x1") => "success",
        Some("0x0") => "reverted",
        _ if receipt.is_null() => "pending",
        _ => "unknown",
    };
    Ok(json!({
        "hash": hash,
        "found": true,
        "status": status,
        "block": tx["blockNumber"].as_str().and_then(decode_u64),
        "from": tx["from"],
        "to": tx["to"],
        "value_eth": value_wei.as_deref().map(|raw| format_units(raw, 18)),
        "method_selector": (input_data.len() >= 10).then(|| &input_data[..10]),
        "gas_used": receipt["gasUsed"].as_str().and_then(decode_u64),
        "contract_created": receipt["contractAddress"],
        "log_count": receipt["logs"].as_array().map(Vec::len),
        "rpc": sources.rpc_label,
    }))
}

async fn new_pools(sources: &Sources, input: ChainNewPoolsInput) -> Result<Value, String> {
    let page = input.page.unwrap_or(1).clamp(1, 10);
    let body = market_get(sources, &format!("new_pools?page={page}")).await?;
    let pools: Vec<Value> = body["data"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .take(MAX_POOLS)
                .map(|pool| {
                    let a = &pool["attributes"];
                    let base = pool["relationships"]["base_token"]["data"]["id"]
                        .as_str()
                        .and_then(|id| id.split('_').nth(1));
                    json!({
                        "name": a["name"],
                        "pool": a["address"],
                        "dex": pool["relationships"]["dex"]["data"]["id"],
                        "created_at": a["pool_created_at"],
                        "reserve_usd": a["reserve_in_usd"],
                        "volume_24h_usd": a["volume_usd"]["h24"],
                        "buys_24h": a["transactions"]["h24"]["buys"],
                        "sells_24h": a["transactions"]["h24"]["sells"],
                        "base_token": base,
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(json!({ "source": sources.market_label, "page": page, "pools": pools }))
}

async fn call(sources: &Sources, input: ChainCallInput) -> Result<Value, String> {
    let to = parse_address(&input.to)?;
    let data = parse_calldata(&input.data)?;
    let mut params = json!({ "to": to, "data": data });
    if let Some(from) = &input.from {
        params["from"] = json!(parse_address(from)?);
    }
    let replies = rpc_batch(sources, &[("eth_call", json!([params, "latest"]))]).await?;
    Ok(match &replies[0] {
        Ok(result) => json!({ "ok": true, "result": result, "rpc": sources.rpc_label }),
        Err(e) => json!({ "ok": false, "reverted": e, "rpc": sources.rpc_label }),
    })
}

#[cfg(test)]
mod live {
    //! Network tests against the public RPC and GeckoTerminal. Ignored by
    //! default; run with `cargo test chain_live -- --ignored`.
    use super::*;

    /// USDG on Robinhood Chain.
    const USDG: &str = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

    #[tokio::test]
    #[ignore = "network"]
    async fn chain_live_status_and_token() {
        let sources = Sources::public();
        let status = status(&sources).await.expect("status");
        assert_eq!(status["chain_id"], json!(CHAIN_ID), "{status}");
        assert!(status["latest_block"].as_u64().unwrap_or(0) > 0, "{status}");

        let token = token(
            &sources,
            ChainTokenInput {
                address: USDG.to_string(),
                market: Some(true),
            },
        )
        .await
        .expect("token");
        println!("{}", serde_json::to_string_pretty(&token).unwrap());
        assert_eq!(token["is_contract"], json!(true));
        assert!(token["symbol"].as_str().is_some(), "{token}");
        assert!(token["decimals"].as_u64().is_some(), "{token}");
        // USDG is an EIP-1967 proxy: the implementation's code is read too.
        assert!(
            token["implementation_code"]["facts"]["size_bytes"]
                .as_u64()
                .unwrap_or(0)
                > 1000,
            "{token}"
        );

        let balance = balance(
            &sources,
            ChainBalanceInput {
                address: USDG.to_string(),
                tokens: vec![USDG.to_string()],
            },
        )
        .await
        .expect("balance");
        assert!(balance["eth"].as_str().is_some(), "{balance}");

        let pools = new_pools(&sources, ChainNewPoolsInput { page: None })
            .await
            .expect("pools");
        println!(
            "{}",
            serde_json::to_string_pretty(&pools["pools"][0]).unwrap()
        );
        assert!(
            pools["pools"].as_array().is_some_and(|p| !p.is_empty()),
            "{pools}"
        );
    }
}
