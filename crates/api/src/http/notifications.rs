use axum::{
    extract::{Path, Query, State},
    routing::{delete, get},
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
    state::AppState,
    target,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_notifications))
        .route("/channels", get(list_channels).post(create_channel))
        .route("/channels/{id}", delete(delete_channel))
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
    pub created_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
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
