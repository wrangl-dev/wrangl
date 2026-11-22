use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;

use super::{origin_allowed, router};
use crate::bridge::Backend;

#[test]
fn only_local_dev_origins_are_allowed() {
    let ports = [1420, 4220];
    assert!(origin_allowed(None, &ports));
    assert!(origin_allowed(Some("http://localhost:1420"), &ports));
    assert!(origin_allowed(Some("http://127.0.0.1:4220"), &ports));
    assert!(origin_allowed(Some("http://[::1]:1420"), &ports));

    assert!(!origin_allowed(Some("http://localhost:3000"), &ports));
    assert!(!origin_allowed(Some("https://evil.example"), &ports));
    assert!(!origin_allowed(Some("http://evil.example:1420"), &ports));
    assert!(!origin_allowed(
        Some("http://localhost.evil.example:1420"),
        &ports
    ));
    assert!(!origin_allowed(Some("null"), &ports));
}

async fn start() -> u16 {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let app = router(Backend::default(), port, None);
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    port
}

#[tokio::test]
async fn answers_commands_over_the_socket() {
    let port = start().await;
    let (mut ws, _) = tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{port}/ws"))
        .await
        .expect("connect");

    let req = json!({ "id": 1, "cmd": "app_info", "args": {} }).to_string();
    ws.send(Message::Text(req.into())).await.unwrap();
    let reply: Value = match ws.next().await.unwrap().unwrap() {
        Message::Text(t) => serde_json::from_str(&t).unwrap(),
        other => panic!("unexpected {other:?}"),
    };
    assert_eq!(reply["type"], "result");
    assert_eq!(reply["id"], 1);
    assert_eq!(reply["ok"]["chainId"], 4663);

    let req = json!({ "id": 2, "cmd": "nope" }).to_string();
    ws.send(Message::Text(req.into())).await.unwrap();
    let reply: Value = match ws.next().await.unwrap().unwrap() {
        Message::Text(t) => serde_json::from_str(&t).unwrap(),
        other => panic!("unexpected {other:?}"),
    };
    assert_eq!(reply["id"], 2);
    assert!(reply["error"].as_str().unwrap().contains("unknown command"));
}

#[tokio::test]
async fn refuses_pages_from_other_origins() {
    let port = start().await;
    let mut req = format!("ws://127.0.0.1:{port}/ws")
        .into_client_request()
        .unwrap();
    req.headers_mut()
        .insert("origin", "https://evil.example".parse().unwrap());
    let err = tokio_tungstenite::connect_async(req).await.err();
    assert!(err.is_some(), "a foreign origin must not get a socket");
}
