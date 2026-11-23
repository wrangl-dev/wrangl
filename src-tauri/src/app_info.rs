//! What the UI shows about the running app.

use serde::Serialize;

/// Robinhood Chain mainnet.
pub const CHAIN_ID: u64 = 4663;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: &'static str,
    pub version: &'static str,
    pub chain_id: u64,
}

#[must_use]
pub fn current() -> AppInfo {
    AppInfo {
        name: "Wrangl",
        version: env!("CARGO_PKG_VERSION"),
        chain_id: CHAIN_ID,
    }
}
