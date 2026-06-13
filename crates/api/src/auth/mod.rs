pub mod jwt;
pub mod password;
pub mod routes;
pub mod session_cleanup;

use axum::{
    extract::{FromRef, FromRequestParts},
    http::request::Parts,
};
use chrono::Utc;
use entity::{session, user};
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter};

use crate::{error::ApiError, state::AppState};

pub struct AuthUser {
    pub user: user::Model,
    pub session_id: uuid::Uuid,
}

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
    AppState: FromRef<S>,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let state = AppState::from_ref(state);
        let bearer = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| {
                s.strip_prefix("Bearer ")
                    .or_else(|| s.strip_prefix("bearer "))
            })
            .ok_or(ApiError::Unauthorized)?;

        let claims = jwt::decode(bearer, &state.config.jwt_secret)?;
        let session_id = uuid::Uuid::parse_str(&claims.jti).map_err(|_| ApiError::Unauthorized)?;
        let token_hash = password::sha256_hex(&claims.jti);

        let (sess, user_opt) = load_session(&state.db, &token_hash).await?;
        if sess.expires_at < Utc::now().fixed_offset() {
            return Err(ApiError::Unauthorized);
        }
        let user = user_opt.ok_or(ApiError::Unauthorized)?;
        Ok(AuthUser { user, session_id })
    }
}

async fn load_session(
    db: &DatabaseConnection,
    token_hash: &str,
) -> Result<(session::Model, Option<user::Model>), ApiError> {
    let sess = session::Entity::find()
        .filter(session::Column::TokenHash.eq(token_hash))
        .one(db)
        .await?
        .ok_or(ApiError::Unauthorized)?;
    let user = user::Entity::find_by_id(sess.user_id).one(db).await?;
    Ok((sess, user))
}
