use crate::models::{AttachResponse, BillingUpdateRequest, CancelAction};
use crate::{Autumn, AutumnError, Result};

/// Builder for cancelling (or uncancelling) a subscription.
///
/// Maps to `POST /v1/billing.update` with a `cancel_action` set. Defaults to
/// `cancel_end_of_cycle`. Use [`immediately`](Self::immediately) /
/// [`end_of_cycle`](Self::end_of_cycle) / [`uncancel`](Self::uncancel) to
/// override.
///
/// ```no_run
/// # async fn run() -> autumn_rs::Result<()> {
/// let autumn = autumn_rs::Autumn::new("am_sk_test_...")?;
/// autumn
///     .cancel("customer_123")
///     .plan("pro")
///     .end_of_cycle()
///     .send()
///     .await?;
/// # Ok(())
/// # }
/// ```
#[derive(Debug)]
pub struct CancelBuilder {
    client: Autumn,
    request: BillingUpdateRequest,
}

impl CancelBuilder {
    pub(crate) fn new(client: Autumn, customer_id: String) -> Self {
        Self {
            client,
            request: BillingUpdateRequest {
                customer_id,
                cancel_action: Some(CancelAction::CancelEndOfCycle),
                ..BillingUpdateRequest::default()
            },
        }
    }

    /// Plan to cancel. Required if the customer has more than one active plan.
    pub fn plan(mut self, plan_id: impl Into<String>) -> Self {
        self.request.plan_id = Some(plan_id.into());
        self
    }

    /// Optional: cancel only the entity-scoped subscription.
    pub fn entity(mut self, entity_id: impl Into<String>) -> Self {
        self.request.entity_id = Some(entity_id.into());
        self
    }

    /// Target a specific Stripe subscription explicitly.
    pub fn subscription(mut self, subscription_id: impl Into<String>) -> Self {
        self.request.subscription_id = Some(subscription_id.into());
        self
    }

    /// Cancel immediately. The customer loses access right away.
    pub fn immediately(mut self) -> Self {
        self.request.cancel_action = Some(CancelAction::CancelImmediately);
        self
    }

    /// Cancel at the end of the current billing cycle (default).
    pub fn end_of_cycle(mut self) -> Self {
        self.request.cancel_action = Some(CancelAction::CancelEndOfCycle);
        self
    }

    /// Reverse a pending cancellation.
    pub fn uncancel(mut self) -> Self {
        self.request.cancel_action = Some(CancelAction::Uncancel);
        self
    }

    /// Sends the request.
    pub async fn send(self) -> Result<AttachResponse> {
        if self.request.customer_id.is_empty() {
            return Err(AutumnError::MissingRequiredField("customer_id"));
        }
        self.client.post("/billing.update", &self.request).await
    }
}
