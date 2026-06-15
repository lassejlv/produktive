use crate::{client::IngestResponse, client::LogClient, event::LogEvent, Result};

/// A structured logger that merges default fields into every event and stamps a
/// `timestamp` at send time. Cheap to clone — it shares the underlying client.
#[derive(Clone, Debug)]
pub struct Logger {
    client: LogClient,
    defaults: LogEvent,
}

impl Logger {
    pub fn new(client: LogClient, defaults: LogEvent) -> Self {
        Self { client, defaults }
    }

    /// Send an event at `level` with `message` and extra `fields`.
    /// Pass [`LogEvent::new`](crate::LogEvent::new) when there are no extra fields.
    pub async fn log(
        &self,
        level: impl Into<String>,
        message: impl Into<String>,
        fields: LogEvent,
    ) -> Result<IngestResponse> {
        let event = self
            .defaults
            .clone()
            .merge(fields)
            .level(level)
            .message(message)
            .timestamp_now();
        self.client.ingest(event).await
    }

    pub async fn trace(
        &self,
        message: impl Into<String>,
        fields: LogEvent,
    ) -> Result<IngestResponse> {
        self.log("trace", message, fields).await
    }

    pub async fn debug(
        &self,
        message: impl Into<String>,
        fields: LogEvent,
    ) -> Result<IngestResponse> {
        self.log("debug", message, fields).await
    }

    pub async fn info(
        &self,
        message: impl Into<String>,
        fields: LogEvent,
    ) -> Result<IngestResponse> {
        self.log("info", message, fields).await
    }

    pub async fn warn(
        &self,
        message: impl Into<String>,
        fields: LogEvent,
    ) -> Result<IngestResponse> {
        self.log("warn", message, fields).await
    }

    pub async fn error(
        &self,
        message: impl Into<String>,
        fields: LogEvent,
    ) -> Result<IngestResponse> {
        self.log("error", message, fields).await
    }

    pub async fn fatal(
        &self,
        message: impl Into<String>,
        fields: LogEvent,
    ) -> Result<IngestResponse> {
        self.log("fatal", message, fields).await
    }

    /// Derive a child logger whose defaults extend this logger's.
    pub fn child(&self, defaults: LogEvent) -> Logger {
        Logger {
            client: self.client.clone(),
            defaults: self.defaults.clone().merge(defaults),
        }
    }
}
