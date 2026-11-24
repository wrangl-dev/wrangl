use std::time::{Duration, SystemTime};

use super::registry::{current_platform, launch_for, summarise, Launch, Registry};
use super::RegistryStore;

const SAMPLE: &str = r#"{
  "version": "1.0.0",
  "agents": [
    {
      "id": "zeta", "name": "zeta agent", "version": "1.0.0", "description": "binary and npx",
      "icon": "https://cdn.example/zeta.svg",
      "distribution": {
        "binary": {
          "windows-x86_64": { "archive": "https://x/zeta.zip", "cmd": "./zeta.exe", "args": ["acp"] },
          "linux-x86_64": { "archive": "https://x/zeta.tgz", "cmd": "./zeta" }
        },
        "npx": { "package": "zeta@1.0.0" }
      },
      "someFutureField": { "ignored": true }
    },
    {
      "id": "alpha", "name": "Alpha", "description": "npx only",
      "icon": "http://insecure.example/a.svg",
      "repository": "https://github.com/example/alpha",
      "distribution": { "npx": { "package": "@a/alpha@2.0.0", "args": ["--acp"], "env": { "A": "1" } } }
    },
    {
      "id": "py", "name": "Py", "description": "uvx only",
      "distribution": { "uvx": { "package": "py-agent" } }
    },
    {
      "id": "mac-only", "name": "Mac only", "description": "no build elsewhere",
      "distribution": { "binary": { "darwin-aarch64": { "archive": "https://x/m.zip", "cmd": "./m" } } }
    }
  ],
  "extensions": []
}"#;

fn sample() -> Registry {
    serde_json::from_str(SAMPLE).expect("sample parses")
}

fn agent<'a>(r: &'a Registry, id: &str) -> &'a super::registry::RegistryAgent {
    r.agents.iter().find(|a| a.id == id).unwrap()
}

#[test]
fn parses_and_ignores_unknown_fields() {
    let r = sample();
    assert_eq!(r.agents.len(), 4);
    assert_eq!(
        agent(&r, "alpha").version,
        "",
        "missing version defaults to empty"
    );
}

#[test]
fn prefers_a_native_binary_then_npx_then_uvx() {
    let r = sample();
    match launch_for(agent(&r, "zeta"), "windows-x86_64") {
        Some(Launch::Binary(b)) => {
            assert_eq!(b.cmd, "./zeta.exe");
            assert_eq!(b.args, vec!["acp"]);
        }
        other => panic!("expected a binary, got {other:?}"),
    }
    assert!(matches!(
        launch_for(agent(&r, "zeta"), "darwin-aarch64"),
        Some(Launch::Npx(_))
    ));
    match launch_for(agent(&r, "alpha"), "windows-x86_64") {
        Some(Launch::Npx(p)) => {
            assert_eq!(p.package, "@a/alpha@2.0.0");
            assert_eq!(p.args, vec!["--acp"]);
            assert_eq!(p.env.get("A").map(String::as_str), Some("1"));
        }
        other => panic!("expected npx, got {other:?}"),
    }
    assert!(matches!(
        launch_for(agent(&r, "py"), "linux-x86_64"),
        Some(Launch::Uvx(_))
    ));
    assert_eq!(launch_for(agent(&r, "mac-only"), "windows-x86_64"), None);
}

#[test]
fn summary_sorts_by_name_and_drops_insecure_icons() {
    let list = summarise(&sample(), "windows-x86_64");
    let names: Vec<&str> = list.iter().map(|a| a.name.as_str()).collect();
    assert_eq!(names, vec!["Alpha", "Mac only", "Py", "zeta agent"]);

    let alpha = &list[0];
    assert_eq!(alpha.icon, None, "http icons are not loaded");
    assert_eq!(
        alpha.website.as_deref(),
        Some("https://github.com/example/alpha")
    );
    assert_eq!(alpha.launch, Some("npx"));
    assert_eq!(list[1].launch, None);
    assert_eq!(list[3].launch, Some("binary"));
}

#[test]
fn platform_key_matches_the_registry_spelling() {
    let key = current_platform();
    assert!(
        ["windows-", "darwin-", "linux-"]
            .iter()
            .any(|p| key.starts_with(p)),
        "{key}"
    );
    assert!(!key.contains("macos"));
}

/// A URL nothing listens on, so a download fails fast.
const DEAD_URL: &str = "http://127.0.0.1:9/registry.json";

#[tokio::test]
async fn a_fresh_cache_is_used_without_the_network() {
    let dir = tempfile::tempdir().unwrap();
    let cache = dir.path().join("registry.json");
    std::fs::write(&cache, SAMPLE).unwrap();
    let store = RegistryStore::new(Some(cache), DEAD_URL);
    let list = store.list(false).await.expect("cache hit");
    assert_eq!(list.len(), 4);
}

#[tokio::test]
async fn a_stale_cache_still_answers_when_the_download_fails() {
    let dir = tempfile::tempdir().unwrap();
    let cache = dir.path().join("registry.json");
    std::fs::write(&cache, SAMPLE).unwrap();
    let old = SystemTime::now() - Duration::from_secs(7 * 24 * 60 * 60);
    std::fs::File::options()
        .write(true)
        .open(&cache)
        .unwrap()
        .set_modified(old)
        .unwrap();
    let store = RegistryStore::new(Some(cache), DEAD_URL);
    assert_eq!(store.list(true).await.expect("stale cache").len(), 4);
}

#[tokio::test]
async fn no_cache_and_no_network_is_an_error() {
    let dir = tempfile::tempdir().unwrap();
    let store = RegistryStore::new(Some(dir.path().join("missing.json")), DEAD_URL);
    let err = store.list(false).await.unwrap_err();
    assert!(err.contains("could not download"), "{err}");
}

#[test]
fn agent_events_reach_the_ui_in_camel_case() {
    use super::session::AgentEvent;
    let permission = serde_json::to_value(AgentEvent::Permission {
        request_id: "r1".into(),
        tool_call: serde_json::json!({ "title": "Run ls" }),
        options: serde_json::json!([]),
    })
    .unwrap();
    assert_eq!(permission["kind"], "permission");
    assert_eq!(permission["requestId"], "r1");
    assert_eq!(permission["toolCall"]["title"], "Run ls");

    let end = serde_json::to_value(AgentEvent::TurnEnd {
        stop_reason: serde_json::json!("cancelled"),
    })
    .unwrap();
    assert_eq!(end["kind"], "turnEnd");
    assert_eq!(end["stopReason"], "cancelled");
}
