//! End-to-end chat tests against `tests/fake-agent.mjs` (needs Node on PATH).

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use tokio::sync::mpsc;

use super::install::{find_program, CommandLine};
use super::session::{AgentEvent, AgentSessions};

fn fake_agent(env: &[(&str, &str)]) -> Option<CommandLine> {
    let node = find_program("node", std::env::var_os("PATH").as_deref(), cfg!(windows))?;
    let script = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fake-agent.mjs");
    Some(CommandLine {
        program: node,
        args: vec![script.to_string_lossy().into_owned()],
        env: env
            .iter()
            .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
            .collect::<BTreeMap<_, _>>(),
    })
}

fn start(
    sessions: &AgentSessions,
    line: CommandLine,
) -> (String, mpsc::UnboundedReceiver<AgentEvent>) {
    let (tx, rx) = mpsc::unbounded_channel();
    let id = sessions.start(
        line,
        std::env::temp_dir(),
        vec![],
        Arc::new(move |e| {
            let _ = tx.send(e);
        }),
    );
    (id, rx)
}

async fn next_matching(
    rx: &mut mpsc::UnboundedReceiver<AgentEvent>,
    seen: &mut Vec<AgentEvent>,
    want: impl Fn(&AgentEvent) -> bool,
) -> AgentEvent {
    loop {
        let event = tokio::time::timeout(Duration::from_secs(30), rx.recv())
            .await
            .unwrap_or_else(|_| panic!("timed out; events so far: {seen:#?}"))
            .unwrap_or_else(|| panic!("channel closed; events so far: {seen:#?}"));
        seen.push(event.clone());
        if want(&event) {
            return event;
        }
    }
}

fn chunk_text(event: &AgentEvent) -> Option<&str> {
    match event {
        AgentEvent::Update { update } if update["sessionUpdate"] == "agent_message_chunk" => {
            update["content"]["text"].as_str()
        }
        _ => None,
    }
}

#[tokio::test]
async fn a_prompt_streams_asks_permission_and_ends_the_turn() {
    let Some(line) = fake_agent(&[]) else {
        eprintln!("node not found; skipping");
        return;
    };
    let sessions = AgentSessions::default();
    let (id, mut rx) = start(&sessions, line);
    let mut seen = vec![];
    next_matching(
        &mut rx,
        &mut seen,
        |e| matches!(e, AgentEvent::Status { state } if state == "ready"),
    )
    .await;

    sessions.prompt(&id, "list files".into()).unwrap();
    next_matching(&mut rx, &mut seen, |e| chunk_text(e) == Some("hello")).await;

    let AgentEvent::Permission {
        request_id,
        tool_call,
        options,
    } = next_matching(&mut rx, &mut seen, |e| {
        matches!(e, AgentEvent::Permission { .. })
    })
    .await
    else {
        unreachable!()
    };
    assert_eq!(tool_call["title"], "Run ls");
    assert_eq!(options.as_array().map(Vec::len), Some(2));

    sessions
        .respond_permission(&id, &request_id, Some("allow".into()))
        .unwrap();
    next_matching(&mut rx, &mut seen, |e| chunk_text(e) == Some("chose allow")).await;
    let AgentEvent::TurnEnd { stop_reason } = next_matching(&mut rx, &mut seen, |e| {
        matches!(e, AgentEvent::TurnEnd { .. })
    })
    .await
    else {
        unreachable!()
    };
    assert_eq!(stop_reason, Value::from("end_turn"));

    assert!(
        sessions.respond_permission(&id, &request_id, None).is_err(),
        "a request is answered once"
    );
    sessions.stop(&id);
    next_matching(&mut rx, &mut seen, |e| matches!(e, AgentEvent::Exit { .. })).await;
    assert!(sessions.is_empty());
}

#[tokio::test]
async fn refusing_permission_and_cancelling_a_turn() {
    let Some(line) = fake_agent(&[]) else {
        return;
    };
    let sessions = AgentSessions::default();
    let (id, mut rx) = start(&sessions, line);
    let mut seen = vec![];
    next_matching(
        &mut rx,
        &mut seen,
        |e| matches!(e, AgentEvent::Status { state } if state == "ready"),
    )
    .await;

    sessions.prompt(&id, "go".into()).unwrap();
    let AgentEvent::Permission { request_id, .. } = next_matching(&mut rx, &mut seen, |e| {
        matches!(e, AgentEvent::Permission { .. })
    })
    .await
    else {
        unreachable!()
    };
    sessions.respond_permission(&id, &request_id, None).unwrap();
    next_matching(&mut rx, &mut seen, |e| {
        chunk_text(e) == Some("chose cancelled")
    })
    .await;
    next_matching(&mut rx, &mut seen, |e| {
        matches!(e, AgentEvent::TurnEnd { .. })
    })
    .await;

    sessions.prompt(&id, "wait".into()).unwrap();
    next_matching(&mut rx, &mut seen, |e| chunk_text(e) == Some("waiting")).await;
    sessions.cancel(&id).unwrap();
    let AgentEvent::TurnEnd { stop_reason } = next_matching(&mut rx, &mut seen, |e| {
        matches!(e, AgentEvent::TurnEnd { .. })
    })
    .await
    else {
        unreachable!()
    };
    assert_eq!(stop_reason, Value::from("cancelled"));
    sessions.stop(&id);
}

#[tokio::test]
async fn sign_in_is_asked_for_then_the_session_opens() {
    let Some(line) = fake_agent(&[("FAKE_AUTH", "1")]) else {
        return;
    };
    let sessions = AgentSessions::default();
    let (id, mut rx) = start(&sessions, line);
    let mut seen = vec![];
    let AgentEvent::AuthRequired { methods, .. } = next_matching(&mut rx, &mut seen, |e| {
        matches!(e, AgentEvent::AuthRequired { .. })
    })
    .await
    else {
        unreachable!()
    };
    assert_eq!(methods[0]["id"], "fake-login");
    sessions.authenticate(&id, "fake-login".into()).unwrap();
    next_matching(
        &mut rx,
        &mut seen,
        |e| matches!(e, AgentEvent::Status { state } if state == "ready"),
    )
    .await;
    sessions.stop(&id);
}

#[tokio::test]
async fn an_agent_that_cannot_start_reports_exit() {
    let sessions = AgentSessions::default();
    let (_id, mut rx) = start(
        &sessions,
        CommandLine {
            program: PathBuf::from("definitely-not-an-agent-binary"),
            args: vec![],
            env: BTreeMap::new(),
        },
    );
    let mut seen = vec![];
    let AgentEvent::Exit { message } =
        next_matching(&mut rx, &mut seen, |e| matches!(e, AgentEvent::Exit { .. })).await
    else {
        unreachable!()
    };
    assert!(message.is_some());
    assert!(sessions.is_empty());
}

#[tokio::test]
async fn sign_in_asked_by_a_prompt_then_the_next_prompt_works() {
    let Some(line) = fake_agent(&[("FAKE_AUTH", "prompt")]) else {
        return;
    };
    let sessions = AgentSessions::default();
    let (id, mut rx) = start(&sessions, line);
    let mut seen = vec![];
    next_matching(
        &mut rx,
        &mut seen,
        |e| matches!(e, AgentEvent::Status { state } if state == "ready"),
    )
    .await;

    sessions.prompt(&id, "hi".into()).unwrap();
    next_matching(&mut rx, &mut seen, |e| {
        matches!(e, AgentEvent::AuthRequired { .. })
    })
    .await;
    sessions.authenticate(&id, "fake-login".into()).unwrap();
    next_matching(
        &mut rx,
        &mut seen,
        |e| matches!(e, AgentEvent::Status { state } if state == "ready"),
    )
    .await;

    sessions.prompt(&id, "hi".into()).unwrap();
    next_matching(&mut rx, &mut seen, |e| chunk_text(e) == Some("hello")).await;
    sessions.stop(&id);
}

#[test]
fn a_terminal_sign_in_runs_the_agent_with_the_method_arguments() {
    use super::session::terminal_login;
    let line = CommandLine {
        program: PathBuf::from("npx.cmd"),
        args: vec!["-y".into(), "agent@1".into()],
        env: BTreeMap::from([("A".to_string(), "1".to_string())]),
    };
    let methods = serde_json::json!([
        { "id": "api-key", "name": "Key" },
        { "type": "terminal", "id": "login", "name": "Log in", "args": ["--login"], "env": { "B": "2" } }
    ]);
    let login = terminal_login(&line, &methods, "login").unwrap();
    assert_eq!(login.program, PathBuf::from("npx.cmd"));
    assert_eq!(login.args, vec!["-y", "agent@1", "--login"]);
    assert_eq!(login.env.get("A").map(String::as_str), Some("1"));
    assert_eq!(login.env.get("B").map(String::as_str), Some("2"));

    assert!(terminal_login(&line, &methods, "api-key")
        .unwrap_err()
        .contains("not a terminal"));
    assert!(terminal_login(&line, &methods, "nope").is_err());
    assert!(terminal_login(&line, &Value::Null, "login").is_err());
}
