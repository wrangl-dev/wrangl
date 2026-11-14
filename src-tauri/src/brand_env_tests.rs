use std::collections::HashMap;

use super::*;

fn env(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
    let map: HashMap<String, String> = pairs
        .iter()
        .map(|(key, value)| ((*key).to_owned(), (*value).to_owned()))
        .collect();
    move |name| map.get(name).cloned()
}

#[test]
fn reads_prefixed_name() {
    let read = env(&[("WRANGL_WEB_AUTH_TOKEN", "abc")]);
    assert_eq!(
        lookup("WEB_AUTH_TOKEN", read),
        Some(EnvValue {
            name: "WRANGL_WEB_AUTH_TOKEN".to_owned(),
            value: "abc".to_owned(),
        })
    );
}

#[test]
fn unset_is_none() {
    let read = env(&[("WRANGL_OTHER", "1"), ("SESSIONS_DIR", "/x")]);
    assert_eq!(lookup("SESSIONS_DIR", read), None);
}

#[test]
fn name_adds_prefix() {
    assert_eq!(name("SERVER"), "WRANGL_SERVER");
}
