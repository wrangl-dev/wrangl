//! Where Wrangl keeps its files. The desktop app and `wrangl-web` share these folders.

use std::ffi::OsString;
use std::path::PathBuf;

/// The app identifier, also the folder name.
pub const APP_ID: &str = "dev.wrangl.app";

/// Overrides the data folder. Used by the end-to-end tests to run against a throwaway folder.
pub const DATA_DIR_ENV: &str = "WRANGL_DATA_DIR";

/// Per-user data folder: `$WRANGL_DATA_DIR` when set, else `%APPDATA%` on Windows,
/// `~/Library/Application Support` on macOS, `$XDG_DATA_HOME` (or `~/.local/share`) elsewhere.
#[must_use]
pub fn data_dir() -> Option<PathBuf> {
    data_dir_from(|name| std::env::var_os(name))
}

fn data_dir_from(var: impl Fn(&str) -> Option<OsString>) -> Option<PathBuf> {
    if let Some(dir) = var(DATA_DIR_ENV).filter(|d| !d.is_empty()) {
        return Some(PathBuf::from(dir));
    }
    let base = if cfg!(windows) {
        var("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        var("HOME").map(|h| PathBuf::from(h).join("Library/Application Support"))
    } else {
        var("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| var("HOME").map(|h| PathBuf::from(h).join(".local/share")))
    };
    base.map(|b| b.join(APP_ID))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_override_wins_and_an_empty_one_is_ignored() {
        let with = |value: &'static str| {
            move |name: &str| match name {
                DATA_DIR_ENV => Some(OsString::from(value)),
                "APPDATA" | "HOME" | "XDG_DATA_HOME" => Some(OsString::from("/base")),
                _ => None,
            }
        };
        assert_eq!(
            data_dir_from(with("/tmp/e2e")),
            Some(PathBuf::from("/tmp/e2e"))
        );
        let default = data_dir_from(with("")).expect("a default folder");
        assert!(default.ends_with(APP_ID));
    }
}
