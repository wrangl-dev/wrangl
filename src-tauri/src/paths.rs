//! Where Wrangl keeps its files. The desktop app and `wrangl-web` share these folders.

use std::path::PathBuf;

/// The app identifier, also the folder name.
pub const APP_ID: &str = "dev.wrangl.app";

/// Per-user data folder: `%APPDATA%` on Windows, `~/Library/Application Support` on macOS,
/// `$XDG_DATA_HOME` (or `~/.local/share`) elsewhere.
#[must_use]
pub fn data_dir() -> Option<PathBuf> {
    let base = if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support"))
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
    };
    base.map(|b| b.join(APP_ID))
}
