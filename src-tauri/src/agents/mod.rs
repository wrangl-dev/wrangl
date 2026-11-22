//! AI agents: the registry of what can be started. Running them (ACP) comes next.

pub mod registry;

#[cfg(test)]
mod tests;

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use self::registry::{AgentSummary, Registry, REGISTRY_URL};

/// A cached registry younger than this is used without asking the network.
pub const CACHE_FRESH_FOR: Duration = Duration::from_secs(6 * 60 * 60);
const CACHE_FILE: &str = "acp-registry.json";

/// Reads the registry, through a file cache so the agent list still works offline.
#[derive(Debug, Clone)]
pub struct RegistryStore {
    cache: Option<PathBuf>,
    url: String,
}

impl Default for RegistryStore {
    fn default() -> Self {
        Self::new(
            crate::paths::data_dir().map(|d| d.join(CACHE_FILE)),
            REGISTRY_URL,
        )
    }
}

fn parse(text: &str) -> Result<Registry, String> {
    serde_json::from_str(text).map_err(|e| format!("the agent registry did not parse: {e}"))
}

fn age(path: &Path) -> Option<Duration> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    SystemTime::now().duration_since(modified).ok()
}

impl RegistryStore {
    #[must_use]
    pub fn new(cache: Option<PathBuf>, url: impl Into<String>) -> Self {
        Self {
            cache,
            url: url.into(),
        }
    }

    fn read_cache(&self) -> Option<(Registry, Duration)> {
        let path = self.cache.as_ref()?;
        let text = std::fs::read_to_string(path).ok()?;
        let registry = parse(&text).ok()?;
        Some((registry, age(path).unwrap_or(Duration::MAX)))
    }

    fn write_cache(&self, text: &str) {
        let Some(path) = &self.cache else { return };
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Err(e) = std::fs::write(path, text) {
            log::warn!("[agents] could not cache the registry: {e}");
        }
    }

    async fn download(&self) -> Result<String, String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent(concat!("wrangl/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|e| e.to_string())?;
        let response = client
            .get(&self.url)
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
            .map_err(|e| format!("could not download the agent registry: {e}"))?;
        response
            .text()
            .await
            .map_err(|e| format!("could not read the agent registry: {e}"))
    }

    /// The registry: a fresh cache, else the network, else a stale cache.
    pub async fn load(&self, refresh: bool) -> Result<Registry, String> {
        let cached = self.read_cache();
        if let Some((registry, age)) = &cached {
            if !refresh && *age < CACHE_FRESH_FOR {
                return Ok(registry.clone());
            }
        }
        match self.download().await.and_then(|text| {
            let registry = parse(&text)?;
            Ok((text, registry))
        }) {
            Ok((text, registry)) => {
                self.write_cache(&text);
                log::info!(
                    "[agents] registry updated: {} agents",
                    registry.agents.len()
                );
                Ok(registry)
            }
            Err(e) => match cached {
                Some((registry, _)) => {
                    log::warn!("[agents] {e}; using the cached registry");
                    Ok(registry)
                }
                None => {
                    log::error!("[agents] {e}");
                    Err(e)
                }
            },
        }
    }

    /// Agents for this machine, sorted by name.
    pub async fn list(&self, refresh: bool) -> Result<Vec<AgentSummary>, String> {
        let registry = self.load(refresh).await?;
        Ok(registry::summarise(
            &registry,
            &registry::current_platform(),
        ))
    }
}
