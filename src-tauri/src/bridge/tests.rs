use std::sync::Arc;

use serde_json::{json, Value};

use super::{dispatch, parse_channel, Backend, EventSink, COMMANDS};

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

#[test]
fn app_info_answers_in_the_ui_shape() {
    let (answer, effects) =
        dispatch(&Backend::default(), "app_info", Value::Null, &quiet_sink()).unwrap();
    assert_eq!(answer["chainId"], 4663);
    assert_eq!(answer["name"], "Wrangl");
    assert_eq!(effects, super::Effects::default());
}

#[test]
fn unknown_commands_and_bad_arguments_are_errors() {
    let backend = Backend::default();
    let sink = quiet_sink();
    assert!(dispatch(&backend, "rm_rf", Value::Null, &sink)
        .unwrap_err()
        .contains("unknown command"));
    assert!(dispatch(&backend, "pty_write", json!({ "id": 1 }), &sink)
        .unwrap_err()
        .contains("bad arguments"));
    assert!(dispatch(
        &backend,
        "pty_spawn",
        json!({ "cols": 80, "rows": 24, "onEvent": "nope" }),
        &sink
    )
    .unwrap_err()
    .contains("expected a channel"));
}

#[test]
fn kill_reports_its_effect_even_for_unknown_ids() {
    let (_, effects) = dispatch(
        &Backend::default(),
        "pty_kill",
        json!({ "id": "gone" }),
        &quiet_sink(),
    )
    .unwrap();
    assert_eq!(effects.killed_pty.as_deref(), Some("gone"));
}

#[test]
fn every_listed_command_is_dispatched() {
    let backend = Backend::default();
    for cmd in COMMANDS {
        let err = dispatch(&backend, cmd, json!({}), &quiet_sink()).err();
        assert!(
            !err.unwrap_or_default().contains("unknown command"),
            "{cmd} is listed but not dispatched"
        );
    }
}
