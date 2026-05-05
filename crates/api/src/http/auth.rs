use crate::{
    auth::{
        auth_cookie, clear_auth_cookie, consume_auth_token, create_auth_token,
        create_organization_for_user, create_signup_records, create_user_session,
        ensure_organization_not_suspended, ensure_user_not_suspended, first_or_create_organization,
        require_auth, revoke_session, revoke_user_sessions, set_session_active_organization,
        update_user_password, user_is_member, validate_email, validate_name, validate_password,
        verify_password, verify_user_email, OrganizationResponse, EMAIL_VERIFICATION_PURPOSE,
        PASSWORD_RESET_PURPOSE,
    },
    email::{send_password_reset_email, send_verification_email},
    error::ApiError,
    permissions::{require_permission, ROLE_OWNER, WORKSPACE_DELETE, WORKSPACE_RENAME},
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
use chrono::Utc;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header as JwtHeader, Validation};
use produktive_entity::{member, organization, session as session_entity, user};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter, QueryOrder, Set,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const MAX_ICON_BYTES: usize = 2 * 1024 * 1024;
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
    ensure_user_not_suspended(&user)?;

    let organization = first_or_create_organization(&state.db, &user).await?;
    ensure_organization_not_suspended(&organization)?;
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
    let (_, session_token) =
        create_user_session(&state.db, &state, &user.id, &organization.id).await?;
    let cookie = auth_cookie(&state, &session_token)?;
    let target = github_auth_success_redirect(&claims);

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

async fn list_sessions(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SessionsResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
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
    let auth = require_auth(&headers, &state).await?;
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
    let auth = require_auth(&headers, &state).await?;
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
    let auth = require_auth(&headers, &state).await?;
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
    let auth = require_auth(&headers, &state).await?;

    if !user_is_member(&state.db, &auth.user.id, &payload.organization_id).await? {
        return Err(ApiError::NotFound("Organization not found".to_owned()));
    }

    let organization = organization::Entity::find_by_id(&payload.organization_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Organization not found".to_owned()))?;
    ensure_organization_not_suspended(&organization)?;

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
    name: String,
}

async fn update_active_organization(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateOrganizationRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_permission(&state, &auth, WORKSPACE_RENAME).await?;

    let name = payload.name.trim();
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

    let mut active: organization::ActiveModel = auth.organization.into();
    active.name = Set(name.to_owned());
    active.updated_at = Set(Utc::now().fixed_offset());
    let updated = active.update(&state.db).await?;

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
    let auth = require_auth(&headers, &state).await?;
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
    let auth = require_auth(&headers, &state).await?;
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
    let auth = require_auth(&headers, &state).await?;

    if payload.confirm.trim() != auth.user.email {
        return Err(ApiError::BadRequest(
            "Type your email exactly to confirm account deletion".to_owned(),
        ));
    }

    user::Entity::delete_by_id(&auth.user.id)
        .exec(&state.db)
        .await?;

    Ok((
        StatusCode::OK,
        [(header::SET_COOKIE, clear_auth_cookie(&state)?)],
        Json(EmptyResponse { ok: true }),
    ))
}
