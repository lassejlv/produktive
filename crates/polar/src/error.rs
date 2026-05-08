use reqwest::StatusCode;
use serde_json::Value;

#[derive(Debug, thiserror::Error)]
pub enum PolarError {
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("polar api error: {0}")]
    Api(ApiError),
    #[error("invalid request: {0}")]
    InvalidRequest(String),
    #[error("missing required field: {0}")]
    MissingRequiredField(&'static str),
    #[error("webhook error: {0}")]
    Webhook(#[from] standardwebhooks::WebhookError),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, PolarError>;

#[derive(Clone, Debug, thiserror::Error)]
#[error("HTTP {status}: {message}")]
pub struct ApiError {
    pub status: StatusCode,
    pub message: String,
    pub error_type: Option<String>,
    pub detail: Option<Value>,
    pub raw_body: String,
}

impl ApiError {
    pub(crate) fn from_body(status: StatusCode, raw_body: String) -> Self {
        let parsed = serde_json::from_str::<Value>(&raw_body).ok();
        let detail = parsed
            .as_ref()
            .and_then(|value| value.get("detail"))
            .cloned();
        let error_type = parsed
            .as_ref()
            .and_then(|value| value.get("type").or_else(|| value.get("code")))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        let message = parsed
            .as_ref()
            .and_then(|value| {
                value
                    .get("message")
                    .or_else(|| value.get("detail"))
                    .or_else(|| value.get("error"))
            })
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| {
                status
                    .canonical_reason()
                    .unwrap_or("Polar API error")
                    .to_owned()
            });

        Self {
            status,
            message,
            error_type,
            detail,
            raw_body,
        }
    }
}
