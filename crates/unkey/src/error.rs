use reqwest::StatusCode;
use serde_json::Value;

/// Result type alias used throughout the crate.
pub type Result<T> = std::result::Result<T, UnkeyError>;

/// Errors the SDK can produce.
#[derive(Debug, thiserror::Error)]
pub enum UnkeyError {
    /// HTTP transport failure.
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    /// JSON serialization or deserialization failure.
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    /// Unkey returned a non-2xx response.
    #[error("unkey api error: {0}")]
    Api(ApiError),
    /// A client-side check rejected the request before it left the process.
    #[error("invalid request: {0}")]
    InvalidRequest(String),
    /// A required field was missing.
    #[error("missing required field: {0}")]
    MissingRequiredField(&'static str),
}

/// Structured Unkey API error response.
#[derive(Clone, Debug, thiserror::Error)]
#[error("HTTP {status}: {message}")]
pub struct ApiError {
    /// HTTP status code from the response.
    pub status: StatusCode,
    /// Error title, when Unkey returned one.
    pub title: Option<String>,
    /// Error type URL or code, when Unkey returned one.
    pub error_type: Option<String>,
    /// Request id from the `meta.requestId` envelope, when present.
    pub request_id: Option<String>,
    /// Human-readable message.
    pub message: String,
    /// Untouched response body for diagnostics.
    pub raw_body: String,
}

impl ApiError {
    pub(crate) fn from_body(status: StatusCode, raw_body: String) -> Self {
        let parsed = serde_json::from_str::<Value>(&raw_body).ok();
        let error = parsed.as_ref().and_then(|value| value.get("error"));
        let meta = parsed.as_ref().and_then(|value| value.get("meta"));

        let title = error
            .and_then(|value| value.get("title"))
            .or_else(|| parsed.as_ref().and_then(|value| value.get("title")))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);

        let error_type = error
            .and_then(|value| value.get("type").or_else(|| value.get("code")))
            .or_else(|| {
                parsed
                    .as_ref()
                    .and_then(|value| value.get("type").or_else(|| value.get("code")))
            })
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);

        let request_id = meta
            .and_then(|value| value.get("requestId"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);

        let message = error
            .and_then(|value| value.get("detail").or_else(|| value.get("message")))
            .or_else(|| {
                parsed
                    .as_ref()
                    .and_then(|value| value.get("detail").or_else(|| value.get("message")))
            })
            .and_then(Value::as_str)
            .or_else(|| title.as_deref())
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| {
                status
                    .canonical_reason()
                    .unwrap_or("Unkey API error")
                    .to_owned()
            });

        Self {
            status,
            title,
            error_type,
            request_id,
            message,
            raw_body,
        }
    }
}
