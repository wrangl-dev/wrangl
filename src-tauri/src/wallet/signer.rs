//! The local signing page: `http://127.0.0.1:<random port>/?t=<secret>`.
//!
//! Browser wallets inject into web pages, not into the desktop app, so the
//! user connects and signs here, in their own browser. The page holds no key
//! either: it asks the wallet extension, which shows its own confirmation.
//!
//! Guards: loopback only; a fresh random port and a one-run secret; the
//! `Host` header must be the loopback address (no DNS rebinding); every API
//! call carries the secret in a custom header, which a cross-site page cannot
//! send without a CORS preflight this server never grants.

use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, HeaderValue, Request, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use subtle::ConstantTimeEq;

use super::WalletService;

const PAGE: &str = include_str!("signer.html");
const TOKEN_HEADER: &str = "x-wrangl-token";

pub struct SignerServer {
    port: u16,
    token: String,
}

impl SignerServer {
    #[must_use]
    pub fn url(&self) -> String {
        format!("http://127.0.0.1:{}/?t={}", self.port, self.token)
    }

    /// Bind `127.0.0.1:0` and serve on a dedicated thread for the life of
    /// the app.
    pub fn start(wallet: Arc<WalletService>) -> Result<Self, String> {
        let token = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        let listener = std::net::TcpListener::bind("127.0.0.1:0")
            .map_err(|e| format!("could not start the signing page: {e}"))?;
        listener
            .set_nonblocking(true)
            .map_err(|e| format!("could not start the signing page: {e}"))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("could not start the signing page: {e}"))?
            .port();
        let state = Arc::new(Guarded {
            wallet,
            token: token.clone(),
            host: format!("127.0.0.1:{port}"),
            origin: format!("http://127.0.0.1:{port}"),
        });
        let app = router(state);
        std::thread::Builder::new()
            .name("wrangl-wallet-signer".to_string())
            .spawn(move || {
                let runtime = match tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                {
                    Ok(runtime) => runtime,
                    Err(e) => {
                        log::error!("[wallet] signer runtime failed: {e}");
                        return;
                    }
                };
                runtime.block_on(async move {
                    let listener = match tokio::net::TcpListener::from_std(listener) {
                        Ok(listener) => listener,
                        Err(e) => {
                            log::error!("[wallet] signer listener failed: {e}");
                            return;
                        }
                    };
                    if let Err(e) = axum::serve(listener, app).await {
                        log::error!("[wallet] signer stopped: {e}");
                    }
                });
            })
            .map_err(|e| format!("could not start the signing page: {e}"))?;
        log::info!("[wallet] signing page listening on 127.0.0.1:{port}");
        Ok(Self { port, token })
    }
}

struct Guarded {
    wallet: Arc<WalletService>,
    token: String,
    host: String,
    origin: String,
}

impl Guarded {
    fn token_ok(&self, candidate: Option<&str>) -> bool {
        candidate.is_some_and(|c| bool::from(c.as_bytes().ct_eq(self.token.as_bytes())))
    }
}

fn router(state: Arc<Guarded>) -> Router {
    let api = Router::new()
        .route("/api/state", get(state_handler))
        .route("/api/connect", post(connect))
        .route("/api/disconnect", post(disconnect))
        .route("/api/requests/{id}", post(report))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_token));
    Router::new()
        .route("/", get(page))
        .merge(api)
        .layer(middleware::from_fn_with_state(
            state.clone(),
            require_loopback,
        ))
        .with_state(state)
}

/// Same-host, same-origin requests only.
async fn require_loopback(
    State(state): State<Arc<Guarded>>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let headers = request.headers();
    let host_ok = headers
        .get(header::HOST)
        .and_then(|h| h.to_str().ok())
        .is_some_and(|h| h == state.host);
    let origin_ok = headers
        .get(header::ORIGIN)
        .and_then(|o| o.to_str().ok())
        .is_none_or(|o| o == state.origin);
    if !host_ok || !origin_ok {
        return StatusCode::FORBIDDEN.into_response();
    }
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    response
}

async fn require_token(
    State(state): State<Arc<Guarded>>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let token = request
        .headers()
        .get(TOKEN_HEADER)
        .and_then(|t| t.to_str().ok());
    if !state.token_ok(token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    next.run(request).await
}

#[derive(Deserialize)]
struct PageQuery {
    t: Option<String>,
}

async fn page(State(state): State<Arc<Guarded>>, Query(query): Query<PageQuery>) -> Response {
    if !state.token_ok(query.t.as_deref()) {
        return (
            StatusCode::UNAUTHORIZED,
            "This link expired. Open Wallet in Wrangl again.",
        )
            .into_response();
    }
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/html; charset=utf-8"),
    );
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(
            "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; \
             connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; \
             form-action 'none'",
        ),
    );
    (headers, PAGE).into_response()
}

async fn state_handler(State(state): State<Arc<Guarded>>) -> Response {
    Json(state.wallet.snapshot()).into_response()
}

#[derive(Deserialize)]
struct ConnectBody {
    address: String,
}

async fn connect(State(state): State<Arc<Guarded>>, Json(body): Json<ConnectBody>) -> Response {
    match state.wallet.set_address(Some(&body.address)) {
        Ok(_) => Json(state.wallet.snapshot()).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e).into_response(),
    }
}

async fn disconnect(State(state): State<Arc<Guarded>>) -> Response {
    match state.wallet.set_address(None) {
        Ok(_) => Json(state.wallet.snapshot()).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

#[derive(Deserialize)]
struct ReportBody {
    result: String,
    hash: Option<String>,
    error: Option<String>,
}

async fn report(
    State(state): State<Arc<Guarded>>,
    Path(id): Path<String>,
    Json(body): Json<ReportBody>,
) -> Response {
    match state.wallet.report(
        &id,
        &body.result,
        body.hash.as_deref(),
        body.error.as_deref(),
    ) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::CONFLICT, e).into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tower::ServiceExt;

    fn app() -> (Router, Arc<WalletService>) {
        let wallet = WalletService::open(None);
        let state = Arc::new(Guarded {
            wallet: wallet.clone(),
            token: "secret".to_string(),
            host: "127.0.0.1:9".to_string(),
            origin: "http://127.0.0.1:9".to_string(),
        });
        (router(state), wallet)
    }

    fn req(method: &str, uri: &str, host: &str, token: Option<&str>, body: &str) -> Request<Body> {
        let mut builder = Request::builder()
            .method(method)
            .uri(uri)
            .header(header::HOST, host)
            .header(header::CONTENT_TYPE, "application/json");
        if let Some(token) = token {
            builder = builder.header(TOKEN_HEADER, token);
        }
        builder.body(Body::from(body.to_string())).unwrap()
    }

    async fn status(app: &Router, request: Request<Body>) -> StatusCode {
        app.clone().oneshot(request).await.unwrap().status()
    }

    #[tokio::test]
    async fn page_needs_the_secret_and_loopback_host() {
        let (app, _) = app();
        let ok = req("GET", "/?t=secret", "127.0.0.1:9", None, "");
        assert_eq!(status(&app, ok).await, StatusCode::OK);
        let wrong = req("GET", "/?t=nope", "127.0.0.1:9", None, "");
        assert_eq!(status(&app, wrong).await, StatusCode::UNAUTHORIZED);
        let rebound = req("GET", "/?t=secret", "evil.example:9", None, "");
        assert_eq!(status(&app, rebound).await, StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn api_needs_the_header_secret_and_same_origin() {
        let (app, wallet) = app();
        let body = r#"{"address":"0x2222222222222222222222222222222222222222"}"#;
        let missing = req("POST", "/api/connect", "127.0.0.1:9", None, body);
        assert_eq!(status(&app, missing).await, StatusCode::UNAUTHORIZED);
        let mut cross = req("POST", "/api/connect", "127.0.0.1:9", Some("secret"), body);
        cross.headers_mut().insert(
            header::ORIGIN,
            HeaderValue::from_static("https://evil.example"),
        );
        assert_eq!(status(&app, cross).await, StatusCode::FORBIDDEN);
        assert_eq!(wallet.address(), None);
        let ok = req("POST", "/api/connect", "127.0.0.1:9", Some("secret"), body);
        assert_eq!(status(&app, ok).await, StatusCode::OK);
        assert_eq!(
            wallet.address().as_deref(),
            Some("0x2222222222222222222222222222222222222222")
        );
    }
}
