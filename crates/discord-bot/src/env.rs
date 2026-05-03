use anyhow::anyhow;

pub fn required_env(key: &str) -> anyhow::Result<String> {
    std::env::var(key)
        .map(|value| value.trim().to_owned())
        .ok()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow!("{key} is required"))
}

pub fn env_or_default(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_owned())
}
