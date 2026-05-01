use std::fmt;
use std::time::Duration;

/// Default base URL for Unkey's hosted API.
pub const DEFAULT_BASE_URL: &str = "https://api.unkey.com";

/// Configuration for the Unkey API client.
#[derive(Clone)]
pub struct UnkeyConfig {
    pub(crate) root_key: String,
    pub(crate) base_url: String,
    pub(crate) timeout: Duration,
    pub(crate) max_retries: u32,
    pub(crate) user_agent: String,
}

impl UnkeyConfig {
    /// Creates a configuration pointing at Unkey's hosted API with sensible
    /// defaults: 30s timeout and 2 retries on transient failures.
    pub fn new(root_key: impl Into<String>) -> Self {
        Self {
            root_key: root_key.into(),
            base_url: DEFAULT_BASE_URL.to_owned(),
            timeout: Duration::from_secs(30),
            max_retries: 2,
            user_agent: format!("unkey-rs/{}", env!("CARGO_PKG_VERSION")),
        }
    }

    /// Overrides the API base URL.
    pub fn base_url(mut self, base_url: impl Into<String>) -> Self {
        self.base_url = base_url.into().trim_end_matches('/').to_owned();
        self
    }

    /// Sets the total request timeout.
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// Number of automatic retries on transient errors.
    pub fn max_retries(mut self, max_retries: u32) -> Self {
        self.max_retries = max_retries;
        self
    }

    /// Overrides the `User-Agent` header.
    pub fn user_agent(mut self, user_agent: impl Into<String>) -> Self {
        self.user_agent = user_agent.into();
        self
    }
}

impl fmt::Debug for UnkeyConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("UnkeyConfig")
            .field("root_key", &"[redacted]")
            .field("base_url", &self.base_url)
            .field("timeout", &self.timeout)
            .field("max_retries", &self.max_retries)
            .field("user_agent", &self.user_agent)
            .finish()
    }
}
