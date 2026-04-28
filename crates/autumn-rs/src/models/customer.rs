//! Customer types — the customer record itself plus its v2-shaped fields:
//! `subscriptions[]` (recurring), `purchases[]` (one-off), `balances{}` keyed
//! by feature id, and `flags{}` for boolean feature gating.
//!
//! [`CustomerData`] is the slimmer "create-time hint" shape used inside
//! requests on other namespaces (e.g. `entities.create`,
//! `billing.multi_attach`).

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::balance::{Balance, Flag};
use super::plan::Plan;
use super::shared::{BillingControls, Environment, Extra};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Customer {
    pub id: Option<String>,
    pub name: Option<String>,
    pub email: Option<String>,
    pub created_at: i64,
    pub fingerprint: Option<String>,
    pub stripe_id: Option<String>,
    pub env: Environment,
    #[serde(default)]
    pub metadata: HashMap<String, Value>,
    pub send_email_receipts: bool,
    pub billing_controls: BillingControls,
    #[serde(default)]
    pub subscriptions: Vec<Subscription>,
    #[serde(default)]
    pub purchases: Vec<Purchase>,
    #[serde(default)]
    pub balances: HashMap<String, Balance>,
    #[serde(default)]
    pub flags: HashMap<String, Flag>,
    #[serde(default)]
    pub config: Option<CustomerConfig>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
pub struct CustomerConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disable_pooled_balance: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Subscription {
    pub id: String,
    #[serde(default)]
    pub plan: Option<Plan>,
    pub plan_id: String,
    pub auto_enable: bool,
    pub add_on: bool,
    pub status: SubscriptionStatus,
    pub past_due: bool,
    pub canceled_at: Option<i64>,
    pub expires_at: Option<i64>,
    pub trial_ends_at: Option<i64>,
    pub started_at: i64,
    pub current_period_start: Option<i64>,
    pub current_period_end: Option<i64>,
    pub quantity: f64,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum SubscriptionStatus {
    Active,
    Scheduled,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Purchase {
    #[serde(default)]
    pub plan: Option<Plan>,
    pub plan_id: String,
    pub expires_at: Option<i64>,
    pub started_at: i64,
    pub quantity: f64,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
pub struct CustomerData {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fingerprint: Option<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub metadata: HashMap<String, Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stripe_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub create_in_stripe: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_enable_plan_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub send_email_receipts: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub billing_controls: Option<BillingControls>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct ListCustomersParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<i64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub plans: Vec<ListCustomersPlanFilter>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription_status: Option<SubscriptionStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub processors: Vec<ProcessorFilter>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct ListCustomersPlanFilter {
    pub id: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub versions: Vec<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ProcessorFilter {
    Stripe,
    Revenuecat,
    Vercel,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct ListCustomersResponse {
    #[serde(default)]
    pub list: Vec<Customer>,
    pub has_more: bool,
    pub offset: f64,
    pub limit: f64,
    pub total: f64,
    pub total_count: f64,
    pub total_filtered_count: f64,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct GetOrCreateCustomerRequest {
    pub customer_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fingerprint: Option<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub metadata: HashMap<String, Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stripe_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub create_in_stripe: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_enable_plan_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub send_email_receipts: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_controls: Option<BillingControls>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<CustomerConfig>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub expand: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct UpdateCustomerRequest {
    pub customer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fingerprint: Option<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub metadata: HashMap<String, Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stripe_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub send_email_receipts: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_controls: Option<BillingControls>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<CustomerConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_customer_id: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct DeleteCustomerRequest {
    pub customer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delete_in_stripe: Option<bool>,
}
