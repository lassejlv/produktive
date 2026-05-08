//! Minimal async Rust SDK for the [Polar](https://polar.sh) API.
//!
//! This crate intentionally stays small: it provides an authenticated async
//! `reqwest` client, JSON-first resource helpers, webhook validation, and a
//! typed escape hatch through `request_json`.
//!
//! ```no_run
//! use polar_rs::Polar;
//! use serde_json::json;
//!
//! # async fn run() -> polar_rs::Result<()> {
//! let polar = Polar::new("polar_oat_...")?;
//! let products = polar.products().list(&json!({ "organization_id": "org_..." })).await?;
//! let checkout = polar
//!     .checkouts()
//!     .create(&json!({ "products": ["prod_..."] }))
//!     .await?;
//! # Ok(())
//! # }
//! ```

mod config;
mod error;
mod resources;

pub mod webhooks;

use serde::de::DeserializeOwned;
use serde::Serialize;

pub use config::{PolarConfig, Server, DEFAULT_PRODUCTION_URL, DEFAULT_SANDBOX_URL};
pub use error::{ApiError, PolarError, Result};
pub use resources::*;

pub type JsonValue = serde_json::Value;

#[derive(Clone, Debug)]
pub struct Polar {
    http: reqwest::Client,
    base_url: String,
}

impl Polar {
    pub fn new(access_token: impl Into<String>) -> Result<Self> {
        Self::with_config(PolarConfig::new(access_token))
    }

    pub fn from_env() -> Result<Self> {
        Self::with_config(PolarConfig::from_env())
    }

    pub fn without_access_token() -> Result<Self> {
        Self::with_config(PolarConfig::without_access_token())
    }

    pub fn customer_session(customer_session: impl Into<String>) -> Result<Self> {
        Self::with_config(PolarConfig::new(customer_session))
    }

    pub fn with_config(config: PolarConfig) -> Result<Self> {
        let http = http_client(&config)?;
        Ok(Self {
            http,
            base_url: config.base_url,
        })
    }

    pub fn with_client(base_url: impl Into<String>, http: reqwest::Client) -> Self {
        Self {
            http,
            base_url: base_url.into().trim_end_matches('/').to_owned(),
        }
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    pub async fn request_json<T, Q, B>(
        &self,
        method: reqwest::Method,
        path: &str,
        query: Option<&Q>,
        body: Option<&B>,
    ) -> Result<T>
    where
        T: DeserializeOwned,
        Q: Serialize + ?Sized,
        B: Serialize + ?Sized,
    {
        let mut request = self.http.request(method, self.url(path));
        if let Some(query) = query {
            request = request.query(query);
        }
        if let Some(body) = body {
            request = request.json(body);
        }

        let response = request.send().await?;
        parse_response(response).await
    }

    pub async fn get_json<T, Q>(&self, path: &str, query: Option<&Q>) -> Result<T>
    where
        T: DeserializeOwned,
        Q: Serialize + ?Sized,
    {
        self.request_json::<T, Q, ()>(reqwest::Method::GET, path, query, None)
            .await
    }

    pub async fn post_json<T, B>(&self, path: &str, body: &B) -> Result<T>
    where
        T: DeserializeOwned,
        B: Serialize + ?Sized,
    {
        self.request_json::<T, (), B>(reqwest::Method::POST, path, None, Some(body))
            .await
    }

    pub async fn patch_json<T, B>(&self, path: &str, body: &B) -> Result<T>
    where
        T: DeserializeOwned,
        B: Serialize + ?Sized,
    {
        self.request_json::<T, (), B>(reqwest::Method::PATCH, path, None, Some(body))
            .await
    }

    pub async fn delete_json<T>(&self, path: &str) -> Result<T>
    where
        T: DeserializeOwned,
    {
        self.request_json::<T, (), ()>(reqwest::Method::DELETE, path, None, None)
            .await
    }

    pub fn benefits(&self) -> Benefits<'_> {
        Benefits::new(self)
    }

    pub fn checkouts(&self) -> Checkouts<'_> {
        Checkouts::new(self)
    }

    pub fn customers(&self) -> Customers<'_> {
        Customers::new(self)
    }

    pub fn customer_sessions(&self) -> CustomerSessions<'_> {
        CustomerSessions::new(self)
    }

    pub fn orders(&self) -> Orders<'_> {
        Orders::new(self)
    }

    pub fn organizations(&self) -> Organizations<'_> {
        Organizations::new(self)
    }

    pub fn products(&self) -> Products<'_> {
        Products::new(self)
    }

    pub fn subscriptions(&self) -> Subscriptions<'_> {
        Subscriptions::new(self)
    }

    pub fn webhooks(&self) -> Webhooks<'_> {
        Webhooks::new(self)
    }

    fn url(&self, path: &str) -> String {
        format!(
            "{}/{}",
            self.base_url.trim_end_matches('/'),
            path.trim_start_matches('/')
        )
    }
}

fn http_client(config: &PolarConfig) -> Result<reqwest::Client> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::ACCEPT,
        reqwest::header::HeaderValue::from_static("application/json"),
    );
    headers.insert(
        reqwest::header::USER_AGENT,
        reqwest::header::HeaderValue::from_str(&config.user_agent)
            .map_err(|error| PolarError::InvalidRequest(error.to_string()))?,
    );

    if let Some(access_token) = config.access_token.as_ref() {
        if access_token.trim().is_empty() {
            return Err(PolarError::MissingRequiredField("access_token"));
        }
        let value = format!("Bearer {access_token}");
        headers.insert(
            reqwest::header::AUTHORIZATION,
            reqwest::header::HeaderValue::from_str(&value)
                .map_err(|error| PolarError::InvalidRequest(error.to_string()))?,
        );
    }

    Ok(reqwest::Client::builder()
        .timeout(config.timeout)
        .default_headers(headers)
        .build()?)
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
        return Ok(serde_json::from_str("null")?);
    }

    Ok(serde_json::from_str(&body)?)
}
