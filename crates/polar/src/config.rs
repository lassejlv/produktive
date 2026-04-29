use std::fmt;
use std::time::Duration;

/// Default base URL for Polar's hosted API.
pub const DEFAULT_BASE_URL: &str = "https://api.polar.sh";

/// Sandbox base URL for testing.
pub const SANDBOX_BASE_URL: &str = "https://sandbox-api.polar.sh";

/// Configuration for the Polar API client.
///
/// Construct via [`PolarConfig::new`] and chain the builder methods to override
/// defaults, then pass to [`Polar::with_config`](crate::Polar::with_config).
#[derive(Clone)]
pub struct PolarConfig {
    pub(crate) access_token: String,
    pub(crate) base_url: String,
    pub(crate) timeout: Duration,
    pub(crate) max_retries: u32,
    pub(crate) user_agent: String,
}

impl PolarConfig {
    /// Creates a configuration pointing at Polar's hosted API with sensible
    /// defaults: 30s timeout, 2 retries on transient failures.
    pub fn new(access_token: impl Into<String>) -> Self {
        Self {
            access_token: access_token.into(),
            base_url: DEFAULT_BASE_URL.to_owned(),
            timeout: Duration::from_secs(30),
            max_retries: 2,
            user_agent: format!("polar-rs/{}", env!("CARGO_PKG_VERSION")),
        }
    }

    /// Overrides the API base URL. Do not include a trailing slash — paths are
    /// expected to start with `/v1/...`.
    pub fn base_url(mut self, base_url: impl Into<String>) -> Self {
        self.base_url = base_url.into().trim_end_matches('/').to_owned();
        self
    }

    /// Targets Polar's sandbox environment instead of production.
    pub fn sandbox(mut self) -> Self {
        self.base_url = SANDBOX_BASE_URL.to_owned();
        self
    }

    /// Sets the total request timeout (default 30s).
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// Number of automatic retries on transient errors (default 2).
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

impl fmt::Debug for PolarConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("PolarConfig")
            .field("access_token", &"[redacted]")
            .field("base_url", &self.base_url)
            .field("timeout", &self.timeout)
            .field("max_retries", &self.max_retries)
            .field("user_agent", &self.user_agent)
            .finish()
    }
}
