//! Balance and Flag types plus the request shapes for direct balance
//! manipulation.
//!
//! A [`Balance`] tracks a customer's current usage / remaining allowance for a
//! feature, broken down across active subscriptions in `breakdown[]`. A
//! [`Flag`] is the on/off variant for boolean feature gates.
//!
//! [`FinalizeLockRequest`] confirms (`Confirm`) or releases (`Release`) a
//! lock previously created via [`Lock`](super::shared::Lock).

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::feature::Feature;
use super::plan::{BillingMethod, RolloverDuration, TierBehavior};
use super::shared::{Extra, Reset, ResetInterval};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Balance {
    pub feature_id: String,
    #[serde(default)]
    pub feature: Option<Feature>,
    pub granted: f64,
    pub remaining: f64,
    pub usage: f64,
    pub unlimited: bool,
    pub overage_allowed: bool,
    pub max_purchase: Option<f64>,
    pub next_reset_at: Option<i64>,
    #[serde(default)]
    pub breakdown: Vec<BalanceBreakdown>,
    #[serde(default)]
    pub rollovers: Vec<BalanceRolloverEntry>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct BalanceBreakdown {
    #[serde(default)]
    pub id: String,
    pub plan_id: Option<String>,
    pub included_grant: f64,
    pub prepaid_grant: f64,
    pub remaining: f64,
    pub usage: f64,
    pub unlimited: bool,
    pub reset: Option<BreakdownReset>,
    pub price: Option<BalanceBreakdownPrice>,
    pub expires_at: Option<i64>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct BreakdownReset {
    pub interval: BreakdownInterval,
    #[serde(default)]
    pub interval_count: Option<f64>,
    pub resets_at: Option<i64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum BreakdownInterval {
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

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct BalanceBreakdownPrice {
    #[serde(default)]
    pub amount: Option<f64>,
    #[serde(default)]
    pub tiers: Option<Vec<Value>>,
    #[serde(default)]
    pub tier_behavior: Option<TierBehavior>,
    pub billing_units: f64,
    pub billing_method: BillingMethod,
    pub max_purchase: Option<f64>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct BalanceRolloverEntry {
    pub balance: f64,
    pub expires_at: i64,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Flag {
    pub id: String,
    pub plan_id: Option<String>,
    pub expires_at: Option<i64>,
    pub feature_id: String,
    #[serde(default)]
    pub feature: Option<Feature>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct CreateBalanceRequest {
    pub customer_id: String,
    pub feature_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub included_grant: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unlimited: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reset: Option<Reset>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rollover: Option<BalanceRollover>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub balance_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct BalanceRollover {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_percentage: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<RolloverDuration>,
    pub length: f64,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct UpdateBalanceRequest {
    pub customer_id: String,
    pub feature_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remaining: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub add_to_balance: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interval: Option<ResetInterval>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub included_grant: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub balance_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_reset_at: Option<i64>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct DeleteBalanceRequest {
    pub customer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feature_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub balance_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recalculate_balances: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interval: Option<ResetInterval>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct FinalizeLockRequest {
    pub lock_id: String,
    pub action: FinalizeAction,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub override_value: Option<f64>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub properties: HashMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum FinalizeAction {
    Confirm,
    Release,
}
