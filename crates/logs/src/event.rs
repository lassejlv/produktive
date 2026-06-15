use serde::{Serialize, Serializer};
use serde_json::{Map, Value};

/// A single structured log event.
///
/// Mirrors the TypeScript SDK's open `LogEvent` shape: a few well-known fields
/// plus arbitrary structured data. It serializes to a flat JSON object, so
/// custom fields land at the top level alongside `level`, `message`, etc.
///
/// ```
/// use produktive_logs::LogEvent;
///
/// let event = LogEvent::new()
///     .level("info")
///     .message("checkout started")
///     .field("request_id", "req_123");
/// # let _ = event;
/// ```
#[derive(Debug, Clone, Default, PartialEq)]
pub struct LogEvent {
    fields: Map<String, Value>,
}

impl LogEvent {
    /// An empty event.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set an arbitrary field. Later writes to the same key win.
    pub fn field(self, key: impl Into<String>, value: impl Into<Value>) -> Self {
        self.with(key, value.into())
    }

    /// `level` (e.g. `info`, `warn`, `error`).
    pub fn level(self, level: impl Into<String>) -> Self {
        self.with("level", level.into())
    }

    /// `severity` — the evlog-style alias for `level`.
    pub fn severity(self, severity: impl Into<String>) -> Self {
        self.with("severity", severity.into())
    }

    /// `message`.
    pub fn message(self, message: impl Into<String>) -> Self {
        self.with("message", message.into())
    }

    /// `service`.
    pub fn service(self, service: impl Into<String>) -> Self {
        self.with("service", service.into())
    }

    /// `environment`.
    pub fn environment(self, environment: impl Into<String>) -> Self {
        self.with("environment", environment.into())
    }

    /// `source`.
    pub fn source(self, source: impl Into<String>) -> Self {
        self.with("source", source.into())
    }

    /// `timestamp` as an RFC 3339 / ISO-8601 string.
    pub fn timestamp(self, timestamp: impl Into<String>) -> Self {
        self.with("timestamp", timestamp.into())
    }

    /// Attach a Rust error as a structured `error` object
    /// (`{ message, source? }`), matching the JS serializer's intent.
    pub fn error<E: std::error::Error + ?Sized>(self, error: &E) -> Self {
        self.with("error", error_to_value(error))
    }

    /// Attach an already-serialized error value under `error`.
    pub fn error_value(self, value: impl Into<Value>) -> Self {
        self.with("error", value.into())
    }

    /// Set `timestamp` to the current UTC time (RFC 3339).
    pub fn timestamp_now(self) -> Self {
        self.with("timestamp", Value::String(chrono::Utc::now().to_rfc3339()))
    }

    /// True when no fields are set.
    pub fn is_empty(&self) -> bool {
        self.fields.is_empty()
    }

    /// Read a field.
    pub fn get(&self, key: &str) -> Option<&Value> {
        self.fields.get(key)
    }

    /// Merge `other` on top of `self`; `other`'s fields win on conflict.
    pub fn merge(mut self, other: LogEvent) -> Self {
        for (key, value) in other.fields {
            self.fields.insert(key, value);
        }
        self
    }

    /// Set `timestamp` from the first of `timestamp`/`time`/`ts` already
    /// present, falling back to now. Used when normalizing evlog events.
    pub(crate) fn resolve_timestamp(mut self) -> Self {
        if let Some(value) = ["timestamp", "time", "ts"]
            .iter()
            .find_map(|key| self.fields.get(*key).cloned())
        {
            self.fields.insert("timestamp".into(), value);
        } else {
            self.fields.insert(
                "timestamp".into(),
                Value::String(chrono::Utc::now().to_rfc3339()),
            );
        }
        self
    }

    fn with(mut self, key: impl Into<String>, value: impl Into<Value>) -> Self {
        self.fields.insert(key.into(), value.into());
        self
    }
}

impl Serialize for LogEvent {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        self.fields.serialize(serializer)
    }
}

impl From<Map<String, Value>> for LogEvent {
    fn from(fields: Map<String, Value>) -> Self {
        LogEvent { fields }
    }
}

fn error_to_value<E: std::error::Error + ?Sized>(error: &E) -> Value {
    let mut object = Map::new();
    object.insert("message".into(), Value::String(error.to_string()));
    if let Some(source) = error.source() {
        object.insert("source".into(), Value::String(source.to_string()));
    }
    Value::Object(object)
}
