//! `WRANGL_<suffix>` environment variable lookups. Values are never logged.

pub const PREFIX: &str = "WRANGL_";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnvValue {
    /// The variable that supplied `value`, for error messages.
    pub name: String,
    pub value: String,
}

/// Full variable name for `suffix`, e.g. `name("SERVER") == "WRANGL_SERVER"`.
#[must_use]
pub fn name(suffix: &str) -> String {
    format!("{PREFIX}{suffix}")
}

pub(crate) fn lookup(suffix: &str, read: impl Fn(&str) -> Option<String>) -> Option<EnvValue> {
    let name = name(suffix);
    read(&name).map(|value| EnvValue { name, value })
}

/// Process-environment read of `WRANGL_<suffix>`. Non-UTF-8 values count as
/// unset, as `std::env::var(..).ok()` does.
#[must_use]
pub fn var(suffix: &str) -> Option<EnvValue> {
    lookup(suffix, |name| std::env::var(name).ok())
}

/// `var(suffix)`'s value alone.
#[must_use]
pub fn value(suffix: &str) -> Option<String> {
    var(suffix).map(|found| found.value)
}

#[cfg(test)]
#[path = "brand_env_tests.rs"]
mod tests;
