use std::fmt;
use std::sync::Arc;
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, CONTENT_TYPE, USER_AGENT};
use reqwest::{Method, StatusCode};
use serde::de::DeserializeOwned;
use serde::Serialize;
use tokio::time::sleep;

use crate::config::PolarConfig;
use crate::error::{ApiError, PolarError, Result};
use crate::resources::{Checkouts, CustomerSessions, Events, Products, Subscriptions};

/// HTTP client for the Polar API.
///
/// Cheap to clone — internally an `Arc` wraps the underlying `reqwest::Client`
/// and configuration. Share one instance per process.
#[derive(Clone)]
pub struct Polar {
    inner: Arc<ClientInner>,
}

#[derive(Debug)]
pub(crate) struct ClientInner {
    http: reqwest::Client,
    config: PolarConfig,
}

impl Polar {
    /// Creates a client with default configuration. Returns
    /// [`PolarError::MissingRequiredField`] if the token is empty.
    pub fn new(access_token: impl Into<String>) -> Result<Self> {
        Self::with_config(PolarConfig::new(access_token))
    }

    /// Creates a client from an explicit [`PolarConfig`].
    pub fn with_config(config: PolarConfig) -> Result<Self> {
        if config.access_token.trim().is_empty() {
            return Err(PolarError::MissingRequiredField("access_token"));
        }

        let http = reqwest::Client::builder().timeout(config.timeout).build()?;
        Ok(Self {
            inner: Arc::new(ClientInner { http, config }),
        })
    }

    /// Checkout sessions: `create`.
    pub fn checkouts(&self) -> Checkouts {
        Checkouts::new(self.clone())
    }

    /// Customer portal sessions: `create`.
    pub fn customer_sessions(&self) -> CustomerSessions {
        CustomerSessions::new(self.clone())
    }

    /// Products: `get`.
    pub fn products(&self) -> Products {
        Products::new(self.clone())
    }

    /// Events: `ingest`.
    pub fn events(&self) -> Events {
        Events::new(self.clone())
    }

    /// Subscriptions: `get`, `update`, `cancel_at_period_end`, `revoke`.
    pub fn subscriptions(&self) -> Subscriptions {
        Subscriptions::new(self.clone())
    }

    pub(crate) async fn post<T, B>(&self, path: &str, body: &B) -> Result<T>
    where
        T: DeserializeOwned,
        B: Serialize + ?Sized,
    {
        self.request(Method::POST, path, Some(body)).await
    }

    pub(crate) async fn patch<T, B>(&self, path: &str, body: &B) -> Result<T>
    where
        T: DeserializeOwned,
        B: Serialize + ?Sized,
    {
        self.request(Method::PATCH, path, Some(body)).await
    }

    pub(crate) async fn get<T>(&self, path: &str) -> Result<T>
    where
        T: DeserializeOwned,
    {
        self.request::<T, ()>(Method::GET, path, None).await
    }

    async fn request<T, B>(&self, method: Method, path: &str, body: Option<&B>) -> Result<T>
    where
        T: DeserializeOwned,
        B: Serialize + ?Sized,
    {
        let attempts = self.inner.config.max_retries + 1;
        let mut last_transport_error = None;

        for attempt in 0..attempts {
            let mut request = self
                .inner
                .http
                .request(method.clone(), self.url(path))
                .headers(self.headers()?);

            if let Some(body) = body {
                request = request.json(body);
            }

            #[cfg(feature = "tracing")]
            tracing::debug!(method = %method, path, attempt, "sending Polar API request");

            match request.send().await {
                Ok(response) if is_retry_status(response.status()) && attempt + 1 < attempts => {
                    backoff(attempt).await;
                }
                Ok(response) => return parse_response(response).await,
                Err(error) if is_retryable_error(&error) && attempt + 1 < attempts => {
                    last_transport_error = Some(error);
                    backoff(attempt).await;
                }
                Err(error) => return Err(PolarError::Http(error)),
            }
        }

        Err(PolarError::Http(
            last_transport_error.expect("retry loop ended without a transport error"),
        ))
    }

    fn url(&self, path: &str) -> String {
        format!(
            "{}{}",
            self.inner.config.base_url.trim_end_matches('/'),
            normalize_path(path)
        )
    }

    fn headers(&self) -> Result<HeaderMap> {
        let mut headers = HeaderMap::new();
        let token = format!("Bearer {}", self.inner.config.access_token);
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&token)
                .map_err(|error| PolarError::InvalidRequest(error.to_string()))?,
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
        headers.insert(
            USER_AGENT,
            HeaderValue::from_str(&self.inner.config.user_agent)
                .map_err(|error| PolarError::InvalidRequest(error.to_string()))?,
        );
        Ok(headers)
    }
}

impl fmt::Debug for Polar {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Polar")
            .field("config", &self.inner.config)
            .finish_non_exhaustive()
    }
}

fn normalize_path(path: &str) -> String {
    if path.starts_with('/') {
        path.to_owned()
    } else {
        format!("/{path}")
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
        return Err(PolarError::Api(ApiError::from_body(status, body)));
    }

    if body.trim().is_empty() {
        return Ok(serde_json::from_str("{}")?);
    }

    Ok(serde_json::from_str(&body)?)
}
