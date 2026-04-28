use std::fmt;
use std::time::Duration;

/// Default base URL for Autumn's hosted API.
pub const DEFAULT_BASE_URL: &str = "https://api.useautumn.com/v1";

/// Default value sent in the `X-Api-Version` header.
pub const DEFAULT_API_VERSION: &str = "2.2.0";

/// Configuration for the Autumn API client.
///
/// Construct via [`AutumnConfig::new`] and chain the builder methods to
/// override defaults, then pass to [`Autumn::with_config`](crate::Autumn::with_config).
///
/// ```no_run
/// use std::time::Duration;
/// use autumn_rs::{Autumn, AutumnConfig};
///
/// let autumn = Autumn::with_config(
///     AutumnConfig::new("am_sk_test_...")
///         .timeout(Duration::from_secs(10))
///         .max_retries(3),
/// )?;
/// # Ok::<_, autumn_rs::AutumnError>(())
/// ```
#[derive(Clone)]
pub struct AutumnConfig {
    pub(crate) api_token: String,
    pub(crate) base_url: String,
    pub(crate) api_version: String,
    pub(crate) timeout: Duration,
    pub(crate) max_retries: u32,
    pub(crate) user_agent: String,
}

impl AutumnConfig {
    /// Creates a configuration pointing at Autumn's hosted API with sensible
    /// defaults: 30s timeout, 2 retries on transient failures, the current
    /// supported API version, and a `autumn-rs/<version>` user agent.
    pub fn new(api_token: impl Into<String>) -> Self {
        Self {
            api_token: api_token.into(),
            base_url: DEFAULT_BASE_URL.to_owned(),
            api_version: DEFAULT_API_VERSION.to_owned(),
            timeout: Duration::from_secs(30),
            max_retries: 2,
            user_agent: format!("autumn-rs/{}", env!("CARGO_PKG_VERSION")),
        }
    }

    /// Overrides the API base URL.
    ///
    /// Include the `/v1` path segment for self-hosted endpoints. The default is
    /// [`DEFAULT_BASE_URL`].
    pub fn base_url(mut self, base_url: impl Into<String>) -> Self {
        self.base_url = base_url.into().trim_end_matches('/').to_owned();
        self
    }

    /// Overrides the value sent in the `X-Api-Version` header.
    ///
    /// Defaults to [`DEFAULT_API_VERSION`].
    pub fn api_version(mut self, api_version: impl Into<String>) -> Self {
        self.api_version = api_version.into();
        self
    }

    /// Sets the total request timeout (default 30s).
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// Number of automatic retries on transient errors (default 2).
    ///
    /// The client retries connection failures, timeouts, and HTTP 5xx
    /// responses with exponential backoff (100ms, 200ms, 400ms, ...). Successes
    /// and 4xx responses are never retried.
    pub fn max_retries(mut self, max_retries: u32) -> Self {
        self.max_retries = max_retries;
        self
    }

    /// Overrides the `User-Agent` header.
    ///
    /// Defaults to `autumn-rs/<crate-version>`.
    pub fn user_agent(mut self, user_agent: impl Into<String>) -> Self {
        self.user_agent = user_agent.into();
        self
    }
}

impl fmt::Debug for AutumnConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("AutumnConfig")
            .field("api_token", &"[redacted]")
            .field("base_url", &self.base_url)
            .field("api_version", &self.api_version)
            .field("timeout", &self.timeout)
            .field("max_retries", &self.max_retries)
            .field("user_agent", &self.user_agent)
            .finish()
    }
}
