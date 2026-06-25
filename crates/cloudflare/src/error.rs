use thiserror::Error;

pub type Result<T> = std::result::Result<T, CloudflareError>;

#[derive(Debug, Error)]
pub enum CloudflareError {
    #[error("Cloudflare request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Cloudflare API returned error {code}: {message}")]
    Api { code: i64, message: String },
    #[error("failed to decode Cloudflare response: {0}")]
    Decode(reqwest::Error),
    #[error("invalid Cloudflare client configuration: {0}")]
    Config(String),
    #[error("unexpected Cloudflare response: {0}")]
    Unexpected(String),
}
