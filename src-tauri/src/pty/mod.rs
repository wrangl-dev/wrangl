//! Terminal sessions: one pseudo-terminal and shell per tab.

pub mod commands;
pub mod shell;
pub mod utf8;

#[cfg(test)]
mod manager_tests;
#[cfg(test)]
mod shell_tests;
#[cfg(test)]
mod utf8_tests;

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;

use self::utf8::Utf8Stream;

/// What a terminal sends to the UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PtyEvent {
    /// Text the shell printed.
    Data { data: String },
    /// The shell ended. `code` is missing when it was killed.
    Exit { code: Option<u32> },
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

/// All open terminals, keyed by id.
#[derive(Default, Clone)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, Session>>>,
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows: rows.max(1),
        cols: cols.max(1),
        pixel_width: 0,
        pixel_height: 0,
    }
}

impl PtyManager {
    /// Start the default shell in `cwd` (or the home folder).
    pub fn spawn_shell<F>(
        &self,
        cols: u16,
        rows: u16,
        cwd: Option<PathBuf>,
        on_event: F,
    ) -> Result<String, String>
    where
        F: Fn(PtyEvent) + Send + Sync + 'static,
    {
        let shell = shell::default_shell();
        let mut cmd = CommandBuilder::new(&shell.program);
        cmd.args(&shell.args);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        if let Some(dir) = cwd.filter(|d| d.is_dir()).or_else(home_dir) {
            cmd.cwd(dir);
        }
        self.spawn(cmd, cols, rows, on_event)
    }

    /// Start `cmd` in a new pseudo-terminal and stream its output to `on_event`.
    pub fn spawn<F>(
        &self,
        cmd: CommandBuilder,
        cols: u16,
        rows: u16,
        on_event: F,
    ) -> Result<String, String>
    where
        F: Fn(PtyEvent) + Send + Sync + 'static,
    {
        let pair = native_pty_system()
            .openpty(size(cols, rows))
            .map_err(|e| format!("could not open a terminal: {e}"))?;
        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("could not start the shell: {e}"))?;
        drop(pair.slave);
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("could not read the terminal: {e}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("could not write to the terminal: {e}"))?;

        let id = uuid::Uuid::new_v4().to_string();
        self.sessions.lock().insert(
            id.clone(),
            Session {
                master: pair.master,
                writer,
                child,
            },
        );
        log::info!("[pty] spawned {id}");

        let on_event = Arc::new(on_event);
        let reader_events = Arc::clone(&on_event);
        let reader_thread = std::thread::Builder::new()
            .name(format!("pty-read-{id}"))
            .spawn(move || read_loop(reader, &*reader_events))
            .map_err(|e| format!("could not start the terminal reader: {e}"))?;

        let sessions = Arc::clone(&self.sessions);
        let watch_id = id.clone();
        std::thread::Builder::new()
            .name(format!("pty-wait-{id}"))
            .spawn(move || {
                let code = wait_for_exit(&sessions, &watch_id);
                // Closing the session dropped the master side, so the reader drains and ends.
                let _ = reader_thread.join();
                log::info!("[pty] {watch_id} exited with {code:?}");
                on_event(PtyEvent::Exit { code });
            })
            .map_err(|e| format!("could not start the terminal watcher: {e}"))?;
        Ok(id)
    }

    /// Send keystrokes or pasted text to a terminal.
    pub fn write(&self, id: &str, data: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock();
        let session = sessions.get_mut(id).ok_or_else(|| unknown(id))?;
        session
            .writer
            .write_all(data.as_bytes())
            .and_then(|()| session.writer.flush())
            .map_err(|e| format!("could not write to the terminal: {e}"))
    }

    /// Tell a terminal its new size.
    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock();
        let session = sessions.get(id).ok_or_else(|| unknown(id))?;
        session
            .master
            .resize(size(cols, rows))
            .map_err(|e| format!("could not resize the terminal: {e}"))
    }

    /// Stop a terminal's shell. Unknown ids are ignored: the shell may have exited already.
    pub fn kill(&self, id: &str) {
        let removed = self.sessions.lock().remove(id);
        if let Some(mut session) = removed {
            if let Err(e) = session.child.kill() {
                log::warn!("[pty] kill {id} failed: {e}");
            }
            log::info!("[pty] killed {id}");
        }
    }

    /// Stop every terminal. Called when the app quits.
    pub fn kill_all(&self) {
        let ids: Vec<String> = self.sessions.lock().keys().cloned().collect();
        for id in ids {
            self.kill(&id);
        }
    }

    /// How many terminals are open.
    #[must_use]
    pub fn len(&self) -> usize {
        self.sessions.lock().len()
    }

    /// Whether no terminal is open.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// Poll the shell until it exits or is killed, then close its session.
///
/// Windows ConPTY keeps the output pipe open after the shell exits, so the reader alone never
/// sees the end; dropping the session's master side is what ends it.
fn wait_for_exit(sessions: &Mutex<HashMap<String, Session>>, id: &str) -> Option<u32> {
    loop {
        {
            let mut map = sessions.lock();
            let Some(session) = map.get_mut(id) else {
                return None; // killed
            };
            match session.child.try_wait() {
                Ok(Some(status)) => {
                    map.remove(id);
                    return Some(status.exit_code());
                }
                Ok(None) => {}
                Err(e) => {
                    log::warn!("[pty] {id} wait failed: {e}");
                    map.remove(id);
                    return None;
                }
            }
        }
        std::thread::sleep(EXIT_POLL);
    }
}

const EXIT_POLL: std::time::Duration = std::time::Duration::from_millis(50);

fn read_loop<F>(mut reader: Box<dyn Read + Send>, on_event: &F)
where
    F: Fn(PtyEvent),
{
    let mut decoder = Utf8Stream::default();
    let mut buf = [0u8; 8192];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let data = decoder.push(&buf[..n]);
                if !data.is_empty() {
                    on_event(PtyEvent::Data { data });
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
            Err(e) => {
                log::info!("[pty] read ended: {e}");
                break;
            }
        }
    }
    let tail = decoder.finish();
    if !tail.is_empty() {
        on_event(PtyEvent::Data { data: tail });
    }
}

fn unknown(id: &str) -> String {
    format!("no terminal with id {id}")
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from)
}
