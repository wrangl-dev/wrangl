//! Tauri commands the terminal UI calls.

use std::path::PathBuf;

use tauri::ipc::Channel;
use tauri::State;

use super::PtyEvent;
use crate::bridge::Backend;

#[tauri::command]
pub fn pty_spawn(
    backend: State<'_, Backend>,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    on_event: Channel<PtyEvent>,
) -> Result<String, String> {
    backend
        .pty
        .spawn_shell(cols, rows, cwd.map(PathBuf::from), move |event| {
            if let Err(e) = on_event.send(event) {
                log::warn!("[pty] could not deliver output: {e}");
            }
        })
        .inspect_err(|e| log::error!("[pty] spawn failed: {e}"))
}

#[tauri::command]
pub fn pty_write(backend: State<'_, Backend>, id: String, data: String) -> Result<(), String> {
    backend.pty.write(&id, &data)
}

#[tauri::command]
pub fn pty_resize(
    backend: State<'_, Backend>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    backend.pty.resize(&id, cols, rows)
}

#[tauri::command]
pub fn pty_kill(backend: State<'_, Backend>, id: String) {
    backend.pty.kill(&id);
}
