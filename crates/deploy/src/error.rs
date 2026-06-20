use thiserror::Error;

#[derive(Debug, Error)]
pub enum DeployError {
    #[error("{0}")]
    Config(String),
    #[error("{0}")]
    Validation(String),
    #[error("{0}")]
    Provider(String),
    #[error("{0}")]
    Crypto(String),
    #[error("deployment provider transport failed: {0}")]
    Transport(String),
    #[error("deployment provider response decode failed: {0}")]
    Decode(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    RateLimited(String),
}

pub type DeployResult<T> = Result<T, DeployError>;
