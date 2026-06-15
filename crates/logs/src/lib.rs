//! Produktive log ingestion SDK for Rust.
//!
//! A thin async client over `POST /api/logs/ingest`, mirroring the TypeScript
//! SDK (`@produktive/logs`): a low-level [`LogClient`], a structured [`Logger`]
//! with per-level helpers, and an evlog-friendly [`EvlogSink`]. The default base
//! URL is `https://produktive.app` and the ingest token is sent in the
//! `x-produktive-log-token` header.
//!
//! ```no_run
//! use produktive_logs::{create_logger, LogClientBuilder, LogEvent};
//!
//! # async fn run() -> produktive_logs::Result<()> {
//! let logger = create_logger(
//!     LogClientBuilder::default().token(std::env::var("PRODUKTIVE_LOG_TOKEN").unwrap()),
//!     LogEvent::new().service("api").environment("production"),
//! )?;
//!
//! logger
//!     .info("checkout started", LogEvent::new().field("request_id", "req_123"))
//!     .await?;
//! # Ok(())
//! # }
//! ```

mod client;
mod error;
mod event;
mod evlog;
mod logger;

pub use client::{
    IngestResponse, LogClient, LogClientBuilder, DEFAULT_BASE_URL, INGEST_TOKEN_HEADER,
};
pub use error::{LogError, Result};
pub use event::LogEvent;
pub use evlog::{normalize_evlog_event, EvlogInput, EvlogSink};
pub use logger::Logger;

/// Create a low-level [`LogClient`] from a configured builder.
pub fn create_log_client(builder: LogClientBuilder) -> Result<LogClient> {
    builder.build()
}

/// Create a structured [`Logger`] directly from a builder and default fields.
pub fn create_logger(builder: LogClientBuilder, defaults: LogEvent) -> Result<Logger> {
    Ok(builder.build()?.logger(defaults))
}

/// Create an [`EvlogSink`] directly from a builder and default fields.
pub fn create_evlog_sink(builder: LogClientBuilder, defaults: LogEvent) -> Result<EvlogSink> {
    Ok(EvlogSink::new(builder.build()?, defaults))
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    use super::*;

    /// A throwaway HTTP/1.1 server that answers one request, returning the raw
    /// request text so tests can assert on headers and body.
    fn spawn_server(status: u16, body: &'static str) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = [0_u8; 8192];
            let read = stream.read(&mut buffer).unwrap();
            let request = String::from_utf8_lossy(&buffer[..read]).to_string();
            let response = format!(
                "HTTP/1.1 {status} OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{body}",
                body.len()
            );
            stream.write_all(response.as_bytes()).unwrap();
            request
        });
        (format!("http://{addr}"), handle)
    }

    fn body_of(request: &str) -> &str {
        request.split("\r\n\r\n").nth(1).unwrap_or("")
    }

    #[test]
    fn defaults_to_the_production_base_url() {
        let client = LogClient::new("plog_test").unwrap();
        assert_eq!(client.base_url(), DEFAULT_BASE_URL);
    }

    #[test]
    fn empty_token_is_rejected() {
        assert!(matches!(LogClient::new("   "), Err(LogError::MissingToken)));
    }

    #[tokio::test]
    async fn sends_the_ingest_token_header_and_event_body() {
        let (base_url, handle) = spawn_server(200, r#"{"accepted":1,"project_id":"project"}"#);
        let client = LogClient::builder()
            .token("plog_secret")
            .base_url(format!("{base_url}/"))
            .build()
            .unwrap();

        let response = client
            .ingest(LogEvent::new().level("info").message("hello"))
            .await
            .unwrap();
        let request = handle.join().unwrap();
        let lower = request.to_ascii_lowercase();

        assert_eq!(response.accepted, 1);
        assert_eq!(response.project_id, "project");
        assert!(request.starts_with("POST /api/logs/ingest HTTP/1.1"));
        assert!(lower.contains("x-produktive-log-token: plog_secret"));
        let body: serde_json::Value = serde_json::from_str(body_of(&request)).unwrap();
        assert_eq!(
            body,
            serde_json::json!({ "level": "info", "message": "hello" })
        );
    }

    #[tokio::test]
    async fn wraps_batches_in_an_events_envelope() {
        let (base_url, handle) = spawn_server(200, r#"{"accepted":2,"project_id":"project"}"#);
        let client = LogClient::builder()
            .token("plog_secret")
            .base_url(base_url)
            .build()
            .unwrap();

        let response = client
            .ingest_batch(vec![
                LogEvent::new().level("info").message("one"),
                LogEvent::new().level("warn").message("two"),
            ])
            .await
            .unwrap();
        let request = handle.join().unwrap();

        assert_eq!(response.accepted, 2);
        let body: serde_json::Value = serde_json::from_str(body_of(&request)).unwrap();
        assert_eq!(
            body,
            serde_json::json!({
                "events": [
                    { "level": "info", "message": "one" },
                    { "level": "warn", "message": "two" },
                ]
            })
        );
    }

    #[tokio::test]
    async fn serializes_errors_as_structured_objects() {
        let (base_url, handle) = spawn_server(200, r#"{"accepted":1,"project_id":"project"}"#);
        let client = LogClient::builder()
            .token("plog_secret")
            .base_url(base_url)
            .build()
            .unwrap();

        let boom = std::io::Error::other("boom");
        client
            .ingest(
                LogEvent::new()
                    .level("error")
                    .message("failed")
                    .timestamp("2026-06-15T10:00:00.000Z")
                    .error(&boom),
            )
            .await
            .unwrap();
        let request = handle.join().unwrap();

        let body: serde_json::Value = serde_json::from_str(body_of(&request)).unwrap();
        assert_eq!(body["timestamp"], "2026-06-15T10:00:00.000Z");
        assert_eq!(body["error"]["message"], "boom");
    }

    #[tokio::test]
    async fn maps_failed_ingest_to_a_typed_error() {
        let (base_url, handle) = spawn_server(401, "bad token");
        let client = LogClient::builder()
            .token("plog_secret")
            .base_url(base_url)
            .build()
            .unwrap();

        let error = client
            .ingest(LogEvent::new().message("hello"))
            .await
            .unwrap_err();
        let _ = handle.join().unwrap();

        assert_eq!(error.status().map(|s| s.as_u16()), Some(401));
        assert_eq!(error.body(), Some("bad token"));
    }

    #[tokio::test]
    async fn logger_merges_defaults_and_stamps_a_timestamp() {
        let (base_url, handle) = spawn_server(200, r#"{"accepted":1,"project_id":"project"}"#);
        let client = LogClient::builder()
            .token("plog_secret")
            .base_url(base_url)
            .build()
            .unwrap();
        let logger = client.logger(LogEvent::new().service("api").environment("production"));

        logger
            .info(
                "checkout started",
                LogEvent::new().field("request_id", "req_123"),
            )
            .await
            .unwrap();
        let request = handle.join().unwrap();

        let body: serde_json::Value = serde_json::from_str(body_of(&request)).unwrap();
        assert_eq!(body["service"], "api");
        assert_eq!(body["environment"], "production");
        assert_eq!(body["level"], "info");
        assert_eq!(body["message"], "checkout started");
        assert_eq!(body["request_id"], "req_123");
        assert!(body["timestamp"].is_string());
    }

    #[test]
    fn normalizes_string_evlog_events() {
        let event = normalize_evlog_event("started", LogEvent::new().service("worker"));
        assert_eq!(event.get("service").unwrap(), "worker");
        assert_eq!(event.get("level").unwrap(), "info");
        assert_eq!(event.get("message").unwrap(), "started");
        assert!(event.get("timestamp").unwrap().is_string());
    }

    #[test]
    fn normalizes_structured_evlog_events() {
        let event = normalize_evlog_event(
            LogEvent::new()
                .field("msg", "checkout failed")
                .severity("error"),
            LogEvent::new().service("api"),
        );
        assert_eq!(event.get("service").unwrap(), "api");
        assert_eq!(event.get("msg").unwrap(), "checkout failed");
        assert_eq!(event.get("severity").unwrap(), "error");
    }

    #[tokio::test]
    async fn evlog_sink_ingests_normalized_events() {
        let (base_url, handle) = spawn_server(200, r#"{"accepted":1,"project_id":"project"}"#);
        let sink = create_evlog_sink(
            LogClient::builder().token("plog_secret").base_url(base_url),
            LogEvent::new().service("worker"),
        )
        .unwrap();

        sink.send("started").await.unwrap();
        let request = handle.join().unwrap();

        let body: serde_json::Value = serde_json::from_str(body_of(&request)).unwrap();
        assert_eq!(body["service"], "worker");
        assert_eq!(body["level"], "info");
        assert_eq!(body["message"], "started");
    }
}
