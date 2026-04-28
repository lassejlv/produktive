use std::collections::HashMap;

use serde_json::Value;

use crate::models::{CheckRequest, CheckResponse, Lock};
use crate::{Autumn, AutumnError, Result};

/// Builder for `POST /v1/balances.check`.
///
/// Constructed via [`Autumn::check`](crate::Autumn::check); finished with
/// [`send`](Self::send). The `feature_id` is required; everything else is
/// optional.
///
/// ```no_run
/// # async fn run() -> autumn_rs::Result<()> {
/// let autumn = autumn_rs::Autumn::new("am_sk_test_...")?;
/// let res = autumn
///     .check("customer_123")
///     .feature("messages")
///     .required_balance(5.0)
///     .send()
///     .await?;
/// if res.allowed {
///     // ...
/// }
/// # Ok(())
/// # }
/// ```
#[derive(Debug)]
pub struct CheckBuilder {
    client: Autumn,
    request: CheckRequest,
}

impl CheckBuilder {
    pub(crate) fn new(client: Autumn, customer_id: String) -> Self {
        Self {
            client,
            request: CheckRequest {
                customer_id,
                ..CheckRequest::default()
            },
        }
    }

    /// Required: which feature to check access against.
    pub fn feature(mut self, feature_id: impl Into<String>) -> Self {
        self.request.feature_id = Some(feature_id.into());
        self
    }

    /// Optional: scope the check to a specific entity (e.g. seat, workspace).
    pub fn entity(mut self, entity_id: impl Into<String>) -> Self {
        self.request.entity_id = Some(entity_id.into());
        self
    }

    /// Minimum balance the customer must have for this check to succeed.
    /// Defaults to `1.0` server-side.
    pub fn required_balance(mut self, required_balance: f64) -> Self {
        self.request.required_balance = Some(required_balance);
        self
    }

    /// Adds a single property used by feature gating rules.
    pub fn property(mut self, key: impl Into<String>, value: Value) -> Self {
        self.request.properties.insert(key.into(), value);
        self
    }

    /// Replaces all properties with the provided map.
    pub fn properties(mut self, properties: HashMap<String, Value>) -> Self {
        self.request.properties = properties;
        self
    }

    /// Atomically tracks usage when the check succeeds (single round trip).
    pub fn send_event(mut self, send_event: bool) -> Self {
        self.request.send_event = Some(send_event);
        self
    }

    /// Reserves balance via a [`Lock`]. Commit or release it later through
    /// [`Balances::finalize`](crate::resources::Balances::finalize).
    pub fn lock(mut self, lock: Lock) -> Self {
        self.request.lock = Some(lock);
        self
    }

    /// When the check is denied, includes upgrade-path information in the
    /// response's `preview` field.
    pub fn with_preview(mut self, with_preview: bool) -> Self {
        self.request.with_preview = Some(with_preview);
        self
    }

    /// Sends the request. Errors with
    /// [`MissingRequiredField`](crate::AutumnError::MissingRequiredField) if
    /// `customer_id` or `feature_id` is empty.
    pub async fn send(self) -> Result<CheckResponse> {
        if self.request.customer_id.is_empty() {
            return Err(AutumnError::MissingRequiredField("customer_id"));
        }
        if self.request.feature_id.is_none() {
            return Err(AutumnError::MissingRequiredField("feature_id"));
        }
        self.client.post("/balances.check", &self.request).await
    }
}
