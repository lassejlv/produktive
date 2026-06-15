use crate::{client::IngestResponse, client::LogClient, event::LogEvent, Result};

/// Input accepted by an [`EvlogSink`]. Strings become `info` messages;
/// structured events are merged onto the sink's defaults as-is.
#[derive(Debug, Clone)]
pub enum EvlogInput {
    Message(String),
    Event(LogEvent),
}

impl From<&str> for EvlogInput {
    fn from(message: &str) -> Self {
        EvlogInput::Message(message.to_string())
    }
}

impl From<String> for EvlogInput {
    fn from(message: String) -> Self {
        EvlogInput::Message(message)
    }
}

impl From<LogEvent> for EvlogInput {
    fn from(event: LogEvent) -> Self {
        EvlogInput::Event(event)
    }
}

/// An evlog-friendly async sink: hand it strings or structured [`LogEvent`]s and
/// it normalizes them (defaulting `level`/`timestamp`) before ingesting.
///
/// Mirrors the TypeScript `createEvlogSink`, which returns a function usable as a
/// sink/transport handler.
#[derive(Clone, Debug)]
pub struct EvlogSink {
    client: LogClient,
    defaults: LogEvent,
}

impl EvlogSink {
    pub fn new(client: LogClient, defaults: LogEvent) -> Self {
        Self { client, defaults }
    }

    /// Normalize and ingest a single event.
    pub async fn send(&self, event: impl Into<EvlogInput>) -> Result<IngestResponse> {
        let event = normalize_evlog_event(event, self.defaults.clone());
        self.client.ingest(event).await
    }
}

/// Normalize an evlog-style input into a [`LogEvent`] layered over `defaults`.
///
/// - A bare string becomes `level: "info"` with that message.
/// - A structured event is merged on top of the defaults verbatim.
///
/// In both cases `timestamp` is resolved from the event (`timestamp`/`time`/`ts`)
/// or set to now.
pub fn normalize_evlog_event(event: impl Into<EvlogInput>, defaults: LogEvent) -> LogEvent {
    let event = match event.into() {
        EvlogInput::Message(message) => LogEvent::new().level("info").message(message),
        EvlogInput::Event(event) => event,
    };
    defaults.merge(event).resolve_timestamp()
}
