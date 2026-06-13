use chrono::Utc;
use entity::monitor;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ConnectionTrait, DatabaseBackend, EntityTrait,
    FromQueryResult, Statement,
};
use serde::Serialize;
use std::time::Duration;
use unstatus_probe::ProbeOutcome;
use uuid::Uuid;

use crate::{
    billing::{require_metered_feature, track_feature_with_key, EVENT_UNITS_PER_CHECK},
    state::AppState,
};

const MAX_WEBHOOK_DELIVERIES_PER_NOTIFICATION: i64 = 16;

#[derive(FromQueryResult)]
struct IdRow {
    id: Uuid,
}

#[derive(FromQueryResult)]
struct AggregateRow {
    total: i64,
    checked: i64,
    down: i64,
    non_up: i64,
    avg_latency_ms: Option<f64>,
    last_checked_at: Option<chrono::DateTime<chrono::FixedOffset>>,
    last_error: Option<String>,
}

const CHANNEL_KIND_SLACK: i16 = 1;
const CHANNEL_KIND_DISCORD: i16 = 2;

// Discord embed accent colors (matching the app's --color-err / --color-ok tokens).
const COLOR_DOWN: i32 = 0xef4444;
const COLOR_RESOLVED: i32 = 0x22c55e;

#[derive(Clone, FromQueryResult)]
struct ChannelRow {
    id: Uuid,
    kind: i16,
    webhook_url: String,
    notify_resolved: bool,
}

#[derive(Clone, Serialize)]
struct WebhookPayload {
    kind: String,
    workspace_id: Uuid,
    monitor_id: Uuid,
    monitor_name: String,
    incident_id: Uuid,
    title: String,
    body: String,
    occurred_at: chrono::DateTime<chrono::FixedOffset>,
}

struct NotificationEvent<'a> {
    incident_id: Uuid,
    kind_value: i16,
    kind: &'a str,
    title: &'a str,
    body: &'a str,
    occurred_at: chrono::DateTime<chrono::FixedOffset>,
}

pub async fn record(
    state: &AppState,
    monitor_id: Uuid,
    region_id: Uuid,
    lease_id: Option<Uuid>,
    outcome: ProbeOutcome,
) -> anyhow::Result<()> {
    let now = Utc::now();
    let existing = monitor::Entity::find_by_id(monitor_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| anyhow::anyhow!("monitor not found"))?;
    let workspace_id = existing.workspace_id;

    require_metered_feature(state, workspace_id, "events", EVENT_UNITS_PER_CHECK).await?;

    update_region_state(
        state,
        monitor_id,
        region_id,
        lease_id,
        &outcome,
        now.fixed_offset(),
    )
    .await?;

    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO checks (
                time, monitor_id, region_id, status, latency_ms, status_code, error_message
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            "#,
            [
                now.fixed_offset().into(),
                monitor_id.into(),
                region_id.into(),
                outcome.status.into(),
                outcome.latency_ms.into(),
                outcome.status_code.into(),
                outcome.error.clone().into(),
            ],
        ))
        .await?;

    let aggregate = aggregate_monitor_state(state, &existing, now.fixed_offset()).await?;
    if aggregate.status.is_some() {
        sync_incident(state, &existing, &aggregate.outcome, now.fixed_offset()).await?;
    }

    let mut am: monitor::ActiveModel = existing.into();
    am.last_status = Set(aggregate.status);
    am.last_latency_ms = Set(aggregate.latency_ms);
    am.last_checked_at = Set(aggregate.last_checked_at);
    am.updated_at = Set(now.fixed_offset());
    am.update(&state.db).await?;

    track_feature_with_key(
        state,
        workspace_id,
        "events",
        EVENT_UNITS_PER_CHECK,
        Some(format!(
            "check-event-{monitor_id}-{region_id}-{}",
            now.timestamp_millis()
        )),
    )
    .await;

    Ok(())
}

struct AggregateOutcome {
    status: Option<i16>,
    latency_ms: Option<i32>,
    last_checked_at: Option<chrono::DateTime<chrono::FixedOffset>>,
    outcome: ProbeOutcome,
}

async fn update_region_state(
    state: &AppState,
    monitor_id: Uuid,
    region_id: Uuid,
    lease_id: Option<Uuid>,
    outcome: &ProbeOutcome,
    now: chrono::DateTime<chrono::FixedOffset>,
) -> anyhow::Result<()> {
    let rows = if let Some(lease_id) = lease_id {
        state
            .db
            .execute(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                r#"
                UPDATE monitor_region_states
                SET last_status = $4,
                    last_latency_ms = $5,
                    last_checked_at = $6,
                    last_error = $7,
                    lease_id = NULL,
                    lease_expires_at = NULL,
                    updated_at = $6
                WHERE monitor_id = $1
                  AND region_id = $2
                  AND lease_id = $3
                "#,
                [
                    monitor_id.into(),
                    region_id.into(),
                    lease_id.into(),
                    outcome.status.into(),
                    outcome.latency_ms.into(),
                    now.into(),
                    outcome.error.clone().into(),
                ],
            ))
            .await?
            .rows_affected()
    } else {
        state
            .db
            .execute(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                r#"
                UPDATE monitor_region_states
                SET last_status = $3,
                    last_latency_ms = $4,
                    last_checked_at = $5,
                    last_error = $6,
                    lease_id = NULL,
                    lease_expires_at = NULL,
                    updated_at = $5
                WHERE monitor_id = $1
                  AND region_id = $2
                "#,
                [
                    monitor_id.into(),
                    region_id.into(),
                    outcome.status.into(),
                    outcome.latency_ms.into(),
                    now.into(),
                    outcome.error.clone().into(),
                ],
            ))
            .await?
            .rows_affected()
    };

    if rows == 0 {
        anyhow::bail!("check lease is no longer active");
    }
    Ok(())
}

async fn aggregate_monitor_state(
    state: &AppState,
    monitor: &monitor::Model,
    now: chrono::DateTime<chrono::FixedOffset>,
) -> anyhow::Result<AggregateOutcome> {
    let row = AggregateRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT
            COUNT(*)::bigint AS total,
            COUNT(s.last_status)::bigint AS checked,
            COUNT(*) FILTER (WHERE s.last_status = 0)::bigint AS down,
            COUNT(*) FILTER (WHERE s.last_status IS NOT NULL AND s.last_status <> 1)::bigint AS non_up,
            AVG(s.last_latency_ms)::float8 AS avg_latency_ms,
            MAX(s.last_checked_at) AS last_checked_at,
            MAX(s.last_error) FILTER (WHERE s.last_status IS NOT NULL AND s.last_status <> 1) AS last_error
        FROM monitor_regions mr
        JOIN monitor_region_states s
          ON s.monitor_id = mr.monitor_id AND s.region_id = mr.region_id
        JOIN regions r ON r.id = mr.region_id
        WHERE mr.monitor_id = $1
          AND mr.enabled = true
          AND r.enabled = true
        "#,
        [monitor.id.into()],
    ))
    .one(&state.db)
    .await?
    .unwrap_or(AggregateRow {
        total: 0,
        checked: 0,
        down: 0,
        non_up: 0,
        avg_latency_ms: None,
        last_checked_at: None,
        last_error: None,
    });

    let status = if row.checked == 0 || row.total == 0 {
        None
    } else if row.down * 2 > row.total {
        Some(0)
    } else if row.non_up > 0 {
        Some(2)
    } else {
        Some(1)
    };
    let latency_ms = row.avg_latency_ms.map(|value| value.round() as i32);
    let error = match status {
        Some(0) => row
            .last_error
            .or_else(|| Some("majority of regions are down".into())),
        Some(2) => row
            .last_error
            .or_else(|| Some("one or more regions are degraded".into())),
        _ => None,
    };

    Ok(AggregateOutcome {
        status,
        latency_ms,
        last_checked_at: row.last_checked_at.or(Some(now)),
        outcome: ProbeOutcome {
            status: status.unwrap_or(0),
            latency_ms,
            status_code: None,
            error,
            body: None,
            headers: None,
        },
    })
}

async fn sync_incident(
    state: &AppState,
    monitor: &monitor::Model,
    outcome: &ProbeOutcome,
    now: chrono::DateTime<chrono::FixedOffset>,
) -> anyhow::Result<()> {
    match outcome.status {
        1 => {
            let open = IdRow::find_by_statement(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                r#"
                SELECT id
                FROM incidents
                WHERE monitor_id = $1
                  AND workspace_id = $2
                  AND status = 0
                LIMIT 1
                "#,
                [monitor.id.into(), monitor.workspace_id.into()],
            ))
            .one(&state.db)
            .await?;

            if let Some(open) = open {
                state
                    .db
                    .execute(Statement::from_sql_and_values(
                        DatabaseBackend::Postgres,
                        r#"
                        UPDATE incidents
                        SET status = 1,
                            resolved_at = $3,
                            last_seen_at = $3,
                            updated_at = $3
                        WHERE id = $1
                          AND workspace_id = $2
                        "#,
                        [open.id.into(), monitor.workspace_id.into(), now.into()],
                    ))
                    .await?;

                emit_notification(
                    state,
                    monitor,
                    NotificationEvent {
                        incident_id: open.id,
                        kind_value: 1,
                        kind: "incident_resolved",
                        title: "Incident resolved",
                        body: &format!("{} is operational again.", monitor.name),
                        occurred_at: now,
                    },
                )
                .await?;
            }
        }
        0 | 2 => {
            let severity = if outcome.status == 0 { 0i16 } else { 2i16 };
            let res = state
                .db
                .execute(Statement::from_sql_and_values(
                    DatabaseBackend::Postgres,
                    r#"
                    UPDATE incidents
                    SET last_seen_at = $3,
                        severity = CASE
                            WHEN severity = 0 OR $4 = 0 THEN 0
                            ELSE $4
                        END,
                        error_message = $5,
                        updated_at = $3
                    WHERE monitor_id = $1
                      AND workspace_id = $2
                      AND status = 0
                    "#,
                    [
                        monitor.id.into(),
                        monitor.workspace_id.into(),
                        now.into(),
                        severity.into(),
                        outcome.error.clone().into(),
                    ],
                ))
                .await?;

            if res.rows_affected() == 0 {
                let incident_id = Uuid::now_v7();
                state
                    .db
                    .execute(Statement::from_sql_and_values(
                        DatabaseBackend::Postgres,
                        r#"
                        INSERT INTO incidents (
                            id, workspace_id, monitor_id, status, severity,
                            started_at, last_seen_at, resolved_at,
                            error_message, created_at, updated_at
                        )
                        VALUES ($1, $2, $3, 0, $4, $5, $5, NULL, $6, $5, $5)
                        "#,
                        [
                            incident_id.into(),
                            monitor.workspace_id.into(),
                            monitor.id.into(),
                            severity.into(),
                            now.into(),
                            outcome.error.clone().into(),
                        ],
                    ))
                    .await?;

                let severity_label = if severity == 0 { "down" } else { "degraded" };
                emit_notification(
                    state,
                    monitor,
                    NotificationEvent {
                        incident_id,
                        kind_value: 0,
                        kind: "incident_opened",
                        title: &format!("{} is {severity_label}", monitor.name),
                        body: outcome
                            .error
                            .as_deref()
                            .unwrap_or("A monitor check started failing."),
                        occurred_at: now,
                    },
                )
                .await?;
            }
        }
        _ => {}
    }

    Ok(())
}

async fn emit_notification(
    state: &AppState,
    monitor: &monitor::Model,
    event: NotificationEvent<'_>,
) -> anyhow::Result<()> {
    let notification_id = Uuid::now_v7();
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO notifications (
                id, workspace_id, monitor_id, incident_id, kind, title, body, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            "#,
            [
                notification_id.into(),
                monitor.workspace_id.into(),
                monitor.id.into(),
                event.incident_id.into(),
                event.kind_value.into(),
                event.title.to_string().into(),
                event.body.to_string().into(),
                event.occurred_at.into(),
            ],
        ))
        .await?;

    let channels = ChannelRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT id, kind, webhook_url, notify_resolved
        FROM notification_channels
        WHERE workspace_id = $1
          AND enabled = true
        ORDER BY created_at
        LIMIT $2
        "#,
        [
            monitor.workspace_id.into(),
            MAX_WEBHOOK_DELIVERIES_PER_NOTIFICATION.into(),
        ],
    ))
    .all(&state.db)
    .await?;

    let payload = WebhookPayload {
        kind: event.kind.to_owned(),
        workspace_id: monitor.workspace_id,
        monitor_id: monitor.id,
        monitor_name: monitor.name.clone(),
        incident_id: event.incident_id,
        title: event.title.to_owned(),
        body: event.body.to_owned(),
        occurred_at: event.occurred_at,
    };

    for channel in channels {
        if event.kind_value == 1 && !channel.notify_resolved {
            continue;
        }
        let state = state.clone();
        let payload = payload.clone();
        let occurred_at = event.occurred_at;
        tokio::spawn(async move {
            if let Err(error) =
                deliver_webhook(state, notification_id, channel, payload, occurred_at).await
            {
                tracing::warn!(error = ?error, notification_id = %notification_id, "webhook delivery failed");
            }
        });
    }

    Ok(())
}

async fn deliver_webhook(
    state: AppState,
    notification_id: Uuid,
    channel: ChannelRow,
    payload: WebhookPayload,
    now: chrono::DateTime<chrono::FixedOffset>,
) -> anyhow::Result<()> {
    let target = crate::target::validate_webhook_target(&channel.webhook_url).await?;
    let client = reqwest::Client::builder()
        .user_agent("unstatus/0.1")
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .resolve_to_addrs(&target.host, &target.addrs)
        .build()?;

    let request = client.post(&channel.webhook_url);
    let request = match channel.kind {
        CHANNEL_KIND_SLACK => request.json(&slack_payload(&payload)),
        CHANNEL_KIND_DISCORD => request.json(&discord_payload(&payload)),
        _ => request.json(&payload),
    };
    let result = request.send().await;

    let (status, error, sent_at): (
        i16,
        Option<String>,
        Option<chrono::DateTime<chrono::FixedOffset>>,
    ) = match result {
        Ok(resp) if resp.status().is_success() => (1, None, Some(now)),
        Ok(resp) => (2, Some(format!("webhook returned {}", resp.status())), None),
        Err(e) => (2, Some(e.to_string()), None),
    };

    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO notification_deliveries (
                id, notification_id, channel_id, status, error_message, sent_at, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            "#,
            [
                Uuid::now_v7().into(),
                notification_id.into(),
                channel.id.into(),
                status.into(),
                error.into(),
                sent_at.into(),
                now.into(),
            ],
        ))
        .await?;

    Ok(())
}

/// Slack Incoming Webhook payload: a mrkdwn section with a status emoji plus a
/// context line naming the monitor. `text` is kept as a fallback for clients
/// that don't render blocks (notifications, etc.).
fn slack_payload(payload: &WebhookPayload) -> serde_json::Value {
    let resolved = payload.kind == "incident_resolved";
    let emoji = if resolved {
        ":large_green_circle:"
    } else {
        ":red_circle:"
    };
    serde_json::json!({
        "text": format!("{emoji} {}", payload.title),
        "blocks": [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": format!("{emoji} *{}*\n{}", payload.title, payload.body),
                }
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": format!("Monitor: *{}* · unstatus", payload.monitor_name),
                    }
                ]
            }
        ]
    })
}

/// Discord webhook payload using a single colored embed (red while an incident
/// is open, green once resolved).
fn discord_payload(payload: &WebhookPayload) -> serde_json::Value {
    let resolved = payload.kind == "incident_resolved";
    let color = if resolved { COLOR_RESOLVED } else { COLOR_DOWN };
    serde_json::json!({
        "embeds": [
            {
                "title": payload.title,
                "description": payload.body,
                "color": color,
                "footer": { "text": format!("{} · unstatus", payload.monitor_name) },
                "timestamp": payload.occurred_at.to_rfc3339(),
            }
        ]
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(kind: &str) -> WebhookPayload {
        WebhookPayload {
            kind: kind.to_string(),
            workspace_id: Uuid::nil(),
            monitor_id: Uuid::nil(),
            monitor_name: "API".to_string(),
            incident_id: Uuid::nil(),
            title: "API is down".to_string(),
            body: "connection refused".to_string(),
            occurred_at: chrono::DateTime::parse_from_rfc3339("2026-06-13T19:00:00Z").unwrap(),
        }
    }

    #[test]
    fn slack_payload_uses_mrkdwn_section_and_red_emoji_when_open() {
        let v = slack_payload(&sample("incident_opened"));
        assert_eq!(v["blocks"][0]["type"], "section");
        assert_eq!(v["blocks"][0]["text"]["type"], "mrkdwn");
        let text = v["blocks"][0]["text"]["text"].as_str().unwrap();
        assert!(text.contains(":red_circle:"), "{text}");
        assert!(text.contains("API is down"), "{text}");
        assert!(text.contains("connection refused"), "{text}");
        assert!(v["text"].as_str().unwrap().contains("API is down"));
    }

    #[test]
    fn slack_payload_uses_green_emoji_when_resolved() {
        let v = slack_payload(&sample("incident_resolved"));
        let text = v["blocks"][0]["text"]["text"].as_str().unwrap();
        assert!(text.contains(":large_green_circle:"), "{text}");
    }

    #[test]
    fn discord_payload_colors_embed_by_state() {
        let opened = discord_payload(&sample("incident_opened"));
        assert_eq!(opened["embeds"][0]["title"], "API is down");
        assert_eq!(opened["embeds"][0]["description"], "connection refused");
        assert_eq!(
            opened["embeds"][0]["color"].as_i64(),
            Some(COLOR_DOWN as i64)
        );

        let resolved = discord_payload(&sample("incident_resolved"));
        assert_eq!(
            resolved["embeds"][0]["color"].as_i64(),
            Some(COLOR_RESOLVED as i64)
        );
    }
}
