use crate::{
    auth::{ensure_fresh_two_factor, require_auth, require_auth_without_two_factor_policy},
    email::send_two_factor_nudge_email,
    error::ApiError,
    permissions::{member_role, require_permission, ROLE_OWNER, WORKSPACE_SECURITY},
    security_events::{
        metadata_empty, record_security_event, SecurityEventInput,
        EVENT_TWO_FACTOR_ENFORCEMENT_BLOCKED, EVENT_TWO_FACTOR_NUDGE_SENT,
        EVENT_TWO_FACTOR_RECOVERY_RESET,
    },
    state::AppState,
};
use axum::{
    extract::State, http::HeaderMap, http::StatusCode, routing::get, routing::post, Json, Router,
};
use produktive_entity::{
    member, security_event, session, user, user_two_factor, user_two_factor_backup_code,
    user_two_factor_trusted_device,
};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter, QueryOrder,
    QuerySelect, Set,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/events", get(list_security_events))
        .route(
            "/two-factor-enforcement/blocked",
            post(record_two_factor_enforcement_blocked),
        )
        .route("/two-factor-nudges", post(send_two_factor_nudges))
        .route("/two-factor-recovery/reset", post(reset_member_two_factor))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SecurityEventsEnvelope {
    events: Vec<SecurityEventResponse>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TwoFactorNudgeResponse {
    sent: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EmptyResponse {
    ok: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResetTwoFactorRequest {
    user_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SecurityEventResponse {
    id: String,
    event_type: String,
    actor: Option<SecurityEventUserResponse>,
    target: Option<SecurityEventUserResponse>,
    ip_address: Option<String>,
    user_agent: Option<String>,
    metadata: Value,
    created_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SecurityEventUserResponse {
    id: String,
    name: String,
    email: String,
}

async fn list_security_events(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SecurityEventsEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_permission(&state, &auth, WORKSPACE_SECURITY).await?;

    let events = security_event::Entity::find()
        .filter(security_event::Column::OrganizationId.eq(&auth.organization.id))
        .order_by_desc(security_event::Column::CreatedAt)
        .limit(100)
        .all(&state.db)
        .await?;

    let mut user_ids = Vec::new();
    for event in &events {
        if let Some(id) = &event.actor_user_id {
            user_ids.push(id.clone());
        }
        if let Some(id) = &event.target_user_id {
            user_ids.push(id.clone());
        }
    }
    user_ids.sort();
    user_ids.dedup();

    let users: HashMap<String, SecurityEventUserResponse> = if user_ids.is_empty() {
        HashMap::new()
    } else {
        user::Entity::find()
            .filter(user::Column::Id.is_in(user_ids))
            .all(&state.db)
            .await?
            .into_iter()
            .map(|row| {
                (
                    row.id.clone(),
                    SecurityEventUserResponse {
                        id: row.id,
                        name: row.name,
                        email: row.email,
                    },
                )
            })
            .collect()
    };

    Ok(Json(SecurityEventsEnvelope {
        events: events
            .into_iter()
            .map(|event| SecurityEventResponse {
                id: event.id,
                event_type: event.event_type,
                actor: event
                    .actor_user_id
                    .as_ref()
                    .and_then(|id| users.get(id).cloned()),
                target: event
                    .target_user_id
                    .as_ref()
                    .and_then(|id| users.get(id).cloned()),
                ip_address: event.ip_address,
                user_agent: event.user_agent,
                metadata: event.metadata,
                created_at: event.created_at.to_rfc3339(),
            })
            .collect(),
    }))
}

async fn send_two_factor_nudges(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<TwoFactorNudgeResponse>), ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_permission(&state, &auth, WORKSPACE_SECURITY).await?;

    let memberships = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(&auth.organization.id))
        .all(&state.db)
        .await?;

    let mut sent = 0;
    for membership in memberships {
        let Some(row) = user::Entity::find_by_id(&membership.user_id)
            .one(&state.db)
            .await?
        else {
            continue;
        };
        if row.two_factor_enabled {
            continue;
        }
        send_two_factor_nudge_email(
            &state,
            &row.email,
            &row.name,
            &auth.organization.name,
            &auth.user.name,
        )
        .await?;
        sent += 1;
    }

    record_security_event(
        &state,
        Some(&headers),
        SecurityEventInput {
            organization_id: Some(auth.organization.id),
            actor_user_id: Some(auth.user.id),
            target_user_id: None,
            event_type: EVENT_TWO_FACTOR_NUDGE_SENT,
            metadata: if sent == 0 {
                metadata_empty()
            } else {
                json!({ "sent": sent })
            },
        },
    )
    .await?;

    Ok((StatusCode::OK, Json(TwoFactorNudgeResponse { sent })))
}

async fn record_two_factor_enforcement_blocked(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<EmptyResponse>, ApiError> {
    let auth = require_auth_without_two_factor_policy(&headers, &state).await?;
    if auth.organization.require_two_factor && !auth.user.two_factor_enabled {
        record_security_event(
            &state,
            Some(&headers),
            SecurityEventInput {
                organization_id: Some(auth.organization.id.clone()),
                actor_user_id: Some(auth.user.id.clone()),
                target_user_id: Some(auth.user.id.clone()),
                event_type: EVENT_TWO_FACTOR_ENFORCEMENT_BLOCKED,
                metadata: metadata_empty(),
            },
        )
        .await?;
    }

    Ok(Json(EmptyResponse { ok: true }))
}

async fn reset_member_two_factor(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ResetTwoFactorRequest>,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_permission(&state, &auth, WORKSPACE_SECURITY).await?;
    ensure_fresh_two_factor(&auth)?;
    if payload.user_id == auth.user.id {
        return Err(ApiError::BadRequest(
            "Use account security to manage your own 2FA".to_owned(),
        ));
    }

    let actor_role = member_role(&state.db, &auth.user.id, &auth.organization.id)
        .await?
        .ok_or_else(|| ApiError::Forbidden("Not a member of this workspace".to_owned()))?;
    if actor_role != ROLE_OWNER {
        return Err(ApiError::Forbidden(
            "Only workspace owners can reset member 2FA".to_owned(),
        ));
    }

    let target_membership = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(&auth.organization.id))
        .filter(member::Column::UserId.eq(&payload.user_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Member not found".to_owned()))?;
    let target = user::Entity::find_by_id(&target_membership.user_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Member not found".to_owned()))?;
    if !target.two_factor_enabled {
        return Err(ApiError::BadRequest(
            "Two-factor authentication is not enabled for this member".to_owned(),
        ));
    }

    user_two_factor_backup_code::Entity::delete_many()
        .filter(user_two_factor_backup_code::Column::UserId.eq(&target.id))
        .exec(&state.db)
        .await?;
    user_two_factor_trusted_device::Entity::delete_many()
        .filter(user_two_factor_trusted_device::Column::UserId.eq(&target.id))
        .exec(&state.db)
        .await?;
    user_two_factor::Entity::delete_many()
        .filter(user_two_factor::Column::UserId.eq(&target.id))
        .exec(&state.db)
        .await?;
    let mut active = target.clone().into_active_model();
    active.two_factor_enabled = Set(false);
    active.updated_at = Set(chrono::Utc::now().fixed_offset());
    active.update(&state.db).await?;

    let sessions = session::Entity::find()
        .filter(session::Column::UserId.eq(&target.id))
        .filter(session::Column::RevokedAt.is_null())
        .all(&state.db)
        .await?;
    let now = chrono::Utc::now().fixed_offset();
    for session in sessions {
        let mut active = session.into_active_model();
        active.revoked_at = Set(Some(now));
        active.updated_at = Set(now);
        active.update(&state.db).await?;
    }

    record_security_event(
        &state,
        Some(&headers),
        SecurityEventInput {
            organization_id: Some(auth.organization.id),
            actor_user_id: Some(auth.user.id),
            target_user_id: Some(target.id),
            event_type: EVENT_TWO_FACTOR_RECOVERY_RESET,
            metadata: json!({ "targetRole": target_membership.role }),
        },
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}
