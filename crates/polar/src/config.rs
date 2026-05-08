use std::fmt;
use std::time::Duration;

pub const DEFAULT_PRODUCTION_URL: &str = "https://api.polar.sh";
pub const DEFAULT_SANDBOX_URL: &str = "https://sandbox-api.polar.sh";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Server {
    Production,
    Sandbox,
}

impl Server {
    pub fn base_url(self) -> &'static str {
        match self {
            Self::Production => DEFAULT_PRODUCTION_URL,
            Self::Sandbox => DEFAULT_SANDBOX_URL,
        }
    }
}

#[derive(Clone)]
pub struct PolarConfig {
    pub(crate) access_token: Option<String>,
    pub(crate) base_url: String,
    pub(crate) timeout: Duration,
    pub(crate) user_agent: String,
}

impl PolarConfig {
    pub fn new(access_token: impl Into<String>) -> Self {
        Self {
            access_token: Some(access_token.into()),
            base_url: DEFAULT_PRODUCTION_URL.to_owned(),
            timeout: Duration::from_secs(30),
            user_agent: format!("polar-rs/{}", env!("CARGO_PKG_VERSION")),
        }
    }

    pub fn from_env() -> Self {
        Self {
            access_token: std::env::var("POLAR_ACCESS_TOKEN").ok(),
            base_url: DEFAULT_PRODUCTION_URL.to_owned(),
            timeout: Duration::from_secs(30),
            user_agent: format!("polar-rs/{}", env!("CARGO_PKG_VERSION")),
        }
    }

    pub fn without_access_token() -> Self {
        Self {
            access_token: None,
            base_url: DEFAULT_PRODUCTION_URL.to_owned(),
            timeout: Duration::from_secs(30),
            user_agent: format!("polar-rs/{}", env!("CARGO_PKG_VERSION")),
        }
    }

    pub fn server(mut self, server: Server) -> Self {
        self.base_url = server.base_url().to_owned();
        self
    }

    pub fn base_url(mut self, base_url: impl Into<String>) -> Self {
        self.base_url = base_url.into().trim_end_matches('/').to_owned();
        self
    }

    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub fn user_agent(mut self, user_agent: impl Into<String>) -> Self {
        self.user_agent = user_agent.into();
        self
    }

    pub fn access_token(mut self, access_token: impl Into<String>) -> Self {
        self.access_token = Some(access_token.into());
        self
    }
}

impl fmt::Debug for PolarConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("PolarConfig")
            .field(
                "access_token",
                &self.access_token.as_ref().map(|_| "[redacted]"),
            )
            .field("base_url", &self.base_url)
            .field("timeout", &self.timeout)
            .field("user_agent", &self.user_agent)
            .finish()
    }
}
