//! Browser dev mode: the same commands as the desktop app, over a WebSocket on `127.0.0.1`.
//!
//! Wire format (JSON text frames):
//! - client → server: `{"id": 1, "cmd": "pty_spawn", "args": {...}}`
//! - server → client: `{"type": "result", "id": 1, "ok": ...}` or `{"type": "result", "id": 1, "error": "..."}`
//! - server → client: `{"type": "event", "channel": 3, "payload": ...}`
//!
//! Only pages served from the allowed local origins may connect: anything else could open a
//! shell on this machine from a web page.

#[cfg(test)]
mod tests;

use std::collections::HashSet;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use parking_lot::Mutex;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::sync::mpsc;

use crate::bridge::{self, Backend, EventSink};

/// Where the dev UI (Vite) runs.
pub const VITE_PORT: u16 = 1420;
/// Where this server listens by default.
pub const DEFAULT_PORT: u16 = 4220;

#[derive(Clone)]
struct AppState {
    backend: Backend,
    allowed_ports: Arc<Vec<u16>>,
}

/// Whether a browser `Origin` may open a session. No header means a non-browser client on this
/// machine, which could start a shell anyway.
#[must_use]
pub fn origin_allowed(origin: Option<&str>, allowed_ports: &[u16]) -> bool {
    let Some(origin) = origin else {
        return true;
    };
    let Some(rest) = origin.strip_prefix("http://") else {
        return false;
    };
    let Some((host, port)) = rest.rsplit_once(':') else {
        return false;
    };
    let port_ok = port
        .parse::<u16>()
        .is_ok_and(|p| allowed_ports.contains(&p));
    port_ok && matches!(host, "localhost" | "127.0.0.1" | "[::1]")
}

/// Build the router: `/ws` for commands, and the built UI from `dist` when given.
pub fn router(backend: Backend, port: u16, dist: Option<PathBuf>) -> Router {
    let state = AppState {
        backend,
        allowed_ports: Arc::new(vec![VITE_PORT, port]),
    };
    let app = Router::new()
        .route("/ws", get(ws_upgrade))
        .with_state(state);
    match dist.filter(|d| d.join("index.html").is_file()) {
        Some(dir) => app.fallback_service(tower_http::services::ServeDir::new(dir)),
        None => app,
    }
}

/// Listen on `127.0.0.1:port` until the process ends.
pub async fn serve(port: u16, dist: Option<PathBuf>) -> std::io::Result<()> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    log::info!("[web] listening on http://{addr}");
    axum::serve(listener, router(Backend::default(), port, dist)).await
}

async fn ws_upgrade(
    State(state): State<AppState>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    let origin = headers.get("origin").and_then(|v| v.to_str().ok());
    if !origin_allowed(origin, &state.allowed_ports) {
        log::warn!("[web] refused a connection from origin {origin:?}");
        return (StatusCode::FORBIDDEN, "origin not allowed").into_response();
    }
    ws.on_upgrade(move |socket| session(socket, state.backend))
}

#[derive(Deserialize)]
struct Request {
    id: u64,
    cmd: String,
    #[serde(default)]
    args: Value,
}

async fn session(socket: WebSocket, backend: Backend) {
    let (mut tx, mut rx) = socket.split();
    let (out, mut outbox) = mpsc::unbounded_channel::<Value>();

    let writer = tokio::spawn(async move {
        while let Some(msg) = outbox.recv().await {
            if tx
                .send(Message::Text(msg.to_string().into()))
                .await
                .is_err()
            {
                break;
            }
        }
    });

    let events = out.clone();
    let sink: EventSink = Arc::new(move |channel, payload| {
        let _ = events.send(json!({ "type": "event", "channel": channel, "payload": payload }));
    });
    // Terminals this browser tab opened; they end with the tab.
    let owned: Mutex<HashSet<String>> = Mutex::new(HashSet::new());
    log::info!("[web] client connected");

    while let Some(Ok(msg)) = rx.next().await {
        let Message::Text(text) = msg else { continue };
        let reply = match serde_json::from_str::<Request>(&text) {
            Ok(req) => match bridge::dispatch(&backend, &req.cmd, req.args, &sink).await {
                Ok((ok, effects)) => {
                    let mut ids = owned.lock();
                    if let Some(id) = effects.spawned_pty {
                        ids.insert(id);
                    }
                    if let Some(id) = effects.killed_pty {
                        ids.remove(&id);
                    }
                    json!({ "type": "result", "id": req.id, "ok": ok })
                }
                Err(error) => json!({ "type": "result", "id": req.id, "error": error }),
            },
            Err(e) => json!({ "type": "result", "id": null, "error": format!("bad request: {e}") }),
        };
        if out.send(reply).is_err() {
            break;
        }
    }

    for id in owned.lock().drain() {
        backend.pty.kill(&id);
    }
    drop(out);
    let _ = writer.await;
    log::info!("[web] client disconnected");
}
