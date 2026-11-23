//! Proposals end to end against a fake RPC, answered the way the signing page answers.

use std::sync::Arc;
use std::time::Duration;

use axum::routing::post;
use axum::{Json, Router};
use serde_json::{json, Value};

use super::propose::{propose, NOT_CONNECTED};
use super::tools::WalletSendTransactionInput;
use super::WalletService;
use crate::chain::client::{Endpoint, Sources};

const USER: &str = "0x1111111111111111111111111111111111111111";
const TO: &str = "0x2222222222222222222222222222222222222222";
const HASH: &str = "0xabababababababababababababababababababababababababababababababab";

/// An RPC whose eth_estimateGas answers `gas` or reverts.
async fn rpc(revert: bool) -> Sources {
    let app = Router::new().route(
        "/",
        post(move |Json(batch): Json<Vec<Value>>| async move {
            let replies: Vec<Value> = batch
                .iter()
                .map(|c| {
                    if revert {
                        json!({ "jsonrpc": "2.0", "id": c["id"],
                            "error": { "code": 3, "message": "execution reverted" } })
                    } else {
                        json!({ "jsonrpc": "2.0", "id": c["id"], "result": "0x5208" })
                    }
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

fn wallet(connected: bool) -> Arc<WalletService> {
    let w = WalletService::open(None);
    w.set_opens_browser(false);
    if connected {
        w.set_address(Some(USER)).unwrap();
    }
    w
}

fn send(value: &str, data: Option<&str>) -> WalletSendTransactionInput {
    WalletSendTransactionInput {
        to: TO.to_string(),
        value_eth: Some(value.to_string()),
        data: data.map(str::to_string),
        description: "Send a little ETH".to_string(),
    }
}

async fn wait_for_request(w: &WalletService) -> String {
    for _ in 0..100 {
        if let Some(r) = w.snapshot().requests.first() {
            return r.id.clone();
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    panic!("no proposal reached the queue");
}

#[tokio::test]
async fn a_signed_proposal_returns_the_hash_and_gas() {
    let w = wallet(true);
    let sources = rpc(false).await;
    let task = {
        let w = Arc::clone(&w);
        tokio::spawn(async move { propose(&w, "chat-1", send("0.01", None), &sources).await })
    };
    let id = wait_for_request(&w).await;
    let queued = &w.snapshot().requests[0];
    assert_eq!(queued.from, USER);
    assert_eq!(queued.tx.value_eth, "0.01");
    assert_eq!(queued.gas_estimate.as_deref(), Some("21000"));

    w.report(&id, "sent", Some(HASH), None).unwrap();
    let answer = task.await.unwrap().unwrap();
    assert_eq!(answer["status"], "sent");
    assert_eq!(answer["hash"], HASH);
    assert!(w.snapshot().requests.is_empty());
}

#[tokio::test]
async fn a_rejected_proposal_tells_the_agent_not_to_retry() {
    let w = wallet(true);
    let sources = rpc(false).await;
    let task = {
        let w = Arc::clone(&w);
        tokio::spawn(
            async move { propose(&w, "chat-1", send("0", Some("0xd0e30db0")), &sources).await },
        )
    };
    let id = wait_for_request(&w).await;
    w.report(&id, "rejected", None, None).unwrap();
    let answer = task.await.unwrap().unwrap();
    assert_eq!(answer["status"], "rejected");
    assert!(answer["next"].as_str().unwrap().contains("Do not retry"));
}

#[tokio::test]
async fn nothing_reaches_the_user_without_a_wallet_or_when_the_simulation_reverts() {
    let err = propose(&wallet(false), "c", send("0.01", None), &rpc(false).await)
        .await
        .unwrap_err();
    assert_eq!(err, NOT_CONNECTED);

    let w = wallet(true);
    let err = propose(&w, "c", send("0.01", None), &rpc(true).await)
        .await
        .unwrap_err();
    assert!(
        err.contains("Simulation failed") && err.contains("reverted"),
        "{err}"
    );
    assert!(w.snapshot().requests.is_empty());
}

#[tokio::test]
async fn an_agent_that_stops_waiting_withdraws_its_proposal() {
    let w = wallet(true);
    let sources = rpc(false).await;
    let task = {
        let w = Arc::clone(&w);
        tokio::spawn(async move { propose(&w, "chat-1", send("0.01", None), &sources).await })
    };
    wait_for_request(&w).await;
    task.abort();
    let _ = task.await;
    assert!(
        w.snapshot().requests.is_empty(),
        "the page no longer shows it"
    );
}

#[tokio::test]
async fn closing_a_chat_rejects_its_proposals() {
    let w = wallet(true);
    let sources = rpc(false).await;
    let task = {
        let w = Arc::clone(&w);
        tokio::spawn(async move { propose(&w, "chat-9", send("0.01", None), &sources).await })
    };
    wait_for_request(&w).await;
    w.cancel_session("chat-9");
    assert_eq!(task.await.unwrap().unwrap()["status"], "rejected");
}
