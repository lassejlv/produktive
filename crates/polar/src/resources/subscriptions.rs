use crate::client::Polar;
use crate::error::Result;
use crate::models::{Subscription, UpdateSubscriptionRequest};

/// `/v1/subscriptions/` resource.
#[derive(Debug, Clone)]
pub struct Subscriptions {
    client: Polar,
}

impl Subscriptions {
    pub(crate) fn new(client: Polar) -> Self {
        Self { client }
    }

    /// Fetches a single subscription by id.
    pub async fn get(&self, id: &str) -> Result<Subscription> {
        self.client.get(&format!("/v1/subscriptions/{id}")).await
    }

    /// `PATCH /v1/subscriptions/{id}` with the caller-supplied body.
    pub async fn update(
        &self,
        id: &str,
        request: &UpdateSubscriptionRequest,
    ) -> Result<Subscription> {
        self.client
            .patch(&format!("/v1/subscriptions/{id}"), request)
            .await
    }

    /// Schedules cancellation at the end of the current period (or rolls one
    /// back when `cancel` is `false`).
    pub async fn cancel_at_period_end(&self, id: &str, cancel: bool) -> Result<Subscription> {
        self.update(
            id,
            &UpdateSubscriptionRequest::CancelAtPeriodEnd {
                cancel_at_period_end: cancel,
            },
        )
        .await
    }

    /// Cancels and revokes the subscription immediately.
    pub async fn revoke(&self, id: &str) -> Result<Subscription> {
        self.update(id, &UpdateSubscriptionRequest::Revoke { revoke: true })
            .await
    }
}
