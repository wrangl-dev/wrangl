//! Project files for `@` mentions: search a project's files by name, and turn a picked file into
//! the `file://` link an agent receives with the message.
//!
//! The search walks like ripgrep: it skips what `.gitignore` excludes, hidden files and `.git`.

use std::path::{Component, Path, PathBuf};

/// Files looked at per search at most, so a huge folder cannot stall the app.
pub const WALK_LIMIT: usize = 50_000;
/// Results per search at most.
pub const RESULT_LIMIT: usize = 50;

/// How well `path` (relative, `/`-separated, lowercase) matches `query` (lowercase).
/// Lower is better; `None` is no match.
fn score(path: &str, query: &str) -> Option<usize> {
    if query.is_empty() {
        return Some(path.matches('/').count() * 1000 + path.len());
    }
    let name = path.rsplit('/').next().unwrap_or(path);
    if name.starts_with(query) {
        return Some(path.len());
    }
    if name.contains(query) {
        return Some(10_000 + path.len());
    }
    if path.contains(query) {
        return Some(20_000 + path.len());
    }
    // Letters in order, like most editors' file pickers: "chst" finds "chat-store.ts".
    let mut letters = query.chars();
    let mut want = letters.next();
    for c in path.chars() {
        if Some(c) == want {
            want = letters.next();
        }
    }
    want.is_none().then_some(30_000 + path.len())
}

/// Files under `root` whose path matches `query`, best first, as `/`-separated relative paths.
#[must_use]
pub fn search(root: &Path, query: &str, limit: usize) -> Vec<String> {
    let query = query.trim().to_lowercase().replace('\\', "/");
    let mut found: Vec<(usize, String)> = ignore::WalkBuilder::new(root)
        .hidden(true)
        .git_ignore(true)
        .git_global(false)
        .require_git(false)
        .build()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_some_and(|t| t.is_file()))
        .take(WALK_LIMIT)
        .filter_map(|e| {
            let rel = e.path().strip_prefix(root).ok()?;
            let rel = rel
                .components()
                .map(|c| c.as_os_str().to_string_lossy())
                .collect::<Vec<_>>()
                .join("/");
            score(&rel.to_lowercase(), &query).map(|s| (s, rel))
        })
        .collect();
    found.sort();
    found
        .into_iter()
        .take(limit.min(RESULT_LIMIT))
        .map(|(_, p)| p)
        .collect()
}

/// The absolute path of `rel` inside `root`, refusing anything that leaves `root`.
pub fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel_path.is_absolute()
        || rel_path.components().any(|c| {
            matches!(
                c,
                Component::ParentDir | Component::Prefix(_) | Component::RootDir
            )
        })
    {
        return Err(format!("{rel} is not inside the project"));
    }
    let path = root.join(rel_path);
    if !path.is_file() {
        return Err(format!("{rel} is not a file in the project"));
    }
    Ok(path)
}

/// `file://` link for an absolute path.
pub fn file_uri(path: &Path) -> Result<String, String> {
    url::Url::from_file_path(path)
        .map(String::from)
        .map_err(|()| format!("{} is not an absolute path", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        for f in [
            "src/lib/chat-store.ts",
            "src/lib/chat.ts",
            "src/App.tsx",
            "README.md",
            "node_modules/react/index.js",
            ".env",
            "dist/app.js",
        ] {
            let p = root.join(f);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(p, "x").unwrap();
        }
        std::fs::write(root.join(".gitignore"), "node_modules/\ndist/\n").unwrap();
        dir
    }

    #[test]
    fn finds_by_name_first_and_skips_ignored_and_hidden_files() {
        let dir = project();
        let found = search(dir.path(), "chat", 10);
        assert_eq!(found, ["src/lib/chat.ts", "src/lib/chat-store.ts"]);
        assert_eq!(search(dir.path(), "chst", 10), ["src/lib/chat-store.ts"]);
        let all = search(dir.path(), "", 10);
        assert_eq!(all.first().map(String::as_str), Some("README.md"));
        assert!(!all
            .iter()
            .any(|p| p.contains("node_modules") || p.contains("dist") || p == ".env"));
        assert_eq!(search(dir.path(), "SRC\\APP", 10), ["src/App.tsx"]);
    }

    #[test]
    fn only_files_inside_the_project_resolve() {
        let dir = project();
        let ok = resolve(dir.path(), "src/App.tsx").unwrap();
        assert!(ok.ends_with("App.tsx"));
        assert!(file_uri(&ok).unwrap().starts_with("file:///"));
        for bad in ["../secret", "/etc/passwd", "src", "missing.ts"] {
            assert!(resolve(dir.path(), bad).is_err(), "{bad}");
        }
    }
}
