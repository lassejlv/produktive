use thiserror::Error;

#[derive(Debug, Error)]
pub enum TigrisError {
    #[error("{0}")]
    Message(String),
    #[error("tigris request failed: {0}")]
    Request(String),
    #[error("tigris s3 error: {0}")]
    S3(String),
    #[error("tigris iam error: {0}")]
    Iam(String),
}

pub type TigrisResult<T> = Result<T, TigrisError>;
