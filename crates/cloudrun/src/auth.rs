use std::sync::Arc;
use std::time::{Duration, Instant};

use deploy::{DeployError, DeployResult};
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

/// OAuth scope granting access to the Cloud Run, Artifact Registry, and Cloud
/// Logging APIs the provider calls.
const SCOPE: &str = "https://www.googleapis.com/auth/cloud-platform";
const DEFAULT_TOKEN_URI: &str = "https://oauth2.googleapis.com/token";
/// Refresh a token this long before its stated expiry to avoid using a token
/// that expires mid-request.
const EXPIRY_SKEW: Duration = Duration::from_secs(60);

/// A Google service-account key, as found in the JSON key file. Only the fields
/// needed for the JWT-bearer token exchange are modeled.
#[derive(Debug, Clone, Deserialize)]
pub struct ServiceAccountKey {
    pub client_email: String,
    pub private_key: String,
    #[serde(default = "default_token_uri")]
    pub token_uri: String,
    #[serde(default)]
    pub project_id: Option<String>,
}

fn default_token_uri() -> String {
    DEFAULT_TOKEN_URI.to_owned()
}

impl ServiceAccountKey {
    /// Parse a service-account key from its JSON representation (the contents of
    /// a downloaded key file or the matching env var).
    pub fn from_json(raw: &str) -> DeployResult<Self> {
        let key: ServiceAccountKey = serde_json::from_str(raw.trim()).map_err(|error| {
            DeployError::Config(format!("invalid Cloud Run service account JSON: {error}"))
        })?;
        if key.client_email.trim().is_empty() || key.private_key.trim().is_empty() {
            return Err(DeployError::Config(
                "Cloud Run service account JSON is missing client_email or private_key".into(),
            ));
        }
        Ok(key)
    }
}

#[derive(Serialize)]
struct Claims<'a> {
    iss: &'a str,
    scope: &'a str,
    aud: &'a str,
    iat: i64,
    exp: i64,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
}

struct Cached {
    token: String,
    expires_at: Instant,
}

/// Mints and caches OAuth access tokens for a service account using the
/// `urn:ietf:params:oauth:grant-type:jwt-bearer` flow. Cheap to clone; the cache
/// is shared.
#[derive(Clone)]
pub struct TokenSource {
    key: Arc<ServiceAccountKey>,
    encoding_key: Arc<EncodingKey>,
    http: reqwest::Client,
    cache: Arc<Mutex<Option<Cached>>>,
}

impl TokenSource {
    pub fn new(key: ServiceAccountKey, http: reqwest::Client) -> DeployResult<Self> {
        let encoding_key =
            EncodingKey::from_rsa_pem(key.private_key.as_bytes()).map_err(|error| {
                DeployError::Config(format!(
                    "Cloud Run service account private_key is not a valid RSA PEM: {error}"
                ))
            })?;
        Ok(Self {
            key: Arc::new(key),
            encoding_key: Arc::new(encoding_key),
            http,
            cache: Arc::new(Mutex::new(None)),
        })
    }

    /// Return a valid access token, reusing the cached one until it nears expiry.
    pub async fn token(&self) -> DeployResult<String> {
        let mut cache = self.cache.lock().await;
        if let Some(cached) = cache.as_ref() {
            if cached.expires_at > Instant::now() {
                return Ok(cached.token.clone());
            }
        }
        let (token, expires_in) = self.mint().await?;
        let expires_at =
            Instant::now() + Duration::from_secs(expires_in).saturating_sub(EXPIRY_SKEW);
        *cache = Some(Cached {
            token: token.clone(),
            expires_at,
        });
        Ok(token)
    }

    async fn mint(&self) -> DeployResult<(String, u64)> {
        let now = chrono::Utc::now().timestamp();
        let claims = Claims {
            iss: &self.key.client_email,
            scope: SCOPE,
            aud: &self.key.token_uri,
            iat: now,
            exp: now + 3600,
        };
        let assertion = encode(&Header::new(Algorithm::RS256), &claims, &self.encoding_key)
            .map_err(|error| {
                DeployError::Provider(format!("failed to sign Cloud Run auth JWT: {error}"))
            })?;
        let response = self
            .http
            .post(&self.key.token_uri)
            .form(&[
                ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
                ("assertion", assertion.as_str()),
            ])
            .send()
            .await
            .map_err(|error| {
                DeployError::Provider(format!("Cloud Run token request failed: {error}"))
            })?;
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(DeployError::Provider(format!(
                "Cloud Run token exchange returned {status}: {body}"
            )));
        }
        let parsed: TokenResponse = serde_json::from_str(&body).map_err(|error| {
            DeployError::Provider(format!("invalid Cloud Run token response: {error}"))
        })?;
        Ok((parsed.access_token, parsed.expires_in))
    }
}
