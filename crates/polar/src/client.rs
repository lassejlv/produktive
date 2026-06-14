use std::{sync::Arc, time::Duration};

use reqwest::{Method, StatusCode};
use serde::{de::DeserializeOwned, Serialize};
use url::Url;

use crate::{
    catalog::CatalogClient, checkouts::CheckoutsClient, customer_sessions::CustomerSessionsClient,
    customers::CustomersClient, error::ApiError, events::EventsClient,
    subscriptions::SubscriptionsClient, PolarError, Result,
};

const DEFAULT_BASE_URL: &str = "https://api.polar.sh";
/// Polar's edge rejects blank / bot user agents (HTTP 403, Cloudflare code 1010),
/// so the client always sends a real one.
const DEFAULT_USER_AGENT: &str = "unstatus-polar/0.1";

#[derive(Clone, Debug)]
pub struct Polar {
    pub(crate) inner: Arc<PolarInner>,
}

#[derive(Debug)]
pub(crate) struct PolarInner {
    pub http: reqwest::Client,
    pub base_url: Url,
    pub secret_key: String,
}

#[derive(Debug, Default)]
pub struct PolarBuilder {
    secret_key: Option<String>,
    base_url: Option<String>,
    user_agent: Option<String>,
    http: Option<reqwest::Client>,
    timeout: Option<Duration>,
}

impl Polar {
    pub fn new(secret_key: impl Into<String>) -> Result<Self> {
        Self::builder().secret_key(secret_key).build()
    }

    pub fn builder() -> PolarBuilder {
        PolarBuilder::default()
    }

    /// Build from `POLAR_SECRET_KEY` (+ optional `POLAR_BASE_URL`).
    pub fn from_env() -> Result<Self> {
        let secret_key =
            std::env::var("POLAR_SECRET_KEY").map_err(|_| PolarError::MissingSecretKey)?;
        let mut builder = Self::builder().secret_key(secret_key);
        if let Ok(base_url) = std::env::var("POLAR_BASE_URL") {
            builder = builder.base_url(base_url);
        }
        builder.build()
    }

    pub fn customers(&self) -> CustomersClient {
        CustomersClient::new(self.clone())
    }

    pub fn events(&self) -> EventsClient {
        EventsClient::new(self.clone())
    }

    pub fn checkouts(&self) -> CheckoutsClient {
        CheckoutsClient::new(self.clone())
    }

    pub fn customer_sessions(&self) -> CustomerSessionsClient {
        CustomerSessionsClient::new(self.clone())
    }

    pub fn subscriptions(&self) -> SubscriptionsClient {
        SubscriptionsClient::new(self.clone())
    }

    pub fn catalog(&self) -> CatalogClient {
        CatalogClient::new(self.clone())
    }

    pub(crate) async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        self.request::<(), T>(Method::GET, path, None).await
    }

    /// `GET` that maps a 404 to `None` rather than an error — used for
    /// "fetch if it exists" lookups (e.g. customer by external id).
    pub(crate) async fn get_optional<T: DeserializeOwned>(&self, path: &str) -> Result<Option<T>> {
        match self.request::<(), T>(Method::GET, path, None).await {
            Ok(value) => Ok(Some(value)),
            Err(PolarError::Api(api)) if api.status == StatusCode::NOT_FOUND => Ok(None),
            Err(error) => Err(error),
        }
    }

    pub(crate) async fn post<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: B,
    ) -> Result<T> {
        self.request(Method::POST, path, Some(body)).await
    }

    pub(crate) async fn patch<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: B,
    ) -> Result<T> {
        self.request(Method::PATCH, path, Some(body)).await
    }

    async fn request<B: Serialize, T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: Option<B>,
    ) -> Result<T> {
        let url = self.inner.base_url.join(path.trim_start_matches('/'))?;
        let mut request = self
            .inner
            .http
            .request(method, url)
            .bearer_auth(&self.inner.secret_key);
        if let Some(body) = body {
            request = request.json(&body);
        }

        let response = request.send().await.map_err(PolarError::Transport)?;
        let status = response.status();
        if !status.is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(PolarError::Api(Box::new(ApiError::new(status, text))));
        }

        response.json::<T>().await.map_err(PolarError::Decode)
    }
}

impl PolarBuilder {
    pub fn secret_key(mut self, secret_key: impl Into<String>) -> Self {
        self.secret_key = Some(secret_key.into());
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

    pub fn build(self) -> Result<Polar> {
        let secret_key = self.secret_key.ok_or(PolarError::MissingSecretKey)?;
        let base_url = self.base_url.unwrap_or_else(|| DEFAULT_BASE_URL.into());
        let base_url = Url::parse(base_url.trim_end_matches('/'))?;

        let http = match self.http {
            Some(http) => http,
            None => reqwest::Client::builder()
                .user_agent(self.user_agent.unwrap_or_else(|| DEFAULT_USER_AGENT.into()))
                .timeout(self.timeout.unwrap_or_else(|| Duration::from_secs(30)))
                .build()
                .map_err(PolarError::Transport)?,
        };

        Ok(Polar {
            inner: Arc::new(PolarInner {
                http,
                base_url,
                secret_key,
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

    use crate::{customers::CustomerCreate, PolarError};

    use super::*;

    #[tokio::test]
    async fn sends_bearer_auth_user_agent_and_json_body() {
        let (base_url, handle) = spawn_server(
            200,
            r#"{"id":"cus_1","external_id":"ws_1","email":"o@example.com","name":null}"#,
        );
        let polar = Polar::builder()
            .secret_key("polar_sk_test")
            .base_url(base_url)
            .build()
            .unwrap();

        let customer = polar
            .customers()
            .create(CustomerCreate::new("o@example.com").external_id("ws_1"))
            .await
            .unwrap();
        let request = handle.join().unwrap();
        let lower = request.to_ascii_lowercase();

        assert_eq!(customer.id, "cus_1");
        assert!(request.starts_with("POST /v1/customers/ HTTP/1.1"));
        assert!(lower.contains("authorization: bearer polar_sk_test"));
        assert!(lower.contains("user-agent: unstatus-polar/0.1"));
        assert!(request.contains(r#""external_id":"ws_1""#));
        // organization_id must never be sent (org-scoped tokens reject it).
        assert!(!lower.contains("organization_id"));
    }

    #[tokio::test]
    async fn maps_non_success_to_api_error() {
        let (base_url, handle) = spawn_server(403, r#"{"error":"Unauthorized","detail":"nope"}"#);
        let polar = Polar::builder()
            .secret_key("polar_sk_test")
            .base_url(base_url)
            .build()
            .unwrap();

        let error = polar
            .customers()
            .state_by_external("ws_1")
            .await
            .unwrap_err();
        let _ = handle.join().unwrap();

        match error {
            PolarError::Api(api) => {
                assert_eq!(api.status.as_u16(), 403);
                assert_eq!(api.message(), Some("nope"));
            }
            other => panic!("expected API error, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn get_optional_maps_404_to_none() {
        let (base_url, handle) = spawn_server(404, r#"{"detail":"Not Found"}"#);
        let polar = Polar::builder()
            .secret_key("polar_sk_test")
            .base_url(base_url)
            .build()
            .unwrap();

        let customer = polar.customers().get_by_external("missing").await.unwrap();
        let _ = handle.join().unwrap();

        assert!(customer.is_none());
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
