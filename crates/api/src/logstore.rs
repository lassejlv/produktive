//! NarrowDB-backed log storage.
//!
//! Wraps the blocking [`narrowdb_sdk::Client`] in async methods that run every
//! call inside [`tokio::task::spawn_blocking`] (the SDK uses `ureq`, not tokio).
//! The client is held behind an [`Arc`] so it is `Send + Sync + 'static`.
//!
//! All writes go through the SDK's JSON ingest path (`ingest_rows`), which is
//! injection-safe. Reads go through `/sql` with RAW SQL text, so every
//! interpolated string literal MUST be escaped via [`sql_literal`]. The free-text
//! `q` filter is applied in Rust after fetching (NarrowDB SQL has no `LIKE`).

use std::sync::Arc;

use chrono::{DateTime, FixedOffset, TimeZone, Utc};
use narrowdb_sdk::Client;
use serde_json::Value;

use crate::error::{ApiError, ApiResult};
use crate::http::logs::{LogSearchEvent, LogSearchQuery};

/// NarrowDB table that holds every workspace's logs (multi-tenant, partitioned
/// by `project_id`).
const TABLE: &str = "app_logs";

/// Column order as registered in the cluster's `app_logs` table. Ingest rows
/// MUST match this order exactly.
const COLUMNS: [&str; 14] = [
    "ts",
    "project_id",
    "event_id",
    "received_at",
    "level",
    "service",
    "environment",
    "operation",
    "request_id",
    "trace_id",
    "source",
    "message",
    "value",
    "fields",
];

/// A normalized log event ready to be written to NarrowDB. Produced by the
/// ingest handler from the raw JSON/NDJSON payload.
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
    /// JSON-encoded structured fields (the `fields` column holds JSON text).
    pub fields_json: String,
}

#[derive(Clone)]
pub struct NarrowLogs {
    client: Arc<Client>,
}

impl NarrowLogs {
    /// Build a NarrowDB-backed log store. Returns `None` when either the URL or
    /// the token is missing, so the caller can fall back to the disabled path.
    pub fn new(url: &str, token: &str) -> anyhow::Result<Self> {
        let client = Client::builder(url)
            .bearer_token(token.to_owned())
            .build()
            .map_err(|e| anyhow::anyhow!("failed to build NarrowDB client: {e}"))?;
        Ok(Self {
            client: Arc::new(client),
        })
    }

    /// Write a batch of normalized events for a single project. `project_id` is
    /// the Postgres `log_projects.id` (UUID string) — the tenant partition key.
    pub async fn ingest_events(
        &self,
        project_id: &str,
        events: &[NormalizedEvent],
    ) -> ApiResult<usize> {
        if events.is_empty() {
            return Ok(0);
        }
        let client = self.client.clone();
        let project_id = project_id.to_owned();
        let rows: Vec<Vec<Value>> = events.iter().map(|e| ingest_row(&project_id, e)).collect();

        let summary = tokio::task::spawn_blocking(move || client.ingest_rows(TABLE, COLUMNS, rows))
            .await
            .map_err(|e| ApiError::Internal(anyhow::anyhow!("ingest task panicked: {e}")))?
            .map_err(|e| {
                tracing::error!(error = %e, "NarrowDB ingest failed");
                ApiError::service_unavailable("log storage is unavailable")
            })?;

        // The summary reports the accepted row count; fall back to the input
        // length when the gateway does not echo `rows=`.
        Ok(summary.rows.unwrap_or(events.len()))
    }

    /// Search a single project's events. Equality/range filters are pushed into
    /// SQL; the free-text `q` is applied in Rust (no `LIKE` in NarrowDB SQL).
    pub async fn search(
        &self,
        project_id: &str,
        params: &LogSearchQuery,
    ) -> ApiResult<Vec<LogSearchEvent>> {
        let limit = params.limit.unwrap_or(250).clamp(1, 1000);
        // Over-fetch when a free-text filter is present, since it is applied
        // after the SQL fetch and would otherwise shrink the page.
        let q = params
            .q
            .as_ref()
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty());
        let fetch_limit = if q.is_some() {
            (limit * 4).min(2000)
        } else {
            limit
        };

        let mut where_parts = vec![format!("project_id = {}", sql_literal(project_id))];
        if let Some(level) = params
            .level
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            where_parts.push(format!("level = {}", sql_literal(level)));
        }
        if let Some(service) = params
            .service
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            where_parts.push(format!("service = {}", sql_literal(service)));
        }
        if let Some(from) = params.from {
            where_parts.push(format!("ts >= {}", from.timestamp_millis()));
        }
        if let Some(to) = params.to {
            where_parts.push(format!("ts < {}", to.timestamp_millis()));
        }

        // Select free-text columns (message, fields) LAST so that, even if a
        // value contains an embedded tab/newline that corrupts naive tab
        // parsing, only the trailing columns are affected.
        let sql = format!(
            "SELECT ts, project_id, event_id, received_at, level, service, environment, \
             operation, request_id, trace_id, source, value, message, fields \
             FROM {TABLE} WHERE {} ORDER BY ts DESC LIMIT {fetch_limit}",
            where_parts.join(" AND "),
        );

        let client = self.client.clone();
        let response = tokio::task::spawn_blocking(move || client.sql(sql))
            .await
            .map_err(|e| ApiError::Internal(anyhow::anyhow!("search task panicked: {e}")))?
            .map_err(|e| {
                tracing::error!(error = %e, "NarrowDB search failed");
                ApiError::service_unavailable("log storage is unavailable")
            })?;

        let mut events = parse_rows(response.as_str());
        if let Some(q) = q {
            events.retain(|e| e.message.to_lowercase().contains(&q));
        }
        events.truncate(limit as usize);
        Ok(events)
    }

    /// Count events for a project since `since_ms` (used for `event_count_24h`).
    pub async fn count_recent(&self, project_id: &str, since_ms: i64) -> ApiResult<i64> {
        let sql = format!(
            "SELECT count(*) FROM {TABLE} WHERE project_id = {} AND ts >= {since_ms}",
            sql_literal(project_id),
        );
        let client = self.client.clone();
        let response = tokio::task::spawn_blocking(move || client.sql(sql))
            .await
            .map_err(|e| ApiError::Internal(anyhow::anyhow!("count task panicked: {e}")))?
            .map_err(|e| {
                tracing::warn!(error = %e, "NarrowDB count failed");
                ApiError::service_unavailable("log storage is unavailable")
            })?;
        Ok(parse_scalar_i64(response.as_str()).unwrap_or(0))
    }
}

/// Build one ingest row in `COLUMNS` order. Optional fields become JSON null.
fn ingest_row(project_id: &str, e: &NormalizedEvent) -> Vec<Value> {
    vec![
        Value::from(e.ts_ms),
        Value::from(project_id),
        Value::from(e.event_id.as_str()),
        Value::from(e.received_at_ms),
        Value::from(e.level.as_str()),
        opt_str(&e.service),
        opt_str(&e.environment),
        opt_str(&e.operation),
        opt_str(&e.request_id),
        opt_str(&e.trace_id),
        Value::from(e.source.as_str()),
        Value::from(e.message.as_str()),
        Value::Null, // value (f64) — unused for plain log events
        Value::from(e.fields_json.as_str()),
    ]
}

fn opt_str(v: &Option<String>) -> Value {
    match v {
        Some(s) => Value::from(s.as_str()),
        None => Value::Null,
    }
}

/// Escape a string into a fully-quoted SQL literal by doubling single quotes.
/// Returns e.g. `'it''s'`. Use for EVERY interpolated string in raw SQL.
fn sql_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

/// Convert epoch-ms to a fixed-offset (UTC) datetime.
fn ms_to_dt(ms: i64) -> DateTime<FixedOffset> {
    Utc.timestamp_millis_opt(ms)
        .single()
        .unwrap_or_else(|| Utc.timestamp_nanos(0))
        .fixed_offset()
}

/// Parse the tab-separated `/sql` response into search events.
///
/// Format: lines starting with `--` are comments; the first non-comment line is
/// the tab-separated header; following lines are tab-separated values. Columns
/// are selected in a fixed order (message, fields LAST) so a stray tab/newline
/// in those free-text columns can only corrupt trailing fields.
fn parse_rows(text: &str) -> Vec<LogSearchEvent> {
    let mut lines = text
        .lines()
        .filter(|l| !l.trim_start().starts_with("--"))
        .filter(|l| !l.trim().is_empty());

    // Skip the header row.
    if lines.next().is_none() {
        return Vec::new();
    }

    lines.filter_map(parse_row).collect()
}

/// Column indexes match the SELECT in `search`:
/// 0 ts, 1 project_id, 2 event_id, 3 received_at, 4 level, 5 service,
/// 6 environment, 7 operation, 8 request_id, 9 trace_id, 10 source, 11 value,
/// 12 message, 13 fields.
fn parse_row(line: &str) -> Option<LogSearchEvent> {
    let cols: Vec<&str> = line.split('\t').collect();
    if cols.len() < 13 {
        return None;
    }
    let ts_ms = cols[0].trim().parse::<i64>().ok()?;
    let received_ms = cols
        .get(3)
        .and_then(|v| v.trim().parse::<i64>().ok())
        .unwrap_or(ts_ms);
    let fields_raw = cols.get(13).copied().unwrap_or("");

    Some(LogSearchEvent {
        event_id: cell(cols.get(2)).unwrap_or_default(),
        timestamp: ms_to_dt(ts_ms),
        received_at: ms_to_dt(received_ms),
        level: cell(cols.get(4)).unwrap_or_else(|| "info".to_owned()),
        message: cols.get(12).map(|v| (*v).to_owned()).unwrap_or_default(),
        service: cell(cols.get(5)),
        environment: cell(cols.get(6)),
        operation: cell(cols.get(7)),
        request_id: cell(cols.get(8)),
        trace_id: cell(cols.get(9)),
        source: cell(cols.get(10)).unwrap_or_else(|| "evlog".to_owned()),
        event: parse_json_cell(fields_raw),
        fields: parse_json_cell(fields_raw),
    })
}

/// A non-empty, non-NULL trimmed cell value.
fn cell(value: Option<&&str>) -> Option<String> {
    value
        .map(|v| v.trim())
        .filter(|v| !v.is_empty() && *v != "NULL")
        .map(ToOwned::to_owned)
}

/// Parse a `fields` cell (JSON text) into a JSON value, defaulting to `{}`.
fn parse_json_cell(raw: &str) -> Value {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "NULL" {
        return Value::Object(Default::default());
    }
    serde_json::from_str(trimmed).unwrap_or_else(|_| Value::Object(Default::default()))
}

/// Parse a single-column, single-row scalar response (e.g. `count(*)`).
fn parse_scalar_i64(text: &str) -> Option<i64> {
    let mut lines = text
        .lines()
        .filter(|l| !l.trim_start().starts_with("--"))
        .filter(|l| !l.trim().is_empty());
    let _header = lines.next()?;
    let value = lines.next()?;
    value.split('\t').next()?.trim().parse::<i64>().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_single_quotes() {
        assert_eq!(sql_literal("it's"), "'it''s'");
        assert_eq!(sql_literal("plain"), "'plain'");
    }

    #[test]
    fn parses_tab_separated_rows() {
        let text = "-- comment\n\
            ts\tproject_id\tevent_id\treceived_at\tlevel\tservice\tenvironment\toperation\trequest_id\ttrace_id\tsource\tvalue\tmessage\tfields\n\
            1710000000000\tproj\tevt1\t1710000000500\terror\tapi\tprod\tGET /\treq1\ttrace1\tevlog\tNULL\tboom\t{\"a\":1}";
        let rows = parse_rows(text);
        assert_eq!(rows.len(), 1);
        let r = &rows[0];
        assert_eq!(r.event_id, "evt1");
        assert_eq!(r.level, "error");
        assert_eq!(r.message, "boom");
        assert_eq!(r.service.as_deref(), Some("api"));
        assert_eq!(r.timestamp.timestamp_millis(), 1710000000000);
    }

    #[test]
    fn parses_scalar_count() {
        assert_eq!(parse_scalar_i64("count\n42\n"), Some(42));
        assert_eq!(parse_scalar_i64("-- x\ncount\n7"), Some(7));
    }
}
