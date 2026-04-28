use std::collections::HashMap;

use serde_json::Value;

use crate::models::{
    AttachCustomize, AttachDiscount, AttachRequest, AttachResponse, BillingCycleAnchorNow,
    CarryOverConfig, CustomLineItem, FeatureQuantity, InvoiceMode, PlanSchedule, ProrationBehavior,
    RedirectMode,
};
use crate::{Autumn, AutumnError, Result};

/// Builder for `POST /v1/billing.attach`.
///
/// Covers new subscriptions, upgrades, and downgrades. Constructed via
/// [`Autumn::attach`](crate::Autumn::attach). The response's `payment_url` is
/// the Stripe Checkout URL when a redirect is required (which is governed by
/// [`RedirectMode`]).
///
/// ```no_run
/// # async fn run() -> autumn_rs::Result<()> {
/// let autumn = autumn_rs::Autumn::new("am_sk_test_...")?;
/// let res = autumn
///     .attach("customer_123")
///     .plan("pro")
///     .success_url("https://example.com/success")
///     .send()
///     .await?;
/// if let Some(url) = res.payment_url {
///     println!("Redirect to {url}");
/// }
/// # Ok(())
/// # }
/// ```
#[derive(Debug)]
pub struct AttachBuilder {
    client: Autumn,
    request: AttachRequest,
}

impl AttachBuilder {
    pub(crate) fn new(client: Autumn, customer_id: String) -> Self {
        Self {
            client,
            request: AttachRequest {
                customer_id,
                ..AttachRequest::default()
            },
        }
    }

    /// Required: the plan to attach.
    pub fn plan(mut self, plan_id: impl Into<String>) -> Self {
        self.request.plan_id = plan_id.into();
        self
    }

    /// Optional: attach to a specific entity rather than the customer.
    pub fn entity(mut self, entity_id: impl Into<String>) -> Self {
        self.request.entity_id = Some(entity_id.into());
        self
    }

    /// Sets the prepaid quantity for a single feature on the plan.
    pub fn feature_quantity(mut self, feature_id: impl Into<String>, quantity: f64) -> Self {
        self.request.feature_quantities.push(FeatureQuantity {
            feature_id: feature_id.into(),
            quantity: Some(quantity),
            adjustable: None,
        });
        self
    }

    /// Replaces all feature quantities at once.
    pub fn feature_quantities<I>(mut self, feature_quantities: I) -> Self
    where
        I: IntoIterator<Item = FeatureQuantity>,
    {
        self.request.feature_quantities = feature_quantities.into_iter().collect();
        self
    }

    /// Pin to a specific plan version.
    pub fn version(mut self, version: f64) -> Self {
        self.request.version = Some(version);
        self
    }

    /// Per-customer pricing / item / trial overrides on top of the plan.
    pub fn customize(mut self, customize: AttachCustomize) -> Self {
        self.request.customize = Some(customize);
        self
    }

    /// Bill via Stripe Invoice instead of a subscription.
    pub fn invoice_mode(mut self, invoice_mode: InvoiceMode) -> Self {
        self.request.invoice_mode = Some(invoice_mode);
        self
    }

    /// Controls prorated charges on plan changes.
    pub fn proration_behavior(mut self, proration_behavior: ProrationBehavior) -> Self {
        self.request.proration_behavior = Some(proration_behavior);
        self
    }

    /// Whether the response should always / sometimes / never include a
    /// `payment_url` for redirect.
    pub fn redirect_mode(mut self, redirect_mode: RedirectMode) -> Self {
        self.request.redirect_mode = Some(redirect_mode);
        self
    }

    /// Target an existing Stripe subscription instead of creating a new one.
    pub fn subscription(mut self, subscription_id: impl Into<String>) -> Self {
        self.request.subscription_id = Some(subscription_id.into());
        self
    }

    /// Apply a reward or promotion code.
    pub fn discount(mut self, discount: AttachDiscount) -> Self {
        self.request.discounts.push(discount);
        self
    }

    /// URL to send the user to after successful checkout.
    pub fn success_url(mut self, success_url: impl Into<String>) -> Self {
        self.request.success_url = Some(success_url.into());
        self
    }

    /// Force creation of a new Stripe billing subscription instead of
    /// extending an existing one.
    pub fn new_billing_subscription(mut self, new_billing_subscription: bool) -> Self {
        self.request.new_billing_subscription = Some(new_billing_subscription);
        self
    }

    /// Restart the billing cycle now (sends `billing_cycle_anchor: "now"`).
    pub fn billing_cycle_anchor_now(mut self) -> Self {
        self.request.billing_cycle_anchor = Some(BillingCycleAnchorNow);
        self
    }

    /// Whether scheduled changes apply immediately or at the end of the cycle.
    pub fn plan_schedule(mut self, plan_schedule: PlanSchedule) -> Self {
        self.request.plan_schedule = Some(plan_schedule);
        self
    }

    /// Pass-through Stripe Checkout session parameters.
    pub fn checkout_session_params(mut self, params: Value) -> Self {
        self.request.checkout_session_params = Some(params);
        self
    }

    /// Add a one-off line item (positive for charges, negative for credits;
    /// amounts in dollars).
    pub fn custom_line_item(mut self, item: CustomLineItem) -> Self {
        self.request.custom_line_items.push(item);
        self
    }

    /// Bind to an existing Stripe subscription you control.
    pub fn processor_subscription_id(mut self, id: impl Into<String>) -> Self {
        self.request.processor_subscription_id = Some(id.into());
        self
    }

    /// Carry remaining balances forward into the new plan period.
    pub fn carry_over_balances(mut self, config: CarryOverConfig) -> Self {
        self.request.carry_over_balances = Some(config);
        self
    }

    /// Carry recorded usage forward into the new plan period.
    pub fn carry_over_usages(mut self, config: CarryOverConfig) -> Self {
        self.request.carry_over_usages = Some(config);
        self
    }

    /// Replaces all metadata.
    pub fn metadata(mut self, metadata: HashMap<String, String>) -> Self {
        self.request.metadata = metadata;
        self
    }

    /// Adds a single metadata key/value.
    pub fn metadata_entry(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.request.metadata.insert(key.into(), value.into());
        self
    }

    /// Disables Stripe-side billing changes — only updates Autumn-managed state.
    pub fn no_billing_changes(mut self, no_billing_changes: bool) -> Self {
        self.request.no_billing_changes = Some(no_billing_changes);
        self
    }

    /// Sends the request. Errors with
    /// [`MissingRequiredField`](crate::AutumnError::MissingRequiredField) if
    /// `customer_id` or `plan_id` is empty.
    pub async fn send(self) -> Result<AttachResponse> {
        if self.request.customer_id.is_empty() {
            return Err(AutumnError::MissingRequiredField("customer_id"));
        }
        if self.request.plan_id.is_empty() {
            return Err(AutumnError::MissingRequiredField("plan_id"));
        }
        self.client.post("/billing.attach", &self.request).await
    }
}
