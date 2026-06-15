pub mod http_check;
pub mod icmp_check;
pub mod postgres_check;
pub mod redis_check;
pub mod ssh_check;
pub mod target;
pub mod tcp_check;

use std::{net::SocketAddr, time::Duration};

use entity::monitor::{self, MonitorKind};
use produktive_dsl as dsl;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProbeSpec {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub slug: String,
    pub name: String,
    pub kind: MonitorKind,
    pub target: String,
    pub interval_seconds: i32,
    pub timeout_ms: i32,
    pub expected_status: Option<i32>,
    pub expected_body_contains: Option<String>,
    pub dsl_source: Option<String>,
}

impl From<monitor::Model> for ProbeSpec {
    fn from(m: monitor::Model) -> Self {
        Self {
            id: m.id,
            workspace_id: m.workspace_id,
            slug: m.slug,
            name: m.name,
            kind: m.kind,
            target: m.target,
            interval_seconds: m.interval_seconds,
            timeout_ms: m.timeout_ms,
            expected_status: m.expected_status,
            expected_body_contains: m.expected_body_contains,
            dsl_source: m.dsl_source,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProbeOutcome {
    pub status: i16,
    pub latency_ms: Option<i32>,
    pub status_code: Option<i32>,
    pub error: Option<String>,
    pub body: Option<String>,
    pub headers: Option<serde_json::Map<String, serde_json::Value>>,
}

impl ProbeOutcome {
    pub fn compact(self) -> Self {
        Self {
            body: None,
            headers: None,
            ..self
        }
    }
}

pub async fn run(client: &Client, spec: &ProbeSpec, max_body_bytes: usize) -> ProbeOutcome {
    let validated_target = match target::validate_spec(spec).await {
        Ok(target) => target,
        Err(e) => {
            return ProbeOutcome {
                status: 0,
                latency_ms: None,
                status_code: None,
                error: Some(e),
                body: None,
                headers: None,
            };
        }
    };
    let timeout = Duration::from_millis(spec.timeout_ms as u64);
    let dsl_doc = parse_monitor_dsl(spec);
    let capture_body = dsl_doc.is_some();
    let raw = match (&spec.kind, validated_target) {
        (MonitorKind::Http, target::ValidatedTarget::Http(target)) => {
            let request_headers = match dsl_doc.as_ref().map(resolve_request_headers).transpose() {
                Ok(headers) => headers.unwrap_or_default(),
                Err(e) => {
                    return ProbeOutcome {
                        status: 0,
                        latency_ms: None,
                        status_code: None,
                        error: Some(e),
                        body: None,
                        headers: None,
                    };
                }
            };
            http_check::run(
                client,
                spec,
                &target,
                timeout,
                max_body_bytes,
                capture_body,
                &request_headers,
            )
            .await
        }
        (MonitorKind::Tcp, target::ValidatedTarget::Tcp(addrs)) => match first_addr(&addrs) {
            Some(addr) => tcp_check::run(addr, timeout).await,
            None => unresolved_target_outcome(),
        },
        (MonitorKind::Ping, target::ValidatedTarget::Ping(addrs)) => match first_addr(&addrs) {
            Some(addr) => icmp_check::run(addr, timeout).await,
            None => unresolved_target_outcome(),
        },
        (MonitorKind::Postgres, target::ValidatedTarget::Tcp(addrs)) => match first_addr(&addrs) {
            Some(_) => {
                let query = dsl_doc
                    .as_ref()
                    .and_then(|doc| dsl::project(doc).query)
                    .unwrap_or_else(|| "SELECT 1".to_owned());
                postgres_check::run(&spec.target, &query, timeout).await
            }
            None => unresolved_target_outcome(),
        },
        (MonitorKind::Redis, target::ValidatedTarget::Tcp(addrs)) => match first_addr(&addrs) {
            Some(_) => {
                let command = dsl_doc
                    .as_ref()
                    .and_then(|doc| dsl::project(doc).command)
                    .unwrap_or_else(|| "PING".to_owned());
                redis_check::run(&spec.target, &command, timeout).await
            }
            None => unresolved_target_outcome(),
        },
        (MonitorKind::Ssh, target::ValidatedTarget::Tcp(addrs)) => match first_addr(&addrs) {
            Some(addr) => ssh_check::run(addr, timeout).await,
            None => unresolved_target_outcome(),
        },
        _ => ProbeOutcome {
            status: 0,
            latency_ms: None,
            status_code: None,
            error: Some("target validation did not match monitor kind".into()),
            body: None,
            headers: None,
        },
    };
    apply_rules(spec, raw, dsl_doc.as_ref())
}

fn first_addr(addrs: &[SocketAddr]) -> Option<SocketAddr> {
    addrs.first().copied()
}

fn unresolved_target_outcome() -> ProbeOutcome {
    ProbeOutcome {
        status: 0,
        latency_ms: None,
        status_code: None,
        error: Some("target host could not be resolved".into()),
        body: None,
        headers: None,
    }
}

fn apply_rules(
    spec: &ProbeSpec,
    raw: ProbeOutcome,
    dsl_doc: Option<&dsl::Document>,
) -> ProbeOutcome {
    let Some(doc) = dsl_doc else {
        return raw;
    };
    if doc.rules.is_empty() {
        return raw;
    }
    let body_str = raw.body.clone().unwrap_or_default();
    let json_body =
        serde_json::from_str::<serde_json::Value>(&body_str).unwrap_or(serde_json::Value::Null);
    let result = serde_json::json!({
        "status": raw.status_code,
        "latency_ms": raw.latency_ms,
        "body": body_str,
        "error": raw.error,
        "headers": raw.headers.clone().unwrap_or_default(),
        "json": json_body,
    });
    let monitor_ctx = serde_json::json!({
        "kind": monitor_kind_name(&spec.kind),
        "target": spec.target,
        "interval_seconds": spec.interval_seconds,
    });
    let ctx = dsl::Context::new()
        .put("result", result)
        .put("monitor", monitor_ctx);
    let outcome = match dsl::eval_rules(&doc.rules, &ctx) {
        Some(o) => o,
        None => return raw,
    };
    let (status, default_err): (i16, Option<String>) = match outcome.kind {
        dsl::OutcomeKind::Ok => (1, None),
        dsl::OutcomeKind::Warn => (2, raw.error.clone()),
        dsl::OutcomeKind::Down => (0, raw.error.clone()),
    };
    ProbeOutcome {
        status,
        latency_ms: raw.latency_ms,
        status_code: raw.status_code,
        error: outcome.message.or(default_err),
        body: raw.body,
        headers: raw.headers,
    }
}

fn parse_monitor_dsl(spec: &ProbeSpec) -> Option<dsl::Document> {
    let source = spec.dsl_source.as_ref()?;
    match dsl::parse(source) {
        Ok(doc) => Some(doc),
        Err(e) => {
            tracing::warn!(
                error = ?e.message,
                line = e.line,
                col = e.col,
                monitor_id = %spec.id,
                "dsl parse failed at probe eval"
            );
            None
        }
    }
}

fn resolve_request_headers(doc: &dsl::Document) -> Result<Vec<(String, String)>, String> {
    dsl::project(doc)
        .headers
        .into_iter()
        .map(|(name, value)| {
            let value = match value {
                dsl::ProjectedHeaderValue::Literal(value) => value,
                dsl::ProjectedHeaderValue::Env(_) => {
                    return Err(format!("header `{name}` cannot use env()"));
                }
            };
            Ok((name, value))
        })
        .collect()
}

pub fn monitor_kind_name(kind: &MonitorKind) -> &'static str {
    match kind {
        MonitorKind::Http => "http",
        MonitorKind::Tcp => "tcp",
        MonitorKind::Ping => "ping",
        MonitorKind::Postgres => "postgres",
        MonitorKind::Redis => "redis",
        MonitorKind::Ssh => "ssh",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_literal_request_headers_from_dsl() {
        let doc = dsl::parse(
            r#"
type http
set params.config {
  url: "https://example.com"
  headers: {
    "x-api-key": "secret"
  }
}
"#,
        )
        .expect("parse");

        let headers = resolve_request_headers(&doc).expect("headers");
        assert_eq!(
            headers,
            vec![("x-api-key".to_string(), "secret".to_string())]
        );
    }

    #[test]
    fn rejects_env_request_headers_from_stored_dsl() {
        std::env::set_var("PRODUKTIVE_PROBE_TEST_SECRET", "should-not-leak");
        let doc = dsl::parse(
            r#"
type http
set params.config {
  url: "https://example.com"
  headers: {
    "x-api-key": env("PRODUKTIVE_PROBE_TEST_SECRET")
  }
}
"#,
        )
        .expect("parse");

        let err = resolve_request_headers(&doc).expect_err("env headers must be rejected");
        assert_eq!(err, "header `x-api-key` cannot use env()");
        std::env::remove_var("PRODUKTIVE_PROBE_TEST_SECRET");
    }
}
