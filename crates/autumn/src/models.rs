use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub type JsonMap = BTreeMap<String, Value>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuccessResponse {
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListResponse<T> {
    pub list: Vec<T>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PagedResponse<T> {
    pub list: Vec<T>,
    pub has_more: Option<bool>,
    pub offset: Option<u64>,
    pub limit: Option<u64>,
    pub total: Option<u64>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FeatureType {
    Boolean,
    Metered,
    CreditSystem,
    Static,
    SingleUse,
    ContinuousUse,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Interval {
    OneOff,
    Minute,
    Hour,
    Day,
    Week,
    Month,
    Quarter,
    SemiAnnual,
    Year,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResetInterval {
    OneOff,
    Minute,
    Hour,
    Day,
    Week,
    Month,
    Quarter,
    SemiAnnual,
    Year,
    Multiple,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BillingMethod {
    Prepaid,
    UsageBased,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TierBehavior {
    Graduated,
    Volume,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RedirectMode {
    Always,
    IfRequired,
    Never,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProrationBehavior {
    ProrateImmediately,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlanSchedule {
    Immediate,
    EndOfCycle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CancelAction {
    CancelImmediately,
    CancelEndOfCycle,
    Uncancel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Env {
    Sandbox,
    Live,
    Test,
    Both,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DisplayNames {
    pub singular: Option<String>,
    pub plural: Option<String>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditSchemaItem {
    pub metered_feature_id: String,
    pub credit_cost: f64,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Feature {
    pub id: String,
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub feature_type: Option<FeatureType>,
    pub consumable: Option<bool>,
    pub event_names: Option<Vec<String>>,
    pub credit_schema: Option<Vec<CreditSchemaItem>>,
    pub display: Option<DisplayNames>,
    pub archived: Option<bool>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reset {
    pub interval: ResetInterval,
    pub interval_count: Option<f64>,
    pub resets_at: Option<i64>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RolloverBalance {
    pub balance: f64,
    pub expires_at: i64,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Price {
    pub amount: Option<f64>,
    pub tiers: Option<Vec<Value>>,
    pub tier_behavior: Option<TierBehavior>,
    pub interval: Option<Interval>,
    pub interval_count: Option<f64>,
    pub billing_units: Option<f64>,
    pub billing_method: Option<BillingMethod>,
    pub max_purchase: Option<f64>,
    pub display: Option<Value>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BalanceBreakdown {
    pub id: String,
    pub plan_id: Option<String>,
    pub included_grant: Option<f64>,
    pub prepaid_grant: Option<f64>,
    pub remaining: Option<f64>,
    pub usage: Option<f64>,
    pub unlimited: Option<bool>,
    pub reset: Option<Reset>,
    pub price: Option<Price>,
    pub expires_at: Option<i64>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Balance {
    pub feature_id: String,
    pub feature: Option<Feature>,
    pub granted: Option<f64>,
    pub remaining: Option<f64>,
    pub usage: Option<f64>,
    pub unlimited: Option<bool>,
    pub overage_allowed: Option<bool>,
    pub max_purchase: Option<f64>,
    pub next_reset_at: Option<i64>,
    pub breakdown: Option<Vec<BalanceBreakdown>>,
    pub rollovers: Option<Vec<RolloverBalance>>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Deduction {
    pub balance_id: String,
    pub feature_id: String,
    pub plan_id: Option<String>,
    pub reset: Option<Reset>,
    pub value: f64,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockParams {
    pub lock_id: String,
    pub enabled: bool,
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckParams {
    pub customer_id: String,
    pub feature_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required_balance: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub properties: Option<JsonMap>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub send_event: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lock: Option<LockParams>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub with_preview: Option<bool>,
}

impl CheckParams {
    pub fn new(customer_id: impl Into<String>, feature_id: impl Into<String>) -> Self {
        Self {
            customer_id: customer_id.into(),
            feature_id: feature_id.into(),
            entity_id: None,
            required_balance: None,
            properties: None,
            send_event: None,
            lock: None,
            with_preview: None,
        }
    }

    pub fn entity_id(mut self, entity_id: impl Into<String>) -> Self {
        self.entity_id = Some(entity_id.into());
        self
    }

    pub fn required_balance(mut self, required_balance: f64) -> Self {
        self.required_balance = Some(required_balance);
        self
    }

    pub fn send_event(mut self, send_event: bool) -> Self {
        self.send_event = Some(send_event);
        self
    }

    pub fn with_preview(mut self, with_preview: bool) -> Self {
        self.with_preview = Some(with_preview);
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckResponse {
    pub allowed: bool,
    pub customer_id: String,
    pub entity_id: Option<String>,
    pub required_balance: Option<f64>,
    pub balance: Option<Balance>,
    pub balances: Option<BTreeMap<String, Option<Balance>>>,
    pub flag: Option<Value>,
    pub preview: Option<Value>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackParams {
    pub customer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feature_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub properties: Option<JsonMap>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lock: Option<LockParams>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idempotency_key: Option<String>,
}

impl TrackParams {
    pub fn new(customer_id: impl Into<String>) -> Self {
        Self {
            customer_id: customer_id.into(),
            feature_id: None,
            entity_id: None,
            event_name: None,
            value: None,
            properties: None,
            lock: None,
            idempotency_key: None,
        }
    }

    pub fn feature_id(mut self, feature_id: impl Into<String>) -> Self {
        self.feature_id = Some(feature_id.into());
        self
    }

    pub fn event_name(mut self, event_name: impl Into<String>) -> Self {
        self.event_name = Some(event_name.into());
        self
    }

    pub fn entity_id(mut self, entity_id: impl Into<String>) -> Self {
        self.entity_id = Some(entity_id.into());
        self
    }

    pub fn value(mut self, value: f64) -> Self {
        self.value = Some(value);
        self
    }

    pub fn idempotency_key(mut self, idempotency_key: impl Into<String>) -> Self {
        self.idempotency_key = Some(idempotency_key.into());
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackResponse {
    pub customer_id: String,
    pub entity_id: Option<String>,
    pub event_name: Option<String>,
    pub value: Option<f64>,
    pub balance: Option<Balance>,
    pub balances: Option<BTreeMap<String, Option<Balance>>>,
    pub deductions: Option<Vec<Deduction>>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureQuantity {
    pub feature_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quantity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub adjustable: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Invoice {
    pub status: Option<String>,
    pub stripe_id: Option<String>,
    pub total: Option<f64>,
    pub currency: Option<String>,
    pub hosted_invoice_url: Option<String>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequiredAction {
    pub code: Option<String>,
    pub reason: Option<String>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillingResponse {
    pub customer_id: Option<String>,
    pub entity_id: Option<String>,
    pub invoice: Option<Invoice>,
    pub payment_url: Option<String>,
    pub required_action: Option<RequiredAction>,
    pub url: Option<String>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Customer {
    pub id: Option<String>,
    pub name: Option<String>,
    pub email: Option<String>,
    pub created_at: Option<i64>,
    pub fingerprint: Option<String>,
    pub stripe_id: Option<String>,
    pub env: Option<String>,
    pub metadata: Option<JsonMap>,
    pub send_email_receipts: Option<bool>,
    pub billing_controls: Option<Value>,
    pub subscriptions: Option<Vec<Value>>,
    pub purchases: Option<Vec<Value>>,
    pub balances: Option<BTreeMap<String, Balance>>,
    pub flags: Option<BTreeMap<String, Value>>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entity {
    pub id: Option<String>,
    pub customer_id: Option<String>,
    pub feature_id: Option<String>,
    pub name: Option<String>,
    pub metadata: Option<JsonMap>,
    pub balances: Option<BTreeMap<String, Balance>>,
    pub subscriptions: Option<Vec<Value>>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub group: Option<String>,
    pub version: Option<f64>,
    pub add_on: Option<bool>,
    pub auto_enable: Option<bool>,
    pub price: Option<Price>,
    pub items: Option<Vec<Value>>,
    pub free_trial: Option<Value>,
    pub created_at: Option<i64>,
    pub env: Option<String>,
    pub archived: Option<bool>,
    pub base_variant_id: Option<String>,
    pub config: Option<Value>,
    pub customer_eligibility: Option<Value>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub id: String,
    pub timestamp: i64,
    pub feature_id: Option<String>,
    pub customer_id: Option<String>,
    pub entity_id: Option<String>,
    pub event_name: Option<String>,
    pub value: f64,
    pub properties: Option<JsonMap>,
    pub deductions: Option<Vec<Deduction>>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn check_params_serialize_snake_case() {
        let body = serde_json::to_value(
            CheckParams::new("cus_123", "messages")
                .required_balance(2.0)
                .send_event(true),
        )
        .unwrap();

        assert_eq!(body["customer_id"], "cus_123");
        assert_eq!(body["feature_id"], "messages");
        assert_eq!(body["required_balance"], 2.0);
        assert_eq!(body["send_event"], true);
        assert!(body.get("entity_id").is_none());
    }

    #[test]
    fn track_params_serialize_optional_fields() {
        let body = serde_json::to_value(
            TrackParams::new("cus_123")
                .feature_id("api_calls")
                .value(1.0)
                .idempotency_key("req_123"),
        )
        .unwrap();

        assert_eq!(body["customer_id"], "cus_123");
        assert_eq!(body["feature_id"], "api_calls");
        assert_eq!(body["idempotency_key"], "req_123");
        assert!(body.get("event_name").is_none());
    }
}
