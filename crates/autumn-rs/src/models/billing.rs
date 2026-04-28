//! Types for the `billing.*` namespace: attach, multi-attach, preview,
//! update (cancel/uncancel via `cancel_action`), setup-payment, and customer
//! portal.
//!
//! [`AttachResponse`] is shared by `attach`, `multi_attach`, and
//! `update` — the only differences are which fields are populated (e.g.
//! `update` typically omits `payment_url` for non-redirect flows).

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::customer::CustomerData;
use super::plan::{FreeTrialParams, Plan, PlanItemInput};
use super::shared::{BasePrice, BillingCycleAnchorNow, EntityBillingControls, Extra};

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct AttachRequest {
    pub customer_id: String,
    pub plan_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub feature_quantities: Vec<FeatureQuantity>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customize: Option<AttachCustomize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invoice_mode: Option<InvoiceMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proration_behavior: Option<ProrationBehavior>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub redirect_mode: Option<RedirectMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription_id: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub discounts: Vec<AttachDiscount>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub success_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_billing_subscription: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_cycle_anchor: Option<BillingCycleAnchorNow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_schedule: Option<PlanSchedule>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checkout_session_params: Option<Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub custom_line_items: Vec<CustomLineItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub processor_subscription_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub carry_over_balances: Option<CarryOverConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub carry_over_usages: Option<CarryOverConfig>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub metadata: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub no_billing_changes: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct AttachResponse {
    pub customer_id: String,
    #[serde(default)]
    pub entity_id: Option<String>,
    #[serde(default)]
    pub invoice: Option<Invoice>,
    pub payment_url: Option<String>,
    #[serde(default)]
    pub required_action: Option<RequiredAction>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Invoice {
    pub status: Option<String>,
    pub stripe_id: String,
    pub total: f64,
    pub currency: String,
    pub hosted_invoice_url: Option<String>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct RequiredAction {
    pub code: RequiredActionCode,
    pub reason: String,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
pub enum RequiredActionCode {
    #[serde(rename = "3ds_required")]
    ThreeDsRequired,
    #[serde(rename = "payment_method_required")]
    PaymentMethodRequired,
    #[serde(rename = "payment_failed")]
    PaymentFailed,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct FeatureQuantity {
    pub feature_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quantity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub adjustable: Option<bool>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct AttachDiscount {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reward_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub promotion_code: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct InvoiceMode {
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enable_plan_immediately: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finalize: Option<bool>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct AttachCustomize {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price: Option<BasePrice>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub items: Vec<PlanItemInput>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub free_trial: Option<FreeTrialParams>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct MultiAttachCustomize {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price: Option<BasePrice>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub items: Vec<PlanItemInput>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ProrationBehavior {
    ProrateImmediately,
    None,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash, Default)]
#[serde(rename_all = "snake_case")]
pub enum RedirectMode {
    Always,
    #[default]
    IfRequired,
    Never,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum PlanSchedule {
    Immediate,
    EndOfCycle,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct CustomLineItem {
    pub amount: f64,
    pub description: String,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct CarryOverConfig {
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub feature_ids: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct MultiAttachRequest {
    pub customer_id: String,
    pub plans: Vec<MultiAttachPlan>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub free_trial: Option<FreeTrialParams>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invoice_mode: Option<InvoiceMode>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub discounts: Vec<AttachDiscount>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub success_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checkout_session_params: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub redirect_mode: Option<RedirectMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_billing_subscription: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_data: Option<CustomerData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_data: Option<MultiAttachEntityData>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct MultiAttachPlan {
    pub plan_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customize: Option<MultiAttachCustomize>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub feature_quantities: Vec<FeatureQuantity>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription_id: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct MultiAttachEntityData {
    pub feature_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_controls: Option<EntityBillingControls>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct BillingUpdateRequest {
    pub customer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_id: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub feature_quantities: Vec<FeatureQuantity>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customize: Option<AttachCustomize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invoice_mode: Option<InvoiceMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proration_behavior: Option<ProrationBehavior>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub redirect_mode: Option<RedirectMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription_id: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub discounts: Vec<AttachDiscount>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancel_action: Option<CancelAction>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_cycle_anchor: Option<BillingCycleAnchorNow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub no_billing_changes: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recalculate_balances: Option<RecalculateBalances>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum CancelAction {
    CancelImmediately,
    CancelEndOfCycle,
    Uncancel,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct RecalculateBalances {
    pub enabled: bool,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct SetupPaymentRequest {
    pub customer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_id: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub feature_quantities: Vec<FeatureQuantity>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customize: Option<AttachCustomize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proration_behavior: Option<ProrationBehavior>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription_id: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub discounts: Vec<AttachDiscount>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub success_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_cycle_anchor: Option<BillingCycleAnchorNow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checkout_session_params: Option<Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub custom_line_items: Vec<CustomLineItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub processor_subscription_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub carry_over_balances: Option<CarryOverConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub carry_over_usages: Option<CarryOverConfig>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub metadata: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub no_billing_changes: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct SetupPaymentResponse {
    pub customer_id: String,
    #[serde(default)]
    pub entity_id: Option<String>,
    pub url: String,
    #[serde(default, flatten)]
    pub extra: Extra,
}

pub type PreviewAttachRequest = AttachRequest;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct PreviewAttachResponse {
    pub customer_id: String,
    #[serde(default)]
    pub line_items: Vec<LineItem>,
    pub subtotal: f64,
    pub total: f64,
    pub currency: String,
    #[serde(default)]
    pub next_cycle: Option<NextCycle>,
    #[serde(default)]
    pub expand: Vec<String>,
    #[serde(default)]
    pub incoming: Vec<IncomingOutgoing>,
    #[serde(default)]
    pub outgoing: Vec<IncomingOutgoing>,
    pub redirect_to_checkout: bool,
    pub checkout_type: Option<CheckoutType>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct LineItem {
    pub display_name: String,
    pub description: String,
    pub subtotal: f64,
    pub total: f64,
    #[serde(default)]
    pub discounts: Vec<LineItemDiscount>,
    pub plan_id: String,
    pub feature_id: Option<String>,
    #[serde(default)]
    pub period: Option<Period>,
    pub quantity: f64,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct LineItemDiscount {
    pub amount_off: f64,
    #[serde(default)]
    pub percent_off: Option<f64>,
    #[serde(default)]
    pub reward_id: Option<String>,
    #[serde(default)]
    pub reward_name: Option<String>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Period {
    pub start: i64,
    pub end: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct NextCycle {
    pub starts_at: i64,
    pub subtotal: f64,
    pub total: f64,
    #[serde(default)]
    pub line_items: Vec<LineItem>,
    #[serde(default)]
    pub usage_line_items: Vec<UsageLineItem>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct UsageLineItem {
    pub display_name: String,
    pub plan_id: String,
    pub feature_id: Option<String>,
    #[serde(default)]
    pub period: Option<Period>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct IncomingOutgoing {
    pub plan_id: String,
    #[serde(default)]
    pub plan: Option<Plan>,
    #[serde(default)]
    pub feature_quantities: Vec<IncomingFeatureQuantity>,
    pub effective_at: Option<i64>,
    pub canceled_at: Option<i64>,
    pub expires_at: Option<i64>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct IncomingFeatureQuantity {
    pub feature_id: String,
    pub quantity: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum CheckoutType {
    StripeCheckout,
    AutumnCheckout,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct OpenCustomerPortalRequest {
    pub customer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configuration_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub return_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct OpenCustomerPortalResponse {
    pub customer_id: String,
    pub url: String,
    #[serde(default, flatten)]
    pub extra: Extra,
}

