use crate::client::Polar;
use crate::error::Result;
use crate::models::{IngestEventsRequest, IngestEventsResponse};

/// `/v1/events/ingest` resource.
#[derive(Debug, Clone)]
pub struct Events {
    client: Polar,
}

impl Events {
    pub(crate) fn new(client: Polar) -> Self {
        Self { client }
    }

    /// Ingests a batch of usage events.
    pub async fn ingest(&self, request: IngestEventsRequest) -> Result<IngestEventsResponse> {
        self.client.post("/v1/events/ingest", &request).await
    }
}
