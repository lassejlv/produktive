use reqwest::StatusCode;
use thiserror::Error;

pub type Result<T> = std::result::Result<T, LogError>;

/// Errors raised while ingesting logs into Produktive.
#[derive(Debug, Error)]
pub enum LogError {
    #[error("Produktive log token is required")]
    MissingToken,
    #[error("invalid Produktive base URL: {0}")]
    InvalidBaseUrl(#[from] url::ParseError),
    #[error("failed to build the HTTP client: {0}")]
    Build(reqwest::Error),
    #[error("Produktive log request failed: {0}")]
    Transport(reqwest::Error),
    #[error("Produktive log ingest failed with status {status}")]
    Api { status: StatusCode, body: String },
    #[error("failed to decode Produktive response: {0}")]
    Decode(reqwest::Error),
}

impl LogError {
    /// HTTP status if this is an API error, else `None`.
    pub fn status(&self) -> Option<StatusCode> {
        match self {
            LogError::Api { status, .. } => Some(*status),
            _ => None,
        }
    }

    /// Raw response body if this is an API error.
    pub fn body(&self) -> Option<&str> {
        match self {
            LogError::Api { body, .. } => Some(body),
            _ => None,
        }
    }
}
