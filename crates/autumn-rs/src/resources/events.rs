use crate::models::{
    AggregateEventsRequest, AggregateEventsResponse, ListEventsRequest, ListEventsResponse,
};
use crate::{Autumn, Result};

/// Events resource. Construct via [`Autumn::events`](crate::Autumn::events).
///
/// Use [`list`](Self::list) to page through individual usage events and
/// [`aggregate`](Self::aggregate) for timeseries / chart data.
#[derive(Clone, Debug)]
pub struct Events {
    client: Autumn,
}

impl Events {
    pub(crate) fn new(client: Autumn) -> Self {
        Self { client }
    }

    /// `POST /v1/events.list` — paginated raw event log.
    pub async fn list(&self, request: ListEventsRequest) -> Result<ListEventsResponse> {
        self.client.post("/events.list", &request).await
    }

    /// `POST /v1/events.aggregate` — bucketed usage totals by feature and
    /// optional `group_by` property. Provide either `range` (e.g. `7d`) or
    /// `custom_range`, not both.
    pub async fn aggregate(
        &self,
        request: AggregateEventsRequest,
    ) -> Result<AggregateEventsResponse> {
        self.client.post("/events.aggregate", &request).await
    }
}
