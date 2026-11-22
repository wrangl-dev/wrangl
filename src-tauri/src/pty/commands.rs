//! Tauri commands the terminal UI calls.

use std::path::PathBuf;

use tauri::ipc::Channel;
use tauri::State;

use super::{PtyEvent, PtyManager};

#[tauri::command]
pub fn pty_spawn(
    manager: State<'_, PtyManager>,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    on_event: Channel<PtyEvent>,
) -> Result<String, String> {
    manager
        .spawn_shell(cols, rows, cwd.map(PathBuf::from), move |event| {
            if let Err(e) = on_event.send(event) {
                log::warn!("[pty] could not deliver output: {e}");
            }
        })
        .inspect_err(|e| log::error!("[pty] spawn failed: {e}"))
}

#[tauri::command]
pub fn pty_write(manager: State<'_, PtyManager>, id: String, data: String) -> Result<(), String> {
    manager.write(&id, &data)
}

#[tauri::command]
pub fn pty_resize(
    manager: State<'_, PtyManager>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    manager.resize(&id, cols, rows)
}

#[tauri::command]
pub fn pty_kill(manager: State<'_, PtyManager>, id: String) {
    manager.kill(&id);
}
