use std::sync::mpsc;
use std::time::{Duration, Instant};

use portable_pty::CommandBuilder;

use super::{PtyEvent, PtyManager};

fn shell_command(script: &str) -> CommandBuilder {
    if cfg!(windows) {
        let mut cmd = CommandBuilder::new("cmd.exe");
        cmd.args(["/C", script]);
        cmd
    } else {
        let mut cmd = CommandBuilder::new("/bin/sh");
        cmd.args(["-c", script]);
        cmd
    }
}

/// Collect events until the shell exits or the deadline passes.
///
/// Windows ConPTY asks for the cursor position (`ESC[6n`) before it prints anything and waits
/// for the answer; xterm.js answers in the app, so the test answers here.
fn collect(
    manager: &PtyManager,
    id: &str,
    rx: &mpsc::Receiver<PtyEvent>,
) -> (String, Option<Option<u32>>) {
    let deadline = Instant::now() + Duration::from_secs(20);
    let mut out = String::new();
    while Instant::now() < deadline {
        match rx.recv_timeout(Duration::from_millis(200)) {
            Ok(PtyEvent::Data { data }) => {
                if data.contains("\u{1b}[6n") {
                    let _ = manager.write(id, "\u{1b}[1;1R");
                }
                out.push_str(&data);
            }
            Ok(PtyEvent::Exit { code }) => return (out, Some(code)),
            Err(_) => {}
        }
    }
    (out, None)
}

#[test]
fn streams_output_and_reports_exit() {
    let manager = PtyManager::default();
    let (tx, rx) = mpsc::channel();
    let id = manager
        .spawn(shell_command("echo wrangl-pty-ok"), 80, 24, move |e| {
            let _ = tx.send(e);
        })
        .expect("spawn");
    assert!(!id.is_empty());

    let (out, exit) = collect(&manager, &id, &rx);
    assert!(out.contains("wrangl-pty-ok"), "output was {out:?}");
    assert_eq!(exit, Some(Some(0)));
    assert!(
        manager.is_empty(),
        "an exited shell leaves the session list"
    );
}

#[test]
fn unknown_ids_are_errors_for_write_and_resize_but_kill_is_quiet() {
    let manager = PtyManager::default();
    assert!(manager.write("nope", "x").is_err());
    assert!(manager.resize("nope", 80, 24).is_err());
    manager.kill("nope");
}

#[test]
fn kill_removes_a_running_session() {
    let manager = PtyManager::default();
    let script = if cfg!(windows) {
        "ping -n 30 127.0.0.1"
    } else {
        "sleep 30"
    };
    let (tx, rx) = mpsc::channel();
    let id = manager
        .spawn(shell_command(script), 80, 24, move |e| {
            let _ = tx.send(e);
        })
        .expect("spawn");
    assert_eq!(manager.len(), 1);
    manager
        .resize(&id, 120, 40)
        .expect("resize a live terminal");
    manager.kill(&id);
    assert!(manager.is_empty());
    let (_, exit) = collect(&manager, &id, &rx);
    assert!(exit.is_some(), "the reader reports an exit after a kill");
}
