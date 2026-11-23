//! The user's settings: their own Robinhood Chain RPC and CoinGecko key.
//!
//! Kept in `settings.json` in the app data folder, readable only by the user on Unix. The UI
//! never gets the values back, only whether each is set and the RPC's host name.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::chain::tools::{COINGECKO_SECRET, RPC_SECRET};

const FILE: &str = "settings.json";

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub robinhood_rpc_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub coingecko_api_key: Option<String>,
}

/// What the UI may see.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub rpc_url_set: bool,
    /// Host of the RPC (`robinhood-mainnet.g.alchemy.com`), never the path or key.
    pub rpc_host: Option<String>,
    pub coingecko_key_set: bool,
}

/// A change from the UI: `None` keeps a value, an empty string clears it.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    #[serde(default)]
    pub robinhood_rpc_url: Option<String>,
    #[serde(default)]
    pub coingecko_api_key: Option<String>,
}

/// Check an RPC URL the user typed.
pub fn validate_rpc_url(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|_| "that is not a URL".to_string())?;
    match parsed.scheme() {
        "https" => Ok(()),
        "http" if matches!(parsed.host_str(), Some("localhost" | "127.0.0.1")) => Ok(()),
        _ => Err("use an https:// RPC URL".into()),
    }
}

fn host_of(url: &str) -> Option<String> {
    url::Url::parse(url).ok()?.host_str().map(str::to_string)
}

impl Settings {
    #[must_use]
    pub fn view(&self) -> SettingsView {
        SettingsView {
            rpc_url_set: self.robinhood_rpc_url.is_some(),
            rpc_host: self.robinhood_rpc_url.as_deref().and_then(host_of),
            coingecko_key_set: self.coingecko_api_key.is_some(),
        }
    }

    /// Apply a patch, checking what changes.
    pub fn apply(&mut self, patch: SettingsPatch) -> Result<(), String> {
        if let Some(url) = patch.robinhood_rpc_url.map(|u| u.trim().to_string()) {
            if url.is_empty() {
                self.robinhood_rpc_url = None;
            } else {
                validate_rpc_url(&url)?;
                self.robinhood_rpc_url = Some(url);
            }
        }
        if let Some(key) = patch.coingecko_api_key.map(|k| k.trim().to_string()) {
            self.coingecko_api_key = (!key.is_empty()).then_some(key);
        }
        Ok(())
    }

    /// The value for `RPC` or `COINGECKO`, falling back to the environment.
    #[must_use]
    pub fn rpc_url(&self) -> Option<String> {
        self.robinhood_rpc_url
            .clone()
            .or_else(|| std::env::var(RPC_SECRET).ok())
    }

    #[must_use]
    pub fn coingecko_key(&self) -> Option<String> {
        self.coingecko_api_key
            .clone()
            .or_else(|| std::env::var(COINGECKO_SECRET).ok())
    }

    /// Environment for the chain tool server.
    #[must_use]
    pub fn tool_env(&self) -> Vec<(&'static str, String)> {
        let mut env = vec![];
        if let Some(url) = self.rpc_url() {
            env.push((RPC_SECRET, url));
        }
        if let Some(key) = self.coingecko_key() {
            env.push((COINGECKO_SECRET, key));
        }
        env
    }
}

/// Reads and writes `settings.json`.
#[derive(Debug, Clone)]
pub struct SettingsStore {
    path: Option<PathBuf>,
}

impl Default for SettingsStore {
    fn default() -> Self {
        Self::new(crate::paths::data_dir().map(|d| d.join(FILE)))
    }
}

impl SettingsStore {
    #[must_use]
    pub fn new(path: Option<PathBuf>) -> Self {
        Self { path }
    }

    /// The saved settings; defaults when there is no file or it does not parse.
    #[must_use]
    pub fn load(&self) -> Settings {
        self.path
            .as_deref()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, settings: &Settings) -> Result<(), String> {
        let path = self
            .path
            .as_deref()
            .ok_or_else(|| "no data folder to save settings in".to_string())?;
        write_private(
            path,
            &serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?,
        )
        .map_err(|e| format!("could not save settings: {e}"))
    }
}

fn write_private(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, bytes)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600))?;
    }
    std::fs::rename(&tmp, path)
}
