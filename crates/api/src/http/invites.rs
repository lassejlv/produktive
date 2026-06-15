use axum::{
    extract::{Path, State},
    routing::{get, post},
    Extension, Json, Router,
};
use chrono::{Duration, Utc};
use email::OutboundEmail;
use entity::{
    workspace, workspace_invite,
    workspace_member::{self, WorkspaceRole},
};
use rand::RngCore;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter,
    TransactionTrait,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    auth::{password::sha256_hex, AuthUser},
    billing::{ensure_customer, load_owner_email, require_metered_feature, track_feature_with_key},
    error::{ApiError, ApiResult},
    middleware::Membership,
    state::AppState,
};

const INVITE_TTL_DAYS: i64 = 7;

pub fn owner_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/{iid}", axum::routing::delete(revoke))
}

pub fn lookup_routes() -> Router<AppState> {
    Router::new()
        .route("/{token}", get(preview))
        .route("/{token}/accept", post(accept))
}

#[derive(Deserialize, ToSchema)]
pub struct CreateInviteBody {
    pub email: String,
    #[serde(default = "default_role")]
    pub role: WorkspaceRole,
}

fn default_role() -> WorkspaceRole {
    WorkspaceRole::Member
}

#[derive(Serialize, ToSchema)]
pub struct InviteCreated {
    pub id: Uuid,
    pub email: String,
    pub role: WorkspaceRole,
    pub expires_at: chrono::DateTime<chrono::FixedOffset>,
    pub token: String,
    pub accept_url: String,
    pub email_sent: bool,
}

#[derive(Serialize, ToSchema)]
pub struct InviteRow {
    pub id: Uuid,
    pub email: String,
    pub role: WorkspaceRole,
    pub expires_at: chrono::DateTime<chrono::FixedOffset>,
    pub accepted_at: Option<chrono::DateTime<chrono::FixedOffset>>,
    pub created_at: chrono::DateTime<chrono::FixedOffset>,
}

impl From<workspace_invite::Model> for InviteRow {
    fn from(v: workspace_invite::Model) -> Self {
        Self {
            id: v.id,
            email: v.email,
            role: v.role,
            expires_at: v.expires_at,
            accepted_at: v.accepted_at,
            created_at: v.created_at,
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct InvitePreview {
    pub workspace_id: Uuid,
    pub workspace_name: String,
    pub email: String,
    pub role: WorkspaceRole,
    pub expires_at: chrono::DateTime<chrono::FixedOffset>,
}

#[derive(Serialize, ToSchema)]
pub struct OkResponse {
    pub ok: bool,
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/invites",
    params(("wid" = Uuid, Path, description = "workspace id")),
    request_body = CreateInviteBody,
    responses(
        (status = 200, body = InviteCreated, description = "Token returned exactly once"),
        (status = 400, description = "Invalid email"),
        (status = 403, description = "Owner only"),
        (status = 409, description = "Invite already pending for this email"),
    ),
    security(("bearerAuth" = [])),
    tag = "invites"
)]
pub async fn create(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    auth: AuthUser,
    Json(body): Json<CreateInviteBody>,
) -> ApiResult<Json<InviteCreated>> {
    m.require_owner()?;
    let email = body.email.trim().to_lowercase();
    if !email.contains('@') {
        return Err(ApiError::bad_request("invalid email"));
    }

    let pending = workspace_invite::Entity::find()
        .filter(workspace_invite::Column::WorkspaceId.eq(m.workspace.id))
        .filter(workspace_invite::Column::Email.eq(&email))
        .filter(workspace_invite::Column::AcceptedAt.is_null())
        .filter(workspace_invite::Column::ExpiresAt.gt(Utc::now().fixed_offset()))
        .count(&state.db)
        .await?;
    if pending > 0 {
        return Err(ApiError::conflict("invite already pending for this email"));
    }

    let pending_invites = workspace_invite::Entity::find()
        .filter(workspace_invite::Column::WorkspaceId.eq(m.workspace.id))
        .filter(workspace_invite::Column::AcceptedAt.is_null())
        .filter(workspace_invite::Column::ExpiresAt.gt(Utc::now().fixed_offset()))
        .count(&state.db)
        .await?;
    let owner_email = load_owner_email(&state, m.workspace.owner_id).await?;
    ensure_customer(&state, &m.workspace, &owner_email).await?;
    require_metered_feature(
        &state,
        m.workspace.id,
        "members",
        (pending_invites + 1) as f64,
    )
    .await?;

    let mut buf = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut buf);
    let token = hex::encode(buf);
    let token_hash = sha256_hex(&token);

    let now = Utc::now();
    let expires_at = (now + Duration::days(INVITE_TTL_DAYS)).fixed_offset();

    let row = workspace_invite::ActiveModel {
        id: Set(Uuid::now_v7()),
        workspace_id: Set(m.workspace.id),
        email: Set(email.clone()),
        role: Set(body.role),
        token_hash: Set(token_hash),
        invited_by: Set(auth.user.id),
        expires_at: Set(expires_at),
        accepted_at: Set(None),
        created_at: Set(now.fixed_offset()),
    }
    .insert(&state.db)
    .await?;

    let accept_url = invite_accept_url(state.config.app_url.as_deref(), &token);
    let email_sent = send_invite_email(
        &state,
        &row.email,
        &m.workspace.name,
        &auth.user.email,
        row.role,
        &accept_url,
        m.workspace.id,
    )
    .await;

    Ok(Json(InviteCreated {
        id: row.id,
        email: row.email,
        role: row.role,
        expires_at: row.expires_at,
        token,
        accept_url,
        email_sent,
    }))
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/invites",
    params(("wid" = Uuid, Path, description = "workspace id")),
    responses(
        (status = 200, body = [InviteRow]),
        (status = 403, description = "Owner only"),
    ),
    security(("bearerAuth" = [])),
    tag = "invites"
)]
pub async fn list(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<Vec<InviteRow>>> {
    m.require_owner()?;
    let rows = workspace_invite::Entity::find()
        .filter(workspace_invite::Column::WorkspaceId.eq(m.workspace.id))
        .filter(workspace_invite::Column::AcceptedAt.is_null())
        .all(&state.db)
        .await?;
    Ok(Json(rows.into_iter().map(InviteRow::from).collect()))
}

#[utoipa::path(
    delete,
    path = "/api/workspaces/{wid}/invites/{iid}",
    params(
        ("wid" = Uuid, Path, description = "workspace id"),
        ("iid" = Uuid, Path, description = "invite id"),
    ),
    responses(
        (status = 200, body = OkResponse),
        (status = 403, description = "Owner only"),
        (status = 404, description = "Invite not found"),
    ),
    security(("bearerAuth" = [])),
    tag = "invites"
)]
pub async fn revoke(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, iid)): Path<(String, Uuid)>,
) -> ApiResult<Json<OkResponse>> {
    m.require_owner()?;
    let res = workspace_invite::Entity::delete_many()
        .filter(workspace_invite::Column::Id.eq(iid))
        .filter(workspace_invite::Column::WorkspaceId.eq(m.workspace.id))
        .exec(&state.db)
        .await?;
    if res.rows_affected == 0 {
        return Err(ApiError::not_found("invite"));
    }
    Ok(Json(OkResponse { ok: true }))
}

fn invite_accept_url(app_url: Option<&str>, token: &str) -> String {
    let path = format!("/invite/{token}");
    match app_url {
        Some(base) => format!("{}{}", base.trim_end_matches('/'), path),
        None => path,
    }
}

async fn send_invite_email(
    state: &AppState,
    to: &str,
    workspace_name: &str,
    inviter_email: &str,
    role: WorkspaceRole,
    accept_url: &str,
    workspace_id: Uuid,
) -> bool {
    let role_label = match role {
        WorkspaceRole::Owner => "owner",
        WorkspaceRole::Member => "member",
    };
    let subject = format!("You have been invited to {workspace_name} on produktive");
    let text_body = format!(
        "{inviter_email} invited you to join {workspace_name} on produktive as a {role_label}.\n\nAccept the invite:\n{accept_url}\n\nThis invite expires in 7 days."
    );
    let workspace_name_html = escape_html(workspace_name);
    let inviter_email_html = escape_html(inviter_email);
    let accept_url_html = escape_html(accept_url);
    let html_body = format!(
        r#"<p>{inviter_email} invited you to join <strong>{workspace_name}</strong> on produktive as a {role_label}.</p>
<p><a href="{accept_url}">Accept the invite</a></p>
<p>This invite expires in 7 days.</p>"#,
        inviter_email = inviter_email_html,
        workspace_name = workspace_name_html,
        accept_url = accept_url_html,
    );

    match state
        .email
        .send(OutboundEmail {
            to: to.to_owned(),
            subject,
            text_body,
            html_body: Some(html_body),
        })
        .await
    {
        Ok(sent) => sent,
        Err(err) => {
            tracing::warn!(%err, email = %to, %workspace_id, "failed to send invite email");
            false
        }
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

async fn load_invite(state: &AppState, token: &str) -> ApiResult<workspace_invite::Model> {
    let token_hash = sha256_hex(token);
    let invite = workspace_invite::Entity::find()
        .filter(workspace_invite::Column::TokenHash.eq(token_hash))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("invite"))?;

    if invite.accepted_at.is_some() {
        return Err(ApiError::bad_request("invite already accepted"));
    }
    if invite.expires_at < Utc::now().fixed_offset() {
        return Err(ApiError::bad_request("invite expired"));
    }
    Ok(invite)
}

#[utoipa::path(
    get,
    path = "/api/invites/{token}",
    params(("token" = String, Path, description = "invite token (hex)")),
    responses(
        (status = 200, body = InvitePreview),
        (status = 400, description = "Expired / already accepted"),
        (status = 403, description = "Token email does not match auth user"),
        (status = 404, description = "Unknown token"),
    ),
    security(("bearerAuth" = [])),
    tag = "invites"
)]
pub async fn preview(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(token): Path<String>,
) -> ApiResult<Json<InvitePreview>> {
    let invite = load_invite(&state, &token).await?;
    if invite.email.to_lowercase() != auth.user.email.to_lowercase() {
        return Err(ApiError::Forbidden);
    }
    let ws = workspace::Entity::find_by_id(invite.workspace_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("workspace"))?;
    Ok(Json(InvitePreview {
        workspace_id: ws.id,
        workspace_name: ws.name,
        email: invite.email,
        role: invite.role,
        expires_at: invite.expires_at,
    }))
}

#[utoipa::path(
    post,
    path = "/api/invites/{token}/accept",
    params(("token" = String, Path, description = "invite token (hex)")),
    responses(
        (status = 200, body = OkResponse),
        (status = 400, description = "Expired / already accepted"),
        (status = 403, description = "Token email does not match auth user"),
        (status = 404, description = "Unknown token"),
    ),
    security(("bearerAuth" = [])),
    tag = "invites"
)]
pub async fn accept(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(token): Path<String>,
) -> ApiResult<Json<OkResponse>> {
    let invite = load_invite(&state, &token).await?;
    if invite.email.to_lowercase() != auth.user.email.to_lowercase() {
        return Err(ApiError::Forbidden);
    }
    let invite_workspace_id = invite.workspace_id;

    let ws = workspace::Entity::find_by_id(invite_workspace_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("workspace"))?;
    let owner_email = load_owner_email(&state, ws.owner_id).await?;
    ensure_customer(&state, &ws, &owner_email).await?;

    let txn = state.db.begin().await?;
    let now = Utc::now().fixed_offset();

    let existing = workspace_member::Entity::find()
        .filter(workspace_member::Column::WorkspaceId.eq(invite.workspace_id))
        .filter(workspace_member::Column::UserId.eq(auth.user.id))
        .one(&txn)
        .await?;

    let added_member = existing.is_none();
    if added_member {
        require_metered_feature(&state, invite_workspace_id, "members", 1.0).await?;
        workspace_member::ActiveModel {
            id: Set(Uuid::now_v7()),
            workspace_id: Set(invite_workspace_id),
            user_id: Set(auth.user.id),
            role: Set(invite.role),
            created_at: Set(now),
        }
        .insert(&txn)
        .await?;
    }

    let mut am: workspace_invite::ActiveModel = invite.into();
    am.accepted_at = Set(Some(now));
    am.update(&txn).await?;

    txn.commit().await?;
    if added_member {
        track_feature_with_key(
            &state,
            invite_workspace_id,
            "members",
            1.0,
            Some(format!(
                "member-accept-{invite_workspace_id}-{}",
                auth.user.id
            )),
        )
        .await;
    }
    Ok(Json(OkResponse { ok: true }))
}
