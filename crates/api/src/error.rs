use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use sea_orm::DbErr;
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("{0}")]
    BadRequest(String),
    #[error("unauthorized")]
    Unauthorized,
    #[error("forbidden")]
    Forbidden,
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Conflict(String),
    #[error("{0}")]
    TooManyRequests(String),
    #[error("{0}")]
    ServiceUnavailable(String),
    #[error("{0}")]
    PaymentRequired(String),
    #[error("internal server error")]
    Internal(#[from] anyhow::Error),
}

impl ApiError {
    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self::BadRequest(msg.into())
    }
    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::NotFound(msg.into())
    }
    pub fn conflict(msg: impl Into<String>) -> Self {
        Self::Conflict(msg.into())
    }
    pub fn too_many_requests(msg: impl Into<String>) -> Self {
        Self::TooManyRequests(msg.into())
    }
    pub fn service_unavailable(msg: impl Into<String>) -> Self {
        Self::ServiceUnavailable(msg.into())
    }
    pub fn payment_required(msg: impl Into<String>) -> Self {
        Self::PaymentRequired(msg.into())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            Self::BadRequest(m) => (StatusCode::BAD_REQUEST, m.clone()),
            Self::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized".into()),
            Self::Forbidden => (StatusCode::FORBIDDEN, "forbidden".into()),
            Self::NotFound(m) => (StatusCode::NOT_FOUND, m.clone()),
            Self::Conflict(m) => (StatusCode::CONFLICT, m.clone()),
            Self::TooManyRequests(m) => (StatusCode::TOO_MANY_REQUESTS, m.clone()),
            Self::ServiceUnavailable(m) => (StatusCode::SERVICE_UNAVAILABLE, m.clone()),
            Self::PaymentRequired(m) => (StatusCode::PAYMENT_REQUIRED, m.clone()),
            Self::Internal(e) => {
                tracing::error!(error = ?e, "internal error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal server error".into(),
                )
            }
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

impl From<DbErr> for ApiError {
    fn from(e: DbErr) -> Self {
        tracing::error!(error = ?e, "db error");
        ApiError::Internal(anyhow::anyhow!(e))
    }
}

impl From<jsonwebtoken::errors::Error> for ApiError {
    fn from(_: jsonwebtoken::errors::Error) -> Self {
        ApiError::Unauthorized
    }
}

impl From<polar::PolarError> for ApiError {
    fn from(e: polar::PolarError) -> Self {
        match e {
            polar::PolarError::Api(api) => {
                let status = api.status.as_u16();
                let msg = api.message().unwrap_or("billing request failed").to_owned();
                match status {
                    402 => ApiError::payment_required(msg),
                    400 | 422 => ApiError::bad_request(msg),
                    403 => ApiError::Forbidden,
                    404 => ApiError::not_found(msg),
                    409 => ApiError::conflict(msg),
                    429 => ApiError::too_many_requests(msg),
                    503 => ApiError::service_unavailable(msg),
                    _ if api.status.is_client_error() => ApiError::bad_request(msg),
                    _ => ApiError::Internal(anyhow::anyhow!("Polar API error: {api}")),
                }
            }
            other => {
                tracing::error!(error = %other, "Polar client error");
                ApiError::Internal(anyhow::anyhow!(other))
            }
        }
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
