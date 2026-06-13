use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{models::*, Autumn, Result};

#[derive(Clone, Debug)]
pub struct BillingClient {
    autumn: Autumn,
}

impl BillingClient {
    pub(crate) fn new(autumn: Autumn) -> Self {
        Self { autumn }
    }

    pub async fn attach(&self, params: AttachParams) -> Result<BillingResponse> {
        self.autumn.post("/v1/billing.attach", params).await
    }

    pub async fn multi_attach(&self, params: MultiAttachParams) -> Result<BillingResponse> {
        self.autumn.post("/v1/billing.multi_attach", params).await
    }

    pub async fn update(&self, params: UpdateSubscriptionParams) -> Result<BillingResponse> {
        self.autumn.post("/v1/billing.update", params).await
    }

    pub async fn create_schedule(&self, params: CreateScheduleParams) -> Result<BillingResponse> {
        self.autumn
            .post("/v1/billing.create_schedule", params)
            .await
    }

    pub async fn preview_attach(&self, params: AttachParams) -> Result<Value> {
        self.autumn.post("/v1/billing.preview_attach", params).await
    }

    pub async fn preview_multi_attach(&self, params: MultiAttachParams) -> Result<Value> {
        self.autumn
            .post("/v1/billing.preview_multi_attach", params)
            .await
    }

    pub async fn preview_update(&self, params: UpdateSubscriptionParams) -> Result<Value> {
        self.autumn.post("/v1/billing.preview_update", params).await
    }

    pub async fn open_customer_portal(
        &self,
        params: OpenCustomerPortalParams,
    ) -> Result<PortalResponse> {
        self.autumn
            .post("/v1/billing.open_customer_portal", params)
            .await
    }

    pub async fn setup_payment(&self, params: SetupPaymentParams) -> Result<SetupPaymentResponse> {
        self.autumn.post("/v1/billing.setup_payment", params).await
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachParams {
    pub customer_id: String,
    pub plan_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feature_quantities: Option<Vec<FeatureQuantity>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customize: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invoice_mode: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proration_behavior: Option<ProrationBehavior>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub redirect_mode: Option<RedirectMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub discounts: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub success_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_billing_subscription: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_cycle_anchor: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_schedule: Option<PlanSchedule>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub starts_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ends_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checkout_session_params: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_line_items: Option<Vec<CustomLineItem>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub processor_subscription_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub carry_over_balances: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub carry_over_usages: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<JsonMap>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub no_billing_changes: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enable_plan_immediately: Option<bool>,
}

impl AttachParams {
    pub fn new(customer_id: impl Into<String>, plan_id: impl Into<String>) -> Self {
        Self {
            customer_id: customer_id.into(),
            plan_id: plan_id.into(),
            entity_id: None,
            feature_quantities: None,
            version: None,
            customize: None,
            invoice_mode: None,
            proration_behavior: None,
            redirect_mode: None,
            subscription_id: None,
            discounts: None,
            success_url: None,
            new_billing_subscription: None,
            billing_cycle_anchor: None,
            plan_schedule: None,
            starts_at: None,
            ends_at: None,
            checkout_session_params: None,
            custom_line_items: None,
            processor_subscription_id: None,
            carry_over_balances: None,
            carry_over_usages: None,
            metadata: None,
            no_billing_changes: None,
            enable_plan_immediately: None,
        }
    }

    pub fn success_url(mut self, success_url: impl Into<String>) -> Self {
        self.success_url = Some(success_url.into());
        self
    }

    pub fn redirect_mode(mut self, redirect_mode: RedirectMode) -> Self {
        self.redirect_mode = Some(redirect_mode);
        self
    }

    pub fn no_billing_changes(mut self, no_billing_changes: bool) -> Self {
        self.no_billing_changes = Some(no_billing_changes);
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiAttachParams {
    pub customer_id: String,
    pub plans: Vec<MultiAttachPlan>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub success_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub redirect_mode: Option<RedirectMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<JsonMap>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiAttachPlan {
    pub plan_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feature_quantities: Option<Vec<FeatureQuantity>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customize: Option<Value>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSubscriptionParams {
    pub customer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feature_quantities: Option<Vec<FeatureQuantity>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customize: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invoice_mode: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proration_behavior: Option<ProrationBehavior>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub redirect_mode: Option<RedirectMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub discounts: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancel_action: Option<CancelAction>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_cycle_anchor: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub no_billing_changes: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recalculate_balances: Option<Value>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateScheduleParams {
    pub customer_id: String,
    pub phases: Vec<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription_id: Option<String>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCustomerPortalParams {
    pub customer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configuration_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub return_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortalResponse {
    pub customer_id: String,
    pub url: String,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupPaymentParams {
    pub customer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feature_quantities: Option<Vec<FeatureQuantity>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customize: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub success_url: Option<String>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupPaymentResponse {
    pub customer_id: String,
    pub entity_id: Option<String>,
    pub url: String,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomLineItem {
    pub amount: f64,
    pub description: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn attach_params_serialize_checkout_options() {
        let body = serde_json::to_value(
            AttachParams::new("cus_123", "pro")
                .success_url("https://app.example.com/billing?checkout=success")
                .redirect_mode(RedirectMode::IfRequired),
        )
        .unwrap();

        assert_eq!(body["customer_id"], "cus_123");
        assert_eq!(body["plan_id"], "pro");
        assert_eq!(
            body["success_url"],
            "https://app.example.com/billing?checkout=success"
        );
        assert_eq!(body["redirect_mode"], "if_required");
    }
}
