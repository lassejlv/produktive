//! TimescaleDB-backed log event storage.
//!
//! Log events live in a dedicated Postgres/TimescaleDB (`log_events` hypertable).
//! Metadata (projects, tokens) stays on the main app database.

use chrono::{DateTime, Duration, FixedOffset, TimeZone, Utc};
use sea_orm::{ConnectionTrait, DatabaseBackend, DatabaseConnection, Statement, TransactionTrait, Value};
use serde_json::Value as JsonValue;
use uuid::Uuid;

use crate::error::{ApiError, ApiResult};
use crate::http::logs::{LogSearchEvent, LogSearchQuery};

/// A normalized log event ready to be written. Built by the ingest handler.
#[derive(Debug, Clone)]
pub struct NormalizedEvent {
    pub event_id: String,
    pub ts_ms: i64,
    pub received_at_ms: i64,
    pub level: String,
    pub message: String,
    pub service: Option<String>,
    pub environment: Option<String>,
    pub operation: Option<String>,
    pub request_id: Option<String>,
    pub trace_id: Option<String>,
    pub source: String,
    pub fields_json: String,
}

#[derive(Debug, Clone, Default)]
pub struct LogStats24h {
    pub event_count: i64,
    pub bytes_ingested: i64,
    pub last_ingested_at: Option<DateTime<FixedOffset>>,
}

#[derive(Clone)]
pub struct LogStore {
    db: DatabaseConnection,
}

impl LogStore {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    /// Write a batch of normalized events for a single project.
    pub async fn ingest_events(
        &self,
        workspace_id: Uuid,
        project_id: Uuid,
        events: &[NormalizedEvent],
    ) -> ApiResult<usize> {
        if events.is_empty() {
            return Ok(0);
        }

        let txn = self.db.begin().await.map_err(|e| {
            tracing::error!(error = %e, "log ingest transaction begin failed");
            ApiError::service_unavailable("log storage is unavailable")
        })?;

        for e in events {
            let fields: JsonValue = serde_json::from_str(&e.fields_json)
                .unwrap_or(JsonValue::Object(Default::default()));
            txn.execute(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                r#"
                INSERT INTO log_events (
                    time, received_at, project_id, workspace_id, event_id,
                    level, message, service, environment, operation,
                    request_id, trace_id, source, fields
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                "#,
                [
                    ms_to_dt(e.ts_ms).into(),
                    ms_to_dt(e.received_at_ms).into(),
                    project_id.into(),
                    workspace_id.into(),
                    e.event_id.clone().into(),
                    e.level.clone().into(),
                    e.message.clone().into(),
                    e.service.clone().into(),
                    e.environment.clone().into(),
                    e.operation.clone().into(),
                    e.request_id.clone().into(),
                    e.trace_id.clone().into(),
                    e.source.clone().into(),
                    fields.into(),
                ],
            ))
            .await
            .map_err(|err| {
                tracing::error!(error = %err, "log event insert failed");
                ApiError::service_unavailable("log storage is unavailable")
            })?;
        }

        txn.commit().await.map_err(|e| {
            tracing::error!(error = %e, "log ingest transaction commit failed");
            ApiError::service_unavailable("log storage is unavailable")
        })?;

        Ok(events.len())
    }

    /// Search a single project's events.
    pub async fn search(
        &self,
        project_id: Uuid,
        params: &LogSearchQuery,
    ) -> ApiResult<Vec<LogSearchEvent>> {
        let limit = params.limit.unwrap_or(250).clamp(1, 1000);
        let (from, to) = search_time_range(params);

        let mut sql = String::from(
            r#"
            SELECT event_id, time, received_at, level, message,
                   service, environment, operation, request_id, trace_id,
                   source, fields
            FROM log_events
            WHERE project_id = $1
              AND time >= $2
              AND time <= $3
            "#,
        );
        let mut values: Vec<Value> = vec![project_id.into(), from.into(), to.into()];
        let mut param_idx = 4;

        if let Some(level) = non_empty(params.level.as_deref()) {
            sql.push_str(&format!(" AND lower(level) = lower(${param_idx})"));
            values.push(level.to_owned().into());
            param_idx += 1;
        }
        if let Some(service) = non_empty(params.service.as_deref()) {
            sql.push_str(&format!(" AND lower(service) = lower(${param_idx})"));
            values.push(service.to_owned().into());
            param_idx += 1;
        }
        if let Some(q) = params.q.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            let pattern = ilike_contains(q);
            sql.push_str(&format!(
                " AND (message ILIKE ${param_idx} ESCAPE '\\' OR fields::text ILIKE ${param_idx} ESCAPE '\\')"
            ));
            values.push(pattern.into());
            param_idx += 1;
        }

        sql.push_str(&format!(" ORDER BY time DESC LIMIT ${param_idx}"));
        values.push((limit as i64).into());

        let rows = self
            .db
            .query_all(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                &sql,
                values,
            ))
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "log search query failed");
                ApiError::service_unavailable("log storage is unavailable")
            })?;

        let mut events = Vec::with_capacity(rows.len());
        for row in rows {
            let fields: JsonValue = row.try_get("", "fields").unwrap_or(JsonValue::Null);
            events.push(LogSearchEvent {
                event_id: row.try_get("", "event_id").unwrap_or_default(),
                timestamp: row.try_get("", "time").unwrap_or_else(|_| Utc::now().fixed_offset()),
                received_at: row
                    .try_get("", "received_at")
                    .unwrap_or_else(|_| Utc::now().fixed_offset()),
                level: row.try_get("", "level").unwrap_or_else(|_| "info".to_owned()),
                message: row.try_get("", "message").unwrap_or_default(),
                service: row.try_get("", "service").ok(),
                environment: row.try_get("", "environment").ok(),
                operation: row.try_get("", "operation").ok(),
                request_id: row.try_get("", "request_id").ok(),
                trace_id: row.try_get("", "trace_id").ok(),
                source: row
                    .try_get("", "source")
                    .unwrap_or_else(|_| "evlog".to_owned()),
                event: fields.clone(),
                fields,
            });
        }
        Ok(events)
    }

    /// 24h stats for a project listing. Fails open on error.
    pub async fn stats_24h(&self, project_id: Uuid, since_ms: i64) -> ApiResult<LogStats24h> {
        let since = ms_to_dt(since_ms);
        let row = self
            .db
            .query_one(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                r#"
                SELECT
                    COUNT(*)::bigint AS event_count,
                    COALESCE(SUM(octet_length(message) + octet_length(fields::text)), 0)::bigint AS bytes_ingested,
                    MAX(time) AS last_ingested_at
                FROM log_events
                WHERE project_id = $1
                  AND time >= $2
                "#,
                [project_id.into(), since.into()],
            ))
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "log stats query failed");
                ApiError::service_unavailable("log storage is unavailable")
            })?;

        match row {
            Some(row) => Ok(LogStats24h {
                event_count: row.try_get("", "event_count").unwrap_or(0),
                bytes_ingested: row.try_get("", "bytes_ingested").unwrap_or(0),
                last_ingested_at: row.try_get("", "last_ingested_at").ok(),
            }),
            None => Ok(LogStats24h::default()),
        }
    }

    /// Delete all events for a project (called before metadata deletion).
    pub async fn delete_project_events(&self, project_id: Uuid) -> ApiResult<u64> {
        let result = self
            .db
            .execute(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                "DELETE FROM log_events WHERE project_id = $1",
                [project_id.into()],
            ))
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "log project delete failed");
                ApiError::service_unavailable("log storage is unavailable")
            })?;
        Ok(result.rows_affected())
    }

    /// Delete events older than `retention_days` for a project, in chunks.
    pub async fn delete_expired_events(
        &self,
        project_id: Uuid,
        retention_days: i32,
    ) -> ApiResult<u64> {
        let mut total = 0u64;
        loop {
            let result = self
                .db
                .execute(Statement::from_sql_and_values(
                    DatabaseBackend::Postgres,
                    r#"
                    DELETE FROM log_events
                    WHERE ctid IN (
                        SELECT ctid
                        FROM log_events
                        WHERE project_id = $1
                          AND time < now() - ($2::text || ' days')::interval
                        LIMIT 10000
                    )
                    "#,
                    [project_id.into(), retention_days.into()],
                ))
                .await
                .map_err(|e| {
                    tracing::error!(error = %e, "log retention delete failed");
                    ApiError::service_unavailable("log storage is unavailable")
                })?;
            total += result.rows_affected();
            if result.rows_affected() == 0 {
                break;
            }
        }
        Ok(total)
    }
}

fn search_time_range(params: &LogSearchQuery) -> (DateTime<FixedOffset>, DateTime<FixedOffset>) {
    let now = Utc::now().fixed_offset();
    let from = params
        .from
        .unwrap_or_else(|| (Utc::now() - Duration::hours(24)).fixed_offset());
    let to = params.to.unwrap_or(now);
    (from, to)
}

fn ms_to_dt(ms: i64) -> DateTime<FixedOffset> {
    Utc.timestamp_millis_opt(ms)
        .single()
        .unwrap_or_else(|| Utc.timestamp_nanos(0))
        .fixed_offset()
}

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|s| !s.is_empty())
}

/// Escape `%` and `_` for use in a SQL ILIKE pattern with `\` escape char.
pub fn ilike_contains(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('%');
    for ch in value.chars() {
        match ch {
            '%' | '_' | '\\' => {
                out.push('\\');
                out.push(ch);
            }
            _ => out.push(ch),
        }
    }
    out.push('%');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ilike_contains_escapes_wildcards() {
        assert_eq!(ilike_contains("plain"), "%plain%");
        assert_eq!(ilike_contains("100%"), "%100\\%%");
        assert_eq!(ilike_contains("a_b"), "%a\\_b%");
        assert_eq!(ilike_contains("back\\slash"), "%back\\\\slash%");
    }

    #[test]
    fn search_time_range_defaults_to_24h() {
        let params = LogSearchQuery {
            from: None,
            to: None,
            q: None,
            level: None,
            service: None,
            limit: None,
        };
        let (from, to) = search_time_range(&params);
        let diff = to.signed_duration_since(from);
        assert!(diff.num_hours() >= 23 && diff.num_hours() <= 25);
    }
}
