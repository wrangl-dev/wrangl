//! Swaps against a fake KyberSwap, a fake RPC and a wallet that answers like the signing page.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};

use super::client::{Endpoint, Sources};
use super::swap::{
    approve_calldata, min_out, parse_units, quote, swap, Kyber, SwapQuoteInput, SwapTokensInput,
    SwapWallet, Waits, KYBER_ROUTERS,
};

const USDG: &str = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const OWNER: &str = "0x1111111111111111111111111111111111111111";
const HASH: &str = "0xabababababababababababababababababababababababababababababababab";

#[test]
fn amounts_parse_with_the_token_decimals() {
    assert_eq!(parse_units("25.5", 6), Ok(25_500_000));
    assert_eq!(parse_units("1", 18), Ok(1_000_000_000_000_000_000));
    assert_eq!(parse_units(".5", 6), Ok(500_000));
    assert!(parse_units("0.0000001", 6)
        .unwrap_err()
        .contains("more than 6 decimals"));
    assert!(parse_units("0", 6).unwrap_err().contains("more than zero"));
    assert!(parse_units("1e6", 6).is_err());
    assert!(parse_units("-1", 6).is_err());
}

#[test]
fn approvals_are_for_the_exact_amount_and_minimum_out_respects_slippage() {
    let data = approve_calldata(KYBER_ROUTERS[0], 25_500_000);
    assert!(data.starts_with("0x095ea7b3"));
    assert!(data.contains("6131b5fae19ea4f9d964eac0408e4408b66337b5"));
    assert!(data.ends_with(&format!("{:064x}", 25_500_000u128)));
    assert_eq!(data.len(), 2 + 8 + 64 + 64);

    assert_eq!(min_out("10000", 50), "9950");
    assert_eq!(min_out("7", 50), "6");
}

/// Fake RPC: USDG has 6 decimals and symbol USDG; allowance as given; receipts succeed.
async fn rpc(allowance: u128) -> Sources {
    let app = Router::new().route(
        "/",
        post(move |Json(batch): Json<Vec<Value>>| async move {
            let replies: Vec<Value> = batch
                .iter()
                .map(|c| {
                    let data = c["params"][0]["data"].as_str().unwrap_or_default();
                    let result = match c["method"].as_str() {
                        Some("eth_getTransactionReceipt") => json!({ "status": "0x1" }),
                        _ if data.starts_with("0x313ce567") => json!(format!("0x{:064x}", 6)),
                        _ if data.starts_with("0x95d89b41") => json!(format!(
                            "0x{:064x}{:064x}{:0<64}",
                            32,
                            4,
                            hex::encode("USDG")
                        )),
                        _ if data.starts_with("0xdd62ed3e") => {
                            json!(format!("0x{allowance:064x}"))
                        }
                        _ => json!("0x"),
                    };
                    json!({ "jsonrpc": "2.0", "id": c["id"], "result": result })
                })
                .collect();
            Json(Value::Array(replies))
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    Sources::with_endpoints(vec![Endpoint { url, label: "test" }])
}

/// Fake KyberSwap answering with `router`.
async fn kyber(router: &'static str) -> Kyber {
    let summary = json!({
        "tokenIn": USDG, "amountIn": "10000000", "amountInUsd": "10.0",
        "tokenOut": "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        "amountOut": "5700000000000000", "amountOutUsd": "9.98", "gas": "300000",
        "route": [[{ "exchange": "uniswapv3", "pool": "0x52e6" }]]
    });
    let s2 = summary.clone();
    let app = Router::new()
        .route(
            "/routes",
            get(move || {
                let summary = summary.clone();
                async move {
                    Json(json!({ "code": 0, "data": { "routeSummary": summary, "routerAddress": router } }))
                }
            }),
        )
        .route(
            "/route/build",
            post(move |Json(body): Json<Value>| async move {
                assert_eq!(body["routeSummary"], s2);
                assert_eq!(body["sender"], OWNER);
                Json(json!({ "code": 0, "data": {
                    "routerAddress": router, "data": "0xe21fd0e9deadbeef",
                    "transactionValue": "0", "amountOut": "5700000000000000",
                    "slippageTolerance": body["slippageTolerance"] } }))
            }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    Kyber::new(base)
}

/// (to, value, data, description) of each proposal.
type Proposals = Arc<Mutex<Vec<(String, u128, String, String)>>>;

/// A wallet that records proposals and answers each with `answer`.
struct FakeWallet {
    connected: bool,
    answer: &'static str,
    proposals: Proposals,
}

impl SwapWallet for FakeWallet {
    async fn address(&self) -> Result<Option<String>, String> {
        Ok(self.connected.then(|| OWNER.to_string()))
    }
    async fn propose(
        &self,
        to: &str,
        value: u128,
        data: &str,
        desc: &str,
    ) -> Result<Value, String> {
        self.proposals
            .lock()
            .unwrap()
            .push((to.into(), value, data.into(), desc.into()));
        Ok(if self.answer == "sent" {
            json!({ "status": "sent", "hash": HASH })
        } else {
            json!({ "status": self.answer })
        })
    }
}

fn wallet(answer: &'static str) -> FakeWallet {
    FakeWallet {
        connected: true,
        answer,
        proposals: Arc::default(),
    }
}

const FAST: Waits = Waits {
    approval_timeout: Duration::from_secs(5),
    poll: Duration::from_millis(10),
};

fn sell_usdg() -> SwapTokensInput {
    SwapTokensInput {
        token_in: USDG.into(),
        token_out: "ETH".into(),
        amount: "10".into(),
        slippage_percent: None,
    }
}

#[tokio::test]
async fn a_quote_reads_decimals_and_reports_the_route() {
    let q = quote(
        &rpc(0).await,
        &kyber(KYBER_ROUTERS[0]).await,
        SwapQuoteInput {
            token_in: USDG.into(),
            token_out: "eth".into(),
            amount: "10".into(),
        },
    )
    .await
    .unwrap();
    assert_eq!(q["sell"]["token"], "USDG");
    assert_eq!(q["sell"]["amount"], "10");
    assert_eq!(q["buy"]["token"], "ETH");
    assert_eq!(q["buy"]["amount"], "0.0057");
    assert_eq!(q["price_impact_percent"], 0.2);
    assert_eq!(q["dexes"], json!(["uniswapv3"]));
}

#[tokio::test]
async fn a_swap_without_allowance_approves_the_exact_amount_then_proposes_the_swap() {
    let w = wallet("sent");
    let out = swap(
        &rpc(0).await,
        &kyber(KYBER_ROUTERS[0]).await,
        &w,
        sell_usdg(),
        FAST,
    )
    .await
    .unwrap();
    assert_eq!(out["status"], "sent");
    let proposals = w.proposals.lock().unwrap().clone();
    assert_eq!(proposals.len(), 2);

    let (to, value, data, desc) = &proposals[0];
    assert_eq!(to, USDG, "the approval goes to the token");
    assert_eq!(*value, 0);
    assert_eq!(data, &approve_calldata(KYBER_ROUTERS[0], 10_000_000));
    assert!(desc.contains("exactly 10 USDG"), "{desc}");

    let (to, _, data, desc) = &proposals[1];
    assert_eq!(to, KYBER_ROUTERS[0]);
    assert_eq!(data, "0xe21fd0e9deadbeef");
    assert!(desc.contains("Swap 10 USDG for about 0.0057 ETH"), "{desc}");
    assert!(desc.contains("slippage 0.5%"), "{desc}");
    assert_eq!(out["minimum_received"], "0.0056715 ETH");
}

#[tokio::test]
async fn enough_allowance_skips_the_approval() {
    let w = wallet("sent");
    swap(
        &rpc(u128::MAX).await,
        &kyber(KYBER_ROUTERS[0]).await,
        &w,
        sell_usdg(),
        FAST,
    )
    .await
    .unwrap();
    assert_eq!(w.proposals.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn a_refused_approval_proposes_no_swap() {
    let w = wallet("rejected");
    let out = swap(
        &rpc(0).await,
        &kyber(KYBER_ROUTERS[0]).await,
        &w,
        sell_usdg(),
        FAST,
    )
    .await
    .unwrap();
    assert_eq!(out["status"], "approval_not_signed");
    assert_eq!(w.proposals.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn an_unknown_router_is_refused_before_anything_reaches_the_wallet() {
    let w = wallet("sent");
    let err = swap(
        &rpc(0).await,
        &kyber("0x9999999999999999999999999999999999999999").await,
        &w,
        sell_usdg(),
        FAST,
    )
    .await
    .unwrap_err();
    assert!(err.contains("unknown router"), "{err}");
    assert!(w.proposals.lock().unwrap().is_empty());
}

#[tokio::test]
async fn no_wallet_or_too_much_slippage_stops_early() {
    let mut w = wallet("sent");
    w.connected = false;
    let err = swap(
        &rpc(0).await,
        &kyber(KYBER_ROUTERS[0]).await,
        &w,
        sell_usdg(),
        FAST,
    )
    .await
    .unwrap_err();
    assert!(err.contains("No wallet is connected"));

    let w = wallet("sent");
    let mut input = sell_usdg();
    input.slippage_percent = Some(10.0);
    let err = swap(
        &rpc(0).await,
        &kyber(KYBER_ROUTERS[0]).await,
        &w,
        input,
        FAST,
    )
    .await
    .unwrap_err();
    assert!(err.contains("at most 5%"), "{err}");
}
