//! Saved chats: one JSON file per chat in `<data>/chats/`, so chats survive a restart.
//!
//! The UI owns the record's shape; this module only needs `id` (a UUID, which keeps file names
//! safe) and strips `items` when listing, so the sidebar loads fast.

use std::path::{Path, PathBuf};

use serde_json::Value;

/// A saved chat larger than this is refused rather than written.
pub const MAX_RECORD_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct HistoryStore {
    dir: Option<PathBuf>,
}

impl Default for HistoryStore {
    fn default() -> Self {
        Self::new(crate::paths::data_dir().map(|d| d.join("chats")))
    }
}

/// A chat id is a UUID: hex digits and dashes only.
#[must_use]
pub fn valid_id(id: &str) -> bool {
    id.len() == 36 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

impl HistoryStore {
    #[must_use]
    pub fn new(dir: Option<PathBuf>) -> Self {
        Self { dir }
    }

    fn dir(&self) -> Result<&Path, String> {
        self.dir
            .as_deref()
            .ok_or_else(|| "no data folder to keep chats in".to_string())
    }

    fn file(&self, id: &str) -> Result<PathBuf, String> {
        if !valid_id(id) {
            return Err(format!("{id} is not a chat id"));
        }
        Ok(self.dir()?.join(format!("{id}.json")))
    }

    /// Every saved chat without its messages, newest first by `updatedAt`.
    pub fn list(&self) -> Result<Vec<Value>, String> {
        let Ok(entries) = std::fs::read_dir(self.dir()?) else {
            return Ok(vec![]);
        };
        let mut out: Vec<Value> = entries
            .filter_map(Result::ok)
            .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
            .filter_map(|e| {
                let text = std::fs::read_to_string(e.path()).ok()?;
                let mut record: Value = serde_json::from_str(&text).ok()?;
                let id = record.get("id")?.as_str()?;
                if !valid_id(id) {
                    return None;
                }
                record.as_object_mut()?.remove("items");
                Some(record)
            })
            .collect();
        out.sort_by(|a, b| {
            let at = |v: &Value| v["updatedAt"].as_f64().unwrap_or(0.0);
            at(b).total_cmp(&at(a))
        });
        Ok(out)
    }

    /// One saved chat with its messages.
    pub fn load(&self, id: &str) -> Result<Value, String> {
        let text = std::fs::read_to_string(self.file(id)?)
            .map_err(|e| format!("could not read chat {id}: {e}"))?;
        serde_json::from_str(&text).map_err(|e| format!("chat {id} is damaged: {e}"))
    }

    /// Write `record` (it must carry its `id`). Written to a temporary file first, so a crash
    /// never leaves half a chat.
    pub fn save(&self, record: &Value) -> Result<(), String> {
        let id = record["id"]
            .as_str()
            .ok_or_else(|| "a saved chat needs an id".to_string())?;
        let path = self.file(id)?;
        let text = serde_json::to_string(record).map_err(|e| e.to_string())?;
        if text.len() > MAX_RECORD_BYTES {
            return Err(format!(
                "chat {id} is too large to save ({} MB)",
                text.len() / 1_000_000
            ));
        }
        std::fs::create_dir_all(self.dir()?).map_err(|e| e.to_string())?;
        let partial = path.with_extension("json.partial");
        std::fs::write(&partial, text).map_err(|e| format!("could not save chat {id}: {e}"))?;
        std::fs::rename(&partial, &path).map_err(|e| format!("could not save chat {id}: {e}"))
    }

    pub fn delete(&self, id: &str) -> Result<(), String> {
        match std::fs::remove_file(self.file(id)?) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
                Err(format!("could not delete chat {id}: {e}"))
            }
            _ => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const A: &str = "11111111-2222-3333-4444-555555555555";
    const B: &str = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

    fn store() -> (tempfile::TempDir, HistoryStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = HistoryStore::new(Some(dir.path().join("chats")));
        (dir, store)
    }

    #[test]
    fn saves_lists_without_messages_and_loads_with_them() {
        let (_dir, store) = store();
        assert_eq!(store.list().unwrap(), Vec::<Value>::new());
        store
            .save(
                &json!({ "id": A, "title": "old", "updatedAt": 1, "items": [{ "type": "user" }] }),
            )
            .unwrap();
        store
            .save(&json!({ "id": B, "title": "new", "updatedAt": 2, "items": [] }))
            .unwrap();

        let list = store.list().unwrap();
        assert_eq!(list[0]["title"], "new");
        assert_eq!(list[1]["title"], "old");
        assert!(list[1].get("items").is_none());
        assert_eq!(store.load(A).unwrap()["items"][0]["type"], "user");

        store.delete(A).unwrap();
        store.delete(A).unwrap();
        assert_eq!(store.list().unwrap().len(), 1);
    }

    #[test]
    fn ids_that_are_not_uuids_are_refused() {
        let (_dir, store) = store();
        for id in [
            "../../evil",
            "a/b",
            "",
            "11111111-2222-3333-4444-55555555555x",
        ] {
            assert!(store.save(&json!({ "id": id })).is_err(), "{id}");
            assert!(store.load(id).is_err(), "{id}");
            assert!(store.delete(id).is_err(), "{id}");
        }
        assert!(store.save(&json!({ "title": "no id" })).is_err());
    }

    #[test]
    fn a_chat_too_large_is_not_written() {
        let (_dir, store) = store();
        let big = "x".repeat(MAX_RECORD_BYTES);
        assert!(store.save(&json!({ "id": A, "items": [big] })).is_err());
        assert!(store.list().unwrap().is_empty());
    }
}
