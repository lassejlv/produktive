use std::{sync::Arc, time::Duration};

use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use url::Url;

use crate::{error::LogError, event::LogEvent, logger::Logger, Result};

/// Default Produktive API base URL.
pub const DEFAULT_BASE_URL: &str = "https://produktive.app";
/// Header carrying the ingest token.
pub const INGEST_TOKEN_HEADER: &str = "x-produktive-log-token";
const DEFAULT_USER_AGENT: &str = "produktive-logs/0.1";
const INGEST_PATH: &str = "/api/logs/ingest";

/// Response from a successful ingest.
#[derive(Debug, Clone, Deserialize)]
pub struct IngestResponse {
    pub accepted: u64,
    pub project_id: String,
}

/// Low-level client for the Produktive log ingest endpoint.
#[derive(Clone, Debug)]
pub struct LogClient {
    inner: Arc<Inner>,
}

#[derive(Debug)]
struct Inner {
    http: reqwest::Client,
    base_url: Url,
    token: String,
    extra_headers: HeaderMap,
}

/// Builder for [`LogClient`].
#[derive(Debug, Default)]
pub struct LogClientBuilder {
    token: Option<String>,
    base_url: Option<String>,
    user_agent: Option<String>,
    http: Option<reqwest::Client>,
    timeout: Option<Duration>,
    extra_headers: HeaderMap,
}

#[derive(Serialize)]
struct Batch<'a> {
    events: &'a [LogEvent],
}

impl LogClient {
    /// Create a client with the given ingest token, targeting the default base URL.
    pub fn new(token: impl Into<String>) -> Result<Self> {
        Self::builder().token(token).build()
    }

    pub fn builder() -> LogClientBuilder {
        LogClientBuilder::default()
    }

    /// Build from `PRODUKTIVE_LOG_TOKEN` (+ optional `PRODUKTIVE_LOG_BASE_URL`).
    pub fn from_env() -> Result<Self> {
        let token = std::env::var("PRODUKTIVE_LOG_TOKEN").map_err(|_| LogError::MissingToken)?;
        let mut builder = Self::builder().token(token);
        if let Ok(base_url) = std::env::var("PRODUKTIVE_LOG_BASE_URL") {
            builder = builder.base_url(base_url);
        }
        builder.build()
    }

    /// The resolved base URL (no trailing slash).
    pub fn base_url(&self) -> &str {
        self.inner.base_url.as_str().trim_end_matches('/')
    }

    /// Send a single event.
    pub async fn ingest(&self, event: LogEvent) -> Result<IngestResponse> {
        self.send(&event).await
    }

    /// Send a batch of events, wrapped as `{ "events": [...] }`.
    pub async fn ingest_batch(&self, events: impl Into<Vec<LogEvent>>) -> Result<IngestResponse> {
        let events = events.into();
        self.send(&Batch { events: &events }).await
    }

    /// Create a structured logger sharing this client's connection, with default
    /// fields merged into every event it sends.
    pub fn logger(&self, defaults: LogEvent) -> Logger {
        Logger::new(self.clone(), defaults)
    }

    async fn send<B: Serialize>(&self, body: &B) -> Result<IngestResponse> {
        let url = self
            .inner
            .base_url
            .join(INGEST_PATH.trim_start_matches('/'))?;
        let response = self
            .inner
            .http
            .post(url)
            .headers(self.inner.extra_headers.clone())
            .header(CONTENT_TYPE, "application/json")
            .header(INGEST_TOKEN_HEADER, &self.inner.token)
            .json(body)
            .send()
            .await
            .map_err(LogError::Transport)?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(LogError::Api { status, body });
        }

        response
            .json::<IngestResponse>()
            .await
            .map_err(LogError::Decode)
    }
}

impl LogClientBuilder {
    pub fn token(mut self, token: impl Into<String>) -> Self {
        self.token = Some(token.into());
        self
    }

    pub fn base_url(mut self, base_url: impl Into<String>) -> Self {
        self.base_url = Some(base_url.into());
        self
    }

    pub fn user_agent(mut self, user_agent: impl Into<String>) -> Self {
        self.user_agent = Some(user_agent.into());
        self
    }

    pub fn http_client(mut self, http: reqwest::Client) -> Self {
        self.http = Some(http);
        self
    }

    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    /// Add an extra header sent on every ingest request.
    pub fn header(mut self, name: HeaderName, value: HeaderValue) -> Self {
        self.extra_headers.insert(name, value);
        self
    }

    pub fn build(self) -> Result<LogClient> {
        let token = self
            .token
            .filter(|t| !t.trim().is_empty())
            .ok_or(LogError::MissingToken)?;
        let base_url = self.base_url.unwrap_or_else(|| DEFAULT_BASE_URL.into());
        let base_url = Url::parse(base_url.trim().trim_end_matches('/'))?;

        let http = match self.http {
            Some(http) => http,
            None => reqwest::Client::builder()
                .user_agent(self.user_agent.unwrap_or_else(|| DEFAULT_USER_AGENT.into()))
                .timeout(self.timeout.unwrap_or_else(|| Duration::from_secs(30)))
                .build()
                .map_err(LogError::Build)?,
        };

        Ok(LogClient {
            inner: Arc::new(Inner {
                http,
                base_url,
                token,
                extra_headers: self.extra_headers,
            }),
        })
    }
}
