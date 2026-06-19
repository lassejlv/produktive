//! Grafana Loki-backed log storage.
//!
//! Loki is plain async HTTP/JSON, so this module talks to it directly via the
//! shared [`reqwest::Client`] — no blocking, no `spawn_blocking`, no SDK.
//!
//! - Writes go through Loki's push API (`/loki/api/v1/push`) as JSON streams.
//! - Reads use `query_range` with a LogQL selector; the free-text `q` filter is
//!   a LogQL line filter.
//! - The 24h count uses the instant `query` endpoint with `count_over_time`.
//!
//! LogQL label values and line-filter strings are interpolated into the query
//! string, so every interpolated value MUST be escaped via [`logql_str`] (LogQL
//! quoted-string escaping) and, for the regex line filter, [`regex_escape`].
//! reqwest's query builder handles the surrounding URL percent-encoding.

use std::sync::Arc;

use chrono::{DateTime, FixedOffset, TimeZone, Utc};
use reqwest::{Client, StatusCode};
use serde_json::{json, Value};

use crate::error::{ApiError, ApiResult};
use crate::http::logs::{LogSearchEvent, LogSearchQuery};

/// Constant stream label identifying produktive log streams in Loki.
const APP_LABEL: &str = "produktive-logs";

/// Loki-backed log store. Cheap to clone (everything is behind an [`Arc`] or is
/// a shared `reqwest::Client`).
#[derive(Clone)]
pub struct LokiLogs {
    inner: Arc<Inner>,
}

struct Inner {
    /// Base URL without a trailing slash, e.g.
    /// `http://loki-railway.railway.internal:3100`.
    base_url: String,
    /// Optional tenant; sent as `X-Scope-OrgID` when present (harmless when
    /// Loki has `auth_enabled = false`).
    tenant: Option<String>,
    http: Client,
}

/// A normalized log event ready to be written to Loki. Produced by the ingest
/// handler from the raw JSON/NDJSON payload. (Field set is unchanged from the
/// prior backend; the ingest normalization code in `logs.rs` builds it.)
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
    /// JSON-encoded structured fields.
    pub fields_json: String,
}

impl LokiLogs {
    /// Build a Loki-backed log store over the shared async HTTP client.
    /// `base_url` is the Loki HTTP endpoint; `tenant` (optional) is sent as
    /// `X-Scope-OrgID` on every request.
    pub fn new(base_url: &str, tenant: Option<String>, http: Client) -> anyhow::Result<Self> {
        let base_url = base_url.trim().trim_end_matches('/').to_owned();
        if base_url.is_empty() {
            return Err(anyhow::anyhow!("Loki base URL must not be empty"));
        }
        Ok(Self {
            inner: Arc::new(Inner {
                base_url,
                tenant: tenant.filter(|t| !t.trim().is_empty()),
                http,
            }),
        })
    }

    /// Attach the optional tenant header to a request builder.
    fn with_tenant(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match &self.inner.tenant {
            Some(t) => req.header("X-Scope-OrgID", t),
            None => req,
        }
    }

    /// Write a batch of normalized events for a single project. `project_id` is
    /// the Postgres `log_projects.id` (UUID string) — the tenant/scope label.
    /// Returns the number of accepted events.
    pub async fn ingest_events(
        &self,
        project_id: &str,
        events: &[NormalizedEvent],
    ) -> ApiResult<usize> {
        if events.is_empty() {
            return Ok(0);
        }
        let body = build_push_body(project_id, events);
        let url = format!("{}/loki/api/v1/push", self.inner.base_url);
        let req = self
            .with_tenant(self.inner.http.post(&url))
            .json(&body)
            .send();

        let resp = req.await.map_err(|e| {
            tracing::error!(error = %e, "Loki push request failed");
            ApiError::service_unavailable("log storage is unavailable")
        })?;

        let status = resp.status();
        if status == StatusCode::NO_CONTENT || status.is_success() {
            return Ok(events.len());
        }
        let body = resp.text().await.unwrap_or_default();
        tracing::error!(status = %status, body = %body, "Loki push returned an error");
        Err(ApiError::service_unavailable("log storage is unavailable"))
    }

    /// Search a single project's events via `query_range`. Equality filters
    /// become LogQL label selectors; the free-text `q` becomes a
    /// case-insensitive line filter.
    pub async fn search(
        &self,
        project_id: &str,
        params: &LogSearchQuery,
    ) -> ApiResult<Vec<LogSearchEvent>> {
        let limit = params.limit.unwrap_or(250).clamp(1, 1000);
        let logql = build_logql(project_id, params);

        // Default window: last 24h. start/end are UNIX nanoseconds.
        let now = Utc::now();
        let start_ns = params
            .from
            .map(|d| d.timestamp_nanos_opt().unwrap_or(0))
            .unwrap_or_else(|| {
                (now - chrono::Duration::hours(24))
                    .timestamp_nanos_opt()
                    .unwrap_or(0)
            });
        let end_ns = params
            .to
            .map(|d| d.timestamp_nanos_opt().unwrap_or(0))
            .unwrap_or_else(|| now.timestamp_nanos_opt().unwrap_or(0));

        let url = format!("{}/loki/api/v1/query_range", self.inner.base_url);
        let req = self.with_tenant(self.inner.http.get(&url)).query(&[
            ("query", logql.as_str()),
            ("start", start_ns.to_string().as_str()),
            ("end", end_ns.to_string().as_str()),
            ("limit", limit.to_string().as_str()),
            ("direction", "backward"),
        ]);

        let resp = req.send().await.map_err(|e| {
            tracing::error!(error = %e, "Loki query_range request failed");
            ApiError::service_unavailable("log storage is unavailable")
        })?;

        let status = resp.status();
        let text = resp.text().await.map_err(|e| {
            tracing::error!(error = %e, "failed to read Loki query_range body");
            ApiError::service_unavailable("log storage is unavailable")
        })?;
        if !status.is_success() {
            tracing::error!(status = %status, body = %text, "Loki query_range returned an error");
            return Err(ApiError::service_unavailable("log storage is unavailable"));
        }

        let json: Value = serde_json::from_str(&text).map_err(|e| {
            tracing::error!(error = %e, "failed to parse Loki query_range JSON");
            ApiError::service_unavailable("log storage is unavailable")
        })?;

        let mut events = parse_query_range(&json);
        // Loki returns newest-first per stream, but we merge across streams.
        events.sort_by_key(|e| std::cmp::Reverse(e.timestamp));
        events.truncate(limit as usize);
        Ok(events)
    }

    /// Count events for a project since `since_ms` (used for `event_count_24h`).
    /// Fails open (returns 0) on any error so a transient hiccup never blocks
    /// the project listing.
    pub async fn count_recent(&self, project_id: &str, _since_ms: i64) -> ApiResult<i64> {
        let query = format!(
            "sum(count_over_time({{{}}}[24h]))",
            base_selector(project_id)
        );
        let url = format!("{}/loki/api/v1/query", self.inner.base_url);
        let req = self
            .with_tenant(self.inner.http.get(&url))
            .query(&[("query", query.as_str())]);

        let resp = match req.send().await {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!(error = %e, "Loki count query failed");
                return Ok(0);
            }
        };
        if !resp.status().is_success() {
            return Ok(0);
        }
        let json: Value = match resp.json().await {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!(error = %e, "failed to parse Loki count JSON");
                return Ok(0);
            }
        };
        Ok(parse_count_vector(&json))
    }
}

// --- Query construction -------------------------------------------------

/// The base LogQL label selector inner-body (no surrounding braces):
/// `app="produktive-logs", project_id="<esc>"`.
fn base_selector(project_id: &str) -> String {
    format!(
        "app={}, project_id={}",
        logql_str(APP_LABEL),
        logql_str(project_id),
    )
}

/// Build the full LogQL query for a search: base selector + optional
/// level/service/environment label equality + optional `q` line filter.
fn build_logql(project_id: &str, params: &LogSearchQuery) -> String {
    let mut selector = base_selector(project_id);
    if let Some(level) = non_empty(params.level.as_deref()) {
        selector.push_str(&format!(", level={}", logql_str(level)));
    }
    if let Some(service) = non_empty(params.service.as_deref()) {
        selector.push_str(&format!(", service={}", logql_str(service)));
    }
    // `environment` is also a stream label and would be added here if the search
    // API gained an `environment` filter param.
    let mut query = format!("{{{selector}}}");
    if let Some(q) = params.q.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        // Loki has no case-insensitive `|=`, so use a regex line filter with the
        // inline `(?i)` flag over the regex-escaped substring.
        let pattern = format!("(?i){}", regex_escape(q));
        query.push_str(&format!(" |~ {}", logql_str(&pattern)));
    }
    query
}

/// Build the Loki push request body from a batch of events for one project.
/// Events are grouped into streams keyed by their label set
/// `(project_id, level, service?, environment?)`; within each stream the values
/// are sorted ascending by timestamp.
fn build_push_body(project_id: &str, events: &[NormalizedEvent]) -> Value {
    use std::collections::BTreeMap;

    // Key streams by an ordered, fully-rendered label map so equal label sets
    // collapse into one stream.
    type StreamKey = Vec<(String, String)>;
    let mut streams: BTreeMap<StreamKey, Vec<(i64, String)>> = BTreeMap::new();

    for e in events {
        let mut labels: Vec<(String, String)> = vec![
            ("app".to_owned(), APP_LABEL.to_owned()),
            ("project_id".to_owned(), project_id.to_owned()),
            ("level".to_owned(), e.level.clone()),
        ];
        if let Some(s) = e.service.as_deref().filter(|s| !s.is_empty()) {
            labels.push(("service".to_owned(), s.to_owned()));
        }
        if let Some(env) = e.environment.as_deref().filter(|s| !s.is_empty()) {
            labels.push(("environment".to_owned(), env.to_owned()));
        }

        let line = build_log_line(e);
        streams.entry(labels).or_default().push((e.ts_ms, line));
    }

    let streams_json: Vec<Value> = streams
        .into_iter()
        .map(|(labels, mut values)| {
            // Sort ascending by timestamp within the stream.
            values.sort_by_key(|(ts, _)| *ts);
            let label_obj: serde_json::Map<String, Value> = labels
                .into_iter()
                .map(|(k, v)| (k, Value::String(v)))
                .collect();
            let value_arr: Vec<Value> = values
                .into_iter()
                .map(|(ts_ms, line)| json!([ms_to_ns_string_i64(ts_ms), line]))
                .collect();
            json!({ "stream": Value::Object(label_obj), "values": value_arr })
        })
        .collect();

    json!({ "streams": streams_json })
}

/// Build the JSON log line carrying everything that is not a stream label, so a
/// search can fully reconstruct a `LogSearchEvent`.
fn build_log_line(e: &NormalizedEvent) -> String {
    let fields: Value = serde_json::from_str(&e.fields_json).unwrap_or(Value::Null);
    let line = json!({
        "event_id": e.event_id,
        "message": e.message,
        "received_at": e.received_at_ms,
        "operation": e.operation,
        "request_id": e.request_id,
        "trace_id": e.trace_id,
        "source": e.source,
        "fields": fields,
        "value": Value::Null,
    });
    serde_json::to_string(&line).unwrap_or_else(|_| "{}".to_owned())
}

// --- Response parsing ---------------------------------------------------

/// Parse a Loki `query_range` streams response into search events.
fn parse_query_range(json: &Value) -> Vec<LogSearchEvent> {
    let Some(result) = json
        .get("data")
        .and_then(|d| d.get("result"))
        .and_then(|r| r.as_array())
    else {
        return Vec::new();
    };

    let mut events = Vec::new();
    for stream in result {
        let labels = stream.get("stream");
        let level_lbl = label(labels, "level");
        let service_lbl = label(labels, "service");
        let environment_lbl = label(labels, "environment");

        let Some(values) = stream.get("values").and_then(|v| v.as_array()) else {
            continue;
        };
        for entry in values {
            let Some(arr) = entry.as_array() else {
                continue;
            };
            let Some(ts_ns) = arr.first().and_then(|v| v.as_str()) else {
                continue;
            };
            let line = arr.get(1).and_then(|v| v.as_str()).unwrap_or("");
            if let Some(ev) = build_event(
                ts_ns,
                line,
                level_lbl.clone(),
                service_lbl.clone(),
                environment_lbl.clone(),
            ) {
                events.push(ev);
            }
        }
    }
    events
}

/// Reconstruct a `LogSearchEvent` from a Loki entry: timestamp (ns string), the
/// JSON log line, and the labels we set (level/service/environment).
fn build_event(
    ts_ns: &str,
    line: &str,
    level_lbl: Option<String>,
    service_lbl: Option<String>,
    environment_lbl: Option<String>,
) -> Option<LogSearchEvent> {
    let ts_ns: i64 = ts_ns.trim().parse().ok()?;
    let timestamp = ns_to_dt(ts_ns);

    let body: Value = serde_json::from_str(line).unwrap_or(Value::Null);

    let received_ms = body
        .get("received_at")
        .and_then(Value::as_i64)
        .unwrap_or(ts_ns / 1_000_000);

    let fields = body
        .get("fields")
        .cloned()
        .filter(|v| !v.is_null())
        .unwrap_or_else(|| Value::Object(Default::default()));

    Some(LogSearchEvent {
        event_id: line_str(&body, "event_id").unwrap_or_default(),
        timestamp,
        received_at: ms_to_dt(received_ms),
        level: level_lbl
            .or_else(|| line_str(&body, "level"))
            .unwrap_or_else(|| "info".to_owned()),
        message: line_str(&body, "message").unwrap_or_default(),
        service: service_lbl.or_else(|| line_str(&body, "service")),
        environment: environment_lbl.or_else(|| line_str(&body, "environment")),
        operation: line_str(&body, "operation"),
        request_id: line_str(&body, "request_id"),
        trace_id: line_str(&body, "trace_id"),
        source: line_str(&body, "source").unwrap_or_else(|| "evlog".to_owned()),
        event: fields.clone(),
        fields,
    })
}

/// Pull a stream label value by key.
fn label(labels: Option<&Value>, key: &str) -> Option<String> {
    labels
        .and_then(|l| l.get(key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
}

/// Pull a non-empty string field out of a parsed log line.
fn line_str(body: &Value, key: &str) -> Option<String> {
    body.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
}

/// Parse the instant `query` vector response into a count, defaulting to 0.
fn parse_count_vector(json: &Value) -> i64 {
    json.get("data")
        .and_then(|d| d.get("result"))
        .and_then(|r| r.as_array())
        .and_then(|arr| arr.first())
        .and_then(|m| m.get("value"))
        .and_then(|v| v.as_array())
        .and_then(|v| v.get(1))
        .and_then(Value::as_str)
        .and_then(|s| s.trim().parse::<f64>().ok())
        .map(|f| f as i64)
        .unwrap_or(0)
}

// --- Escaping & conversions ---------------------------------------------

/// Escape a string into a double-quoted LogQL string literal. Backslashes and
/// double-quotes are backslash-escaped. e.g. `a"b` => `"a\"b"`.
fn logql_str(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for ch in value.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            _ => out.push(ch),
        }
    }
    out.push('"');
    out
}

/// Escape regex metacharacters so a free-text `q` is matched literally inside a
/// LogQL `|~` line filter.
fn regex_escape(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        if matches!(
            ch,
            '.' | '^' | '$' | '*' | '+' | '?' | '(' | ')' | '[' | ']' | '{' | '}' | '|' | '\\'
        ) {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|s| !s.is_empty())
}

/// Format epoch-ms as a UNIX-nanoseconds decimal string (Loki entry timestamp).
fn ms_to_ns_string_i64(ms: i64) -> String {
    (ms * 1_000_000).to_string()
}

/// Convert epoch-ms to a fixed-offset (UTC) datetime.
fn ms_to_dt(ms: i64) -> DateTime<FixedOffset> {
    Utc.timestamp_millis_opt(ms)
        .single()
        .unwrap_or_else(|| Utc.timestamp_nanos(0))
        .fixed_offset()
}

/// Convert epoch-ns to a fixed-offset (UTC) datetime.
fn ns_to_dt(ns: i64) -> DateTime<FixedOffset> {
    Utc.timestamp_nanos(ns).fixed_offset()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn logql_str_escapes_quotes_and_backslashes() {
        assert_eq!(logql_str("plain"), "\"plain\"");
        // A value with both a double-quote and a backslash.
        assert_eq!(logql_str("a\"b"), "\"a\\\"b\"");
        assert_eq!(logql_str("c\\d"), "\"c\\\\d\"");
        assert_eq!(logql_str("x\\\"y"), "\"x\\\\\\\"y\"");
    }

    #[test]
    fn regex_escape_escapes_metachars() {
        assert_eq!(regex_escape("a.b*c"), "a\\.b\\*c");
        assert_eq!(regex_escape("(x)[y]"), "\\(x\\)\\[y\\]");
        assert_eq!(regex_escape("plain"), "plain");
    }

    #[test]
    fn build_logql_includes_filters_and_line_filter() {
        let params = LogSearchQuery {
            from: None,
            to: None,
            q: Some("oo.ps".to_owned()),
            level: Some("error".to_owned()),
            service: Some("api".to_owned()),
            limit: None,
        };
        let q = build_logql("proj-1", &params);
        assert!(q.contains("app=\"produktive-logs\""));
        assert!(q.contains("project_id=\"proj-1\""));
        assert!(q.contains("level=\"error\""));
        assert!(q.contains("service=\"api\""));
        // Case-insensitive regex line filter: `q` regex-escapes the `.` to
        // `\.`, then logql_str escapes that backslash again, so the rendered
        // LogQL string is `"(?i)oo\\.ps"`.
        assert!(q.contains("|~ \"(?i)oo\\\\.ps\""), "actual: {q}");
    }

    #[test]
    fn build_logql_omits_empty_filters() {
        let params = LogSearchQuery {
            from: None,
            to: None,
            q: None,
            level: Some("  ".to_owned()),
            service: None,
            limit: None,
        };
        let q = build_logql("proj-1", &params);
        assert!(!q.contains("level="));
        assert!(!q.contains("|~"));
    }

    #[test]
    fn build_push_body_groups_streams_and_sorts() {
        let events = vec![
            NormalizedEvent {
                event_id: "e2".to_owned(),
                ts_ms: 2000,
                received_at_ms: 2001,
                level: "error".to_owned(),
                message: "second".to_owned(),
                service: Some("api".to_owned()),
                environment: None,
                operation: None,
                request_id: None,
                trace_id: None,
                source: "evlog".to_owned(),
                fields_json: "{\"a\":1}".to_owned(),
            },
            NormalizedEvent {
                event_id: "e1".to_owned(),
                ts_ms: 1000,
                received_at_ms: 1001,
                level: "error".to_owned(),
                message: "first".to_owned(),
                service: Some("api".to_owned()),
                environment: None,
                operation: None,
                request_id: None,
                trace_id: None,
                source: "evlog".to_owned(),
                fields_json: "{}".to_owned(),
            },
        ];
        let body = build_push_body("proj-1", &events);
        let streams = body.get("streams").unwrap().as_array().unwrap();
        // Same label set -> a single stream.
        assert_eq!(streams.len(), 1);
        let stream = &streams[0];
        let labels = stream.get("stream").unwrap();
        assert_eq!(labels.get("app").unwrap(), "produktive-logs");
        assert_eq!(labels.get("project_id").unwrap(), "proj-1");
        assert_eq!(labels.get("level").unwrap(), "error");
        assert_eq!(labels.get("service").unwrap(), "api");
        // No environment label (omitted when empty).
        assert!(labels.get("environment").is_none());

        let values = stream.get("values").unwrap().as_array().unwrap();
        assert_eq!(values.len(), 2);
        // Sorted ascending by ts: ts_ms 1000 -> 1_000_000_000 ns first.
        assert_eq!(values[0][0], "1000000000");
        assert_eq!(values[1][0], "2000000000");
    }

    #[test]
    fn parse_query_range_builds_events_from_labels_and_line() {
        let line = json!({
            "event_id": "evt1",
            "message": "boom",
            "received_at": 1_710_000_000_500_i64,
            "operation": "GET /",
            "request_id": "req1",
            "trace_id": "trace1",
            "source": "evlog",
            "fields": { "a": 1 },
            "value": Value::Null,
        })
        .to_string();
        let resp = json!({
            "status": "success",
            "data": {
                "resultType": "streams",
                "result": [{
                    "stream": {
                        "app": "produktive-logs",
                        "project_id": "proj-1",
                        "level": "error",
                        "service": "api",
                        "environment": "prod",
                        // Loki auto-added labels we ignore:
                        "detected_level": "error",
                        "service_name": "api",
                    },
                    "values": [[ "1710000000000000000", line ]],
                }]
            }
        });
        let events = parse_query_range(&resp);
        assert_eq!(events.len(), 1);
        let e = &events[0];
        assert_eq!(e.event_id, "evt1");
        assert_eq!(e.message, "boom");
        // level/service/environment come from labels.
        assert_eq!(e.level, "error");
        assert_eq!(e.service.as_deref(), Some("api"));
        assert_eq!(e.environment.as_deref(), Some("prod"));
        assert_eq!(e.operation.as_deref(), Some("GET /"));
        assert_eq!(e.request_id.as_deref(), Some("req1"));
        assert_eq!(e.trace_id.as_deref(), Some("trace1"));
        assert_eq!(e.source, "evlog");
        // ns -> ms.
        assert_eq!(e.timestamp.timestamp_millis(), 1_710_000_000_000);
        assert_eq!(e.received_at.timestamp_millis(), 1_710_000_000_500);
        assert!(e.fields.is_object());
    }

    #[test]
    fn parse_query_range_empty_result_is_empty() {
        let resp =
            json!({ "status": "success", "data": { "resultType": "streams", "result": [] } });
        assert!(parse_query_range(&resp).is_empty());
    }

    #[test]
    fn parse_count_vector_reads_value() {
        let resp = json!({
            "status": "success",
            "data": {
                "resultType": "vector",
                "result": [{ "metric": {}, "value": [1710000000.0, "42"] }]
            }
        });
        assert_eq!(parse_count_vector(&resp), 42);
    }

    #[test]
    fn parse_count_vector_empty_is_zero() {
        let resp = json!({ "data": { "resultType": "vector", "result": [] } });
        assert_eq!(parse_count_vector(&resp), 0);
    }
}
