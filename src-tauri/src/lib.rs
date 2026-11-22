//! Wrangl desktop runtime.

pub mod app_info;

#[cfg(test)]
mod app_info_tests;

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
        .invoke_handler(tauri::generate_handler![app_info::app_info])
        .setup(|_app| {
            log::info!("[app] started v{}", env!("CARGO_PKG_VERSION"));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Wrangl");
}
