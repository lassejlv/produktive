use reqwest::StatusCode;
use serde_json::Value;

/// Result type alias used throughout the crate.
pub type Result<T> = std::result::Result<T, PolarError>;

/// Errors the SDK can produce.
#[derive(Debug, thiserror::Error)]
pub enum PolarError {
    /// HTTP transport failure (DNS, TLS, connection refused, timeout, etc.).
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    /// JSON (de)serialization failure — usually means the API returned a shape
    /// the SDK doesn't model yet.
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    /// Polar returned a non-2xx response.
    #[error("polar api error: {0}")]
    Api(ApiError),
    /// A client-side check rejected the request before it left the process.
    #[error("invalid request: {0}")]
    InvalidRequest(String),
    /// A required field was missing on the request builder.
    #[error("missing required field: {0}")]
    MissingRequiredField(&'static str),
}

/// Structured Polar error response.
///
/// Polar follows the FastAPI/HTTPException convention: the response body
/// usually contains either `{ "detail": "..." }` or
/// `{ "detail": [{ "msg": "...", ... }, ...] }` for validation errors.
#[derive(Clone, Debug, thiserror::Error)]
#[error("HTTP {status}: {message}")]
pub struct ApiError {
    /// HTTP status code from the response.
    pub status: StatusCode,
    /// Optional Polar error type/code (e.g. `BadRequest`, `NotFound`).
    pub error_type: Option<String>,
    /// Human-readable error message.
    pub message: String,
    /// Untouched response body — useful for diagnostics when the parsed
    /// fields don't tell the full story.
    pub raw_body: String,
}

impl ApiError {
    pub(crate) fn from_body(status: StatusCode, raw_body: String) -> Self {
        let parsed = serde_json::from_str::<Value>(&raw_body).ok();
        let error_type = parsed
            .as_ref()
            .and_then(|value| value.get("type").or_else(|| value.get("error")))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        let message = parsed
            .as_ref()
            .and_then(|value| value.get("detail"))
            .and_then(extract_detail_message)
            .or_else(|| {
                parsed
                    .as_ref()
                    .and_then(|value| value.get("message"))
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
            })
            .unwrap_or_else(|| {
                status
                    .canonical_reason()
                    .unwrap_or("Polar API error")
                    .to_owned()
            });

        Self {
            status,
            error_type,
            message,
            raw_body,
        }
    }
}

fn extract_detail_message(detail: &Value) -> Option<String> {
    if let Some(message) = detail.as_str() {
        return Some(message.to_owned());
    }
    detail
        .as_array()
        .and_then(|items| items.first())
        .and_then(|item| item.get("msg"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}
