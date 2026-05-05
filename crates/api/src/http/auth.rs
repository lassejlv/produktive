use crate::{
    auth::{
        auth_cookie, clear_auth_cookie, consume_auth_token, create_auth_token,
        create_organization_for_user, create_signup_records, create_user_session,
        ensure_fresh_two_factor, ensure_organization_not_suspended, ensure_user_not_suspended,
        first_or_create_organization, hash_token, mark_session_two_factor_verified, require_auth,
        require_auth_without_two_factor_policy, revoke_session, revoke_user_sessions,
        set_session_active_organization, update_user_password, user_is_member, validate_email,
        validate_name, validate_password, verify_password, verify_user_email, OrganizationResponse,
        EMAIL_VERIFICATION_PURPOSE, PASSWORD_RESET_PURPOSE,
    },
    email::{send_password_reset_email, send_verification_email},
    error::ApiError,
    mcp::{decrypt_secret, encrypt_secret},
    permissions::{
        require_permission, ROLE_OWNER, WORKSPACE_DELETE, WORKSPACE_RENAME, WORKSPACE_SECURITY,
    },
    security_events::{
        metadata_empty, record_security_event, SecurityEventInput, EVENT_ACCOUNT_DELETED,
        EVENT_LOGIN_2FA_FAILED, EVENT_LOGIN_SUCCESS, EVENT_TWO_FACTOR_BACKUP_CODES_REGENERATED,
        EVENT_TWO_FACTOR_DISABLED, EVENT_TWO_FACTOR_ENABLED, EVENT_WORKSPACE_DELETED,
        EVENT_WORKSPACE_REQUIRE_2FA_DISABLED, EVENT_WORKSPACE_REQUIRE_2FA_ENABLED,
    },
    state::AppState,
    storage,
};
use axum::{
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Redirect, Response},
    routing::{delete, get, patch, post},
    Json, Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{Duration, Utc};
use cookie::{Cookie, SameSite};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header as JwtHeader, Validation};
use produktive_entity::{
    member, organization, session as session_entity, two_factor_challenge, user, user_two_factor,
    user_two_factor_backup_code, user_two_factor_trusted_device,
};
use rand_core::{OsRng, RngCore};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter, QueryOrder, Set,
    TransactionTrait,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use time::Duration as CookieDuration;
use totp_rs::{Algorithm, Secret, TOTP};
use uuid::Uuid;

const MAX_ICON_BYTES: usize = 2 * 1024 * 1024;
const TWO_FACTOR_ISSUER: &str = "Produktive";
const TWO_FACTOR_BACKUP_CODE_COUNT: usize = 10;
const TWO_FACTOR_BACKUP_CODE_BYTES: usize = 6;
const TWO_FACTOR_CHALLENGE_MAX_ATTEMPTS: i32 = 5;
const TWO_FACTOR_CHALLENGE_TTL_MINUTES: i64 = 10;
const TWO_FACTOR_TRUSTED_DEVICE_DAYS: i64 = 30;
const GITHUB_AUTH_URL: &str = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const GITHUB_API_BASE: &str = "https://api.github.com";
const GITHUB_API_VERSION: &str = "2026-03-10";
const GITHUB_AUTH_SCOPE: &str = "user:email";

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/sign-up", post(sign_up))
        .route("/sign-in", post(sign_in))
        .route("/github/start", get(start_github_oauth))
        .route("/github/callback", get(github_oauth_callback))
        .route("/sign-out", post(sign_out))
        .route("/session", get(session))
        .route(
            "/sessions",
            get(list_sessions).delete(revoke_other_sessions),
        )
        .route("/sessions/{id}", delete(revoke_session_by_id))
        .route("/verify-email", post(verify_email))
        .route("/request-password-reset", post(request_password_reset))
        .route("/reset-password", post(reset_password))
        .route("/two-factor/status", get(two_factor_status))
        .route("/two-factor/setup", post(two_factor_setup))
        .route("/two-factor/enable", post(two_factor_enable))
        .route("/two-factor/disable", post(two_factor_disable))
        .route("/two-factor/fresh", post(two_factor_fresh))
        .route(
            "/two-factor/backup-codes",
            post(two_factor_regenerate_backup_codes),
        )
        .route("/two-factor/verify-login", post(two_factor_verify_login))
        .route(
            "/organizations",
            get(list_organizations).post(create_organization),
        )
        .route(
            "/organizations/active",
            patch(update_active_organization).delete(delete_active_organization),
        )
        .route(
            "/organizations/active/icon",
            post(upload_active_organization_icon)
                .layer(DefaultBodyLimit::max(MAX_ICON_BYTES + 1024 * 1024)),
        )
        .route(
            "/organizations/active/leave",
            post(leave_active_organization),
        )
        .route("/switch-organization", post(switch_organization))
        .route("/account", delete(delete_account))
        .route(
            "/account/icon",
            post(upload_account_icon).layer(DefaultBodyLimit::max(MAX_ICON_BYTES + 1024 * 1024)),
        )
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
struct GithubOAuthStartQuery {
    invite: Option<String>,
    redirect: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct GithubOAuthCallbackQuery {
    pub(super) state: String,
    pub(super) code: Option<String>,
    pub(super) error: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct GithubAuthStateClaims {
    nonce: String,
    invite: Option<String>,
    redirect: Option<String>,
    iat: usize,
    exp: usize,
}

#[derive(Deserialize)]
struct GithubAuthTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Deserialize)]
struct GithubAuthUserResponse {
    id: i64,
    login: String,
    name: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct GithubAuthEmailResponse {
    email: String,
    primary: bool,
    verified: bool,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TwoFactorPasswordRequest {
    password: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TwoFactorCodeRequest {
    code: String,
    remember_device: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TwoFactorPasswordCodeRequest {
    password: String,
    code: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TwoFactorRequiredResponse {
    two_factor_required: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TwoFactorStatusResponse {
    enabled: bool,
    backup_codes_remaining: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TwoFactorSetupResponse {
    secret: String,
    totp_uri: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TwoFactorBackupCodesResponse {
    backup_codes: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EmptyResponse {
    ok: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionsResponse {
    sessions: Vec<SessionListItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionListItem {
    id: String,
    current: bool,
    active_organization_id: String,
    active_organization_name: Option<String>,
    expires_at: chrono::DateTime<chrono::FixedOffset>,
    created_at: chrono::DateTime<chrono::FixedOffset>,
    updated_at: chrono::DateTime<chrono::FixedOffset>,
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
    headers: HeaderMap,
    Json(payload): Json<SignInRequest>,
) -> Result<Response, ApiError> {
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
    ensure_user_not_suspended(&user)?;

    let organization = first_or_create_organization(&state.db, &user).await?;
    ensure_organization_not_suspended(&organization)?;
    if user.two_factor_enabled {
        if verify_trusted_two_factor_device(&state, &headers, &user).await? {
            let (_, token) =
                create_user_session(&state.db, &state, &user.id, &organization.id).await?;
            let cookie = auth_cookie(&state, &token)?;
            return Ok((
                StatusCode::OK,
                [(header::SET_COOKIE, cookie)],
                Json(crate::auth::AuthResponse {
                    user: user.into(),
                    organization: organization.into(),
                }),
            )
                .into_response());
        }
        let challenge_cookie =
            create_two_factor_challenge_cookie(&state, &user, &organization).await?;
        return Ok((
            StatusCode::OK,
            [(header::SET_COOKIE, challenge_cookie)],
            Json(TwoFactorRequiredResponse {
                two_factor_required: true,
            }),
        )
            .into_response());
    }

    let (_, token) = create_user_session(&state.db, &state, &user.id, &organization.id).await?;
    let cookie = auth_cookie(&state, &token)?;

    Ok((
        StatusCode::OK,
        [(header::SET_COOKIE, cookie)],
        Json(crate::auth::AuthResponse {
            user: user.into(),
            organization: organization.into(),
        }),
    )
        .into_response())
}

async fn start_github_oauth(
    State(state): State<AppState>,
    Query(query): Query<GithubOAuthStartQuery>,
) -> Result<Redirect, ApiError> {
    let client_id = github_client_id()?;
    let redirect_uri = github_auth_redirect_uri(&state);
    let state_token = sign_github_auth_state(
        &state,
        sanitize_invite(query.invite.as_deref()),
        safe_redirect(query.redirect.as_deref()),
    )?;
    let mut url = reqwest::Url::parse(GITHUB_AUTH_URL)
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?;
    url.query_pairs_mut()
        .append_pair("client_id", &client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("scope", GITHUB_AUTH_SCOPE)
        .append_pair("state", &state_token)
        .append_pair("allow_signup", "true");

    Ok(Redirect::to(url.as_str()))
}

async fn github_oauth_callback(
    State(state): State<AppState>,
    Query(query): Query<GithubOAuthCallbackQuery>,
) -> Result<Response, ApiError> {
    complete_github_auth_callback(state, query).await
}

pub(super) async fn complete_github_auth_callback(
    state: AppState,
    query: GithubOAuthCallbackQuery,
) -> Result<Response, ApiError> {
    if query.error.is_some() {
        return Ok(Redirect::to("/login?github=oauth_error").into_response());
    }

    let claims = verify_github_auth_state(&state, &query.state)?;
    let code = query
        .code
        .ok_or_else(|| ApiError::BadRequest("GitHub did not return an OAuth code".to_owned()))?;
    let token = exchange_github_auth_code(&state, &code).await?;
    let access_token = token
        .access_token
        .as_deref()
        .ok_or_else(|| ApiError::BadRequest("GitHub token response was empty".to_owned()))?;
    let github_user = fetch_github_auth_user(access_token).await?;
    let github_emails = fetch_github_auth_emails(access_token).await?;
    let email = select_verified_github_email(&github_emails)?;
    let user = find_or_create_github_user(&state, email, &github_user).await?;
    ensure_user_not_suspended(&user)?;
    let organization = first_or_create_organization(&state.db, &user).await?;
    ensure_organization_not_suspended(&organization)?;
    let target = github_auth_success_redirect(&claims);
    if user.two_factor_enabled {
        // OAuth callback cannot see a trusted-device cookie in every provider/browser flow,
        // so it always starts a 2FA challenge when the account requires it.
        let challenge_cookie =
            create_two_factor_challenge_cookie(&state, &user, &organization).await?;
        let redirect = format!("/login?twoFactor=1&redirect={}", urlencoding(&target));
        return Ok((
            [(header::SET_COOKIE, challenge_cookie)],
            Redirect::to(&redirect),
        )
            .into_response());
    }

    let (_, session_token) =
        create_user_session(&state.db, &state, &user.id, &organization.id).await?;
    let cookie = auth_cookie(&state, &session_token)?;

    Ok(([(header::SET_COOKIE, cookie)], Redirect::to(&target)).into_response())
}

pub(super) fn is_github_auth_state(token: &str) -> bool {
    token.matches('.').count() == 2
}

async fn verify_email(
    State(state): State<AppState>,
    Json(payload): Json<TokenRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let auth_token =
        consume_auth_token(&state.db, &payload.token, EMAIL_VERIFICATION_PURPOSE).await?;
    let user = verify_user_email(&state.db, &auth_token.user_id).await?;
    ensure_user_not_suspended(&user)?;
    let organization = first_or_create_organization(&state.db, &user).await?;
    ensure_organization_not_suspended(&organization)?;
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
    if let Ok(auth) = require_auth_without_two_factor_policy(&headers, &state).await {
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
    match require_auth_without_two_factor_policy(&headers, &state).await {
        Ok(auth) => Ok((StatusCode::OK, Json(Some(auth.response())))),
        Err(ApiError::Unauthorized) => Ok((StatusCode::OK, Json(None))),
        Err(error) => Err(error),
    }
}

async fn two_factor_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<TwoFactorStatusResponse>, ApiError> {
    let auth = require_auth_without_two_factor_policy(&headers, &state).await?;
    let backup_codes_remaining = user_two_factor_backup_code::Entity::find()
        .filter(user_two_factor_backup_code::Column::UserId.eq(&auth.user.id))
        .filter(user_two_factor_backup_code::Column::UsedAt.is_null())
        .all(&state.db)
        .await?
        .len();

    Ok(Json(TwoFactorStatusResponse {
        enabled: auth.user.two_factor_enabled,
        backup_codes_remaining,
    }))
}

async fn two_factor_setup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<TwoFactorPasswordRequest>,
) -> Result<Json<TwoFactorSetupResponse>, ApiError> {
    let auth = require_auth_without_two_factor_policy(&headers, &state).await?;
    if !verify_password(&payload.password, &auth.user.password_hash)? {
        return Err(ApiError::Unauthorized);
    }

    let secret = Secret::generate_secret();
    let secret_base32 = match secret.to_encoded() {
        Secret::Encoded(value) => value,
        Secret::Raw(_) => unreachable!("to_encoded returns an encoded secret"),
    };
    let encrypted = encrypt_two_factor_secret(&state, &secret_base32)?;
    let now = Utc::now().fixed_offset();

    if let Some(existing) = user_two_factor::Entity::find()
        .filter(user_two_factor::Column::UserId.eq(&auth.user.id))
        .one(&state.db)
        .await?
    {
        let mut active = existing.into_active_model();
        active.pending_secret_ciphertext = Set(Some(encrypted));
        active.setup_started_at = Set(Some(now));
        active.updated_at = Set(now);
        active.update(&state.db).await?;
    } else {
        user_two_factor::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            user_id: Set(auth.user.id.clone()),
            secret_ciphertext: Set(None),
            pending_secret_ciphertext: Set(Some(encrypted)),
            enabled_at: Set(None),
            setup_started_at: Set(Some(now)),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(&state.db)
        .await?;
    }

    let totp = build_totp(&secret_base32, &auth.user.email)?;
    Ok(Json(TwoFactorSetupResponse {
        secret: secret_base32,
        totp_uri: totp.get_url(),
    }))
}

async fn two_factor_enable(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<TwoFactorCodeRequest>,
) -> Result<Json<TwoFactorBackupCodesResponse>, ApiError> {
    let auth = require_auth_without_two_factor_policy(&headers, &state).await?;
    let setup = user_two_factor::Entity::find()
        .filter(user_two_factor::Column::UserId.eq(&auth.user.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Start two-factor setup first".to_owned()))?;
    let pending_secret = setup
        .pending_secret_ciphertext
        .as_deref()
        .ok_or_else(|| ApiError::BadRequest("Start two-factor setup first".to_owned()))
        .and_then(|ciphertext| decrypt_two_factor_secret(&state, ciphertext))?;

    if !verify_totp_code(&pending_secret, &payload.code, &auth.user.email)? {
        return Err(ApiError::BadRequest(
            "Invalid authentication code".to_owned(),
        ));
    }

    let backup_codes = generate_backup_codes();
    let now = Utc::now().fixed_offset();
    let txn = state.db.begin().await?;
    user_two_factor_backup_code::Entity::delete_many()
        .filter(user_two_factor_backup_code::Column::UserId.eq(&auth.user.id))
        .exec(&txn)
        .await?;
    for code in &backup_codes {
        user_two_factor_backup_code::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            user_id: Set(auth.user.id.clone()),
            code_hash: Set(hash_two_factor_code(code)),
            used_at: Set(None),
            created_at: Set(now),
        }
        .insert(&txn)
        .await?;
    }

    let mut active = setup.into_active_model();
    active.secret_ciphertext = Set(Some(encrypt_two_factor_secret(&state, &pending_secret)?));
    active.pending_secret_ciphertext = Set(None);
    active.enabled_at = Set(Some(now));
    active.updated_at = Set(now);
    active.update(&txn).await?;

    let mut user_active = auth.user.clone().into_active_model();
    user_active.two_factor_enabled = Set(true);
    user_active.updated_at = Set(now);
    user_active.update(&txn).await?;
    txn.commit().await?;
    record_security_event(
        &state,
        Some(&headers),
        SecurityEventInput {
            organization_id: Some(auth.organization.id.clone()),
            actor_user_id: Some(auth.user.id.clone()),
            target_user_id: Some(auth.user.id.clone()),
            event_type: EVENT_TWO_FACTOR_ENABLED,
            metadata: metadata_empty(),
        },
    )
    .await?;

    Ok(Json(TwoFactorBackupCodesResponse { backup_codes }))
}

async fn two_factor_disable(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<TwoFactorPasswordCodeRequest>,
) -> Result<Json<EmptyResponse>, ApiError> {
    let auth = require_auth_without_two_factor_policy(&headers, &state).await?;
    if !verify_password(&payload.password, &auth.user.password_hash)? {
        return Err(ApiError::Unauthorized);
    }
    verify_account_second_factor(&state, &auth.user, &payload.code).await?;

    let now = Utc::now().fixed_offset();
    let txn = state.db.begin().await?;
    user_two_factor_backup_code::Entity::delete_many()
        .filter(user_two_factor_backup_code::Column::UserId.eq(&auth.user.id))
        .exec(&txn)
        .await?;
    user_two_factor::Entity::delete_many()
        .filter(user_two_factor::Column::UserId.eq(&auth.user.id))
        .exec(&txn)
        .await?;
    let mut active = auth.user.clone().into_active_model();
    active.two_factor_enabled = Set(false);
    active.updated_at = Set(now);
    active.update(&txn).await?;
    txn.commit().await?;
    record_security_event(
        &state,
        Some(&headers),
        SecurityEventInput {
            organization_id: Some(auth.organization.id.clone()),
            actor_user_id: Some(auth.user.id.clone()),
            target_user_id: Some(auth.user.id.clone()),
            event_type: EVENT_TWO_FACTOR_DISABLED,
            metadata: metadata_empty(),
        },
    )
    .await?;

    Ok(Json(EmptyResponse { ok: true }))
}

async fn two_factor_regenerate_backup_codes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<TwoFactorPasswordCodeRequest>,
) -> Result<Json<TwoFactorBackupCodesResponse>, ApiError> {
    let auth = require_auth_without_two_factor_policy(&headers, &state).await?;
    if !auth.user.two_factor_enabled {
        return Err(ApiError::BadRequest(
            "Two-factor authentication is not enabled".to_owned(),
        ));
    }
    if !verify_password(&payload.password, &auth.user.password_hash)? {
        return Err(ApiError::Unauthorized);
    }
    verify_account_second_factor(&state, &auth.user, &payload.code).await?;

    let backup_codes = generate_backup_codes();
    let now = Utc::now().fixed_offset();
    let txn = state.db.begin().await?;
    user_two_factor_backup_code::Entity::delete_many()
        .filter(user_two_factor_backup_code::Column::UserId.eq(&auth.user.id))
        .exec(&txn)
        .await?;
    for code in &backup_codes {
        user_two_factor_backup_code::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            user_id: Set(auth.user.id.clone()),
            code_hash: Set(hash_two_factor_code(code)),
            used_at: Set(None),
            created_at: Set(now),
        }
        .insert(&txn)
        .await?;
    }
    txn.commit().await?;
    record_security_event(
        &state,
        Some(&headers),
        SecurityEventInput {
            organization_id: Some(auth.organization.id.clone()),
            actor_user_id: Some(auth.user.id.clone()),
            target_user_id: Some(auth.user.id.clone()),
            event_type: EVENT_TWO_FACTOR_BACKUP_CODES_REGENERATED,
            metadata: metadata_empty(),
        },
    )
    .await?;

    Ok(Json(TwoFactorBackupCodesResponse { backup_codes }))
}

async fn two_factor_verify_login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<TwoFactorCodeRequest>,
) -> Result<Response, ApiError> {
    let challenge_token = read_two_factor_cookie(&headers, &state).ok_or(ApiError::Unauthorized)?;
    let challenge = two_factor_challenge::Entity::find()
        .filter(two_factor_challenge::Column::TokenHash.eq(hash_token(&challenge_token)))
        .one(&state.db)
        .await?
        .ok_or(ApiError::Unauthorized)?;
    let now = Utc::now().fixed_offset();
    if challenge.used_at.is_some() || challenge.expires_at <= now {
        return Err(ApiError::Unauthorized);
    }
    if challenge.attempts >= TWO_FACTOR_CHALLENGE_MAX_ATTEMPTS {
        return Err(ApiError::Unauthorized);
    }

    let user = user::Entity::find_by_id(&challenge.user_id)
        .one(&state.db)
        .await?
        .ok_or(ApiError::Unauthorized)?;
    ensure_user_not_suspended(&user)?;
    let organization = organization::Entity::find_by_id(&challenge.active_organization_id)
        .one(&state.db)
        .await?
        .ok_or(ApiError::Unauthorized)?;
    ensure_organization_not_suspended(&organization)?;

    let verified = verify_account_second_factor_inner(&state, &user, &payload.code).await?;
    if !verified {
        let attempts = challenge.attempts;
        let mut active = challenge.into_active_model();
        active.attempts = Set(attempts + 1);
        active.update(&state.db).await?;
        record_security_event(
            &state,
            Some(&headers),
            SecurityEventInput {
                organization_id: Some(organization.id),
                actor_user_id: Some(user.id.clone()),
                target_user_id: Some(user.id),
                event_type: EVENT_LOGIN_2FA_FAILED,
                metadata: json!({ "attempts": attempts + 1 }),
            },
        )
        .await?;
        return Err(ApiError::BadRequest(
            "Invalid authentication code".to_owned(),
        ));
    }

    let txn = state.db.begin().await?;
    let mut active = challenge.into_active_model();
    active.used_at = Set(Some(now));
    active.update(&txn).await?;
    txn.commit().await?;

    let (session, _) = create_user_session(&state.db, &state, &user.id, &organization.id).await?;
    let session = mark_session_two_factor_verified(&state.db, session).await?;
    let session_token = crate::auth::sign_session_token(&state, &session)?;
    let cookie = auth_cookie(&state, &session_token)?;
    let clear_challenge = clear_two_factor_cookie(&state)?;
    let trusted_device_cookie = if payload.remember_device.unwrap_or(false) {
        Some(create_trusted_two_factor_device_cookie(&state, &user).await?)
    } else {
        None
    };
    record_security_event(
        &state,
        Some(&headers),
        SecurityEventInput {
            organization_id: Some(organization.id.clone()),
            actor_user_id: Some(user.id.clone()),
            target_user_id: Some(user.id.clone()),
            event_type: EVENT_LOGIN_SUCCESS,
            metadata: json!({ "method": "two_factor" }),
        },
    )
    .await?;

    let body = Json(crate::auth::AuthResponse {
        user: user.into(),
        organization: organization.into(),
    });
    if let Some(trusted_device_cookie) = trusted_device_cookie {
        Ok((
            StatusCode::OK,
            [
                (header::SET_COOKIE, cookie),
                (header::SET_COOKIE, clear_challenge),
                (header::SET_COOKIE, trusted_device_cookie),
            ],
            body,
        )
            .into_response())
    } else {
        Ok((
            StatusCode::OK,
            [
                (header::SET_COOKIE, cookie),
                (header::SET_COOKIE, clear_challenge),
            ],
            body,
        )
            .into_response())
    }
}

async fn two_factor_fresh(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<TwoFactorCodeRequest>,
) -> Result<Json<EmptyResponse>, ApiError> {
    let auth = require_auth_without_two_factor_policy(&headers, &state).await?;
    if !auth.user.two_factor_enabled {
        return Ok(Json(EmptyResponse { ok: true }));
    }
    verify_account_second_factor(&state, &auth.user, &payload.code).await?;
    mark_session_two_factor_verified(&state.db, auth.session).await?;
    Ok(Json(EmptyResponse { ok: true }))
}

async fn list_sessions(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SessionsResponse>, ApiError> {
    let auth = require_auth_without_two_factor_policy(&headers, &state).await?;
    let now = Utc::now().fixed_offset();
    let sessions = session_entity::Entity::find()
        .filter(session_entity::Column::UserId.eq(&auth.user.id))
        .filter(session_entity::Column::RevokedAt.is_null())
        .filter(session_entity::Column::ExpiresAt.gt(now))
        .order_by_desc(session_entity::Column::UpdatedAt)
        .all(&state.db)
        .await?;

    let mut items = Vec::with_capacity(sessions.len());
    for session in sessions {
        let active_organization_name =
            organization::Entity::find_by_id(&session.active_organization_id)
                .one(&state.db)
                .await?
                .map(|organization| organization.name);
        items.push(SessionListItem {
            current: session.id == auth.session.id,
            id: session.id,
            active_organization_id: session.active_organization_id,
            active_organization_name,
            expires_at: session.expires_at,
            created_at: session.created_at,
            updated_at: session.updated_at,
        });
    }

    Ok(Json(SessionsResponse { sessions: items }))
}

async fn revoke_session_by_id(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<EmptyResponse>, ApiError> {
    let auth = require_auth_without_two_factor_policy(&headers, &state).await?;
    if id == auth.session.id {
        return Err(ApiError::BadRequest(
            "Sign out to revoke the current session".to_owned(),
        ));
    }

    let session = session_entity::Entity::find_by_id(&id)
        .filter(session_entity::Column::UserId.eq(&auth.user.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Session not found".to_owned()))?;

    let now = Utc::now().fixed_offset();
    if session.revoked_at.is_none() {
        let mut active = session.into_active_model();
        active.revoked_at = Set(Some(now));
        active.updated_at = Set(now);
        active.update(&state.db).await?;
    }

    Ok(Json(EmptyResponse { ok: true }))
}

async fn revoke_other_sessions(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<EmptyResponse>, ApiError> {
    let auth = require_auth_without_two_factor_policy(&headers, &state).await?;
    let now = Utc::now().fixed_offset();
    let sessions = session_entity::Entity::find()
        .filter(session_entity::Column::UserId.eq(&auth.user.id))
        .filter(session_entity::Column::Id.ne(&auth.session.id))
        .filter(session_entity::Column::RevokedAt.is_null())
        .filter(session_entity::Column::ExpiresAt.gt(now))
        .all(&state.db)
        .await?;

    for session in sessions {
        let mut active = session.into_active_model();
        active.revoked_at = Set(Some(now));
        active.updated_at = Set(now);
        active.update(&state.db).await?;
    }

    Ok(Json(EmptyResponse { ok: true }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OrganizationsResponse {
    organizations: Vec<OrganizationListItem>,
    active_organization_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OrganizationListItem {
    id: String,
    name: String,
    slug: String,
    image: Option<String>,
    role: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SwitchOrganizationRequest {
    organization_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateOrganizationRequest {
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OrganizationEnvelope {
    organization: OrganizationResponse,
}

async fn list_organizations(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<OrganizationsResponse>, ApiError> {
    let auth = require_auth_without_two_factor_policy(&headers, &state).await?;
    let memberships = member::Entity::find()
        .filter(member::Column::UserId.eq(&auth.user.id))
        .order_by_asc(member::Column::CreatedAt)
        .all(&state.db)
        .await?;

    let mut organizations = Vec::with_capacity(memberships.len());
    for membership in memberships {
        if let Some(org) = organization::Entity::find_by_id(&membership.organization_id)
            .one(&state.db)
            .await?
        {
            organizations.push(OrganizationListItem {
                id: org.id,
                name: org.name,
                slug: org.slug,
                image: org.image,
                role: membership.role,
            });
        }
    }

    Ok(Json(OrganizationsResponse {
        organizations,
        active_organization_id: auth.organization.id,
    }))
}

async fn switch_organization(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SwitchOrganizationRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let auth = require_auth_without_two_factor_policy(&headers, &state).await?;

    if !user_is_member(&state.db, &auth.user.id, &payload.organization_id).await? {
        return Err(ApiError::NotFound("Organization not found".to_owned()));
    }

    let organization = organization::Entity::find_by_id(&payload.organization_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Organization not found".to_owned()))?;
    ensure_organization_not_suspended(&organization)?;
    if organization.require_two_factor && !auth.user.two_factor_enabled {
        return Err(ApiError::Forbidden(
            "Two-factor authentication is required for this workspace".to_owned(),
        ));
    }

    let (_, token) =
        set_session_active_organization(&state.db, &state, auth.session, organization.id.clone())
            .await?;
    let cookie = auth_cookie(&state, &token)?;

    Ok((
        StatusCode::OK,
        [(header::SET_COOKIE, cookie)],
        Json(crate::auth::AuthResponse {
            user: auth.user.into(),
            organization: organization.into(),
        }),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateOrganizationRequest {
    name: Option<String>,
    require_two_factor: Option<bool>,
}

async fn update_active_organization(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateOrganizationRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    if payload.name.is_some() {
        require_permission(&state, &auth, WORKSPACE_RENAME).await?;
    }
    if payload.require_two_factor.is_some() {
        require_permission(&state, &auth, WORKSPACE_SECURITY).await?;
        ensure_fresh_two_factor(&auth)?;
    }
    if payload.require_two_factor == Some(true) && !auth.user.two_factor_enabled {
        return Err(ApiError::BadRequest(
            "Enable two-factor authentication on your account before requiring it for the workspace"
                .to_owned(),
        ));
    }

    let mut active: organization::ActiveModel = auth.organization.into();
    if let Some(name) = payload.name.as_deref() {
        let name = name.trim();
        if name.is_empty() {
            return Err(ApiError::BadRequest(
                "Workspace name is required".to_owned(),
            ));
        }
        if name.chars().count() > 64 {
            return Err(ApiError::BadRequest(
                "Workspace name must be 64 characters or fewer".to_owned(),
            ));
        }
        active.name = Set(name.to_owned());
    }
    if let Some(require_two_factor) = payload.require_two_factor {
        active.require_two_factor = Set(require_two_factor);
    }
    active.updated_at = Set(Utc::now().fixed_offset());
    let updated = active.update(&state.db).await?;
    if let Some(require_two_factor) = payload.require_two_factor {
        record_security_event(
            &state,
            Some(&headers),
            SecurityEventInput {
                organization_id: Some(updated.id.clone()),
                actor_user_id: Some(auth.user.id.clone()),
                target_user_id: None,
                event_type: if require_two_factor {
                    EVENT_WORKSPACE_REQUIRE_2FA_ENABLED
                } else {
                    EVENT_WORKSPACE_REQUIRE_2FA_DISABLED
                },
                metadata: metadata_empty(),
            },
        )
        .await?;
    }

    Ok(Json(OrganizationEnvelope {
        organization: updated.into(),
    }))
}

async fn upload_active_organization_icon(
    State(state): State<AppState>,
    headers: HeaderMap,
    multipart: Multipart,
) -> Result<impl IntoResponse, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_permission(&state, &auth, WORKSPACE_RENAME).await?;
    let image = upload_icon(
        &state,
        multipart,
        IconScope::Workspace(&auth.organization.id),
    )
    .await?;

    let mut active: organization::ActiveModel = auth.organization.into();
    active.image = Set(Some(image));
    active.updated_at = Set(Utc::now().fixed_offset());
    let updated = active.update(&state.db).await?;

    Ok(Json(OrganizationEnvelope {
        organization: updated.into(),
    }))
}

async fn upload_account_icon(
    State(state): State<AppState>,
    headers: HeaderMap,
    multipart: Multipart,
) -> Result<impl IntoResponse, ApiError> {
    let auth = require_auth_without_two_factor_policy(&headers, &state).await?;
    let image = upload_icon(&state, multipart, IconScope::User(&auth.user.id)).await?;

    let mut active = auth.user.into_active_model();
    active.image = Set(Some(image));
    active.updated_at = Set(Utc::now().fixed_offset());
    let updated = active.update(&state.db).await?;

    Ok(Json(crate::auth::AuthResponse {
        user: updated.into(),
        organization: auth.organization.into(),
    }))
}

enum IconScope<'a> {
    Workspace(&'a str),
    User(&'a str),
}

async fn upload_icon(
    state: &AppState,
    mut multipart: Multipart,
    scope: IconScope<'_>,
) -> Result<String, ApiError> {
    let storage_config = state
        .config
        .storage
        .as_ref()
        .ok_or_else(|| ApiError::BadRequest("File storage is not configured".to_owned()))?;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::BadRequest("Invalid multipart upload".to_owned()))?
    {
        if field.name() != Some("file") {
            continue;
        }

        let filename = field.file_name().unwrap_or("icon").to_owned();
        let content_type = field
            .content_type()
            .unwrap_or("application/octet-stream")
            .to_owned();
        if !matches!(
            content_type.as_str(),
            "image/png" | "image/jpeg" | "image/webp" | "image/gif"
        ) {
            return Err(ApiError::BadRequest(
                "Icons must be PNG, JPEG, WebP, or GIF images".to_owned(),
            ));
        }

        let bytes = field
            .bytes()
            .await
            .map_err(|_| ApiError::BadRequest("Invalid uploaded file".to_owned()))?;
        if bytes.is_empty() {
            return Err(ApiError::BadRequest("Uploaded file is empty".to_owned()));
        }
        if bytes.len() > MAX_ICON_BYTES {
            return Err(ApiError::BadRequest(
                "Icons must be 2 MB or smaller".to_owned(),
            ));
        }

        let key = match scope {
            IconScope::Workspace(organization_id) => {
                storage::safe_workspace_icon_key(organization_id, &filename)
            }
            IconScope::User(user_id) => storage::safe_user_icon_key(user_id, &filename),
        };
        let stored =
            storage::put_object(storage_config, &key, &content_type, bytes.to_vec()).await?;
        return Ok(stored.url);
    }

    Err(ApiError::BadRequest("No file was uploaded".to_owned()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteOrganizationRequest {
    confirm: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeleteOrganizationResponse {
    ok: bool,
    switched_to: Option<OrganizationResponse>,
}

async fn delete_active_organization(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<DeleteOrganizationRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_permission(&state, &auth, WORKSPACE_DELETE).await?;
    ensure_fresh_two_factor(&auth)?;

    if payload.confirm.trim() != auth.organization.name {
        return Err(ApiError::BadRequest(
            "Type the workspace name exactly to confirm deletion".to_owned(),
        ));
    }

    let other_membership = member::Entity::find()
        .filter(member::Column::UserId.eq(&auth.user.id))
        .filter(member::Column::OrganizationId.ne(&auth.organization.id))
        .order_by_asc(member::Column::CreatedAt)
        .one(&state.db)
        .await?;

    let next_organization = if let Some(other) = other_membership.as_ref() {
        organization::Entity::find_by_id(&other.organization_id)
            .one(&state.db)
            .await?
    } else {
        None
    };

    if next_organization.is_none() {
        return Err(ApiError::BadRequest(
            "You can't delete your only workspace. Create another one first.".to_owned(),
        ));
    }

    let deleted_org_id = auth.organization.id.clone();
    record_security_event(
        &state,
        Some(&headers),
        SecurityEventInput {
            organization_id: Some(deleted_org_id.clone()),
            actor_user_id: Some(auth.user.id.clone()),
            target_user_id: None,
            event_type: EVENT_WORKSPACE_DELETED,
            metadata: json!({ "workspaceName": auth.organization.name }),
        },
    )
    .await?;
    organization::Entity::delete_by_id(&deleted_org_id)
        .exec(&state.db)
        .await?;

    let next_org = next_organization.expect("checked above");
    let (_, token) =
        set_session_active_organization(&state.db, &state, auth.session, next_org.id.clone())
            .await?;
    let cookie = auth_cookie(&state, &token)?;

    Ok((
        StatusCode::OK,
        [(header::SET_COOKIE, cookie)],
        Json(DeleteOrganizationResponse {
            ok: true,
            switched_to: Some(next_org.into()),
        }),
    ))
}

async fn leave_active_organization(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, ApiError> {
    let auth = require_auth(&headers, &state).await?;

    let membership = member::Entity::find()
        .filter(member::Column::UserId.eq(&auth.user.id))
        .filter(member::Column::OrganizationId.eq(&auth.organization.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::Forbidden("Not a member of this workspace".to_owned()))?;

    if membership.role == ROLE_OWNER {
        return Err(ApiError::BadRequest(
            "Owners can't leave. Transfer ownership or delete the workspace.".to_owned(),
        ));
    }

    let other_membership = member::Entity::find()
        .filter(member::Column::UserId.eq(&auth.user.id))
        .filter(member::Column::OrganizationId.ne(&auth.organization.id))
        .order_by_asc(member::Column::CreatedAt)
        .one(&state.db)
        .await?;

    let next_organization = if let Some(other) = other_membership.as_ref() {
        organization::Entity::find_by_id(&other.organization_id)
            .one(&state.db)
            .await?
    } else {
        None
    };

    if next_organization.is_none() {
        return Err(ApiError::BadRequest(
            "You can't leave your only workspace.".to_owned(),
        ));
    }

    let membership_id = membership.id.clone();
    member::Entity::delete_by_id(&membership_id)
        .exec(&state.db)
        .await?;

    let next_org = next_organization.expect("checked above");
    let (_, token) =
        set_session_active_organization(&state.db, &state, auth.session, next_org.id.clone())
            .await?;
    let cookie = auth_cookie(&state, &token)?;

    Ok((
        StatusCode::OK,
        [(header::SET_COOKIE, cookie)],
        Json(DeleteOrganizationResponse {
            ok: true,
            switched_to: Some(next_org.into()),
        }),
    ))
}

async fn create_organization(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateOrganizationRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let auth = require_auth_without_two_factor_policy(&headers, &state).await?;
    let organization = create_organization_for_user(&state.db, &auth.user, &payload.name).await?;
    let (_, token) =
        set_session_active_organization(&state.db, &state, auth.session, organization.id.clone())
            .await?;
    let cookie = auth_cookie(&state, &token)?;

    Ok((
        StatusCode::CREATED,
        [(header::SET_COOKIE, cookie)],
        Json(OrganizationEnvelope {
            organization: organization.into(),
        }),
    ))
}

async fn create_two_factor_challenge_cookie(
    state: &AppState,
    user: &user::Model,
    organization: &organization::Model,
) -> Result<header::HeaderValue, ApiError> {
    let token = random_url_token(32);
    let now = Utc::now().fixed_offset();
    two_factor_challenge::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        user_id: Set(user.id.clone()),
        active_organization_id: Set(organization.id.clone()),
        token_hash: Set(hash_token(&token)),
        expires_at: Set(
            (Utc::now() + Duration::minutes(TWO_FACTOR_CHALLENGE_TTL_MINUTES)).fixed_offset(),
        ),
        used_at: Set(None),
        attempts: Set(0),
        created_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    two_factor_cookie(state, &token)
}

fn two_factor_cookie(state: &AppState, token: &str) -> Result<header::HeaderValue, ApiError> {
    let mut cookie = Cookie::build((two_factor_cookie_name(state), token.to_owned()))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(state.config.cookie_secure)
        .max_age(CookieDuration::minutes(TWO_FACTOR_CHALLENGE_TTL_MINUTES));

    if let Some(domain) = &state.config.cookie_domain {
        cookie = cookie.domain(domain.clone());
    }

    header::HeaderValue::from_str(&cookie.build().to_string())
        .map_err(|error| ApiError::Internal(error.into()))
}

fn clear_two_factor_cookie(state: &AppState) -> Result<header::HeaderValue, ApiError> {
    let mut cookie = Cookie::build((two_factor_cookie_name(state), ""))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(state.config.cookie_secure)
        .max_age(CookieDuration::ZERO);

    if let Some(domain) = &state.config.cookie_domain {
        cookie = cookie.domain(domain.clone());
    }

    header::HeaderValue::from_str(&cookie.build().to_string())
        .map_err(|error| ApiError::Internal(error.into()))
}

fn two_factor_cookie_name(state: &AppState) -> String {
    format!("{}_2fa", state.config.cookie_name)
}

fn read_two_factor_cookie(headers: &HeaderMap, state: &AppState) -> Option<String> {
    let name = two_factor_cookie_name(state);
    read_named_cookie(headers, &name)
}

async fn verify_trusted_two_factor_device(
    state: &AppState,
    headers: &HeaderMap,
    user: &user::Model,
) -> Result<bool, ApiError> {
    let Some(token) = read_trusted_two_factor_device_cookie(headers, state) else {
        return Ok(false);
    };
    let now = Utc::now().fixed_offset();
    let Some(device) = user_two_factor_trusted_device::Entity::find()
        .filter(user_two_factor_trusted_device::Column::UserId.eq(&user.id))
        .filter(user_two_factor_trusted_device::Column::TokenHash.eq(hash_token(&token)))
        .filter(user_two_factor_trusted_device::Column::ExpiresAt.gt(now))
        .one(&state.db)
        .await?
    else {
        return Ok(false);
    };

    let mut active = device.into_active_model();
    active.last_used_at = Set(Some(now));
    active.update(&state.db).await?;
    Ok(true)
}

async fn create_trusted_two_factor_device_cookie(
    state: &AppState,
    user: &user::Model,
) -> Result<header::HeaderValue, ApiError> {
    let token = random_url_token(32);
    let now = Utc::now().fixed_offset();
    let expires_at = (Utc::now() + Duration::days(TWO_FACTOR_TRUSTED_DEVICE_DAYS)).fixed_offset();
    user_two_factor_trusted_device::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        user_id: Set(user.id.clone()),
        token_hash: Set(hash_token(&token)),
        expires_at: Set(expires_at),
        last_used_at: Set(Some(now)),
        created_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    trusted_two_factor_device_cookie(state, &token)
}

fn trusted_two_factor_device_cookie(
    state: &AppState,
    token: &str,
) -> Result<header::HeaderValue, ApiError> {
    let mut cookie = Cookie::build((
        trusted_two_factor_device_cookie_name(state),
        token.to_owned(),
    ))
    .path("/")
    .http_only(true)
    .same_site(SameSite::Lax)
    .secure(state.config.cookie_secure)
    .max_age(CookieDuration::days(TWO_FACTOR_TRUSTED_DEVICE_DAYS));

    if let Some(domain) = &state.config.cookie_domain {
        cookie = cookie.domain(domain.clone());
    }

    header::HeaderValue::from_str(&cookie.build().to_string())
        .map_err(|error| ApiError::Internal(error.into()))
}

fn trusted_two_factor_device_cookie_name(state: &AppState) -> String {
    format!("{}_2fa_trusted", state.config.cookie_name)
}

fn read_trusted_two_factor_device_cookie(headers: &HeaderMap, state: &AppState) -> Option<String> {
    let name = trusted_two_factor_device_cookie_name(state);
    read_named_cookie(headers, &name)
}

fn read_named_cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    let header = headers.get(header::COOKIE)?.to_str().ok()?;
    header.split(';').find_map(|part| {
        let (cookie_name, value) = part.trim().split_once('=')?;
        (cookie_name == name).then(|| value.to_owned())
    })
}

fn encrypt_two_factor_secret(state: &AppState, value: &str) -> Result<String, ApiError> {
    encrypt_secret(&state.config.two_factor_key(), value)
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))
}

fn decrypt_two_factor_secret(state: &AppState, value: &str) -> Result<String, ApiError> {
    decrypt_secret(&state.config.two_factor_key(), value)
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))
}

fn build_totp(secret_base32: &str, account_name: &str) -> Result<TOTP, ApiError> {
    TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        Secret::Encoded(secret_base32.to_owned())
            .to_bytes()
            .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?,
        Some(TWO_FACTOR_ISSUER.to_owned()),
        account_name.to_owned(),
    )
    .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))
}

fn verify_totp_code(secret_base32: &str, code: &str, account_name: &str) -> Result<bool, ApiError> {
    let code = code.trim().replace(' ', "");
    if code.len() != 6 || !code.chars().all(|char| char.is_ascii_digit()) {
        return Ok(false);
    }
    build_totp(secret_base32, account_name)?
        .check_current(&code)
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))
}

async fn verify_account_second_factor(
    state: &AppState,
    user: &user::Model,
    code: &str,
) -> Result<(), ApiError> {
    if verify_account_second_factor_inner(state, user, code).await? {
        Ok(())
    } else {
        Err(ApiError::BadRequest(
            "Invalid authentication code".to_owned(),
        ))
    }
}

async fn verify_account_second_factor_inner(
    state: &AppState,
    user: &user::Model,
    code: &str,
) -> Result<bool, ApiError> {
    let Some(two_factor) = user_two_factor::Entity::find()
        .filter(user_two_factor::Column::UserId.eq(&user.id))
        .one(&state.db)
        .await?
    else {
        return Ok(false);
    };
    let Some(secret_ciphertext) = two_factor.secret_ciphertext.as_deref() else {
        return Ok(false);
    };
    let secret = decrypt_two_factor_secret(state, secret_ciphertext)?;
    if verify_totp_code(&secret, code, &user.email)? {
        return Ok(true);
    }

    let code_hash = hash_two_factor_code(code);
    let Some(backup_code) = user_two_factor_backup_code::Entity::find()
        .filter(user_two_factor_backup_code::Column::UserId.eq(&user.id))
        .filter(user_two_factor_backup_code::Column::CodeHash.eq(code_hash))
        .filter(user_two_factor_backup_code::Column::UsedAt.is_null())
        .one(&state.db)
        .await?
    else {
        return Ok(false);
    };

    let mut active = backup_code.into_active_model();
    active.used_at = Set(Some(Utc::now().fixed_offset()));
    active.update(&state.db).await?;
    Ok(true)
}

fn generate_backup_codes() -> Vec<String> {
    (0..TWO_FACTOR_BACKUP_CODE_COUNT)
        .map(|_| {
            let raw = random_url_token(TWO_FACTOR_BACKUP_CODE_BYTES).to_ascii_uppercase();
            format!("{}-{}", &raw[..4], &raw[4..])
        })
        .collect()
}

fn hash_two_factor_code(code: &str) -> String {
    hash_token(&format!(
        "two_factor_backup:{}",
        normalize_two_factor_code(code)
    ))
}

fn normalize_two_factor_code(code: &str) -> String {
    code.chars()
        .filter(|char| !char.is_ascii_whitespace() && *char != '-')
        .flat_map(char::to_uppercase)
        .collect()
}

fn random_url_token(bytes_len: usize) -> String {
    let mut bytes = vec![0u8; bytes_len];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn urlencoding(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

fn sign_github_auth_state(
    state: &AppState,
    invite: Option<String>,
    redirect: Option<String>,
) -> Result<String, ApiError> {
    let now = Utc::now();
    let claims = GithubAuthStateClaims {
        nonce: Uuid::new_v4().to_string(),
        invite,
        redirect,
        iat: now.timestamp() as usize,
        exp: (now + chrono::Duration::minutes(10)).timestamp() as usize,
    };

    encode(
        &JwtHeader::default(),
        &claims,
        &EncodingKey::from_secret(state.config.jwt_secret.as_bytes()),
    )
    .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))
}

fn verify_github_auth_state(
    state: &AppState,
    token: &str,
) -> Result<GithubAuthStateClaims, ApiError> {
    decode::<GithubAuthStateClaims>(
        token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map(|data| data.claims)
    .map_err(|_| ApiError::BadRequest("Invalid GitHub OAuth state".to_owned()))
}

async fn exchange_github_auth_code(
    state: &AppState,
    code: &str,
) -> Result<GithubAuthTokenResponse, ApiError> {
    let response = reqwest::Client::new()
        .post(GITHUB_TOKEN_URL)
        .header(reqwest::header::ACCEPT, "application/json")
        .form(&[
            ("client_id", github_client_id()?),
            ("client_secret", github_client_secret()?),
            ("code", code.to_owned()),
            ("redirect_uri", github_auth_redirect_uri(state)),
        ])
        .send()
        .await
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?;
    let status = response.status();
    let token = response
        .json::<GithubAuthTokenResponse>()
        .await
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?;

    if !status.is_success() || token.access_token.is_none() {
        let message = token
            .error_description
            .or(token.error)
            .unwrap_or_else(|| "GitHub OAuth token exchange failed".to_owned());
        return Err(ApiError::BadRequest(message));
    }

    Ok(token)
}

async fn fetch_github_auth_user(token: &str) -> Result<GithubAuthUserResponse, ApiError> {
    github_auth_request(token, "/user")
        .send()
        .await
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?
        .error_for_status()
        .map_err(|error| ApiError::BadRequest(error.to_string()))?
        .json::<GithubAuthUserResponse>()
        .await
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))
}

async fn fetch_github_auth_emails(token: &str) -> Result<Vec<GithubAuthEmailResponse>, ApiError> {
    github_auth_request(token, "/user/emails")
        .send()
        .await
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?
        .error_for_status()
        .map_err(|error| ApiError::BadRequest(error.to_string()))?
        .json::<Vec<GithubAuthEmailResponse>>()
        .await
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))
}

fn github_auth_request(token: &str, path: &str) -> reqwest::RequestBuilder {
    reqwest::Client::new()
        .get(format!("{GITHUB_API_BASE}{path}"))
        .bearer_auth(token)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .header(reqwest::header::USER_AGENT, "Produktive")
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
}

fn select_verified_github_email(emails: &[GithubAuthEmailResponse]) -> Result<String, ApiError> {
    let selected = emails
        .iter()
        .find(|email| email.primary && email.verified)
        .or_else(|| emails.iter().find(|email| email.verified))
        .ok_or_else(|| {
            ApiError::BadRequest("GitHub account has no verified email address".to_owned())
        })?;

    validate_email(&selected.email)
}

async fn find_or_create_github_user(
    state: &AppState,
    email: String,
    github_user: &GithubAuthUserResponse,
) -> Result<user::Model, ApiError> {
    if let Some(existing) = user::Entity::find()
        .filter(user::Column::Email.eq(&email))
        .one(&state.db)
        .await?
    {
        let mut active = existing.clone().into_active_model();
        let mut changed = false;

        if !existing.email_verified {
            active.email_verified = Set(true);
            changed = true;
        }
        if existing.image.is_none() && github_user.avatar_url.is_some() {
            active.image = Set(github_user.avatar_url.clone());
            changed = true;
        }

        if changed {
            active.updated_at = Set(Utc::now().fixed_offset());
            return Ok(active.update(&state.db).await?);
        }

        return Ok(existing);
    }

    let name = github_user
        .name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or(&github_user.login)
        .to_owned();
    let random_password = format!("github-oauth-{}-{}", github_user.id, Uuid::new_v4());
    let (created, _) = create_signup_records(state, name, email, random_password).await?;
    let mut created = verify_user_email(&state.db, &created.id).await?;

    if github_user.avatar_url.is_some() {
        let mut active = created.clone().into_active_model();
        active.image = Set(github_user.avatar_url.clone());
        active.updated_at = Set(Utc::now().fixed_offset());
        created = active.update(&state.db).await?;
    }

    Ok(created)
}

fn github_auth_success_redirect(claims: &GithubAuthStateClaims) -> String {
    if let Some(invite) = claims
        .invite
        .as_deref()
        .and_then(|value| sanitize_invite(Some(value)))
    {
        return format!("/invite/{invite}");
    }

    claims
        .redirect
        .clone()
        .unwrap_or_else(|| "/chat".to_owned())
}

fn safe_redirect(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    if value.starts_with('/')
        && !value.starts_with("//")
        && !value.contains('\n')
        && !value.contains('\r')
    {
        Some(value.to_owned())
    } else {
        None
    }
}

fn sanitize_invite(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    if !value.is_empty()
        && value.len() <= 128
        && value
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || char == '-' || char == '_')
    {
        Some(value.to_owned())
    } else {
        None
    }
}

fn github_client_id() -> Result<String, ApiError> {
    std::env::var("GITHUB_OAUTH_CLIENT_ID")
        .map(|value| value.trim().to_owned())
        .ok()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| ApiError::BadRequest("GitHub OAuth is not configured".to_owned()))
}

fn github_client_secret() -> Result<String, ApiError> {
    std::env::var("GITHUB_OAUTH_CLIENT_SECRET")
        .map(|value| value.trim().to_owned())
        .ok()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| ApiError::BadRequest("GitHub OAuth is not configured".to_owned()))
}

fn github_auth_redirect_uri(state: &AppState) -> String {
    format!("{}/api/github/oauth/callback", state.config.app_url)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteAccountRequest {
    confirm: String,
}

async fn delete_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<DeleteAccountRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let auth = require_auth_without_two_factor_policy(&headers, &state).await?;

    if payload.confirm.trim() != auth.user.email {
        return Err(ApiError::BadRequest(
            "Type your email exactly to confirm account deletion".to_owned(),
        ));
    }

    record_security_event(
        &state,
        Some(&headers),
        SecurityEventInput {
            organization_id: Some(auth.organization.id.clone()),
            actor_user_id: Some(auth.user.id.clone()),
            target_user_id: Some(auth.user.id.clone()),
            event_type: EVENT_ACCOUNT_DELETED,
            metadata: metadata_empty(),
        },
    )
    .await?;
    user::Entity::delete_by_id(&auth.user.id)
        .exec(&state.db)
        .await?;

    Ok((
        StatusCode::OK,
        [(header::SET_COOKIE, clear_auth_cookie(&state)?)],
        Json(EmptyResponse { ok: true }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backup_code_hash_ignores_case_spaces_and_hyphens() {
        assert_eq!(
            hash_two_factor_code("abcd-1234"),
            hash_two_factor_code("ABCD 1234")
        );
    }

    #[test]
    fn totp_accepts_current_code_and_rejects_invalid_code() {
        let secret = match Secret::generate_secret().to_encoded() {
            Secret::Encoded(value) => value,
            Secret::Raw(_) => unreachable!("to_encoded returns an encoded secret"),
        };
        let totp = build_totp(&secret, "user@example.com").expect("TOTP builds");
        let code = totp.generate_current().expect("current code");

        assert!(verify_totp_code(&secret, &code, "user@example.com").expect("valid check"));
        assert!(!verify_totp_code(&secret, "000000", "user@example.com").expect("invalid check"));
        assert!(!verify_totp_code(&secret, "not-a-code", "user@example.com").expect("format check"));
    }
}
