use std::time::Duration as StdDuration;

use chrono::{DateTime, Duration, FixedOffset, Utc};
use produktive_logging::{LogStoreOptions, SearchEvent, SearchRequest};
use sea_orm::{ConnectionTrait, DatabaseBackend, FromQueryResult, Statement};
use uuid::Uuid;

use crate::{
    notification_webhook::{self, ChannelDelivery, WebhookPayload},
    state::AppState,
};

const MAX_RULES_PER_TICK: i64 = 50;
const MAX_WEBHOOK_DELIVERIES_PER_ALERT: i64 = 20;
const NOTIFICATION_KIND_LOG_ALERT_FIRED: i16 = 3;

#[derive(Debug, FromQueryResult)]
struct AlertRuleRow {
    id: Uuid,
    workspace_id: Uuid,
    project_id: Uuid,
    project_name: String,
    query: String,
    level: Option<String>,
    threshold_count: i32,
    window_seconds: i32,
    last_fired_at: Option<DateTime<FixedOffset>>,
    storage_uri: Option<String>,
    region: Option<String>,
    endpoint: Option<String>,
    access_key_id: Option<String>,
    secret_access_key: Option<String>,
}

#[derive(Debug, FromQueryResult)]
struct ChannelRow {
    id: Uuid,
    kind: i16,
    webhook_url: String,
}

pub fn spawn(state: AppState) {
    tokio::spawn(async move {
        let tick = StdDuration::from_secs(state.config.log_alert_tick_seconds);
        let mut interval = tokio::time::interval(tick);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        interval.tick().await;
        loop {
            interval.tick().await;
            if let Err(error) = run_once(&state).await {
                tracing::error!(error = ?error, "log alert sweep failed");
            }
        }
    });
}

async fn run_once(state: &AppState) -> anyhow::Result<()> {
    let rules = due_rules(state).await?;
    for rule in rules {
        if let Err(error) = evaluate_rule(state, rule).await {
            tracing::warn!(error = ?error, "log alert rule evaluation failed");
        }
    }
    Ok(())
}

async fn due_rules(state: &AppState) -> anyhow::Result<Vec<AlertRuleRow>> {
    Ok(
        AlertRuleRow::find_by_statement(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
        SELECT r.id,
               r.workspace_id,
               r.project_id,
               p.name AS project_name,
               r.query,
               r.level,
               r.threshold_count,
               r.window_seconds,
               r.last_fired_at,
               b.storage_uri,
               b.region,
               b.endpoint,
               b.access_key_id,
               b.secret_access_key
        FROM log_alert_rules r
        JOIN log_projects p ON p.id = r.project_id
        LEFT JOIN log_storage_buckets b ON b.id = p.bucket_id
        WHERE r.enabled = true
          AND (
            r.last_evaluated_at IS NULL
            OR r.last_evaluated_at <= now() - ($1 || ' seconds')::interval
          )
        ORDER BY r.last_evaluated_at NULLS FIRST, r.created_at ASC
        LIMIT $2
        "#,
            vec![
                (state.config.log_alert_tick_seconds as i64).into(),
                MAX_RULES_PER_TICK.into(),
            ],
        ))
        .all(&state.db)
        .await?,
    )
}

async fn evaluate_rule(state: &AppState, rule: AlertRuleRow) -> anyhow::Result<()> {
    let now = Utc::now().fixed_offset();
    let window_seconds = rule.window_seconds.clamp(60, 86_400);
    let window_start = now - Duration::seconds(window_seconds as i64);
    let threshold = rule.threshold_count.max(1) as usize;
    let request = SearchRequest {
        workspace_id: rule.workspace_id,
        project_id: rule.project_id,
        from_ms: window_start.timestamp_millis(),
        to_ms: now.timestamp_millis(),
        limit: threshold,
        query: clean_query(&rule.query),
        level: rule.level.clone(),
        service: None,
    };
    let events = if let Some(cache) = state.log_hot_cache.as_ref() {
        match cache.search(&request).await {
            Ok(Some(events)) => events,
            Ok(None) => {
                state
                    .logs
                    .search_with(storage_options(state, &rule), request.clone())
                    .await?
            }
            Err(error) => {
                tracing::warn!(rule_id = %rule.id, error = ?error, "log alert hot cache search failed");
                state
                    .logs
                    .search_with(storage_options(state, &rule), request.clone())
                    .await?
            }
        }
    } else {
        state
            .logs
            .search_with(storage_options(state, &rule), request.clone())
            .await?
    };
    let matched_count = events.len() as i64;
    let should_fire = matched_count >= threshold as i64 && outside_cooldown(&rule, now);
    if should_fire {
        record_firing(
            state,
            &rule,
            matched_count,
            window_start,
            now,
            events.first(),
        )
        .await?;
        emit_notification(state, &rule, matched_count, events.first(), now).await?;
        mark_rule_evaluated(state, rule.id, now, true).await?;
    } else {
        mark_rule_evaluated(state, rule.id, now, false).await?;
    }
    Ok(())
}

async fn record_firing(
    state: &AppState,
    rule: &AlertRuleRow,
    matched_count: i64,
    window_start: DateTime<FixedOffset>,
    window_end: DateTime<FixedOffset>,
    sample: Option<&SearchEvent>,
) -> anyhow::Result<()> {
    let sample = sample.map(serde_json::to_value).transpose()?;
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO log_alert_firings (
                id, workspace_id, project_id, rule_id, matched_count,
                window_start, window_end, sample, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7)
            "#,
            vec![
                Uuid::now_v7().into(),
                rule.workspace_id.into(),
                rule.project_id.into(),
                rule.id.into(),
                matched_count.into(),
                window_start.into(),
                window_end.into(),
                sample.into(),
            ],
        ))
        .await?;
    Ok(())
}

async fn emit_notification(
    state: &AppState,
    rule: &AlertRuleRow,
    matched_count: i64,
    sample: Option<&SearchEvent>,
    now: DateTime<FixedOffset>,
) -> anyhow::Result<()> {
    let notification_id = Uuid::now_v7();
    let title = format!("Log alert fired: {}", rule.project_name);
    let body = alert_body(rule, matched_count, sample);
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO notifications (
                id, workspace_id, monitor_id, incident_id, kind, title, body, created_at
            )
            VALUES ($1, $2, NULL, NULL, $3, $4, $5, $6)
            "#,
            vec![
                notification_id.into(),
                rule.workspace_id.into(),
                NOTIFICATION_KIND_LOG_ALERT_FIRED.into(),
                title.clone().into(),
                body.clone().into(),
                now.into(),
            ],
        ))
        .await?;

    let channels = ChannelRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT id, kind, webhook_url
        FROM notification_channels
        WHERE workspace_id = $1
          AND enabled = true
        ORDER BY created_at
        LIMIT $2
        "#,
        vec![
            rule.workspace_id.into(),
            MAX_WEBHOOK_DELIVERIES_PER_ALERT.into(),
        ],
    ))
    .all(&state.db)
    .await?;

    let payload = WebhookPayload {
        kind: "log_alert_fired".to_string(),
        workspace_id: rule.workspace_id,
        monitor_id: None,
        monitor_name: format!("Log project: {}", rule.project_name),
        incident_id: None,
        title,
        body,
        occurred_at: now,
    };

    for channel in channels {
        let state = state.clone();
        let payload = payload.clone();
        let delivery = ChannelDelivery {
            id: channel.id,
            kind: channel.kind,
            webhook_url: channel.webhook_url,
        };
        tokio::spawn(async move {
            if let Err(error) = notification_webhook::deliver_and_record(
                &state,
                notification_id,
                &delivery,
                &payload,
                now,
            )
            .await
            {
                tracing::warn!(error = ?error, notification_id = %notification_id, "log alert webhook delivery failed");
            }
        });
    }

    Ok(())
}

async fn mark_rule_evaluated(
    state: &AppState,
    rule_id: Uuid,
    now: DateTime<FixedOffset>,
    fired: bool,
) -> anyhow::Result<()> {
    let sql = if fired {
        r#"
        UPDATE log_alert_rules
        SET last_evaluated_at = $2,
            last_fired_at = $2,
            updated_at = now()
        WHERE id = $1
        "#
    } else {
        r#"
        UPDATE log_alert_rules
        SET last_evaluated_at = $2,
            updated_at = now()
        WHERE id = $1
        "#
    };
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            sql,
            vec![rule_id.into(), now.into()],
        ))
        .await?;
    Ok(())
}

fn storage_options(state: &AppState, rule: &AlertRuleRow) -> Option<LogStoreOptions> {
    let storage_uri = rule
        .storage_uri
        .as_ref()
        .map(|value| value.trim().trim_end_matches('/').to_owned())
        .filter(|value| !value.is_empty())?;
    Some(LogStoreOptions {
        storage_uri,
        duckdb_path: state
            .config
            .log_duckdb_path
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned()),
        s3_region: rule
            .region
            .clone()
            .or_else(|| state.config.log_s3_region.clone()),
        s3_endpoint: rule
            .endpoint
            .clone()
            .or_else(|| state.config.log_s3_endpoint.clone()),
        s3_access_key_id: rule
            .access_key_id
            .clone()
            .or_else(|| state.config.log_s3_access_key_id.clone()),
        s3_secret_access_key: rule
            .secret_access_key
            .clone()
            .or_else(|| state.config.log_s3_secret_access_key.clone()),
    })
}

fn clean_query(query: &str) -> Option<String> {
    let query = query.trim();
    if query.is_empty() {
        None
    } else {
        Some(query.to_owned())
    }
}

fn outside_cooldown(rule: &AlertRuleRow, now: DateTime<FixedOffset>) -> bool {
    let Some(last_fired_at) = rule.last_fired_at else {
        return true;
    };
    last_fired_at + Duration::seconds(rule.window_seconds.max(60) as i64) <= now
}

fn alert_body(rule: &AlertRuleRow, matched_count: i64, sample: Option<&SearchEvent>) -> String {
    let mut body = format!(
        "{matched_count} matching log events in the last {} seconds",
        rule.window_seconds
    );
    if let Some(level) = rule.level.as_deref() {
        body.push_str(&format!(" at level {level}"));
    }
    if !rule.query.trim().is_empty() {
        body.push_str(&format!(" for query {:?}", rule.query.trim()));
    }
    if let Some(sample) = sample {
        body.push_str(&format!(". Sample: {}", sample.message));
    }
    body
}
