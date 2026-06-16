use axum::{
    extract::{Query, State},
    http::HeaderMap,
    response::Redirect,
    routing::{get, post},
    Json, Router,
};
use chrono::{Duration, Utc};
use email::OutboundEmail;
use entity::{
    password_reset_token, session, user, workspace,
    workspace_member::{self, WorkspaceRole},
};
use rand::RngCore;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, TransactionTrait,
};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    auth::{jwt, password, password::sha256_hex, AuthUser},
    error::{ApiError, ApiResult},
    http::workspaces::personal_workspace_id,
    rate_limit::{self, AuthLimitKind},
    slug,
    state::AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/forgot-password", post(forgot_password))
        .route("/reset-password", post(reset_password))
        .route("/config", get(auth_config))
        .route("/github/start", get(github_start))
        .route("/github/callback", get(github_callback))
        .route("/logout", post(logout))
        .route("/me", get(me))
}

#[derive(Deserialize, ToSchema)]
pub struct CredsPayload {
    pub email: String,
    pub password: String,
}

#[derive(Serialize, ToSchema)]
pub struct AuthConfig {
    /// Whether GitHub OAuth login is configured on this server.
    pub github_enabled: bool,
}

#[utoipa::path(
    get,
    path = "/api/auth/config",
    responses((status = 200, body = AuthConfig)),
    tag = "auth"
)]
pub async fn auth_config(State(state): State<AppState>) -> Json<AuthConfig> {
    Json(AuthConfig {
        github_enabled: state.config.github_client_id.is_some()
            && state.config.github_client_secret.is_some(),
    })
}

#[derive(Serialize, ToSchema)]
pub struct UserView {
    pub id: Uuid,
    pub email: String,
    pub is_admin: bool,
    pub created_at: chrono::DateTime<chrono::FixedOffset>,
}

impl From<user::Model> for UserView {
    fn from(u: user::Model) -> Self {
        Self {
            id: u.id,
            email: u.email,
            is_admin: u.is_admin,
            created_at: u.created_at,
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct RegisterResponse {
    pub user: UserView,
    pub personal_workspace_id: Uuid,
}

#[derive(Serialize, ToSchema)]
pub struct MeResponse {
    pub id: Uuid,
    pub email: String,
    pub is_admin: bool,
    pub created_at: chrono::DateTime<chrono::FixedOffset>,
    pub personal_workspace_id: Option<Uuid>,
}

#[derive(Serialize, ToSchema)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserView,
}

#[derive(Serialize, ToSchema)]
pub struct OkResponse {
    pub ok: bool,
}

#[derive(Deserialize, ToSchema)]
pub struct ForgotPasswordPayload {
    pub email: String,
}

#[derive(Deserialize, ToSchema)]
pub struct ResetPasswordPayload {
    pub token: String,
    pub password: String,
}

#[derive(Deserialize, IntoParams, ToSchema)]
#[into_params(parameter_in = Query)]
pub struct GithubStartQuery {
    pub redirect: Option<String>,
}

#[derive(Deserialize, IntoParams, ToSchema)]
#[into_params(parameter_in = Query)]
pub struct GithubCallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct GithubStateClaims {
    exp: usize,
    redirect: String,
}

#[derive(Deserialize)]
struct GithubTokenResponse {
    access_token: String,
}

#[derive(Deserialize)]
struct GithubUserResponse {
    id: u64,
}

#[derive(Deserialize)]
struct GithubEmailResponse {
    email: String,
    primary: bool,
    verified: bool,
}

#[utoipa::path(
    post,
    path = "/api/auth/register",
    request_body = CredsPayload,
    responses(
        (status = 200, body = RegisterResponse, description = "User created and personal workspace assigned"),
        (status = 400, description = "Invalid email or password"),
        (status = 409, description = "Email already registered"),
    ),
    tag = "auth"
)]
pub async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CredsPayload>,
) -> ApiResult<Json<RegisterResponse>> {
    let email = body.email.trim().to_lowercase();
    if !email.contains('@') {
        return Err(ApiError::bad_request("invalid email"));
    }
    if body.password.len() < 8 {
        return Err(ApiError::bad_request("password must be at least 8 chars"));
    }
    rate_limit::check_auth(&state, &headers, &email, AuthLimitKind::Register).await?;

    let exists = user::Entity::find()
        .filter(user::Column::Email.eq(&email))
        .one(&state.db)
        .await?;
    if exists.is_some() {
        return Err(ApiError::conflict("email already registered"));
    }

    let now = Utc::now().fixed_offset();
    let txn = state.db.begin().await?;

    let user_model = user::ActiveModel {
        id: Set(Uuid::now_v7()),
        email: Set(email.clone()),
        github_id: Set(None),
        password_hash: Set(password::hash(&body.password)?),
        is_admin: Set(registration_admin_flag(&email)),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&txn)
    .await?;

    let workspace_name = personal_workspace_name(&email);
    let workspace_slug = slug::unique_workspace_slug(&txn, &workspace_name).await?;
    let ws = workspace::ActiveModel {
        id: Set(Uuid::now_v7()),
        slug: Set(workspace_slug),
        name: Set(workspace_name),
        is_personal: Set(true),
        owner_id: Set(user_model.id),
        status_slug: Set(None),
        status_page_enabled: Set(false),
        status_page_title: Set(None),
        status_page_description: Set(None),
        status_page_config: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&txn)
    .await?;

    workspace_member::ActiveModel {
        id: Set(Uuid::now_v7()),
        workspace_id: Set(ws.id),
        user_id: Set(user_model.id),
        role: Set(WorkspaceRole::Owner),
        created_at: Set(now),
    }
    .insert(&txn)
    .await?;

    txn.commit().await?;

    Ok(Json(RegisterResponse {
        user: user_model.into(),
        personal_workspace_id: ws.id,
    }))
}

#[utoipa::path(
    get,
    path = "/api/auth/github/start",
    params(GithubStartQuery),
    responses(
        (status = 303, description = "Redirects to GitHub OAuth"),
        (status = 503, description = "GitHub login is not configured"),
    ),
    tag = "auth"
)]
pub async fn github_start(
    State(state): State<AppState>,
    Query(query): Query<GithubStartQuery>,
) -> ApiResult<Redirect> {
    let client_id = state
        .config
        .github_client_id
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("GitHub login is not configured"))?;
    let redirect_uri = github_redirect_url(&state)?;
    let redirect = sanitize_login_redirect(query.redirect.as_deref());
    let state_token = encode_github_state(&state, &redirect)?;

    let mut url = url::Url::parse("https://github.com/login/oauth/authorize")
        .map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?;
    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("scope", "read:user user:email")
        .append_pair("state", &state_token);

    Ok(Redirect::to(url.as_str()))
}

#[utoipa::path(
    get,
    path = "/api/auth/github/callback",
    params(GithubCallbackQuery),
    responses(
        (status = 303, description = "Redirects to the app with an auth token"),
        (status = 400, description = "Invalid OAuth callback"),
        (status = 503, description = "GitHub login is not configured"),
    ),
    tag = "auth"
)]
pub async fn github_callback(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<GithubCallbackQuery>,
) -> ApiResult<Redirect> {
    if let Some(error) = query.error {
        return Err(ApiError::bad_request(format!(
            "GitHub login failed: {error}"
        )));
    }
    let code = query
        .code
        .ok_or_else(|| ApiError::bad_request("missing GitHub authorization code"))?;
    let state_token = query
        .state
        .ok_or_else(|| ApiError::bad_request("missing GitHub state"))?;
    let claims = decode_github_state(&state, &state_token)?;

    let access_token = exchange_github_code(&state, &code).await?;
    let github_user = fetch_github_user(&state, &access_token).await?;
    let email = fetch_github_verified_email(&state, &access_token).await?;
    let github_id = github_user.id.to_string();
    let user_model = find_or_create_github_user(&state, &github_id, &email).await?;
    let token = create_session_token(&state, &headers, user_model.id).await?;

    Ok(Redirect::to(
        build_oauth_complete_url(&state, &token, &claims.redirect)?.as_str(),
    ))
}

fn personal_workspace_name(email: &str) -> String {
    let local = email.split('@').next().unwrap_or("user");
    format!("{local}'s workspace")
}

#[utoipa::path(
    post,
    path = "/api/auth/login",
    request_body = CredsPayload,
    responses(
        (status = 200, body = AuthResponse),
        (status = 401, description = "Invalid credentials"),
    ),
    tag = "auth"
)]
pub async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CredsPayload>,
) -> ApiResult<Json<AuthResponse>> {
    let email = body.email.trim().to_lowercase();
    rate_limit::check_auth(&state, &headers, &email, AuthLimitKind::Login).await?;
    let user_model = user::Entity::find()
        .filter(user::Column::Email.eq(&email))
        .one(&state.db)
        .await?
        .ok_or(ApiError::Unauthorized)?;

    if !password::verify(&body.password, &user_model.password_hash) {
        return Err(ApiError::Unauthorized);
    }

    let token = create_session_token(&state, &headers, user_model.id).await?;

    Ok(Json(AuthResponse {
        token,
        user: user_model.into(),
    }))
}

async fn create_session_token(
    state: &AppState,
    headers: &HeaderMap,
    user_id: Uuid,
) -> ApiResult<String> {
    let jti = Uuid::now_v7();
    let token = jwt::encode(
        user_id,
        jti,
        &state.config.jwt_secret,
        state.config.jwt_ttl_hours,
    )?;
    let token_hash = password::sha256_hex(&jti.to_string());

    let now = Utc::now();
    let session_row = session::ActiveModel {
        id: Set(jti),
        user_id: Set(user_id),
        token_hash: Set(token_hash),
        expires_at: Set((now + Duration::hours(state.config.jwt_ttl_hours)).fixed_offset()),
        created_at: Set(now.fixed_offset()),
        user_agent: Set(headers
            .get("user-agent")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())),
        ip: Set(headers
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())),
    };
    session_row.insert(&state.db).await?;

    Ok(token)
}

#[utoipa::path(
    post,
    path = "/api/auth/forgot-password",
    request_body = ForgotPasswordPayload,
    responses(
        (status = 200, body = OkResponse, description = "Always ok; reveals nothing about whether the email exists"),
        (status = 429, description = "Rate limit exceeded"),
    ),
    tag = "auth"
)]
pub async fn forgot_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ForgotPasswordPayload>,
) -> ApiResult<Json<OkResponse>> {
    let email = body.email.trim().to_lowercase();
    rate_limit::check_auth(&state, &headers, &email, AuthLimitKind::PasswordReset).await?;

    // Only act if the user exists; otherwise we still return ok to avoid
    // user enumeration. Never error on an unknown email.
    if let Some(user_model) = user::Entity::find()
        .filter(user::Column::Email.eq(&email))
        .one(&state.db)
        .await?
    {
        // Invalidate any prior unused reset tokens so only the latest link works.
        password_reset_token::Entity::delete_many()
            .filter(password_reset_token::Column::UserId.eq(user_model.id))
            .filter(password_reset_token::Column::UsedAt.is_null())
            .exec(&state.db)
            .await?;

        let mut buf = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut buf);
        let token = hex::encode(buf);
        let token_hash = sha256_hex(&token);

        let now = Utc::now();
        let expires_at =
            (now + Duration::minutes(state.config.password_reset_ttl_minutes)).fixed_offset();

        password_reset_token::ActiveModel {
            id: Set(Uuid::now_v7()),
            user_id: Set(user_model.id),
            token_hash: Set(token_hash),
            expires_at: Set(expires_at),
            used_at: Set(None),
            created_at: Set(now.fixed_offset()),
        }
        .insert(&state.db)
        .await?;

        // Send on a detached task so the SMTP round-trip is off the response
        // path: it must not become a timing oracle that distinguishes whether
        // the email is registered (the whole point of always returning ok).
        let ttl_minutes = state.config.password_reset_ttl_minutes;
        match password_reset_url(state.config.app_url.as_deref(), &token) {
            Some(reset_url) => {
                let state = state.clone();
                let to = user_model.email.clone();
                tokio::spawn(async move {
                    send_password_reset_email(&state, &to, &reset_url, ttl_minutes).await;
                });
            }
            None => {
                tracing::warn!(
                    email = %user_model.email,
                    "APP_URL not set; password reset email not sent (link would be unusable)"
                );
            }
        }
    }

    Ok(Json(OkResponse { ok: true }))
}

#[utoipa::path(
    post,
    path = "/api/auth/reset-password",
    request_body = ResetPasswordPayload,
    responses(
        (status = 200, body = AuthResponse, description = "Password updated; auto-logged-in"),
        (status = 400, description = "Invalid/expired/used token or password too short"),
    ),
    tag = "auth"
)]
pub async fn reset_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ResetPasswordPayload>,
) -> ApiResult<Json<AuthResponse>> {
    if body.password.len() < 8 {
        return Err(ApiError::bad_request("password must be at least 8 chars"));
    }

    // A single generic message for not-found, expired, and used tokens avoids
    // leaking which failure occurred (token-probing oracle).
    let invalid = || ApiError::bad_request("invalid or expired reset token");

    let token_hash = sha256_hex(&body.token);
    let row = password_reset_token::Entity::find()
        .filter(password_reset_token::Column::TokenHash.eq(token_hash))
        .one(&state.db)
        .await?
        .ok_or_else(invalid)?;

    if row.used_at.is_some() {
        return Err(invalid());
    }
    if row.expires_at < Utc::now().fixed_offset() {
        return Err(invalid());
    }

    let user_model = user::Entity::find_by_id(row.user_id)
        .one(&state.db)
        .await?
        .ok_or_else(invalid)?;

    let now = Utc::now();
    let txn = state.db.begin().await?;

    let mut user_active: user::ActiveModel = user_model.clone().into();
    user_active.password_hash = Set(password::hash(&body.password)?);
    user_active.updated_at = Set(now.fixed_offset());
    user_active.update(&txn).await?;

    let mut token_active: password_reset_token::ActiveModel = row.into();
    token_active.used_at = Set(Some(now.fixed_offset()));
    token_active.update(&txn).await?;

    // Kill every existing session for this user so any compromised session is
    // invalidated before we issue the fresh one.
    session::Entity::delete_many()
        .filter(session::Column::UserId.eq(user_model.id))
        .exec(&txn)
        .await?;

    txn.commit().await?;

    let token = create_session_token(&state, &headers, user_model.id).await?;

    Ok(Json(AuthResponse {
        token,
        user: user_model.into(),
    }))
}

/// Build the absolute reset link. Returns `None` when no `APP_URL` is
/// configured, since a relative link in an email is unusable.
fn password_reset_url(app_url: Option<&str>, token: &str) -> Option<String> {
    let base = app_url?.trim_end_matches('/');
    Some(format!("{base}/reset-password?token={token}"))
}

async fn send_password_reset_email(state: &AppState, to: &str, reset_url: &str, ttl_minutes: i64) {
    let subject = "Reset your produktive password".to_owned();
    let text_body = format!(
        "We received a request to reset your produktive password.\n\nReset your password:\n{reset_url}\n\nThis link expires in {ttl_minutes} minutes. If you did not request a password reset, you can safely ignore this email."
    );
    let reset_url_html = escape_html(reset_url);
    let html_body = format!(
        r#"<p>We received a request to reset your produktive password.</p>
<p><a href="{reset_url}">Reset your password</a></p>
<p>This link expires in {ttl_minutes} minutes. If you did not request a password reset, you can safely ignore this email.</p>"#,
        reset_url = reset_url_html,
    );

    if let Err(err) = state
        .email
        .send(OutboundEmail {
            to: to.to_owned(),
            subject,
            text_body,
            html_body: Some(html_body),
        })
        .await
    {
        tracing::warn!(%err, email = %to, "failed to send password reset email");
    }
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn github_redirect_url(state: &AppState) -> ApiResult<String> {
    if let Some(url) = state.config.github_redirect_url.as_ref() {
        return Ok(url.clone());
    }
    let app_url = state
        .config
        .app_url
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("APP_URL is required for GitHub login"))?;
    Ok(format!("{app_url}/api/auth/github/callback"))
}

fn encode_github_state(state: &AppState, redirect: &str) -> ApiResult<String> {
    let exp = (Utc::now() + Duration::minutes(10)).timestamp() as usize;
    let claims = GithubStateClaims {
        exp,
        redirect: redirect.to_owned(),
    };
    jsonwebtoken::encode(
        &jsonwebtoken::Header::default(),
        &claims,
        &jsonwebtoken::EncodingKey::from_secret(state.config.jwt_secret.as_bytes()),
    )
    .map_err(ApiError::from)
}

fn decode_github_state(state: &AppState, token: &str) -> ApiResult<GithubStateClaims> {
    let data = jsonwebtoken::decode::<GithubStateClaims>(
        token,
        &jsonwebtoken::DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &jsonwebtoken::Validation::default(),
    )
    .map_err(|_| ApiError::bad_request("invalid GitHub state"))?;
    Ok(data.claims)
}

async fn exchange_github_code(state: &AppState, code: &str) -> ApiResult<String> {
    let client_id = state
        .config
        .github_client_id
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("GitHub login is not configured"))?;
    let client_secret = state
        .config
        .github_client_secret
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("GitHub login is not configured"))?;
    let redirect_uri = github_redirect_url(state)?;

    let res = state
        .http
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("code", code),
            ("redirect_uri", redirect_uri.as_str()),
        ])
        .send()
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?;
    if !res.status().is_success() {
        return Err(ApiError::bad_request("GitHub token exchange failed"));
    }
    let body = res
        .json::<GithubTokenResponse>()
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?;
    if body.access_token.is_empty() {
        return Err(ApiError::bad_request("GitHub token exchange failed"));
    }
    Ok(body.access_token)
}

async fn fetch_github_user(state: &AppState, access_token: &str) -> ApiResult<GithubUserResponse> {
    state
        .http
        .get("https://api.github.com/user")
        .bearer_auth(access_token)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?
        .error_for_status()
        .map_err(|_| ApiError::bad_request("could not fetch GitHub user"))?
        .json::<GithubUserResponse>()
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))
}

async fn fetch_github_verified_email(state: &AppState, access_token: &str) -> ApiResult<String> {
    let emails = state
        .http
        .get("https://api.github.com/user/emails")
        .bearer_auth(access_token)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?
        .error_for_status()
        .map_err(|_| ApiError::bad_request("could not fetch GitHub email"))?
        .json::<Vec<GithubEmailResponse>>()
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?;

    emails
        .iter()
        .find(|email| email.primary && email.verified)
        .or_else(|| emails.iter().find(|email| email.verified))
        .map(|email| email.email.trim().to_lowercase())
        .filter(|email| email.contains('@'))
        .ok_or_else(|| ApiError::bad_request("GitHub account has no verified email"))
}

async fn find_or_create_github_user(
    state: &AppState,
    github_id: &str,
    email: &str,
) -> ApiResult<user::Model> {
    if let Some(existing) = user::Entity::find()
        .filter(user::Column::GithubId.eq(github_id))
        .one(&state.db)
        .await?
    {
        return Ok(existing);
    }

    if let Some(existing) = user::Entity::find()
        .filter(user::Column::Email.eq(email))
        .one(&state.db)
        .await?
    {
        let mut active: user::ActiveModel = existing.into();
        active.github_id = Set(Some(github_id.to_owned()));
        return active.update(&state.db).await.map_err(ApiError::from);
    }

    let now = Utc::now().fixed_offset();
    let txn = state.db.begin().await?;
    let user_model = user::ActiveModel {
        id: Set(Uuid::now_v7()),
        email: Set(email.to_owned()),
        github_id: Set(Some(github_id.to_owned())),
        password_hash: Set(password::hash(&Uuid::now_v7().to_string())?),
        is_admin: Set(registration_admin_flag(email)),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&txn)
    .await?;

    let workspace_name = personal_workspace_name(email);
    let workspace_slug = slug::unique_workspace_slug(&txn, &workspace_name).await?;
    let ws = workspace::ActiveModel {
        id: Set(Uuid::now_v7()),
        slug: Set(workspace_slug),
        name: Set(workspace_name),
        is_personal: Set(true),
        owner_id: Set(user_model.id),
        status_slug: Set(None),
        status_page_enabled: Set(false),
        status_page_title: Set(None),
        status_page_description: Set(None),
        status_page_config: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&txn)
    .await?;

    workspace_member::ActiveModel {
        id: Set(Uuid::now_v7()),
        workspace_id: Set(ws.id),
        user_id: Set(user_model.id),
        role: Set(WorkspaceRole::Owner),
        created_at: Set(now),
    }
    .insert(&txn)
    .await?;

    txn.commit().await?;
    Ok(user_model)
}

fn build_oauth_complete_url(state: &AppState, token: &str, redirect: &str) -> ApiResult<String> {
    let base = state.config.app_url.as_deref().unwrap_or("");
    let mut url = if base.is_empty() {
        url::Url::parse("http://localhost/login")
    } else {
        url::Url::parse(&format!("{base}/login"))
    }
    .map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?;
    url.query_pairs_mut()
        .append_pair("oauth_token", token)
        .append_pair("redirect", redirect);
    if base.is_empty() {
        Ok(format!(
            "{}?{}",
            url.path(),
            url.query().unwrap_or_default()
        ))
    } else {
        Ok(url.into())
    }
}

fn sanitize_login_redirect(raw: Option<&str>) -> String {
    let Some(raw) = raw else {
        return "/".to_owned();
    };
    if !raw.starts_with('/') || raw.starts_with("//") || raw.starts_with("/login") {
        return "/".to_owned();
    }
    raw.to_owned()
}

#[utoipa::path(
    post,
    path = "/api/auth/logout",
    responses(
        (status = 200, body = OkResponse),
        (status = 401, description = "Missing or invalid token"),
    ),
    security(("bearerAuth" = [])),
    tag = "auth"
)]
pub async fn logout(State(state): State<AppState>, auth: AuthUser) -> ApiResult<Json<OkResponse>> {
    session::Entity::delete_by_id(auth.session_id)
        .exec(&state.db)
        .await?;
    Ok(Json(OkResponse { ok: true }))
}

#[utoipa::path(
    get,
    path = "/api/auth/me",
    responses(
        (status = 200, body = MeResponse),
        (status = 401, description = "Missing or invalid token"),
    ),
    security(("bearerAuth" = [])),
    tag = "auth"
)]
pub async fn me(State(state): State<AppState>, auth: AuthUser) -> ApiResult<Json<MeResponse>> {
    let pid = personal_workspace_id(&state.db, auth.user.id).await?;
    Ok(Json(MeResponse {
        id: auth.user.id,
        email: auth.user.email,
        is_admin: auth.user.is_admin,
        created_at: auth.user.created_at,
        personal_workspace_id: pid,
    }))
}

fn registration_admin_flag(_email: &str) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::registration_admin_flag;

    #[test]
    fn self_service_registration_never_grants_admin_from_email() {
        assert!(!registration_admin_flag("admin@example.com"));
    }
}
