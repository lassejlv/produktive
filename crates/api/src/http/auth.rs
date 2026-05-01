use crate::{
    auth::{
        auth_cookie, clear_auth_cookie, consume_auth_token, create_auth_token,
        create_organization_for_user, create_signup_records, create_user_session,
        first_or_create_organization, require_auth, revoke_session, revoke_user_sessions,
        set_session_active_organization, update_user_password, user_is_member, validate_email,
        validate_name, validate_password, verify_password, verify_user_email, OrganizationResponse,
        EMAIL_VERIFICATION_PURPOSE, PASSWORD_RESET_PURPOSE,
    },
    email::{send_password_reset_email, send_verification_email},
    error::ApiError,
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{delete, get, patch, post},
    Json, Router,
};
use chrono::Utc;
use produktive_entity::{member, organization, session as session_entity, user};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter, QueryOrder, Set,
};
use serde::{Deserialize, Serialize};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/sign-up", post(sign_up))
        .route("/sign-in", post(sign_in))
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
            "/organizations/active/leave",
            post(leave_active_organization),
        )
        .route("/switch-organization", post(switch_organization))
        .route("/account", delete(delete_account))
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

    let membership = member::Entity::find()
        .filter(member::Column::UserId.eq(&auth.user.id))
        .filter(member::Column::OrganizationId.eq(&auth.organization.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::Forbidden("Not a member of this workspace".to_owned()))?;

    if membership.role != "owner" {
        return Err(ApiError::Forbidden(
            "Only workspace owners can rename the workspace".to_owned(),
        ));
    }

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

    let membership = member::Entity::find()
        .filter(member::Column::UserId.eq(&auth.user.id))
        .filter(member::Column::OrganizationId.eq(&auth.organization.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::Forbidden("Not a member of this workspace".to_owned()))?;

    if membership.role != "owner" {
        return Err(ApiError::Forbidden(
            "Only workspace owners can delete the workspace".to_owned(),
        ));
    }

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

    if membership.role == "owner" {
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
