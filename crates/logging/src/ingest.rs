use anyhow::{bail, Result};
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::store::LogEvent;

pub fn normalize_payload(payload: &serde_json::Value, max_events: usize) -> Result<Vec<LogEvent>> {
    let raw_events = if let Some(events) = payload.get("events").and_then(|v| v.as_array()) {
        events.iter().collect::<Vec<_>>()
    } else if let Some(batch) = payload.get("batch").and_then(|v| v.as_array()) {
        batch.iter().collect::<Vec<_>>()
    } else {
        vec![payload]
    };

    if raw_events.len() > max_events {
        bail!("too many log events; max batch is {max_events}");
    }

    let now_ms = Utc::now().timestamp_millis();
    raw_events
        .into_iter()
        .map(|raw| normalize_event(raw, now_ms))
        .collect()
}

fn normalize_event(raw: &serde_json::Value, received_at_ms: i64) -> Result<LogEvent> {
    let event = raw.get("event").unwrap_or(raw);
    let event_obj = event.as_object();
    let timestamp_ms = timestamp_ms(event)
        .or_else(|| timestamp_ms(raw))
        .unwrap_or(received_at_ms);
    let level = string_field(event, &["level", "severity"])
        .unwrap_or_else(|| "info".to_string())
        .to_ascii_lowercase();
    let message = string_field(event, &["message", "msg"])
        .or_else(|| {
            event
                .get("error")
                .and_then(|error| string_field(error, &["message", "name"]))
        })
        .unwrap_or_else(|| "log event".to_string());
    let request = raw.get("request");
    let service = string_field(event, &["service", "service_name"])
        .or_else(|| string_field(raw, &["service", "service_name"]));
    let environment = string_field(event, &["environment", "env"])
        .or_else(|| string_field(raw, &["environment", "env"]));
    let operation = string_field(event, &["operation", "op", "route", "path"])
        .or_else(|| request.and_then(|v| string_field(v, &["operation", "path"])));
    let request_id = string_field(event, &["request_id", "requestId"])
        .or_else(|| request.and_then(|v| string_field(v, &["request_id", "requestId"])));
    let trace_id = string_field(event, &["trace_id", "traceId"]);
    let source = string_field(raw, &["source"]).unwrap_or_else(|| "evlog".to_string());
    let fields = if let Some(obj) = event_obj {
        serde_json::Value::Object(obj.clone())
    } else {
        event.clone()
    };

    Ok(LogEvent {
        event_id: Uuid::now_v7().to_string(),
        ts_ms: timestamp_ms,
        received_at_ms,
        level: clean_level(Some(level))?.unwrap_or_else(|| "info".to_string()),
        message: truncate(message, 16_000),
        service: service.map(|v| truncate(v, 256)),
        environment: environment.map(|v| truncate(v, 128)),
        operation: operation.map(|v| truncate(v, 512)),
        request_id: request_id.map(|v| truncate(v, 256)),
        trace_id: trace_id.map(|v| truncate(v, 256)),
        source: truncate(source, 128),
        event_json: serde_json::to_string(raw).unwrap_or_else(|_| "{}".to_string()),
        fields_json: serde_json::to_string(&fields).unwrap_or_else(|_| "{}".to_string()),
    })
}

fn string_field(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value
            .get(*key)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(ToOwned::to_owned)
    })
}

fn timestamp_ms(value: &serde_json::Value) -> Option<i64> {
    for key in ["timestamp", "time", "ts", "date"] {
        let Some(v) = value.get(key) else {
            continue;
        };
        if let Some(n) = v.as_i64() {
            return Some(if n.abs() < 100_000_000_000 {
                n * 1000
            } else {
                n
            });
        }
        if let Some(f) = v.as_f64() {
            return Some(if f.abs() < 100_000_000_000.0 {
                (f * 1000.0) as i64
            } else {
                f as i64
            });
        }
        if let Some(s) = v.as_str() {
            if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
                return Some(dt.timestamp_millis());
            }
            if let Ok(n) = s.parse::<i64>() {
                return Some(if n.abs() < 100_000_000_000 {
                    n * 1000
                } else {
                    n
                });
            }
        }
    }
    None
}

pub fn clean_level(level: Option<String>) -> Result<Option<String>> {
    let Some(level) = level
        .map(|v| v.trim().to_ascii_lowercase())
        .filter(|v| !v.is_empty())
    else {
        return Ok(None);
    };
    let normalized = match level.as_str() {
        "trace" | "debug" | "info" | "warn" | "warning" | "error" | "fatal" => {
            if level == "warning" {
                "warn".to_string()
            } else {
                level
            }
        }
        _ => bail!("invalid log level"),
    };
    Ok(Some(normalized))
}

fn truncate(mut value: String, max: usize) -> String {
    if value.len() <= max {
        return value;
    }
    while value.len() > max {
        value.pop();
    }
    value
}
