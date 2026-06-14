use chrono::{DateTime, FixedOffset};
use sea_orm::{ConnectionTrait, DatabaseBackend, Statement};
use serde::Serialize;
use std::time::Duration;
use uuid::Uuid;

use crate::state::AppState;

const CHANNEL_KIND_SLACK: i16 = 1;
const CHANNEL_KIND_DISCORD: i16 = 2;

const COLOR_DOWN: i32 = 0xef4444;
const COLOR_RESOLVED: i32 = 0x22c55e;

#[derive(Clone, Debug)]
pub struct ChannelDelivery {
    pub id: Uuid,
    pub kind: i16,
    pub webhook_url: String,
}

#[derive(Clone, Serialize)]
pub struct WebhookPayload {
    pub kind: String,
    pub workspace_id: Uuid,
    pub monitor_id: Option<Uuid>,
    pub monitor_name: String,
    pub incident_id: Option<Uuid>,
    pub title: String,
    pub body: String,
    pub occurred_at: DateTime<FixedOffset>,
}

pub fn test_payload(workspace_id: Uuid, workspace_name: &str) -> WebhookPayload {
    let now = chrono::Utc::now().fixed_offset();
    WebhookPayload {
        kind: "test".to_string(),
        workspace_id,
        monitor_id: None,
        monitor_name: workspace_name.to_string(),
        incident_id: None,
        title: "Test notification from unstatus".to_string(),
        body: "If you received this, your notification channel is configured correctly."
            .to_string(),
        occurred_at: now,
    }
}

pub async fn deliver_and_record(
    state: &AppState,
    notification_id: Uuid,
    channel: &ChannelDelivery,
    payload: &WebhookPayload,
    now: DateTime<FixedOffset>,
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
        CHANNEL_KIND_SLACK => request.json(&slack_payload(payload)),
        CHANNEL_KIND_DISCORD => request.json(&discord_payload(payload)),
        _ => request.json(payload),
    };
    let result = request.send().await;

    let (status, error, sent_at): (i16, Option<String>, Option<DateTime<FixedOffset>>) =
        match result {
            Ok(resp) if resp.status().is_success() => (1, None, Some(now)),
            Ok(resp) => (2, Some(format!("webhook returned {}", resp.status())), None),
            Err(e) => (2, Some(e.to_string()), None),
        };

    let delivery_error = error.clone();
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

    if status != 1 {
        anyhow::bail!(delivery_error.unwrap_or_else(|| "delivery failed".to_string()));
    }

    Ok(())
}

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
            monitor_id: Some(Uuid::nil()),
            monitor_name: "API".to_string(),
            incident_id: Some(Uuid::nil()),
            title: "API is down".to_string(),
            body: "connection refused".to_string(),
            occurred_at: chrono::DateTime::parse_from_rfc3339("2026-06-13T19:00:00Z").unwrap(),
        }
    }

    #[test]
    fn test_payload_serializes() {
        let payload = test_payload(Uuid::nil(), "Acme");
        assert_eq!(payload.kind, "test");
        assert!(payload.title.contains("Test notification"));
    }

    #[test]
    fn slack_payload_uses_mrkdwn_section_and_red_emoji_when_open() {
        let v = slack_payload(&sample("incident_opened"));
        assert_eq!(v["blocks"][0]["type"], "section");
        let text = v["blocks"][0]["text"]["text"].as_str().unwrap();
        assert!(text.contains(":red_circle:"), "{text}");
        assert!(text.contains("API is down"), "{text}");
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
