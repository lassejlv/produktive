use axum::{
    extract::{Path, Query, State},
    routing::{get, patch, post},
    Extension, Json, Router,
};
use chrono::{DateTime, FixedOffset, Utc};
use sea_orm::{ConnectionTrait, DatabaseBackend, FromQueryResult, Statement};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    middleware::Membership,
    notification_webhook::{self, ChannelDelivery},
    state::AppState,
    target,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_notifications))
        .route("/channels", get(list_channels).post(create_channel))
        .route(
            "/channels/{id}",
            patch(update_channel).delete(delete_channel),
        )
        .route("/channels/{id}/test", post(test_channel))
        .route("/channels/{id}/deliveries", get(list_channel_deliveries))
}

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct NotificationQuery {
    pub limit: Option<u64>,
}

#[derive(Serialize, FromQueryResult, ToSchema)]
pub struct NotificationView {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub monitor_id: Option<Uuid>,
    pub monitor_name: Option<String>,
    pub incident_id: Option<Uuid>,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub created_at: DateTime<FixedOffset>,
}

#[derive(Serialize, FromQueryResult, ToSchema)]
pub struct NotificationChannelView {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
    pub kind: String,
    pub masked_url: String,
    pub enabled: bool,
    pub notify_resolved: bool,
    pub last_delivery_status: Option<String>,
    pub last_delivery_at: Option<DateTime<FixedOffset>>,
    pub last_delivery_error: Option<String>,
    pub created_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
}

#[derive(Serialize, FromQueryResult, ToSchema)]
pub struct NotificationDeliveryView {
    pub id: Uuid,
    pub notification_id: Uuid,
    pub channel_id: Uuid,
    pub status: String,
    pub error_message: Option<String>,
    pub sent_at: Option<DateTime<FixedOffset>>,
    pub created_at: DateTime<FixedOffset>,
    pub notification_title: Option<String>,
}

/// Delivery target type for a notification channel. Stored as a SMALLINT
/// (`webhook = 0`, `slack = 1`, `discord = 2`); the wire format is the
/// lowercase name so the API stays self-describing.
#[derive(Debug, Clone, Copy, Default, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum ChannelKind {
    #[default]
    Webhook,
    Slack,
    Discord,
}

impl ChannelKind {
    fn as_i16(self) -> i16 {
        match self {
            ChannelKind::Webhook => 0,
            ChannelKind::Slack => 1,
            ChannelKind::Discord => 2,
        }
    }

    /// Reject mismatched URLs early (e.g. a Discord URL pasted into a Slack
    /// channel) so a misconfigured channel fails at create time rather than
    /// silently dropping every delivery.
    fn validate_host(self, host: &str) -> ApiResult<()> {
        let host = host.to_ascii_lowercase();
        let ok = match self {
            ChannelKind::Webhook => true,
            ChannelKind::Slack => host == "hooks.slack.com",
            ChannelKind::Discord => {
                host == "discord.com"
                    || host == "discordapp.com"
                    || host.ends_with(".discord.com")
                    || host.ends_with(".discordapp.com")
            }
        };
        if ok {
            return Ok(());
        }
        Err(ApiError::bad_request(match self {
            ChannelKind::Slack => "slack channel url must point to hooks.slack.com",
            ChannelKind::Discord => "discord channel url must point to discord.com",
            ChannelKind::Webhook => "invalid webhook host",
        }))
    }
}

#[derive(Deserialize, ToSchema)]
pub struct CreateNotificationChannel {
    pub name: String,
    pub webhook_url: String,
    #[serde(default)]
    pub kind: ChannelKind,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub notify_resolved: bool,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateNotificationChannel {
    pub name: Option<String>,
    pub enabled: Option<bool>,
    pub notify_resolved: Option<bool>,
}

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct DeliveryQuery {
    pub limit: Option<u64>,
}

#[derive(Serialize, ToSchema)]
pub struct TestChannelResponse {
    pub ok: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Serialize, ToSchema)]
pub struct OkResponse {
    pub ok: bool,
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/notifications",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        NotificationQuery,
    ),
    responses((status = 200, body = [NotificationView])),
    security(("bearerAuth" = [])),
    tag = "notifications"
)]
pub async fn list_notifications(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Query(q): Query<NotificationQuery>,
) -> ApiResult<Json<Vec<NotificationView>>> {
    let limit = q.limit.unwrap_or(100).min(500) as i64;
    let rows = NotificationView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT
            n.id,
            n.workspace_id,
            n.monitor_id,
            m.name AS monitor_name,
            n.incident_id,
            CASE n.kind
                WHEN 0 THEN 'incident_opened'
                WHEN 1 THEN 'incident_resolved'
                WHEN 3 THEN 'log_alert_fired'
                ELSE 'unknown'
            END AS kind,
            n.title,
            n.body,
            n.created_at
        FROM notifications n
        LEFT JOIN monitors m ON m.id = n.monitor_id
        WHERE n.workspace_id = $1
        ORDER BY n.created_at DESC
        LIMIT $2
        "#,
        [m.workspace.id.into(), limit.into()],
    ))
    .all(&state.db)
    .await?;

    Ok(Json(rows))
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/notifications/channels",
    params(("wid" = String, Path, description = "workspace id or slug")),
    responses((status = 200, body = [NotificationChannelView])),
    security(("bearerAuth" = [])),
    tag = "notifications"
)]
pub async fn list_channels(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<Vec<NotificationChannelView>>> {
    Ok(Json(load_channels(&state, m.workspace.id).await?))
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/notifications/channels",
    params(("wid" = String, Path, description = "workspace id or slug")),
    request_body = CreateNotificationChannel,
    responses(
        (status = 200, body = NotificationChannelView),
        (status = 400, description = "Invalid channel"),
        (status = 403, description = "Owner only"),
    ),
    security(("bearerAuth" = [])),
    tag = "notifications"
)]
pub async fn create_channel(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Json(body): Json<CreateNotificationChannel>,
) -> ApiResult<Json<NotificationChannelView>> {
    m.require_owner()?;
    let name = body.name.trim();
    if name.is_empty() {
        return Err(ApiError::bad_request("channel name required"));
    }
    let webhook_url = body.webhook_url.trim().to_string();
    let validated = target::validate_webhook_target(&webhook_url).await?;
    body.kind.validate_host(&validated.host)?;
    let now = Utc::now().fixed_offset();
    let id = Uuid::now_v7();

    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO notification_channels (
                id, workspace_id, name, kind, webhook_url, enabled,
                notify_resolved, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
            "#,
            [
                id.into(),
                m.workspace.id.into(),
                name.to_string().into(),
                body.kind.as_i16().into(),
                webhook_url.into(),
                body.enabled.into(),
                body.notify_resolved.into(),
                now.into(),
            ],
        ))
        .await?;

    let channel = load_channels(&state, m.workspace.id)
        .await?
        .into_iter()
        .find(|c| c.id == id)
        .ok_or_else(|| ApiError::not_found("notification channel"))?;
    Ok(Json(channel))
}

#[utoipa::path(
    delete,
    path = "/api/workspaces/{wid}/notifications/channels/{id}",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("id" = Uuid, Path, description = "channel id"),
    ),
    responses(
        (status = 200, body = OkResponse),
        (status = 403, description = "Owner only"),
    ),
    security(("bearerAuth" = [])),
    tag = "notifications"
)]
pub async fn delete_channel(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, id)): Path<(String, Uuid)>,
) -> ApiResult<Json<OkResponse>> {
    m.require_owner()?;
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "DELETE FROM notification_channels WHERE id = $1 AND workspace_id = $2",
            [id.into(), m.workspace.id.into()],
        ))
        .await?;
    Ok(Json(OkResponse { ok: true }))
}

#[utoipa::path(
    patch,
    path = "/api/workspaces/{wid}/notifications/channels/{id}",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("id" = Uuid, Path, description = "channel id"),
    ),
    request_body = UpdateNotificationChannel,
    responses(
        (status = 200, body = NotificationChannelView),
        (status = 403, description = "Owner only"),
        (status = 404, description = "Channel not found"),
    ),
    security(("bearerAuth" = [])),
    tag = "notifications"
)]
pub async fn update_channel(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, id)): Path<(String, Uuid)>,
    Json(body): Json<UpdateNotificationChannel>,
) -> ApiResult<Json<NotificationChannelView>> {
    m.require_owner()?;
    if body.name.is_none() && body.enabled.is_none() && body.notify_resolved.is_none() {
        return Err(ApiError::bad_request("no fields to update"));
    }
    if let Some(name) = &body.name {
        if name.trim().is_empty() {
            return Err(ApiError::bad_request("channel name required"));
        }
    }

    let now = Utc::now().fixed_offset();
    let name = body.name.as_deref().map(str::trim).map(str::to_string);
    let updated = state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE notification_channels
            SET
                name = COALESCE($3, name),
                enabled = COALESCE($4, enabled),
                notify_resolved = COALESCE($5, notify_resolved),
                updated_at = $6
            WHERE id = $1 AND workspace_id = $2
            "#,
            [
                id.into(),
                m.workspace.id.into(),
                name.into(),
                body.enabled.into(),
                body.notify_resolved.into(),
                now.into(),
            ],
        ))
        .await?;
    if updated.rows_affected() == 0 {
        return Err(ApiError::not_found("notification channel"));
    }

    load_channels(&state, m.workspace.id)
        .await?
        .into_iter()
        .find(|c| c.id == id)
        .ok_or_else(|| ApiError::not_found("notification channel"))
        .map(Json)
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/notifications/channels/{id}/test",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("id" = Uuid, Path, description = "channel id"),
    ),
    responses(
        (status = 200, body = TestChannelResponse),
        (status = 400, description = "Delivery failed"),
        (status = 403, description = "Owner only"),
        (status = 404, description = "Channel not found"),
    ),
    security(("bearerAuth" = [])),
    tag = "notifications"
)]
pub async fn test_channel(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, id)): Path<(String, Uuid)>,
) -> ApiResult<Json<TestChannelResponse>> {
    m.require_owner()?;
    let channel = load_channel_delivery(&state, m.workspace.id, id)
        .await?
        .ok_or_else(|| ApiError::not_found("notification channel"))?;

    let notification_id = Uuid::now_v7();
    let now = Utc::now().fixed_offset();
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO notifications (
                id, workspace_id, monitor_id, incident_id, kind, title, body, created_at
            )
            VALUES ($1, $2, NULL, NULL, 2, $3, $4, $5)
            "#,
            [
                notification_id.into(),
                m.workspace.id.into(),
                "Test notification from produktive".into(),
                "If you received this, your notification channel is configured correctly.".into(),
                now.into(),
            ],
        ))
        .await?;

    let payload = notification_webhook::test_payload(m.workspace.id, &m.workspace.name);
    notification_webhook::deliver_and_record(&state, notification_id, &channel, &payload, now)
        .await
        .map_err(|e| ApiError::bad_request(e.to_string()))?;

    Ok(Json(TestChannelResponse { ok: true }))
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/notifications/channels/{id}/deliveries",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("id" = Uuid, Path, description = "channel id"),
        DeliveryQuery,
    ),
    responses(
        (status = 200, body = [NotificationDeliveryView]),
        (status = 404, description = "Channel not found"),
    ),
    security(("bearerAuth" = [])),
    tag = "notifications"
)]
pub async fn list_channel_deliveries(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, id)): Path<(String, Uuid)>,
    Query(q): Query<DeliveryQuery>,
) -> ApiResult<Json<Vec<NotificationDeliveryView>>> {
    ensure_channel(&state, m.workspace.id, id).await?;
    let limit = q.limit.unwrap_or(20).min(100) as i64;
    let rows = NotificationDeliveryView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT
            d.id,
            d.notification_id,
            d.channel_id,
            CASE d.status
                WHEN 1 THEN 'ok'
                WHEN 2 THEN 'failed'
                ELSE 'unknown'
            END AS status,
            d.error_message,
            d.sent_at,
            d.created_at,
            n.title AS notification_title
        FROM notification_deliveries d
        JOIN notifications n ON n.id = d.notification_id
        WHERE d.channel_id = $1
          AND n.workspace_id = $2
        ORDER BY d.created_at DESC
        LIMIT $3
        "#,
        [id.into(), m.workspace.id.into(), limit.into()],
    ))
    .all(&state.db)
    .await?;
    Ok(Json(rows))
}

async fn load_channels(
    state: &AppState,
    workspace_id: Uuid,
) -> ApiResult<Vec<NotificationChannelView>> {
    let rows = NotificationChannelView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT
            id,
            workspace_id,
            name,
            CASE kind
                WHEN 0 THEN 'webhook'
                WHEN 1 THEN 'slack'
                WHEN 2 THEN 'discord'
                ELSE 'unknown'
            END AS kind,
            regexp_replace(webhook_url, '^(https?://[^/?#]+).*$', '\1/...') AS masked_url,
            enabled,
            notify_resolved,
            (
                SELECT CASE ld.status
                    WHEN 1 THEN 'ok'
                    WHEN 2 THEN 'failed'
                    ELSE 'unknown'
                END
                FROM notification_deliveries ld
                WHERE ld.channel_id = notification_channels.id
                ORDER BY ld.created_at DESC
                LIMIT 1
            ) AS last_delivery_status,
            (
                SELECT COALESCE(ld.sent_at, ld.created_at)
                FROM notification_deliveries ld
                WHERE ld.channel_id = notification_channels.id
                ORDER BY ld.created_at DESC
                LIMIT 1
            ) AS last_delivery_at,
            (
                SELECT ld.error_message
                FROM notification_deliveries ld
                WHERE ld.channel_id = notification_channels.id
                ORDER BY ld.created_at DESC
                LIMIT 1
            ) AS last_delivery_error,
            created_at,
            updated_at
        FROM notification_channels
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        "#,
        [workspace_id.into()],
    ))
    .all(&state.db)
    .await?;
    Ok(rows)
}

async fn ensure_channel(state: &AppState, workspace_id: Uuid, channel_id: Uuid) -> ApiResult<()> {
    let exists = state
        .db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT 1 FROM notification_channels WHERE id = $1 AND workspace_id = $2",
            [channel_id.into(), workspace_id.into()],
        ))
        .await?
        .is_some();
    if exists {
        Ok(())
    } else {
        Err(ApiError::not_found("notification channel"))
    }
}

async fn load_channel_delivery(
    state: &AppState,
    workspace_id: Uuid,
    channel_id: Uuid,
) -> ApiResult<Option<ChannelDelivery>> {
    #[derive(FromQueryResult)]
    struct Row {
        id: Uuid,
        kind: i16,
        webhook_url: String,
    }

    let row = Row::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT id, kind, webhook_url
        FROM notification_channels
        WHERE id = $1 AND workspace_id = $2
        "#,
        [channel_id.into(), workspace_id.into()],
    ))
    .one(&state.db)
    .await?;

    Ok(row.map(|r| ChannelDelivery {
        id: r.id,
        kind: r.kind,
        webhook_url: r.webhook_url,
    }))
}

#[cfg(test)]
mod tests {
    use super::ChannelKind;

    #[test]
    fn channel_kind_maps_to_stored_smallint() {
        assert_eq!(ChannelKind::Webhook.as_i16(), 0);
        assert_eq!(ChannelKind::Slack.as_i16(), 1);
        assert_eq!(ChannelKind::Discord.as_i16(), 2);
    }

    #[test]
    fn slack_requires_hooks_host() {
        assert!(ChannelKind::Slack.validate_host("hooks.slack.com").is_ok());
        assert!(ChannelKind::Slack.validate_host("HOOKS.SLACK.COM").is_ok());
        assert!(ChannelKind::Slack.validate_host("discord.com").is_err());
    }

    #[test]
    fn discord_allows_known_hosts_only() {
        for host in ["discord.com", "discordapp.com", "ptb.discord.com"] {
            assert!(ChannelKind::Discord.validate_host(host).is_ok(), "{host}");
        }
        assert!(ChannelKind::Discord
            .validate_host("hooks.slack.com")
            .is_err());
        assert!(ChannelKind::Discord
            .validate_host("notdiscord.com.evil.test")
            .is_err());
    }

    #[test]
    fn webhook_accepts_any_public_host() {
        assert!(ChannelKind::Webhook
            .validate_host("hooks.example.com")
            .is_ok());
    }
}
