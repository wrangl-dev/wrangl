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

/// The agents the registry lists for this machine.
#[tauri::command]
async fn agent_list(
    backend: tauri::State<'_, bridge::Backend>,
    refresh: Option<bool>,
) -> Result<Vec<agents::registry::AgentSummary>, String> {
    backend.agents.list(refresh.unwrap_or(false)).await
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
        .manage(bridge::Backend::default())
        .invoke_handler(tauri::generate_handler![
            app_info::app_info,
            pty::commands::pty_spawn,
            pty::commands::pty_write,
            pty::commands::pty_resize,
            pty::commands::pty_kill,
            agent_list,
        ])
        .setup(|_app| {
            log::info!("[app] started v{}", env!("CARGO_PKG_VERSION"));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Wrangl")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                app.state::<bridge::Backend>().pty.kill_all();
            }
        });
}
