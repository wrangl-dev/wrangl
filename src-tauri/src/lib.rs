//! Wrangl desktop runtime.

pub mod agents;
pub mod app_info;
pub mod bridge;
pub mod paths;
pub mod pty;
pub mod web;

#[cfg(test)]
mod app_info_tests;

use tauri::Manager;

/// Every UI call in the desktop app: the same command table the browser dev mode uses.
/// `events` carries pushes for commands that stream (terminals, chats); other calls ignore it.
#[tauri::command]
async fn bridge(
    backend: tauri::State<'_, bridge::Backend>,
    cmd: String,
    args: serde_json::Value,
    events: tauri::ipc::Channel<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let sink: bridge::EventSink = std::sync::Arc::new(move |_, payload| {
        if let Err(e) = events.send(payload) {
            log::warn!("[bridge] could not deliver an event: {e}");
        }
    });
    bridge::dispatch(&backend, &cmd, args, &sink)
        .await
        .map(|(answer, _)| answer)
}

/// Start the desktop app.
///
/// # Panics
/// When Tauri cannot build or run the app window.
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        // Updates come from GitHub releases, signed with the Wrangl release key.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(bridge::Backend::default())
        .invoke_handler(tauri::generate_handler![bridge])
        .setup(|_app| {
            log::info!("[app] started v{}", env!("CARGO_PKG_VERSION"));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Wrangl")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let backend = app.state::<bridge::Backend>();
                backend.pty.kill_all();
                backend.chats.stop_all();
            }
        });
}
