use std::{sync::Arc, time::Duration};

use reqwest::{
    header::{HeaderMap, HeaderValue, AUTHORIZATION},
    Method, StatusCode,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::json;

use crate::{
    error::{CloudflareError, Result},
    models::{CfEnvelope, CustomHostname},
};

const DEFAULT_BASE_URL: &str = "https://api.cloudflare.com/client/v4";
const DEFAULT_USER_AGENT: &str = "produktive-cloudflare/0.1";

#[derive(Clone, Debug)]
pub struct Cloudflare {
    inner: Arc<CloudflareInner>,
}

#[derive(Debug)]
struct CloudflareInner {
    http: reqwest::Client,
    base_url: String,
    zone_id: String,
}

impl Cloudflare {
    /// Build from `CF_API_TOKEN` and `CF_ZONE_ID` (+ optional `CF_BASE_URL`).
    ///
    /// Returns `None` when either required variable is missing or empty, so the
    /// API can treat Cloudflare as an optional integration.
    pub fn from_env() -> Option<Self> {
        let token = non_empty(std::env::var("CF_API_TOKEN").ok())?;
        let zone_id = non_empty(std::env::var("CF_ZONE_ID").ok())?;
        let base_url = non_empty(std::env::var("CF_BASE_URL").ok())
            .unwrap_or_else(|| DEFAULT_BASE_URL.to_string());
        Self::new(token, zone_id, base_url).ok()
    }

    /// Build a client with an explicit token, zone id, and base URL. A default
    /// `Authorization: Bearer <token>` header is attached to the underlying
    /// `reqwest::Client`.
    pub fn new(
        token: impl Into<String>,
        zone_id: impl Into<String>,
        base_url: impl Into<String>,
    ) -> Result<Self> {
        let token = token.into();
        let zone_id = zone_id.into();
        let base_url = base_url.into().trim_end_matches('/').to_string();

        let mut headers = HeaderMap::new();
        let mut auth = HeaderValue::from_str(&format!("Bearer {token}"))
            .map_err(|e| CloudflareError::Config(format!("invalid CF_API_TOKEN: {e}")))?;
        auth.set_sensitive(true);
        headers.insert(AUTHORIZATION, auth);

        let http = reqwest::Client::builder()
            .user_agent(DEFAULT_USER_AGENT)
            .default_headers(headers)
            .timeout(Duration::from_secs(30))
            .build()?;

        Ok(Self {
            inner: Arc::new(CloudflareInner {
                http,
                base_url,
                zone_id,
            }),
        })
    }

    /// `POST /zones/{zone}/custom_hostnames`. `ssl_method` is `"txt"` or `"http"`.
    pub async fn create_custom_hostname(
        &self,
        hostname: &str,
        ssl_method: &str,
    ) -> Result<CustomHostname> {
        let body = json!({
            "hostname": hostname,
            "ssl": {
                "method": ssl_method,
                "type": "dv",
                "settings": { "min_tls_version": "1.2" }
            }
        });
        let envelope: CfEnvelope<CustomHostname> = self
            .request(Method::POST, &self.zone_path("/custom_hostnames"), Some(body))
            .await?;
        envelope.into_result()
    }

    /// `GET /zones/{zone}/custom_hostnames/{id}`. A 404 maps to `Ok(None)`.
    pub async fn get_custom_hostname(&self, id: &str) -> Result<Option<CustomHostname>> {
        let path = self.zone_path(&format!("/custom_hostnames/{id}"));
        match self
            .request::<(), CfEnvelope<CustomHostname>>(Method::GET, &path, None)
            .await
        {
            Ok(envelope) => envelope.into_result().map(Some),
            Err(CloudflareError::Http(e)) if e.status() == Some(StatusCode::NOT_FOUND) => Ok(None),
            Err(error) => Err(error),
        }
    }

    /// `DELETE /zones/{zone}/custom_hostnames/{id}`. A 404 is treated as success.
    pub async fn delete_custom_hostname(&self, id: &str) -> Result<()> {
        let path = self.zone_path(&format!("/custom_hostnames/{id}"));
        match self
            .request::<(), CfEnvelope<serde_json::Value>>(Method::DELETE, &path, None)
            .await
        {
            Ok(envelope) => envelope.into_result().map(|_| ()),
            Err(CloudflareError::Http(e)) if e.status() == Some(StatusCode::NOT_FOUND) => Ok(()),
            Err(error) => Err(error),
        }
    }

    /// `PUT /zones/{zone}/custom_hostnames/fallback_origin`.
    pub async fn set_fallback_origin(&self, origin: &str) -> Result<()> {
        let body = json!({ "origin": origin });
        let envelope: CfEnvelope<serde_json::Value> = self
            .request(
                Method::PUT,
                &self.zone_path("/custom_hostnames/fallback_origin"),
                Some(body),
            )
            .await?;
        envelope.into_result().map(|_| ())
    }

    /// `GET /zones/{zone}/dcv_delegation/uuid` — returns `result.uuid`.
    pub async fn dcv_delegation_uuid(&self) -> Result<String> {
        let envelope: CfEnvelope<DcvDelegation> = self
            .request(Method::GET, &self.zone_path("/dcv_delegation/uuid"), None::<()>)
            .await?;
        Ok(envelope.into_result()?.uuid)
    }

    fn zone_path(&self, suffix: &str) -> String {
        format!("/zones/{}{}", self.inner.zone_id, suffix)
    }

    async fn request<B: Serialize, T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: Option<B>,
    ) -> Result<T> {
        let url = format!("{}{}", self.inner.base_url, path);
        let mut request = self.inner.http.request(method, url);
        if let Some(body) = body {
            request = request.json(&body);
        }

        let response = request.send().await?.error_for_status()?;
        response.json::<T>().await.map_err(CloudflareError::Decode)
    }
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.filter(|v| !v.trim().is_empty())
}

#[derive(Debug, Deserialize)]
struct DcvDelegation {
    uuid: String,
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    use super::*;

    fn client(base_url: String) -> Cloudflare {
        Cloudflare::new("cf_token_test", "zone_1", base_url).unwrap()
    }

    #[tokio::test]
    async fn create_sends_bearer_auth_and_ssl_body() {
        let (base_url, handle) = spawn_server(
            200,
            r#"{"success":true,"errors":[],"result":{"id":"ch_1","hostname":"a.example.com","status":"pending","ssl":{"status":"pending_validation","method":"txt"}}}"#,
        );
        let cf = client(base_url);

        let hostname = cf
            .create_custom_hostname("a.example.com", "txt")
            .await
            .unwrap();
        let request = handle.join().unwrap();
        let lower = request.to_ascii_lowercase();

        assert_eq!(hostname.id, "ch_1");
        assert_eq!(hostname.ssl_status(), Some("pending_validation"));
        assert!(request.starts_with("POST /zones/zone_1/custom_hostnames HTTP/1.1"));
        assert!(lower.contains("authorization: bearer cf_token_test"));
        assert!(request.contains(r#""hostname":"a.example.com""#));
        assert!(request.contains(r#""method":"txt""#));
        assert!(request.contains(r#""type":"dv""#));
        assert!(request.contains(r#""min_tls_version":"1.2""#));
    }

    #[tokio::test]
    async fn get_maps_404_to_none() {
        let (base_url, handle) = spawn_server(
            404,
            r#"{"success":false,"errors":[{"code":1436,"message":"not found"}],"result":null}"#,
        );
        let cf = client(base_url);

        let hostname = cf.get_custom_hostname("missing").await.unwrap();
        let _ = handle.join().unwrap();

        assert!(hostname.is_none());
    }

    #[tokio::test]
    async fn delete_treats_404_as_ok() {
        let (base_url, handle) = spawn_server(
            404,
            r#"{"success":false,"errors":[{"code":1436,"message":"not found"}],"result":null}"#,
        );
        let cf = client(base_url);

        cf.delete_custom_hostname("missing").await.unwrap();
        let _ = handle.join().unwrap();
    }

    #[tokio::test]
    async fn maps_envelope_error_to_api_error() {
        let (base_url, handle) = spawn_server(
            200,
            r#"{"success":false,"errors":[{"code":1234,"message":"bad request"}],"result":null}"#,
        );
        let cf = client(base_url);

        let error = cf
            .create_custom_hostname("a.example.com", "txt")
            .await
            .unwrap_err();
        let _ = handle.join().unwrap();

        match error {
            CloudflareError::Api { code, message } => {
                assert_eq!(code, 1234);
                assert_eq!(message, "bad request");
            }
            other => panic!("expected API error, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn dcv_delegation_returns_uuid() {
        let (base_url, handle) = spawn_server(
            200,
            r#"{"success":true,"errors":[],"result":{"uuid":"deadbeef"}}"#,
        );
        let cf = client(base_url);

        let uuid = cf.dcv_delegation_uuid().await.unwrap();
        let request = handle.join().unwrap();

        assert_eq!(uuid, "deadbeef");
        assert!(request.starts_with("GET /zones/zone_1/dcv_delegation/uuid HTTP/1.1"));
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
