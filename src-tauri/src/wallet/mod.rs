//! The user's own wallet, connected watch-only.
//!
//! Wrangl keeps the connected **address** (a plain JSON file, it is public
//! data) and a queue of transactions an agent proposed. It never holds a
//! private key or seed phrase. The user connects and signs on a local page
//! (`signer`) that their browser wallet (MetaMask, Rabby, ...) injects into;
//! each proposal waits there until the user signs it in their wallet,
//! rejects it, or the agent's turn ends.

pub mod propose;
mod signer;
pub mod tools;

#[cfg(test)]
mod propose_tests;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;

use self::tools::ValidTransaction;
use crate::chain::tools::{parse_address, parse_tx_hash, CHAIN_ID, PUBLIC_RPC_URL};

pub use signer::SignerServer;

/// The app's one wallet, shareable and `Default` so it fits the command table's state.
#[derive(Clone)]
pub struct WalletHandle(Arc<WalletService>);

impl Default for WalletHandle {
    fn default() -> Self {
        Self(WalletService::open(crate::paths::data_dir()))
    }
}

impl WalletHandle {
    /// A wallet that keeps nothing on disk and never opens the browser (tests).
    #[must_use]
    pub fn in_memory() -> Self {
        let wallet = WalletService::open(None);
        wallet.set_opens_browser(false);
        Self(wallet)
    }
}

impl std::ops::Deref for WalletHandle {
    type Target = Arc<WalletService>;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

static INSTALLED: OnceLock<Arc<WalletService>> = OnceLock::new();

/// Make the host's wallet reachable by the MCP host and the desktop
/// commands. The first call wins.
pub fn install(service: Arc<WalletService>) {
    if INSTALLED.set(service).is_err() {
        log::warn!("[wallet] a service was already installed");
    }
}

#[must_use]
pub fn installed() -> Option<Arc<WalletService>> {
    INSTALLED.get().cloned()
}

/// How a proposed transaction ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TxOutcome {
    /// The user's wallet sent it; the hash is on chain (maybe still pending).
    Sent(String),
    /// The user rejected it, on the page or in their wallet.
    Rejected,
    /// The wallet reported an error.
    Failed(String),
}

/// A proposal as the signer page and the desktop panel see it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TxRequest {
    pub id: String,
    pub from: String,
    #[serde(flatten)]
    pub tx: ValidTransaction,
    pub warnings: Vec<String>,
    /// Gas the simulation used, decimal, when it ran.
    pub gas_estimate: Option<String>,
    pub created_at_ms: u64,
    #[serde(skip)]
    pub session_id: String,
}

/// What the page and the panel render.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletSnapshot {
    pub address: Option<String>,
    pub chain_id: u64,
    pub chain_id_hex: String,
    pub rpc_url: &'static str,
    pub requests: Vec<TxRequest>,
}

#[derive(Default, Serialize, Deserialize)]
struct Stored {
    address: Option<String>,
}

pub struct WalletService {
    /// `<app data>/wallet.json`; `None` keeps the address in memory only.
    store_path: Option<PathBuf>,
    address: Mutex<Option<String>>,
    requests: Mutex<Vec<TxRequest>>,
    waiters: Mutex<HashMap<String, oneshot::Sender<TxOutcome>>>,
    signer: OnceLock<SignerServer>,
    /// Open the signing page in the browser when a proposal arrives (off in tests).
    opens_browser: std::sync::atomic::AtomicBool,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX))
}

impl WalletService {
    /// Load the connected address from `<data_dir>/wallet.json`.
    #[must_use]
    pub fn open(data_dir: Option<PathBuf>) -> Arc<Self> {
        let store_path = data_dir.map(|dir| dir.join("wallet.json"));
        let address = store_path
            .as_ref()
            .and_then(|path| std::fs::read(path).ok())
            .and_then(|bytes| serde_json::from_slice::<Stored>(&bytes).ok())
            .and_then(|stored| stored.address)
            .and_then(|address| parse_address(&address).ok());
        Arc::new(Self {
            store_path,
            address: Mutex::new(address),
            requests: Mutex::new(Vec::new()),
            waiters: Mutex::new(HashMap::new()),
            signer: OnceLock::new(),
            opens_browser: std::sync::atomic::AtomicBool::new(true),
        })
    }

    /// Stop opening the browser by itself (tests, headless runs).
    pub fn set_opens_browser(&self, opens: bool) {
        self.opens_browser
            .store(opens, std::sync::atomic::Ordering::Relaxed);
    }

    #[must_use]
    pub fn address(&self) -> Option<String> {
        self.address.lock().clone()
    }

    /// Connect (`Some`) or disconnect (`None`). Disconnecting rejects every
    /// waiting proposal: they were made for the old address.
    pub fn set_address(&self, address: Option<&str>) -> Result<Option<String>, String> {
        let address = address.map(parse_address).transpose()?;
        *self.address.lock() = address.clone();
        if let Some(path) = &self.store_path {
            let body = serde_json::to_vec_pretty(&Stored {
                address: address.clone(),
            })
            .map_err(|e| e.to_string())?;
            if let Some(dir) = path.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            std::fs::write(path, body).map_err(|e| format!("could not save the wallet: {e}"))?;
        }
        if address.is_none() {
            let ids: Vec<String> = self.requests.lock().iter().map(|r| r.id.clone()).collect();
            for id in ids {
                self.resolve(&id, TxOutcome::Rejected);
            }
        }
        log::info!(
            "[wallet] {}",
            if address.is_some() {
                "connected"
            } else {
                "disconnected"
            }
        );
        Ok(address)
    }

    #[must_use]
    pub fn snapshot(&self) -> WalletSnapshot {
        WalletSnapshot {
            address: self.address(),
            chain_id: CHAIN_ID,
            chain_id_hex: format!("0x{CHAIN_ID:x}"),
            rpc_url: PUBLIC_RPC_URL,
            requests: self.requests.lock().clone(),
        }
    }

    /// Queue a proposal and return its id and the receiver its outcome
    /// arrives on.
    pub fn propose(
        &self,
        session_id: &str,
        from: String,
        tx: ValidTransaction,
        warnings: Vec<String>,
        gas_estimate: Option<String>,
    ) -> (String, oneshot::Receiver<TxOutcome>) {
        let id = format!("tx-{}", uuid::Uuid::new_v4().simple());
        let (sender, receiver) = oneshot::channel();
        self.waiters.lock().insert(id.clone(), sender);
        self.requests.lock().push(TxRequest {
            id: id.clone(),
            from,
            tx,
            warnings,
            gas_estimate,
            created_at_ms: now_ms(),
            session_id: session_id.to_string(),
        });
        (id, receiver)
    }

    /// Finish a proposal. `false` when it is no longer waiting.
    pub fn resolve(&self, id: &str, outcome: TxOutcome) -> bool {
        self.requests.lock().retain(|r| r.id != id);
        let Some(waiter) = self.waiters.lock().remove(id) else {
            return false;
        };
        let _ = waiter.send(outcome);
        true
    }

    /// The page reported a result for `id`.
    pub fn report(
        &self,
        id: &str,
        result: &str,
        hash: Option<&str>,
        error: Option<&str>,
    ) -> Result<(), String> {
        let outcome = match result {
            "sent" => TxOutcome::Sent(parse_tx_hash(hash.unwrap_or_default())?),
            "rejected" => TxOutcome::Rejected,
            "failed" => TxOutcome::Failed(
                error
                    .map(|e| e.chars().take(300).collect())
                    .unwrap_or_else(|| "the wallet reported an error".to_string()),
            ),
            other => return Err(format!("unknown result `{other}`")),
        };
        if self.resolve(id, outcome) {
            Ok(())
        } else {
            Err("that transaction is no longer waiting".to_string())
        }
    }

    /// Drop a proposal whose agent stopped waiting.
    pub fn withdraw(&self, id: &str) {
        self.requests.lock().retain(|r| r.id != id);
        self.waiters.lock().remove(id);
    }

    /// Reject every proposal of a session (its turn ended).
    pub fn cancel_session(&self, session_id: &str) {
        let ids: Vec<String> = self
            .requests
            .lock()
            .iter()
            .filter(|r| r.session_id == session_id)
            .map(|r| r.id.clone())
            .collect();
        for id in ids {
            self.resolve(&id, TxOutcome::Rejected);
        }
    }

    /// Start the local signing page on first use and return its URL (with
    /// its one-run secret).
    pub fn signer_url(self: &Arc<Self>) -> Result<String, String> {
        if let Some(server) = self.signer.get() {
            return Ok(server.url());
        }
        let server = SignerServer::start(Arc::clone(self))?;
        let _ = self.signer.set(server);
        Ok(self.signer.get().map(SignerServer::url).unwrap_or_default())
    }

    /// Where the chain tool server reaches this wallet: the signer's base URL and its secret.
    /// Starts the signer on first use.
    pub fn agent_endpoint(self: &Arc<Self>) -> Result<(String, String), String> {
        self.signer_url()?;
        self.signer
            .get()
            .map(|s| (s.base_url(), s.token().to_string()))
            .ok_or_else(|| "the signing page did not start".to_string())
    }

    /// Open the signing page in the user's default browser, where their
    /// wallet extension lives.
    pub fn open_signer(self: &Arc<Self>) -> Result<String, String> {
        let url = self.signer_url()?;
        if self
            .opens_browser
            .load(std::sync::atomic::Ordering::Relaxed)
        {
            open_in_browser(&url)?;
        }
        Ok(url)
    }
}

fn open_in_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", ""]);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command
        .arg(url)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("could not open the browser: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tx() -> ValidTransaction {
        ValidTransaction {
            to: "0x1111111111111111111111111111111111111111".to_string(),
            value_wei_hex: "0x1".to_string(),
            value_eth: "0.000000000000000001".to_string(),
            data: "0x".to_string(),
            description: "test".to_string(),
        }
    }

    const ADDR: &str = "0x2222222222222222222222222222222222222222";
    const HASH: &str = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    #[test]
    fn address_persists_and_is_validated() {
        let dir = tempfile::tempdir().unwrap();
        let wallet = WalletService::open(Some(dir.path().to_path_buf()));
        assert_eq!(wallet.address(), None);
        assert!(wallet.set_address(Some("nope")).is_err());
        wallet
            .set_address(Some("0x2222222222222222222222222222222222222222"))
            .unwrap();
        let again = WalletService::open(Some(dir.path().to_path_buf()));
        assert_eq!(again.address().as_deref(), Some(ADDR));
        again.set_address(None).unwrap();
        assert_eq!(
            WalletService::open(Some(dir.path().to_path_buf())).address(),
            None
        );
    }

    #[tokio::test]
    async fn report_resolves_the_waiting_proposal() {
        let wallet = WalletService::open(None);
        let (id, waiting) = wallet.propose("s1", ADDR.to_string(), tx(), vec![], None);
        assert_eq!(wallet.snapshot().requests.len(), 1);
        assert!(wallet.report(&id, "sent", Some("0x12"), None).is_err());
        wallet.report(&id, "sent", Some(HASH), None).unwrap();
        assert_eq!(waiting.await.unwrap(), TxOutcome::Sent(HASH.to_string()));
        assert!(wallet.snapshot().requests.is_empty());
        assert!(wallet.report(&id, "rejected", None, None).is_err());
    }

    #[tokio::test]
    async fn disconnect_and_turn_end_reject_proposals() {
        let wallet = WalletService::open(None);
        wallet.set_address(Some(ADDR)).unwrap();
        let (_, a) = wallet.propose("s1", ADDR.to_string(), tx(), vec![], None);
        let (_, b) = wallet.propose("s2", ADDR.to_string(), tx(), vec![], None);
        wallet.cancel_session("s1");
        assert_eq!(a.await.unwrap(), TxOutcome::Rejected);
        assert_eq!(wallet.snapshot().requests.len(), 1);
        wallet.set_address(None).unwrap();
        assert_eq!(b.await.unwrap(), TxOutcome::Rejected);
    }
}
