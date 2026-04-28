use crate::{
    auth::{
        auth_cookie, require_auth, set_session_active_organization, validate_email, AuthResponse,
    },
    email,
    error::ApiError,
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::{Duration, Utc};
use produktive_entity::{invitation, member, organization, user};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, PaginatorTrait, QueryFilter,
    QueryOrder, Set,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const INVITE_TTL_DAYS: i64 = 7;

pub fn public_routes() -> Router<AppState> {
    Router::new()
        .route("/lookup", get(lookup_invitation))
        .route("/accept", post(accept_invitation))
}

pub fn org_routes() -> Router<AppState> {
    Router::new()
        .route(
            "/invitations",
            get(list_invitations).post(create_invitation),
        )
        .route(
            "/invitations/{id}",
            axum::routing::delete(revoke_invitation),
        )
        .route("/invitations/{id}/resend", post(resend_invitation))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InvitationStatus {
    valid: bool,
    expired: bool,
    revoked: bool,
    accepted: bool,
    organization_name: Option<String>,
    inviter_name: Option<String>,
    email: Option<String>,
}

#[derive(Deserialize)]
struct LookupQuery {
    token: String,
}

async fn lookup_invitation(
    State(state): State<AppState>,
    Query(query): Query<LookupQuery>,
) -> Result<Json<InvitationStatus>, ApiError> {
    let row = invitation::Entity::find()
        .filter(invitation::Column::Token.eq(&query.token))
        .one(&state.db)
        .await?;

    let Some(row) = row else {
        return Ok(Json(InvitationStatus {
            valid: false,
            expired: false,
            revoked: false,
            accepted: false,
            organization_name: None,
            inviter_name: None,
            email: None,
        }));
    };

    let now = Utc::now().fixed_offset();
    let expired = row.expires_at < now;
    let revoked = row.revoked_at.is_some();
    let accepted = row.accepted_at.is_some();

    let org = organization::Entity::find_by_id(&row.organization_id)
        .one(&state.db)
        .await?;
    let inviter = match &row.invited_by_id {
        Some(id) => user::Entity::find_by_id(id).one(&state.db).await?,
        None => None,
    };

    Ok(Json(InvitationStatus {
        valid: !expired && !revoked && !accepted,
        expired,
        revoked,
        accepted,
        organization_name: org.map(|o| o.name),
        inviter_name: inviter.map(|u| u.name),
        email: Some(row.email),
    }))
}

#[derive(Deserialize)]
struct AcceptRequest {
    token: String,
}

async fn accept_invitation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<AcceptRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let auth = require_auth(&headers, &state).await?;

    let row = invitation::Entity::find()
        .filter(invitation::Column::Token.eq(&payload.token))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Invitation not found".to_owned()))?;

    let now = Utc::now().fixed_offset();
    if row.revoked_at.is_some() {
        return Err(ApiError::BadRequest(
            "This invitation has been revoked".to_owned(),
        ));
    }
    if row.accepted_at.is_some() {
        return Err(ApiError::BadRequest(
            "This invitation has already been accepted".to_owned(),
        ));
    }
    if row.expires_at < now {
        return Err(ApiError::BadRequest(
            "This invitation has expired".to_owned(),
        ));
    }
    if !auth.user.email.eq_ignore_ascii_case(&row.email) {
        return Err(ApiError::BadRequest(format!(
            "This invitation is for {}",
            row.email
        )));
    }

    // Idempotent member insert
    let existing = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(&row.organization_id))
        .filter(member::Column::UserId.eq(&auth.user.id))
        .one(&state.db)
        .await?;
    if existing.is_none() {
        member::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            organization_id: Set(row.organization_id.clone()),
            user_id: Set(auth.user.id.clone()),
            role: Set(row.role.clone()),
            created_at: Set(now),
        }
        .insert(&state.db)
        .await?;
    }

    let invitation_id = row.id.clone();
    let organization_id = row.organization_id.clone();

    let mut active = row.into_active_model();
    active.accepted_at = Set(Some(now));
    active.update(&state.db).await?;

    // Fetch the org for response
    let organization = organization::Entity::find_by_id(&organization_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Organization not found".to_owned()))?;

    // Switch active org so the next request lands in the right workspace
    let (_, token) =
        set_session_active_organization(&state.db, &state, auth.session, organization.id.clone())
            .await?;
    let cookie = auth_cookie(&state, &token)?;

    let _ = invitation_id; // currently unused; placeholder for audit logs

    Ok((
        StatusCode::OK,
        [(header::SET_COOKIE, cookie)],
        Json(AuthResponse {
            user: auth.user.into(),
            organization: organization.into(),
        }),
    ))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InvitationResponse {
    id: String,
    email: String,
    role: String,
    invited_by_name: Option<String>,
    expires_at: String,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InvitationListResponse {
    invitations: Vec<InvitationResponse>,
}

async fn list_invitations(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<InvitationListResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;

    let rows = invitation::Entity::find()
        .filter(invitation::Column::OrganizationId.eq(&auth.organization.id))
        .filter(invitation::Column::AcceptedAt.is_null())
        .filter(invitation::Column::RevokedAt.is_null())
        .order_by_desc(invitation::Column::CreatedAt)
        .all(&state.db)
        .await?;

    let now = Utc::now().fixed_offset();
    let mut invitations = Vec::with_capacity(rows.len());
    for row in rows {
        if row.expires_at < now {
            continue;
        }
        let inviter_name = match &row.invited_by_id {
            Some(id) => user::Entity::find_by_id(id)
                .one(&state.db)
                .await?
                .map(|u| u.name),
            None => None,
        };
        invitations.push(InvitationResponse {
            id: row.id,
            email: row.email,
            role: row.role,
            invited_by_name: inviter_name,
            expires_at: row.expires_at.to_rfc3339(),
            created_at: row.created_at.to_rfc3339(),
        });
    }

    Ok(Json(InvitationListResponse { invitations }))
}

#[derive(Deserialize)]
struct CreateInvitationRequest {
    email: String,
}

async fn create_invitation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateInvitationRequest>,
) -> Result<(StatusCode, Json<InvitationResponse>), ApiError> {
    let auth = require_auth(&headers, &state).await?;

    let email = validate_email(&payload.email)?;

    // If a user with this email is already a member, reject
    if let Some(existing_user) = user::Entity::find()
        .filter(user::Column::Email.eq(&email))
        .one(&state.db)
        .await?
    {
        let already_member = member::Entity::find()
            .filter(member::Column::OrganizationId.eq(&auth.organization.id))
            .filter(member::Column::UserId.eq(&existing_user.id))
            .one(&state.db)
            .await?
            .is_some();
        if already_member {
            return Err(ApiError::BadRequest(
                "This person is already a member of the workspace".to_owned(),
            ));
        }
    }

    let now = Utc::now().fixed_offset();

    // Reject duplicate active pending invite
    let has_active_invite = invitation::Entity::find()
        .filter(invitation::Column::OrganizationId.eq(&auth.organization.id))
        .filter(invitation::Column::Email.eq(&email))
        .filter(invitation::Column::AcceptedAt.is_null())
        .filter(invitation::Column::RevokedAt.is_null())
        .filter(invitation::Column::ExpiresAt.gte(now.clone()))
        .count(&state.db)
        .await?
        > 0;
    if has_active_invite {
        return Err(ApiError::BadRequest(
            "An invitation is already pending for this email".to_owned(),
        ));
    }

    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let expires = now + Duration::days(INVITE_TTL_DAYS);
    let row = invitation::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(auth.organization.id.clone()),
        email: Set(email.clone()),
        token: Set(token.clone()),
        role: Set("member".to_owned()),
        invited_by_id: Set(Some(auth.user.id.clone())),
        expires_at: Set(expires),
        accepted_at: Set(None),
        revoked_at: Set(None),
        created_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    if let Err(error) = email::send_invitation_email(
        &state,
        &email,
        &auth.user.name,
        &auth.organization.name,
        &token,
    )
    .await
    {
        let invitation_id = row.id.clone();
        if let Err(delete_error) = invitation::Entity::delete_by_id(invitation_id.clone())
            .exec(&state.db)
            .await
        {
            tracing::error!(
                %delete_error,
                invitation_id,
                "failed to delete invitation after email delivery failure"
            );
        }
        tracing::warn!("failed to send invitation email to {}: {}", email, error);
        return Err(error);
    }

    Ok((
        StatusCode::CREATED,
        Json(InvitationResponse {
            id: row.id,
            email: row.email,
            role: row.role,
            invited_by_name: Some(auth.user.name.clone()),
            expires_at: row.expires_at.to_rfc3339(),
            created_at: row.created_at.to_rfc3339(),
        }),
    ))
}

async fn revoke_invitation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<InvitationListResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;

    let row = invitation::Entity::find_by_id(&id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Invitation not found".to_owned()))?;

    if row.organization_id != auth.organization.id {
        return Err(ApiError::NotFound("Invitation not found".to_owned()));
    }

    // Allowed: original inviter, or any owner in the org
    let is_inviter = row.invited_by_id.as_deref() == Some(&auth.user.id);
    let is_owner = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(&auth.organization.id))
        .filter(member::Column::UserId.eq(&auth.user.id))
        .filter(member::Column::Role.eq("owner"))
        .one(&state.db)
        .await?
        .is_some();
    if !is_inviter && !is_owner {
        return Err(ApiError::NotFound("Invitation not found".to_owned()));
    }

    let mut active = row.into_active_model();
    active.revoked_at = Set(Some(Utc::now().fixed_offset()));
    active.update(&state.db).await?;

    list_invitations(State(state), headers).await
}

async fn resend_invitation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<InvitationResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;

    let row = invitation::Entity::find_by_id(&id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Invitation not found".to_owned()))?;

    if row.organization_id != auth.organization.id {
        return Err(ApiError::NotFound("Invitation not found".to_owned()));
    }
    if row.accepted_at.is_some() {
        return Err(ApiError::BadRequest("Already accepted".to_owned()));
    }
    if row.revoked_at.is_some() {
        return Err(ApiError::BadRequest("Revoked invitation".to_owned()));
    }

    // Bump expiry
    let now = Utc::now().fixed_offset();
    let new_expires = now + Duration::days(INVITE_TTL_DAYS);
    let token = row.token.clone();
    let email_addr = row.email.clone();
    let invited_by_name = match &row.invited_by_id {
        Some(id) => user::Entity::find_by_id(id)
            .one(&state.db)
            .await?
            .map(|u| u.name),
        None => None,
    };
    let invitation_id = row.id.clone();
    let role = row.role.clone();
    let created_at = row.created_at;

    let mut active = row.into_active_model();
    active.expires_at = Set(new_expires);
    active.update(&state.db).await?;

    if let Err(error) = email::send_invitation_email(
        &state,
        &email_addr,
        &auth.user.name,
        &auth.organization.name,
        &token,
    )
    .await
    {
        tracing::warn!(
            "failed to resend invitation email to {}: {}",
            email_addr,
            error
        );
    }

    Ok(Json(InvitationResponse {
        id: invitation_id,
        email: email_addr,
        role,
        invited_by_name,
        expires_at: new_expires.to_rfc3339(),
        created_at: created_at.to_rfc3339(),
    }))
}
