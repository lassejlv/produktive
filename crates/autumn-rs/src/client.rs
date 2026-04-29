use std::fmt;
use std::sync::Arc;
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, CONTENT_TYPE, USER_AGENT};
use reqwest::{Method, StatusCode};
use serde::de::DeserializeOwned;
use serde::Serialize;
use tokio::time::sleep;

use crate::builders::{AttachBuilder, CancelBuilder, CheckBuilder, TrackBuilder};
use crate::config::AutumnConfig;
use crate::error::{ApiError, AutumnError, Result};
use crate::resources::{
    Balances, Billing, Customers, Entities, Events, Features, Plans, Platform, Referrals,
};

const X_API_VERSION: &str = "X-Api-Version";

/// HTTP client for the Autumn API.
///
/// Cheap to clone — internally an `Arc` wraps the underlying `reqwest::Client`
/// and configuration. Share one instance per process; clone it freely across
/// tasks.
#[derive(Clone)]
pub struct Autumn {
    inner: Arc<ClientInner>,
}

#[derive(Debug)]
pub(crate) struct ClientInner {
    http: reqwest::Client,
    config: AutumnConfig,
}

impl Autumn {
    /// Creates a new client pointing at Autumn's hosted API.
    ///
    /// The `api_token` is your Autumn secret key (`am_sk_test_...` or
    /// `am_sk_live_...`). Returns
    /// [`AutumnError::MissingRequiredField`](crate::AutumnError::MissingRequiredField)
    /// if the token is empty.
    ///
    /// ```no_run
    /// let autumn = autumn_rs::Autumn::new("am_sk_test_...")?;
    /// # Ok::<_, autumn_rs::AutumnError>(())
    /// ```
    pub fn new(api_token: impl Into<String>) -> Result<Self> {
        Self::with_config(AutumnConfig::new(api_token))
    }

    /// Creates a new client from an explicit [`AutumnConfig`].
    ///
    /// Use this when you need to override the base URL (e.g. for a self-hosted
    /// instance), the request timeout, retry count, or `User-Agent` header.
    pub fn with_config(config: AutumnConfig) -> Result<Self> {
        if config.api_token.trim().is_empty() {
            return Err(AutumnError::MissingRequiredField("api_token"));
        }

        let http = reqwest::Client::builder().timeout(config.timeout).build()?;
        Ok(Self {
            inner: Arc::new(ClientInner { http, config }),
        })
    }

    /// Starts a `balances.check` request: verify the customer can use a feature.
    ///
    /// Returns a [`CheckBuilder`]; chain `.feature(...)`, optionally
    /// `.required_balance(...)` / `.entity(...)` / `.with_preview(...)`, then
    /// `.send().await`.
    pub fn check(&self, customer_id: impl Into<String>) -> CheckBuilder {
        CheckBuilder::new(self.clone(), customer_id.into())
    }

    /// Starts a `balances.track` request: record usage of a feature.
    ///
    /// Returns a [`TrackBuilder`]. Either `.feature(...)` or `.event_name(...)`
    /// must be set before `.send().await`. The default value is `1.0`.
    pub fn track(&self, customer_id: impl Into<String>) -> TrackBuilder {
        TrackBuilder::new(self.clone(), customer_id.into())
    }

    /// Starts a `billing.attach` request: subscribe a customer to a plan, or
    /// upgrade / downgrade an existing one.
    ///
    /// The response's `payment_url` is the Stripe Checkout URL when a
    /// redirect is required (set [`RedirectMode`](crate::models::RedirectMode)
    /// via `.redirect_mode(...)` to control this).
    pub fn attach(&self, customer_id: impl Into<String>) -> AttachBuilder {
        AttachBuilder::new(self.clone(), customer_id.into())
    }

    /// Starts a `billing.update` request scoped to cancellation.
    ///
    /// Defaults to `cancel_action: cancel_end_of_cycle`. Use
    /// `.immediately()`, `.end_of_cycle()`, or `.uncancel()` to override.
    pub fn cancel(&self, customer_id: impl Into<String>) -> CancelBuilder {
        CancelBuilder::new(self.clone(), customer_id.into())
    }

    /// Per-feature balance management: `create`, `update`, `delete`, `finalize`.
    pub fn balances(&self) -> Balances {
        Balances::new(self.clone())
    }

    /// Direct (non-builder) billing endpoints: `attach`, `multi_attach`,
    /// `preview_attach`, `update`, `setup_payment`, `open_customer_portal`.
    ///
    /// Prefer the top-level [`Autumn::attach`] / [`Autumn::cancel`] builders
    /// for simple flows; use `billing()` for the request types that need rich
    /// configuration.
    pub fn billing(&self) -> Billing {
        Billing::new(self.clone())
    }

    /// Customer CRUD: `list`, `get_or_create`, `update`, `delete`.
    pub fn customers(&self) -> Customers {
        Customers::new(self.clone())
    }

    /// Sub-customer entities (e.g. seats, workspaces): `create`, `get`,
    /// `update`, `delete`.
    pub fn entities(&self) -> Entities {
        Entities::new(self.clone())
    }

    /// Raw usage events: `list` (per-event) and `aggregate` (timeseries).
    pub fn events(&self) -> Events {
        Events::new(self.clone())
    }

    /// Feature CRUD: `create`, `get`, `list`, `update`, `delete`.
    pub fn features(&self) -> Features {
        Features::new(self.clone())
    }

    /// Plan CRUD: `create`, `get`, `list`, `update`, `delete`.
    ///
    /// Plans are v2's name for what v1 called "products".
    pub fn plans(&self) -> Plans {
        Plans::new(self.clone())
    }

    /// Referral codes: `create_code`, `redeem_code`.
    pub fn referrals(&self) -> Referrals {
        Referrals::new(self.clone())
    }

    /// Multi-tenant platform API (Beta).
    ///
    /// Lets you provision tenant organizations and connect Stripe accounts on
    /// their behalf. Requires platform feature access on your Autumn account.
    pub fn platform(&self) -> Platform {
        Platform::new(self.clone())
    }

    pub(crate) async fn get<T>(&self, path: &str) -> Result<T>
    where
        T: DeserializeOwned,
    {
        self.request(Method::GET, path, Option::<&()>::None).await
    }

    pub(crate) async fn post<T, B>(&self, path: &str, body: &B) -> Result<T>
    where
        T: DeserializeOwned,
        B: Serialize + ?Sized,
    {
        self.request(Method::POST, path, Some(body)).await
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
            tracing::debug!(method = %method, path, attempt, "sending Autumn API request");

            match request.send().await {
                Ok(response) if is_retry_status(response.status()) && attempt + 1 < attempts => {
                    backoff(attempt).await;
                }
                Ok(response) => return parse_response(response).await,
                Err(error) if is_retryable_error(&error) && attempt + 1 < attempts => {
                    last_transport_error = Some(error);
                    backoff(attempt).await;
                }
                Err(error) => return Err(AutumnError::Http(error)),
            }
        }

        Err(AutumnError::Http(
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
        let token = format!("Bearer {}", self.inner.config.api_token);
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&token)
                .map_err(|error| AutumnError::InvalidRequest(error.to_string()))?,
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
        headers.insert(
            USER_AGENT,
            HeaderValue::from_str(&self.inner.config.user_agent)
                .map_err(|error| AutumnError::InvalidRequest(error.to_string()))?,
        );
        headers.insert(
            X_API_VERSION,
            HeaderValue::from_str(&self.inner.config.api_version)
                .map_err(|error| AutumnError::InvalidRequest(error.to_string()))?,
        );
        Ok(headers)
    }
}

impl fmt::Debug for Autumn {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Autumn")
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
        return Err(AutumnError::Api(ApiError::from_body(status, body)));
    }

    if body.trim().is_empty() {
        return Ok(serde_json::from_str("{}")?);
    }

    Ok(serde_json::from_str(&body)?)
}
