use crate::{
    auth::require_auth,
    email,
    error::ApiError,
    http::preferences::for_user as preferences_for_user,
    realtime::{RealtimeAction, RealtimeEntity},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use produktive_entity::{notification, user};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter, QueryOrder, Set,
};
use serde::Serialize;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_inbox))
        .route("/read-all", post(mark_all_read))
        .route("/{id}/read", post(mark_read))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ActorResponse {
    id: String,
    name: String,
    image: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NotificationResponse {
    id: String,
    kind: String,
    target_type: String,
    target_id: String,
    title: String,
    snippet: Option<String>,
    created_at: String,
    read_at: Option<String>,
    actor: Option<ActorResponse>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InboxResponse {
    notifications: Vec<NotificationResponse>,
    unread_count: u64,
}

async fn list_inbox(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<InboxResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;

    let rows = notification::Entity::find()
        .filter(notification::Column::OrganizationId.eq(&auth.organization.id))
        .filter(notification::Column::UserId.eq(&auth.user.id))
        .order_by_desc(notification::Column::CreatedAt)
        .all(&state.db)
        .await?;

    let mut response = Vec::with_capacity(rows.len());
    let mut unread_count: u64 = 0;
    for row in rows {
        if row.read_at.is_none() {
            unread_count += 1;
        }
        response.push(notification_response(&state, row).await?);
    }

    Ok(Json(InboxResponse {
        notifications: response,
        unread_count,
    }))
}

async fn mark_read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<InboxResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;

    if let Some(row) = notification::Entity::find_by_id(&id)
        .filter(notification::Column::OrganizationId.eq(&auth.organization.id))
        .filter(notification::Column::UserId.eq(&auth.user.id))
        .one(&state.db)
        .await?
    {
        if row.read_at.is_none() {
            let mut active = row.into_active_model();
            active.read_at = Set(Some(Utc::now().fixed_offset()));
            active.update(&state.db).await?;
        }
    }

    list_inbox(State(state), headers).await
}

async fn mark_all_read(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<InboxResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;

    let now = Utc::now().fixed_offset();
    notification::Entity::update_many()
        .col_expr(
            notification::Column::ReadAt,
            sea_orm::sea_query::Expr::value(now),
        )
        .filter(notification::Column::OrganizationId.eq(&auth.organization.id))
        .filter(notification::Column::UserId.eq(&auth.user.id))
        .filter(notification::Column::ReadAt.is_null())
        .exec(&state.db)
        .await?;

    list_inbox(State(state), headers).await
}

pub async fn enqueue_notification(
    state: &AppState,
    organization_id: &str,
    user_id: &str,
    kind: &str,
    target_type: &str,
    target_id: &str,
    actor_id: Option<&str>,
    title: &str,
    snippet: Option<String>,
) -> Result<(), ApiError> {
    let row = notification::ActiveModel {
        id: Set(uuid::Uuid::new_v4().to_string()),
        organization_id: Set(organization_id.to_owned()),
        user_id: Set(user_id.to_owned()),
        kind: Set(kind.to_owned()),
        target_type: Set(target_type.to_owned()),
        target_id: Set(target_id.to_owned()),
        actor_id: Set(actor_id.map(|s| s.to_owned())),
        title: Set(title.to_owned()),
        snippet: Set(snippet),
        created_at: Set(Utc::now().fixed_offset()),
        read_at: Set(None),
    }
    .insert(&state.db)
    .await?;
    let response = notification_response(state, row).await?;
    state
        .realtime
        .publish_user_event_with_payload(
            &state.db,
            organization_id,
            user_id,
            RealtimeEntity::Notification,
            RealtimeAction::Created,
            &response.id,
            &response,
        )
        .await;

    Ok(())
}

async fn notification_response(
    state: &AppState,
    row: notification::Model,
) -> Result<NotificationResponse, ApiError> {
    let actor = match &row.actor_id {
        Some(id) => user::Entity::find_by_id(id)
            .one(&state.db)
            .await?
            .map(|user| ActorResponse {
                id: user.id,
                name: user.name,
                image: user.image,
            }),
        None => None,
    };

    Ok(NotificationResponse {
        id: row.id,
        kind: row.kind,
        target_type: row.target_type,
        target_id: row.target_id,
        title: row.title,
        snippet: row.snippet,
        created_at: row.created_at.to_rfc3339(),
        read_at: row.read_at.map(|value| value.to_rfc3339()),
        actor,
    })
}

/// Enqueue an in-app notification AND send an email if the user's preferences allow it.
/// Email failures are logged with `tracing::warn!` and never propagated.
#[allow(clippy::too_many_arguments)]
pub async fn dispatch_notification(
    state: &AppState,
    organization_id: &str,
    user_id: &str,
    kind: &str,
    target_type: &str,
    target_id: &str,
    actor_id: Option<&str>,
    title: &str,
    snippet: Option<String>,
    target_path: &str,
) -> Result<(), ApiError> {
    enqueue_notification(
        state,
        organization_id,
        user_id,
        kind,
        target_type,
        target_id,
        actor_id,
        title,
        snippet.clone(),
    )
    .await?;

    let prefs = match preferences_for_user(state, user_id).await {
        Ok(prefs) => prefs,
        Err(error) => {
            tracing::warn!(
                user_id = %user_id,
                organization_id = %organization_id,
                target_type = %target_type,
                target_id = %target_id,
                error = %error,
                "failed to load notification preferences"
            );
            return Ok(());
        }
    };

    if prefs.email_paused {
        return Ok(());
    }
    let send = match kind {
        "comment" => prefs.email_comments,
        "assignment" => prefs.email_assignments,
        _ => false,
    };
    if !send {
        return Ok(());
    }

    let recipient = match user::Entity::find_by_id(user_id).one(&state.db).await {
        Ok(Some(user)) => user,
        Ok(None) => return Ok(()),
        Err(error) => {
            tracing::warn!(
                user_id = %user_id,
                organization_id = %organization_id,
                target_type = %target_type,
                target_id = %target_id,
                error = %error,
                "failed to load notification recipient"
            );
            return Ok(());
        }
    };

    let action_label = match kind {
        "comment" => "Open comment",
        "assignment" => "Open issue",
        _ => "Open Produktive",
    };

    if let Err(error) = email::send_notification_email(
        state,
        &recipient.email,
        &recipient.name,
        title,
        snippet.as_deref(),
        action_label,
        target_path,
    )
    .await
    {
        tracing::warn!(
            user_id = %user_id,
            recipient_email = %recipient.email,
            organization_id = %organization_id,
            target_type = %target_type,
            target_id = %target_id,
            kind = %kind,
            error = %error,
            "failed to send notification email"
        );
    }

    Ok(())
}
