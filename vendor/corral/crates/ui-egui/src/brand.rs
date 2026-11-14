//! The product name the UI shows. A build with `CORRAL_BRAND_NAME` set ships under that name:
//! catalog strings say it instead of "Corral" (build.rs fills it in), and About shows a
//! plain-text attribution in place of upstream's blurb and links.

use std::borrow::Cow;

/// Upstream's name. Catalog keys and the English text in the code keep it.
pub const UPSTREAM: &str = "Corral";

/// The name this build shows.
pub const NAME: &str = match option_env!("CORRAL_BRAND_NAME") {
    Some(name) if !name.is_empty() => name,
    _ => UPSTREAM,
};

/// Built under another name than upstream's.
pub const REBRANDED: bool = !same(NAME, UPSTREAM);

/// What About says in a rebranded build, in place of upstream's blurb and links.
pub const ATTRIBUTION: &str = "Based on Corral, dual-licensed MIT OR Apache-2.0.";

const fn same(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    let mut i = 0;
    while i < a.len() {
        if a[i] != b[i] {
            return false;
        }
        i += 1;
    }
    true
}

/// `text` with upstream's name replaced by this build's: for English text that doesn't come from
/// a catalog (the engine's command labels).
pub fn rename(text: &str) -> Cow<'_, str> {
    if REBRANDED && text.contains(UPSTREAM) { Cow::Owned(text.replace(UPSTREAM, NAME)) } else { Cow::Borrowed(text) }
}

#[cfg(test)]
#[path = "brand_tests.rs"]
mod tests;
