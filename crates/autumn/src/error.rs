use reqwest::StatusCode;
use serde_json::Value;
use thiserror::Error;

pub type Result<T> = std::result::Result<T, AutumnError>;

#[derive(Debug, Error)]
pub enum AutumnError {
    #[error("AUTUMN_SECRET_KEY not set")]
    MissingSecretKey,
    #[error("invalid Autumn base URL: {0}")]
    InvalidBaseUrl(#[from] url::ParseError),
    #[error("failed to encode request body: {0}")]
    Encode(#[from] serde_json::Error),
    #[error("Autumn request failed: {0}")]
    Transport(reqwest::Error),
    #[error("Autumn API returned {0}")]
    Api(Box<ApiError>),
    #[error("failed to decode Autumn response: {0}")]
    Decode(reqwest::Error),
    #[error("Autumn handler error: {0}")]
    Handler(String),
}

#[derive(Debug, Clone)]
pub struct ApiError {
    pub status: StatusCode,
    pub body: Option<Value>,
    pub text: String,
}

impl ApiError {
    pub fn new(status: StatusCode, text: String) -> Self {
        let body = serde_json::from_str(&text).ok();

        Self { status, body, text }
    }

    pub fn message(&self) -> Option<&str> {
        self.body
            .as_ref()
            .and_then(|body| body.get("message").or_else(|| body.get("error")))
            .and_then(Value::as_str)
    }
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let Some(message) = self.message() {
            write!(f, "{}: {}", self.status, message)
        } else if self.text.is_empty() {
            write!(f, "{}", self.status)
        } else {
            write!(f, "{}: {}", self.status, self.text)
        }
    }
}

impl std::error::Error for ApiError {}

impl From<reqwest::Error> for AutumnError {
    fn from(error: reqwest::Error) -> Self {
        AutumnError::Transport(error)
    }
}
