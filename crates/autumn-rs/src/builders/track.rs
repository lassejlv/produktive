use std::collections::HashMap;

use serde_json::Value;

use crate::models::{Lock, TrackRequest, TrackResponse};
use crate::{Autumn, AutumnError, Result};

/// Builder for `POST /v1/balances.track`.
///
/// Constructed via [`Autumn::track`](crate::Autumn::track); finished with
/// [`send`](Self::send). Either `feature_id` or `event_name` must be set.
/// The default `value` is `1.0`; pass a negative value to credit usage back.
///
/// ```no_run
/// # async fn run() -> autumn_rs::Result<()> {
/// let autumn = autumn_rs::Autumn::new("am_sk_test_...")?;
/// autumn
///     .track("customer_123")
///     .feature("messages")
///     .value(3.0)
///     .send()
///     .await?;
/// # Ok(())
/// # }
/// ```
#[derive(Debug)]
pub struct TrackBuilder {
    client: Autumn,
    request: TrackRequest,
}

impl TrackBuilder {
    pub(crate) fn new(client: Autumn, customer_id: String) -> Self {
        Self {
            client,
            request: TrackRequest {
                customer_id,
                value: Some(1.0),
                ..TrackRequest::default()
            },
        }
    }

    /// Tracks against a specific feature. Mutually compatible with
    /// `event_name` if your feature is configured to fan out by event.
    pub fn feature(mut self, feature_id: impl Into<String>) -> Self {
        self.request.feature_id = Some(feature_id.into());
        self
    }

    /// Tracks against an event name (mapped to features by your Autumn config).
    pub fn event_name(mut self, event_name: impl Into<String>) -> Self {
        self.request.event_name = Some(event_name.into());
        self
    }

    /// Optional: scope the usage to a specific entity.
    pub fn entity(mut self, entity_id: impl Into<String>) -> Self {
        self.request.entity_id = Some(entity_id.into());
        self
    }

    /// Amount to deduct from the balance. Defaults to `1.0`. Negative values
    /// credit usage back.
    pub fn value(mut self, value: f64) -> Self {
        self.request.value = Some(value);
        self
    }

    /// Adds a single property to the event payload.
    pub fn property(mut self, key: impl Into<String>, value: Value) -> Self {
        self.request.properties.insert(key.into(), value);
        self
    }

    /// Replaces all properties with the provided map.
    pub fn properties(mut self, properties: HashMap<String, Value>) -> Self {
        self.request.properties = properties;
        self
    }

    /// Holds the deduction under a [`Lock`]; commit or release it later via
    /// [`Balances::finalize`](crate::resources::Balances::finalize).
    pub fn lock(mut self, lock: Lock) -> Self {
        self.request.lock = Some(lock);
        self
    }

    /// Sends the request. Errors with
    /// [`MissingRequiredField`](crate::AutumnError::MissingRequiredField) if
    /// neither `feature_id` nor `event_name` is set.
    pub async fn send(self) -> Result<TrackResponse> {
        if self.request.customer_id.is_empty() {
            return Err(AutumnError::MissingRequiredField("customer_id"));
        }
        if self.request.feature_id.is_none() && self.request.event_name.is_none() {
            return Err(AutumnError::MissingRequiredField("feature_id"));
        }
        self.client.post("/balances.track", &self.request).await
    }
}
