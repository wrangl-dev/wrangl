//! Tokens the user watches, with optional price alerts, in `<data>/watchlist.json`.
//! Watched tokens are also checked for the portfolio.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Most tokens one watchlist holds.
pub const MAX_ITEMS: usize = 100;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchItem {
    /// Lowercase contract address.
    pub address: String,
    pub symbol: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub decimals: Option<u32>,
    /// Milliseconds since the epoch.
    pub added_at: u64,
    /// Alert once the price reaches this (USD); cleared after it fires.
    #[serde(default)]
    pub alert_above: Option<f64>,
    #[serde(default)]
    pub alert_below: Option<f64>,
}

#[derive(Debug, Clone)]
pub struct WatchlistStore {
    path: Option<PathBuf>,
}

impl Default for WatchlistStore {
    fn default() -> Self {
        Self::new(crate::paths::data_dir().map(|d| d.join("watchlist.json")))
    }
}

fn valid_alert(v: Option<f64>) -> Result<Option<f64>, String> {
    match v {
        Some(x) if !x.is_finite() || x <= 0.0 => {
            Err("an alert price must be a positive number".into())
        }
        other => Ok(other),
    }
}

impl WatchlistStore {
    #[must_use]
    pub fn new(path: Option<PathBuf>) -> Self {
        Self { path }
    }

    #[must_use]
    pub fn load(&self) -> Vec<WatchItem> {
        self.path
            .as_ref()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default()
    }

    fn save(&self, items: &[WatchItem]) -> Result<(), String> {
        let path = self
            .path
            .as_ref()
            .ok_or_else(|| "no data folder to keep the watchlist in".to_string())?;
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let text = serde_json::to_string_pretty(items).map_err(|e| e.to_string())?;
        let partial = path.with_extension("json.partial");
        std::fs::write(&partial, text).map_err(|e| format!("could not save the watchlist: {e}"))?;
        std::fs::rename(&partial, path).map_err(|e| format!("could not save the watchlist: {e}"))
    }

    /// Add `item`, or keep the one already there. Newest first.
    pub fn add(&self, item: WatchItem) -> Result<Vec<WatchItem>, String> {
        let mut items = self.load();
        if items.iter().any(|i| i.address == item.address) {
            return Ok(items);
        }
        if items.len() >= MAX_ITEMS {
            return Err(format!("the watchlist holds at most {MAX_ITEMS} tokens"));
        }
        items.insert(0, item);
        self.save(&items)?;
        Ok(items)
    }

    pub fn remove(&self, address: &str) -> Result<Vec<WatchItem>, String> {
        let address = address.to_lowercase();
        let mut items = self.load();
        items.retain(|i| i.address != address);
        self.save(&items)?;
        Ok(items)
    }

    /// Set or clear the alerts of one token.
    pub fn set_alerts(
        &self,
        address: &str,
        above: Option<f64>,
        below: Option<f64>,
    ) -> Result<Vec<WatchItem>, String> {
        let (above, below) = (valid_alert(above)?, valid_alert(below)?);
        let address = address.to_lowercase();
        let mut items = self.load();
        let item = items
            .iter_mut()
            .find(|i| i.address == address)
            .ok_or_else(|| format!("{address} is not on the watchlist"))?;
        item.alert_above = above;
        item.alert_below = below;
        self.save(&items)?;
        Ok(items)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(address: &str) -> WatchItem {
        WatchItem {
            address: address.into(),
            symbol: "T".into(),
            name: String::new(),
            decimals: Some(18),
            added_at: 1,
            alert_above: None,
            alert_below: None,
        }
    }

    #[test]
    fn adds_once_newest_first_sets_alerts_and_removes() {
        let dir = tempfile::tempdir().unwrap();
        let store = WatchlistStore::new(Some(dir.path().join("watchlist.json")));
        assert!(store.load().is_empty());
        store.add(item("0xa")).unwrap();
        let items = store.add(item("0xb")).unwrap();
        assert_eq!(
            items.iter().map(|i| i.address.as_str()).collect::<Vec<_>>(),
            ["0xb", "0xa"]
        );
        assert_eq!(store.add(item("0xa")).unwrap().len(), 2);

        let items = store.set_alerts("0xA", Some(2.5), None).unwrap();
        assert_eq!(items[1].alert_above, Some(2.5));
        assert!(store.set_alerts("0xa", Some(-1.0), None).is_err());
        assert!(store.set_alerts("0xc", Some(1.0), None).is_err());

        assert_eq!(store.remove("0xB").unwrap().len(), 1);
        assert_eq!(store.load()[0].alert_above, Some(2.5));
    }
}
