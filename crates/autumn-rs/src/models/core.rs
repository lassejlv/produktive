//! Request and response types for `balances.check` and `balances.track`.
//!
//! Most users will reach for [`CheckBuilder`](crate::builders::CheckBuilder)
//! and [`TrackBuilder`](crate::builders::TrackBuilder) rather than
//! constructing these structs directly.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::balance::{Balance, Flag};
use super::shared::{Environment, Extra, Lock};

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct CheckRequest {
    pub customer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feature_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required_balance: Option<f64>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub properties: HashMap<String, Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub send_event: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lock: Option<Lock>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub with_preview: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct CheckResponse {
    pub allowed: bool,
    pub customer_id: String,
    #[serde(default)]
    pub entity_id: Option<String>,
    #[serde(default)]
    pub required_balance: Option<f64>,
    pub balance: Option<Balance>,
    pub flag: Option<Flag>,
    #[serde(default)]
    pub preview: Option<CheckPreview>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct CheckPreview {
    pub scenario: PreviewScenario,
    pub title: String,
    pub message: String,
    pub feature_id: String,
    pub feature_name: String,
    #[serde(default)]
    pub products: Vec<PreviewProduct>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum PreviewScenario {
    UsageLimit,
    FeatureFlag,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct PreviewProduct {
    pub id: String,
    pub name: String,
    pub group: Option<String>,
    pub env: Environment,
    pub is_add_on: bool,
    pub is_default: bool,
    pub archived: bool,
    pub version: f64,
    pub created_at: i64,
    #[serde(default)]
    pub items: Vec<Value>,
    pub free_trial: Option<PreviewFreeTrial>,
    pub base_variant_id: Option<String>,
    pub scenario: PreviewProductScenario,
    #[serde(default)]
    pub properties: Option<PreviewProductProperties>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum PreviewProductScenario {
    Scheduled,
    Active,
    New,
    Renew,
    Upgrade,
    UpdatePrepaidQuantity,
    Downgrade,
    Cancel,
    Expired,
    PastDue,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct PreviewFreeTrial {
    pub duration: PreviewTrialDuration,
    pub length: f64,
    pub unique_fingerprint: bool,
    pub card_required: bool,
    #[serde(default)]
    pub trial_available: Option<bool>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum PreviewTrialDuration {
    Day,
    Month,
    Year,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct PreviewProductProperties {
    pub is_free: bool,
    pub is_one_off: bool,
    #[serde(default)]
    pub interval_group: Option<String>,
    #[serde(default)]
    pub has_trial: Option<bool>,
    #[serde(default)]
    pub updateable: Option<bool>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct TrackRequest {
    pub customer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feature_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub properties: HashMap<String, Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lock: Option<Lock>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct TrackResponse {
    pub customer_id: String,
    #[serde(default)]
    pub entity_id: Option<String>,
    #[serde(default)]
    pub event_name: Option<String>,
    pub value: f64,
    pub balance: Option<Balance>,
    #[serde(default)]
    pub balances: HashMap<String, Balance>,
    #[serde(default, flatten)]
    pub extra: Extra,
}
