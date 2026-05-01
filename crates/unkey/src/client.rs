use std::fmt;
use std::sync::Arc;
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, CONTENT_TYPE, USER_AGENT};
use reqwest::{Method, StatusCode};
use serde::de::DeserializeOwned;
use serde::Serialize;
use tokio::time::sleep;

use crate::config::UnkeyConfig;
use crate::error::{ApiError, Result, UnkeyError};
use crate::resources::{Apis, Identities, Keys, Permissions, Ratelimit};

/// HTTP client for the Unkey API.
///
/// Cheap to clone. Internally an `Arc` wraps the underlying `reqwest::Client`
/// and configuration, so one instance can be shared across a process.
#[derive(Clone)]
pub struct Unkey {
    inner: Arc<ClientInner>,
}

#[derive(Debug)]
pub(crate) struct ClientInner {
    http: reqwest::Client,
    config: UnkeyConfig,
}

impl Unkey {
    /// Creates a client with default configuration.
    pub fn new(root_key: impl Into<String>) -> Result<Self> {
        Self::with_config(UnkeyConfig::new(root_key))
    }

    /// Creates a client from an explicit [`UnkeyConfig`].
    pub fn with_config(config: UnkeyConfig) -> Result<Self> {
        if config.root_key.trim().is_empty() {
            return Err(UnkeyError::MissingRequiredField("root_key"));
        }

        let http = reqwest::Client::builder().timeout(config.timeout).build()?;
        Ok(Self {
            inner: Arc::new(ClientInner { http, config }),
        })
    }

    /// API namespace operations.
    pub fn apis(&self) -> Apis {
        Apis::new(self.clone())
    }

    /// API key operations.
    pub fn keys(&self) -> Keys {
        Keys::new(self.clone())
    }

    /// Identity operations.
    pub fn identities(&self) -> Identities {
        Identities::new(self.clone())
    }

    /// RBAC permission and role operations.
    pub fn permissions(&self) -> Permissions {
        Permissions::new(self.clone())
    }

    /// Ratelimit operations.
    pub fn ratelimit(&self) -> Ratelimit {
        Ratelimit::new(self.clone())
    }

    pub(crate) async fn post<T, B>(&self, procedure: &str, body: &B) -> Result<T>
    where
        T: DeserializeOwned,
        B: Serialize + ?Sized,
    {
        self.request(Method::POST, procedure, body).await
    }

    async fn request<T, B>(&self, method: Method, procedure: &str, body: &B) -> Result<T>
    where
        T: DeserializeOwned,
        B: Serialize + ?Sized,
    {
        let attempts = self.inner.config.max_retries + 1;
        let mut last_transport_error = None;

        for attempt in 0..attempts {
            let request = self
                .inner
                .http
                .request(method.clone(), self.url(procedure))
                .headers(self.headers()?)
                .json(body);

            #[cfg(feature = "tracing")]
            tracing::debug!(method = %method, procedure, attempt, "sending Unkey API request");

            match request.send().await {
                Ok(response) if is_retry_status(response.status()) && attempt + 1 < attempts => {
                    backoff(attempt).await;
                }
                Ok(response) => return parse_response(response).await,
                Err(error) if is_retryable_error(&error) && attempt + 1 < attempts => {
                    last_transport_error = Some(error);
                    backoff(attempt).await;
                }
                Err(error) => return Err(UnkeyError::Http(error)),
            }
        }

        Err(UnkeyError::Http(
            last_transport_error.expect("retry loop ended without a transport error"),
        ))
    }

    fn url(&self, procedure: &str) -> String {
        format!(
            "{}/v2/{}",
            self.inner.config.base_url.trim_end_matches('/'),
            procedure.trim_start_matches('/')
        )
    }

    fn headers(&self) -> Result<HeaderMap> {
        let mut headers = HeaderMap::new();
        let token = format!("Bearer {}", self.inner.config.root_key);
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&token)
                .map_err(|error| UnkeyError::InvalidRequest(error.to_string()))?,
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
        headers.insert(
            USER_AGENT,
            HeaderValue::from_str(&self.inner.config.user_agent)
                .map_err(|error| UnkeyError::InvalidRequest(error.to_string()))?,
        );
        Ok(headers)
    }
}

impl fmt::Debug for Unkey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Unkey")
            .field("config", &self.inner.config)
            .finish_non_exhaustive()
    }
}

fn is_retry_status(status: StatusCode) -> bool {
    status.is_server_error() || status == StatusCode::GATEWAY_TIMEOUT
}

fn is_retryable_error(error: &reqwest::Error) -> bool {
    error.is_timeout() || error.is_connect()
}

async fn backoff(attempt: u32) {
    let delay = 100_u64.saturating_mul(2_u64.saturating_pow(attempt));
    sleep(Duration::from_millis(delay)).await;
}

async fn parse_response<T>(response: reqwest::Response) -> Result<T>
where
    T: DeserializeOwned,
{
    let status = response.status();
    let body = response.text().await?;

    if !status.is_success() {
        return Err(UnkeyError::Api(ApiError::from_body(status, body)));
    }

    if body.trim().is_empty() {
        return Ok(serde_json::from_str("{}")?);
    }

    Ok(serde_json::from_str(&body)?)
}
