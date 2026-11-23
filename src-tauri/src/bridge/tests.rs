use std::sync::Arc;

use serde_json::{json, Value};

use super::{dispatch, parse_channel, Backend, EventSink, COMMANDS};
use crate::agents::RegistryStore;

/// A backend that never touches the network or the user's registry cache.
fn offline() -> Backend {
    Backend {
        pty: crate::pty::PtyManager::default(),
        agents: RegistryStore::new(None, "http://127.0.0.1:9/registry.json"),
        chats: crate::agents::session::AgentSessions::default(),
        settings: crate::settings::SettingsStore::new(None),
        wallet: crate::wallet::WalletHandle::in_memory(),
    }
}

fn quiet_sink() -> EventSink {
    Arc::new(|_, _| {})
}

#[test]
fn parses_tauri_style_channel_ids() {
    assert_eq!(parse_channel(&json!("__CHANNEL__:7")), Ok(7));
    assert!(parse_channel(&json!("7")).is_err());
    assert!(parse_channel(&json!(7)).is_err());
    assert!(parse_channel(&json!("__CHANNEL__:x")).is_err());
}

#[tokio::test]
async fn app_info_answers_in_the_ui_shape() {
    let (answer, effects) = dispatch(&offline(), "app_info", Value::Null, &quiet_sink())
        .await
        .unwrap();
    assert_eq!(answer["chainId"], 4663);
    assert_eq!(answer["name"], "Wrangl");
    assert_eq!(effects, super::Effects::default());
}

#[tokio::test]
async fn unknown_commands_and_bad_arguments_are_errors() {
    let backend = offline();
    let sink = quiet_sink();
    assert!(dispatch(&backend, "rm_rf", Value::Null, &sink)
        .await
        .unwrap_err()
        .contains("unknown command"));
    assert!(dispatch(&backend, "pty_write", json!({ "id": 1 }), &sink)
        .await
        .unwrap_err()
        .contains("bad arguments"));
    assert!(dispatch(
        &backend,
        "pty_spawn",
        json!({ "cols": 80, "rows": 24, "onEvent": "nope" }),
        &sink
    )
    .await
    .unwrap_err()
    .contains("expected a channel"));
}

#[tokio::test]
async fn kill_reports_its_effect_even_for_unknown_ids() {
    let (_, effects) = dispatch(
        &offline(),
        "pty_kill",
        json!({ "id": "gone" }),
        &quiet_sink(),
    )
    .await
    .unwrap();
    assert_eq!(effects.killed_pty.as_deref(), Some("gone"));
}

#[tokio::test]
async fn every_listed_command_is_dispatched() {
    let backend = offline();
    for cmd in COMMANDS {
        // A bad URL keeps chain_test_rpc off the network.
        let input = if *cmd == "chain_test_rpc" {
            json!({ "rpcUrl": "not a url" })
        } else {
            json!({})
        };
        let err = dispatch(&backend, cmd, input, &quiet_sink()).await.err();
        assert!(
            !err.unwrap_or_default().contains("unknown command"),
            "{cmd} is listed but not dispatched"
        );
    }
}
