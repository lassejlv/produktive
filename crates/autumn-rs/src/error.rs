use reqwest::StatusCode;
use serde_json::Value;

/// Result type alias used throughout the crate.
pub type Result<T> = std::result::Result<T, AutumnError>;

/// All errors the SDK can produce.
#[derive(Debug, thiserror::Error)]
pub enum AutumnError {
    /// HTTP transport failure (connection refused, DNS failure, TLS error,
    /// timeout, etc.). Wraps the underlying [`reqwest::Error`].
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    /// Failure to (de)serialize JSON. Almost always indicates the API
    /// returned an unexpected shape.
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    /// The Autumn API returned a non-2xx response. The wrapped [`ApiError`]
    /// carries the status code, error code (if any), human message, and the
    /// raw body for debugging.
    #[error("autumn api error: {0}")]
    Api(ApiError),
    /// A client-side check rejected the request before it was sent.
    #[error("invalid request: {0}")]
    InvalidRequest(String),
    /// A required field was missing on the request builder.
    #[error("missing required field: {0}")]
    MissingRequiredField(&'static str),
}

/// Structured representation of an Autumn API error response.
///
/// Built from a non-2xx HTTP response. The `code` field follows Autumn's
/// canonical error codes (e.g. `payment_required`, `not_found`,
/// `invalid_input`); inspect [`ApiError::raw_body`] when you need the
/// untouched JSON.
#[derive(Clone, Debug, thiserror::Error)]
#[error("HTTP {status}: {message}")]
pub struct ApiError {
    /// HTTP status code from the response.
    pub status: StatusCode,
    /// Autumn-defined error code, if the response body included one.
    pub code: Option<String>,
    /// Human-readable error message.
    pub message: String,
    /// Untouched response body — useful for diagnostics when the structured
    /// fields don't tell the full story.
    pub raw_body: String,
}

impl ApiError {
    pub(crate) fn from_body(status: StatusCode, raw_body: String) -> Self {
        let parsed = serde_json::from_str::<Value>(&raw_body).ok();
        let code = parsed
            .as_ref()
            .and_then(|value| value.get("code"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        let message = parsed
            .as_ref()
            .and_then(|value| value.get("message"))
            .and_then(Value::as_str)
            .unwrap_or_else(|| status.canonical_reason().unwrap_or("Autumn API error"))
            .to_owned();

        Self {
            status,
            code,
            message,
            raw_body,
        }
    }
}
