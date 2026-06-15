use axum::{
    extract::{Query, State},
    http::HeaderMap,
    response::Redirect,
    routing::{get, post},
    Json, Router,
};
use chrono::{Duration, Utc};
use entity::{
    session, user, workspace,
    workspace_member::{self, WorkspaceRole},
};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, TransactionTrait,
};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    auth::{jwt, password, AuthUser},
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
