use serde::Deserialize;

use crate::error::CloudflareError;

/// A Cloudflare for SaaS custom hostname.
#[derive(Clone, Debug, Deserialize)]
pub struct CustomHostname {
    pub id: String,
    pub hostname: String,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub ssl: Option<CustomHostnameSsl>,
}

impl CustomHostname {
    /// The SSL validation status (e.g. `pending_validation`, `active`), if known.
    pub fn ssl_status(&self) -> Option<&str> {
        self.ssl.as_ref().and_then(|s| s.status.as_deref())
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default)]
pub struct CustomHostnameSsl {
    pub status: Option<String>,
    pub method: Option<String>,
}

/// Cloudflare wraps every response in `{ success, errors, result }`.
#[derive(Clone, Debug, Deserialize)]
#[serde(bound(deserialize = "T: Deserialize<'de>"))]
pub struct CfEnvelope<T> {
    pub success: bool,
    #[serde(default)]
    pub errors: Vec<CfApiError>,
    #[serde(default = "Option::default")]
    pub result: Option<T>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CfApiError {
    #[serde(default)]
    pub code: i64,
    #[serde(default)]
    pub message: String,
}

impl<T> CfEnvelope<T> {
    /// Unwrap the envelope: return `result` on success, or map the first
    /// Cloudflare error to [`CloudflareError::Api`].
    pub fn into_result(self) -> Result<T, CloudflareError> {
        if self.success {
            self.result.ok_or_else(|| {
                CloudflareError::Unexpected("missing result in successful response".into())
            })
        } else {
            let (code, message) = match self.errors.into_iter().next() {
                Some(err) => (err.code, err.message),
                None => (0, "unknown Cloudflare API error".to_string()),
            };
            Err(CloudflareError::Api { code, message })
        }
    }
}
