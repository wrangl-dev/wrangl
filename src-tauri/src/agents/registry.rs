//! The public ACP Registry: which agents exist and how to start each one.
//!
//! Format: <https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json>. Unknown fields
//! are ignored so a newer registry still parses.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

pub const REGISTRY_URL: &str =
    "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";

#[derive(Debug, Clone, Deserialize)]
pub struct Registry {
    #[serde(default)]
    pub agents: Vec<RegistryAgent>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RegistryAgent {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub website: Option<String>,
    #[serde(default)]
    pub repository: Option<String>,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub distribution: Distribution,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Distribution {
    pub npx: Option<PackageRun>,
    pub uvx: Option<PackageRun>,
    /// Keyed by platform, e.g. `windows-x86_64`, `darwin-aarch64`, `linux-x86_64-musl`.
    pub binary: Option<BTreeMap<String, BinaryRun>>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct PackageRun {
    pub package: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct BinaryRun {
    pub archive: String,
    pub cmd: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub sha256: Option<String>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
}

/// How an agent starts on this machine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Launch {
    Npx(PackageRun),
    Uvx(PackageRun),
    Binary(BinaryRun),
}

impl Launch {
    #[must_use]
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Npx(_) => "npx",
            Self::Uvx(_) => "uvx",
            Self::Binary(_) => "binary",
        }
    }
}

/// This machine's platform key as the registry spells it.
#[must_use]
pub fn current_platform() -> String {
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        other => other,
    };
    let mut key = format!("{os}-{}", std::env::consts::ARCH);
    if cfg!(target_env = "musl") {
        key.push_str("-musl");
    }
    key
}

/// Pick how to start `agent` on `platform`: a native binary first (no Node or Python needed),
/// then npx, then uvx. `None` when the agent does not run here.
#[must_use]
pub fn launch_for(agent: &RegistryAgent, platform: &str) -> Option<Launch> {
    let d = &agent.distribution;
    if let Some(bin) = d.binary.as_ref().and_then(|b| b.get(platform)) {
        return Some(Launch::Binary(bin.clone()));
    }
    if let Some(npx) = &d.npx {
        return Some(Launch::Npx(npx.clone()));
    }
    d.uvx.clone().map(Launch::Uvx)
}

/// What the UI lists for one agent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSummary {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub icon: Option<String>,
    pub website: Option<String>,
    /// `npx`, `uvx` or `binary`; missing when the agent has no build for this machine.
    pub launch: Option<&'static str>,
}

/// Agents sorted by name, case-insensitively.
#[must_use]
pub fn summarise(registry: &Registry, platform: &str) -> Vec<AgentSummary> {
    let mut list: Vec<AgentSummary> = registry
        .agents
        .iter()
        .map(|a| AgentSummary {
            id: a.id.clone(),
            name: a.name.clone(),
            version: a.version.clone(),
            description: a.description.clone(),
            icon: a.icon.clone().filter(|u| u.starts_with("https://")),
            website: a.website.clone().or_else(|| a.repository.clone()),
            launch: launch_for(a, platform).map(|l| l.kind()),
        })
        .collect();
    list.sort_by_key(|a| a.name.to_lowercase());
    list
}
