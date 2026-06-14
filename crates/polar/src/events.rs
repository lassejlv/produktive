use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{Metadata, Polar, Result};

#[derive(Clone, Debug)]
pub struct EventsClient {
    polar: Polar,
}

impl EventsClient {
    pub(crate) fn new(polar: Polar) -> Self {
        Self { polar }
    }

    /// `POST /v1/events/ingest` — record usage events. Events carrying the same
    /// `external_id` are de-duplicated by Polar.
    pub async fn ingest(&self, events: Vec<EventCreate>) -> Result<EventsIngestResponse> {
        #[derive(Serialize)]
        struct Body {
            events: Vec<EventCreate>,
        }
        self.polar.post("/v1/events/ingest", Body { events }).await
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct EventCreate {
    pub name: String,
    pub external_customer_id: String,
    /// Dedup key — reusing one ensures the event is counted at most once.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
    #[serde(skip_serializing_if = "Metadata::is_empty")]
    pub metadata: Metadata,
}

impl EventCreate {
    pub fn new(name: impl Into<String>, external_customer_id: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            external_customer_id: external_customer_id.into(),
            external_id: None,
            timestamp: None,
            metadata: Metadata::new(),
        }
    }

    pub fn external_id(mut self, external_id: impl Into<String>) -> Self {
        self.external_id = Some(external_id.into());
        self
    }

    pub fn metadata(mut self, key: impl Into<String>, value: impl Into<Value>) -> Self {
        self.metadata.insert(key.into(), value.into());
        self
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct EventsIngestResponse {
    #[serde(default)]
    pub inserted: i64,
}
