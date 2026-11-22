//! Wrangl desktop runtime.

pub mod app_info;
pub mod bridge;
pub mod pty;
pub mod web;

#[cfg(test)]
mod app_info_tests;

use tauri::Manager;

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
        .manage(pty::PtyManager::default())
        .invoke_handler(tauri::generate_handler![
            app_info::app_info,
            pty::commands::pty_spawn,
            pty::commands::pty_write,
            pty::commands::pty_resize,
            pty::commands::pty_kill,
        ])
        .setup(|_app| {
            log::info!("[app] started v{}", env!("CARGO_PKG_VERSION"));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Wrangl")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                app.state::<pty::PtyManager>().kill_all();
            }
        });
}
