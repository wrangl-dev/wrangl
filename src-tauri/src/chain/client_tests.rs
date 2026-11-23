//! RPC failover against small local servers.

use axum::routing::post;
use axum::{Json, Router};
use serde_json::{json, Value};

use super::client::{run, Endpoint, Sources};
use super::tools::ChainTool;

/// A fake RPC that answers every batch item with chain id 4663-style values.
async fn healthy() -> String {
    let app = Router::new().route(
        "/",
        post(|Json(batch): Json<Vec<Value>>| async move {
            let replies: Vec<Value> = batch
                .iter()
                .map(|call| {
                    let result = match call["method"].as_str() {
                        Some("eth_chainId") => "0x1237",
                        Some("eth_blockNumber") => "0x10",
                        _ => "0x3b9aca00",
                    };
                    json!({ "jsonrpc": "2.0", "id": call["id"], "result": result })
                })
                .collect();
            Json(Value::Array(replies))
        }),
    );
    serve(app).await
}

/// An RPC that is up but refuses: HTTP 503.
async fn broken() -> String {
    let app = Router::new().route(
        "/",
        post(|| async { (axum::http::StatusCode::SERVICE_UNAVAILABLE, "down") }),
    );
    serve(app).await
}

async fn serve(app: Router) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    url
}

/// Nothing listens here.
const DEAD: &str = "http://127.0.0.1:9/";

fn endpoint(url: &str, label: &'static str) -> Endpoint {
    Endpoint {
        url: url.to_string(),
        label,
    }
}

#[tokio::test]
async fn falls_back_when_the_first_rpc_is_unreachable_or_refuses_and_sticks_to_the_one_that_answered(
) {
    let good = healthy().await;
    let sources = Sources::with_endpoints(vec![
        endpoint(DEAD, "official"),
        endpoint(&broken().await, "broken"),
        endpoint(&good, "good"),
    ]);
    let status = run(&sources, ChainTool::Status, json!({})).await.unwrap();
    assert_eq!(status["chain_id"], 4663);
    assert_eq!(status["latest_block"], 16);
    assert_eq!(
        status["rpc"], "good",
        "the answer names the RPC that answered"
    );
    assert_eq!(sources.rpc_label(), "good", "the next call starts there");
}

#[tokio::test]
async fn all_rpcs_failing_reports_each_one() {
    let sources = Sources::with_endpoints(vec![
        endpoint(DEAD, "official"),
        endpoint(&broken().await, "broken"),
    ]);
    let err = run(&sources, ChainTool::Status, json!({}))
        .await
        .unwrap_err();
    assert!(
        err.contains("official") && err.contains("unreachable"),
        "{err}"
    );
    assert!(err.contains("broken") && err.contains("503"), "{err}");
}

#[test]
fn the_public_default_has_keyless_fallbacks_but_an_own_rpc_has_none() {
    let public = Sources::public();
    assert_eq!(public.rpc_label(), "public");
    assert_eq!(public.endpoint_count(), 3);
    let own = Sources::from_settings(Some("https://rpc.example/key"), None);
    assert_eq!(
        own.endpoint_count(),
        1,
        "never switch away from the user's own RPC"
    );
}
