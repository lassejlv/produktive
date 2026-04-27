use crate::{
    auth::{
        auth_cookie, clear_auth_cookie, consume_auth_token, create_auth_token,
        create_signup_records, create_user_session, first_or_create_organization, require_auth,
        revoke_session, revoke_user_sessions, update_user_password, validate_email, validate_name,
        validate_password, verify_password, verify_user_email, EMAIL_VERIFICATION_PURPOSE,
        PASSWORD_RESET_PURPOSE,
    },
    email::{send_password_reset_email, send_verification_email},
    error::ApiError,
    state::AppState,
};
use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use produktive_entity::user;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use serde::{Deserialize, Serialize};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/sign-up", post(sign_up))
        .route("/sign-in", post(sign_in))
        .route("/sign-out", post(sign_out))
        .route("/session", get(session))
        .route("/verify-email", post(verify_email))
        .route("/request-password-reset", post(request_password_reset))
        .route("/reset-password", post(reset_password))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignUpRequest {
    name: String,
    email: String,
    password: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignInRequest {
    email: String,
    password: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TokenRequest {
    token: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RequestPasswordResetRequest {
    email: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResetPasswordRequest {
    token: String,
    password: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EmptyResponse {
    ok: bool,
}

async fn sign_up(
    State(state): State<AppState>,
    Json(payload): Json<SignUpRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let name = validate_name(&payload.name)?;
    let email = validate_email(&payload.email)?;
    let password = validate_password(&payload.password)?;
    let (user, _) = create_signup_records(&state, name, email, password).await?;
    let token = create_auth_token(
        &state.db,
        &user.id,
        EMAIL_VERIFICATION_PURPOSE,
        chrono::Duration::hours(24),
    )
    .await?;
    send_verification_email(&state, &user.email, &user.name, &token).await?;

    Ok((StatusCode::CREATED, Json(EmptyResponse { ok: true })))
}

async fn sign_in(
    State(state): State<AppState>,
    Json(payload): Json<SignInRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let email = validate_email(&payload.email)?;
    let password = validate_password(&payload.password)?;
    let user = user::Entity::find()
        .filter(user::Column::Email.eq(email))
        .one(&state.db)
        .await?
        .ok_or(ApiError::Unauthorized)?;

    if !verify_password(&password, &user.password_hash)? {
        return Err(ApiError::Unauthorized);
    }

    if !user.email_verified {
        return Err(ApiError::BadRequest(
            "Please verify your email before signing in".to_owned(),
        ));
    }

    let organization = first_or_create_organization(&state.db, &user).await?;
    let (_, token) = create_user_session(&state.db, &state, &user.id, &organization.id).await?;
    let cookie = auth_cookie(&state, &token)?;

    Ok((
        StatusCode::OK,
        [(header::SET_COOKIE, cookie)],
        Json(crate::auth::AuthResponse {
            user: user.into(),
            organization: organization.into(),
        }),
    ))
}

async fn verify_email(
    State(state): State<AppState>,
    Json(payload): Json<TokenRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let auth_token =
        consume_auth_token(&state.db, &payload.token, EMAIL_VERIFICATION_PURPOSE).await?;
    let user = verify_user_email(&state.db, &auth_token.user_id).await?;
    let organization = first_or_create_organization(&state.db, &user).await?;
    let (_, session_token) =
        create_user_session(&state.db, &state, &user.id, &organization.id).await?;
    let cookie = auth_cookie(&state, &session_token)?;

    Ok((
        StatusCode::OK,
        [(header::SET_COOKIE, cookie)],
        Json(crate::auth::AuthResponse {
            user: user.into(),
            organization: organization.into(),
        }),
    ))
}

async fn request_password_reset(
    State(state): State<AppState>,
    Json(payload): Json<RequestPasswordResetRequest>,
) -> Result<Json<EmptyResponse>, ApiError> {
    let email = validate_email(&payload.email)?;

    if let Some(user) = user::Entity::find()
        .filter(user::Column::Email.eq(email))
        .one(&state.db)
        .await?
    {
        let token = create_auth_token(
            &state.db,
            &user.id,
            PASSWORD_RESET_PURPOSE,
            chrono::Duration::hours(1),
        )
        .await?;
        send_password_reset_email(&state, &user.email, &user.name, &token).await?;
    }

    Ok(Json(EmptyResponse { ok: true }))
}

async fn reset_password(
    State(state): State<AppState>,
    Json(payload): Json<ResetPasswordRequest>,
) -> Result<Json<EmptyResponse>, ApiError> {
    let password = validate_password(&payload.password)?;
    let auth_token = consume_auth_token(&state.db, &payload.token, PASSWORD_RESET_PURPOSE).await?;
    update_user_password(&state.db, &auth_token.user_id, &password).await?;
    revoke_user_sessions(&state.db, &auth_token.user_id).await?;

    Ok(Json(EmptyResponse { ok: true }))
}

async fn sign_out(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ApiError> {
    if let Ok(auth) = require_auth(&headers, &state).await {
        revoke_session(&auth, &state.db).await?;
    }

    Ok((
        StatusCode::OK,
        [(header::SET_COOKIE, clear_auth_cookie(&state)?)],
        Json(EmptyResponse { ok: true }),
    ))
}

async fn session(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ApiError> {
    match require_auth(&headers, &state).await {
        Ok(auth) => Ok((StatusCode::OK, Json(Some(auth.response())))),
        Err(ApiError::Unauthorized) => Ok((StatusCode::OK, Json(None))),
        Err(error) => Err(error),
    }
}
