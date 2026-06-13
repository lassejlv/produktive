use std::{sync::Arc, time::Duration};

use reqwest::Method;
use serde::{de::DeserializeOwned, Serialize};
use url::Url;

use crate::{
    balances::BalancesClient,
    billing::BillingClient,
    customers::CustomersClient,
    entities::EntitiesClient,
    error::ApiError,
    events::EventsClient,
    features::FeaturesClient,
    models::{CheckParams, CheckResponse, TrackParams, TrackResponse},
    plans::PlansClient,
    platform::PlatformClient,
    referrals::ReferralsClient,
    AutumnError, Result,
};

const DEFAULT_BASE_URL: &str = "https://api.useautumn.com";
const DEFAULT_API_VERSION: &str = "2.2.0";

#[derive(Clone, Debug)]
pub struct Autumn {
    pub(crate) inner: Arc<AutumnInner>,
}

#[derive(Debug)]
pub(crate) struct AutumnInner {
    pub http: reqwest::Client,
    pub base_url: Url,
    pub secret_key: String,
    pub api_version: String,
}

#[derive(Debug, Default)]
pub struct AutumnBuilder {
    secret_key: Option<String>,
    base_url: Option<String>,
    api_version: Option<String>,
    http: Option<reqwest::Client>,
    timeout: Option<Duration>,
}

impl Autumn {
    pub fn new(secret_key: impl Into<String>) -> Result<Self> {
        Self::builder().secret_key(secret_key).build()
    }

    pub fn builder() -> AutumnBuilder {
        AutumnBuilder::default()
    }

    pub fn from_env() -> Result<Self> {
        let secret_key =
            std::env::var("AUTUMN_SECRET_KEY").map_err(|_| AutumnError::MissingSecretKey)?;
        let mut builder = Self::builder().secret_key(secret_key);

        if let Ok(base_url) = std::env::var("AUTUMN_BASE_URL") {
            builder = builder.base_url(base_url);
        }
        if let Ok(api_version) = std::env::var("AUTUMN_API_VERSION") {
            builder = builder.api_version(api_version);
        }

        builder.build()
    }

    pub async fn check(&self, params: CheckParams) -> Result<CheckResponse> {
        self.post("/v1/balances.check", params).await
    }

    pub async fn track(&self, params: TrackParams) -> Result<TrackResponse> {
        self.post("/v1/balances.track", params).await
    }

    pub fn balances(&self) -> BalancesClient {
        BalancesClient::new(self.clone())
    }

    pub fn billing(&self) -> BillingClient {
        BillingClient::new(self.clone())
    }

    pub fn customers(&self) -> CustomersClient {
        CustomersClient::new(self.clone())
    }

    pub fn entities(&self) -> EntitiesClient {
        EntitiesClient::new(self.clone())
    }

    pub fn events(&self) -> EventsClient {
        EventsClient::new(self.clone())
    }

    pub fn features(&self) -> FeaturesClient {
        FeaturesClient::new(self.clone())
    }

    pub fn plans(&self) -> PlansClient {
        PlansClient::new(self.clone())
    }

    pub fn platform(&self) -> PlatformClient {
        PlatformClient::new(self.clone())
    }

    pub fn referrals(&self) -> ReferralsClient {
        ReferralsClient::new(self.clone())
    }

    pub(crate) async fn post<B, T>(&self, path: &str, body: B) -> Result<T>
    where
        B: Serialize,
        T: DeserializeOwned,
    {
        self.request(Method::POST, path, Some(body), Option::<&()>::None)
            .await
    }

    pub(crate) async fn post_empty<T>(&self, path: &str) -> Result<T>
    where
        T: DeserializeOwned,
    {
        self.request::<(), (), T>(Method::POST, path, None, None)
            .await
    }

    pub(crate) async fn get<Q, T>(&self, path: &str, query: Q) -> Result<T>
    where
        Q: Serialize,
        T: DeserializeOwned,
    {
        self.request(Method::GET, path, Option::<&()>::None, Some(query))
            .await
    }

    async fn request<B, Q, T>(
        &self,
        method: Method,
        path: &str,
        body: Option<B>,
        query: Option<Q>,
    ) -> Result<T>
    where
        B: Serialize,
        Q: Serialize,
        T: DeserializeOwned,
    {
        let url = self.inner.base_url.join(path.trim_start_matches('/'))?;
        let mut request = self
            .inner
            .http
            .request(method, url)
            .bearer_auth(&self.inner.secret_key)
            .header("x-api-version", &self.inner.api_version);

        if let Some(query) = query {
            request = request.query(&query);
        }
        if let Some(body) = body {
            request = request.json(&body);
        }

        let response = request.send().await.map_err(AutumnError::Transport)?;
        let status = response.status();

        if !status.is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(AutumnError::Api(Box::new(ApiError::new(status, text))));
        }

        response.json::<T>().await.map_err(AutumnError::Decode)
    }
}

impl AutumnBuilder {
    pub fn secret_key(mut self, secret_key: impl Into<String>) -> Self {
        self.secret_key = Some(secret_key.into());
        self
    }

    pub fn base_url(mut self, base_url: impl Into<String>) -> Self {
        self.base_url = Some(base_url.into());
        self
    }

    pub fn api_version(mut self, api_version: impl Into<String>) -> Self {
        self.api_version = Some(api_version.into());
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

    pub fn build(self) -> Result<Autumn> {
        let secret_key = self.secret_key.ok_or(AutumnError::MissingSecretKey)?;
        let base_url = self.base_url.unwrap_or_else(|| DEFAULT_BASE_URL.into());
        let base_url = Url::parse(base_url.trim_end_matches('/'))?;

        let http = match (self.http, self.timeout) {
            (Some(http), _) => http,
            (None, Some(timeout)) => reqwest::Client::builder()
                .timeout(timeout)
                .build()
                .map_err(AutumnError::Transport)?,
            (None, None) => reqwest::Client::new(),
        };

        Ok(Autumn {
            inner: Arc::new(AutumnInner {
                http,
                base_url,
                secret_key,
                api_version: self
                    .api_version
                    .unwrap_or_else(|| DEFAULT_API_VERSION.into()),
            }),
        })
    }
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    use crate::{models::CheckParams, AutumnError};

    use super::*;

    #[tokio::test]
    async fn sends_auth_version_and_json_body() {
        let (base_url, handle) = spawn_server(
            200,
            r#"{"allowed":true,"customer_id":"cus_123","required_balance":1}"#,
        );
        let autumn = Autumn::builder()
            .secret_key("am_sk_test")
            .api_version("2.2-test")
            .base_url(base_url)
            .build()
            .unwrap();

        let response = autumn
            .check(CheckParams::new("cus_123", "messages"))
            .await
            .unwrap();
        let request = handle.join().unwrap();
        let lower = request.to_ascii_lowercase();

        assert!(response.allowed);
        assert!(request.starts_with("POST /v1/balances.check HTTP/1.1"));
        assert!(lower.contains("authorization: bearer am_sk_test"));
        assert!(lower.contains("x-api-version: 2.2-test"));
        assert!(request.contains(r#""customer_id":"cus_123""#));
        assert!(request.contains(r#""feature_id":"messages""#));
    }

    #[tokio::test]
    async fn turns_non_success_into_api_error() {
        let (base_url, handle) = spawn_server(402, r#"{"message":"card required"}"#);
        let autumn = Autumn::builder()
            .secret_key("am_sk_test")
            .base_url(base_url)
            .build()
            .unwrap();

        let error = autumn.features().list().await.unwrap_err();
        let _ = handle.join().unwrap();

        match error {
            AutumnError::Api(api) => {
                assert_eq!(api.status.as_u16(), 402);
                assert_eq!(api.message(), Some("card required"));
            }
            other => panic!("expected API error, got {other:?}"),
        }
    }

    fn spawn_server(status: u16, body: &'static str) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = [0_u8; 8192];
            let read = stream.read(&mut buffer).unwrap();
            let request = String::from_utf8_lossy(&buffer[..read]).to_string();
            let response = format!(
                "HTTP/1.1 {status} OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{body}",
                body.len()
            );
            stream.write_all(response.as_bytes()).unwrap();
            request
        });

        (format!("http://{addr}"), handle)
    }
}
