//! Plan types. In v2 these replace v1's "products".
//!
//! Updates to a plan create a new version by default. Use the `version` field
//! on [`GetPlanRequest`] / [`UpdatePlanRequest`] to pin to a specific version.
//! `PlanItemInput` carries everything you need to set up included usage,
//! pricing tiers, proration policy, and rollovers per feature.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::feature::FeatureRef;
use super::shared::{
    BasePrice, BasePriceResponse, BillingInterval, Display, Environment, Extra, Reset,
};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Plan {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub group: Option<String>,
    pub version: f64,
    pub add_on: bool,
    pub auto_enable: bool,
    pub price: Option<BasePriceResponse>,
    #[serde(default)]
    pub items: Vec<PlanItem>,
    #[serde(default)]
    pub free_trial: Option<FreeTrial>,
    pub created_at: i64,
    pub env: Environment,
    pub archived: bool,
    pub base_variant_id: Option<String>,
    #[serde(default)]
    pub customer_eligibility: Option<CustomerEligibility>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct PlanItem {
    pub feature_id: String,
    pub included: Option<f64>,
    pub unlimited: Option<bool>,
    pub reset: Option<Reset>,
    pub price: Option<PlanItemPriceResponse>,
    #[serde(default)]
    pub proration: Option<PlanProration>,
    #[serde(default)]
    pub rollover: Option<PlanRolloverResponse>,
    #[serde(default)]
    pub feature: Option<FeatureRef>,
    #[serde(default)]
    pub display: Option<Display>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct PlanItemInput {
    pub feature_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub included: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unlimited: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reset: Option<Reset>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price: Option<PlanItemPriceInput>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proration: Option<PlanProration>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rollover: Option<PlanRolloverInput>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct PlanItemPriceInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<f64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tiers: Vec<PlanItemTier>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tier_behavior: Option<TierBehavior>,
    pub interval: BillingInterval,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interval_count: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_units: Option<f64>,
    pub billing_method: BillingMethod,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_purchase: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct PlanItemPriceResponse {
    #[serde(default)]
    pub amount: Option<f64>,
    #[serde(default)]
    pub tiers: Option<Vec<Value>>,
    #[serde(default)]
    pub tier_behavior: Option<TierBehavior>,
    pub interval: BillingInterval,
    #[serde(default)]
    pub interval_count: Option<f64>,
    pub billing_units: f64,
    pub billing_method: BillingMethod,
    pub max_purchase: Option<f64>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct PlanItemTier {
    pub to: TierTo,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flat_amount: Option<f64>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum TierTo {
    Number(f64),
    Inf,
}

impl Serialize for TierTo {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            TierTo::Number(value) => serializer.serialize_f64(*value),
            TierTo::Inf => serializer.serialize_str("inf"),
        }
    }
}

impl<'de> Deserialize<'de> for TierTo {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = Value::deserialize(deserializer)?;
        match value {
            Value::Number(number) => number
                .as_f64()
                .map(TierTo::Number)
                .ok_or_else(|| serde::de::Error::custom("tier `to` must be a finite f64")),
            Value::String(text) if text == "inf" => Ok(TierTo::Inf),
            other => Err(serde::de::Error::invalid_value(
                serde::de::Unexpected::Other(&other.to_string()),
                &"a number or the string \"inf\"",
            )),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum BillingMethod {
    Prepaid,
    UsageBased,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum TierBehavior {
    Graduated,
    Volume,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct PlanProration {
    pub on_increase: ProrationOnIncrease,
    pub on_decrease: ProrationOnDecrease,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ProrationOnIncrease {
    BillImmediately,
    ProrateImmediately,
    ProrateNextCycle,
    BillNextCycle,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ProrationOnDecrease {
    Prorate,
    ProrateImmediately,
    ProrateNextCycle,
    None,
    NoProrations,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct PlanRolloverInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_percentage: Option<f64>,
    pub expiry_duration_type: RolloverDuration,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expiry_duration_length: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct PlanRolloverResponse {
    pub max: Option<f64>,
    #[serde(default)]
    pub max_percentage: Option<f64>,
    pub expiry_duration_type: RolloverDuration,
    #[serde(default)]
    pub expiry_duration_length: Option<f64>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash, Default)]
#[serde(rename_all = "snake_case")]
pub enum RolloverDuration {
    #[default]
    Month,
    Forever,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct FreeTrialParams {
    pub duration_length: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_type: Option<FreeTrialDuration>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub card_required: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct FreeTrial {
    pub duration_length: f64,
    pub duration_type: FreeTrialDuration,
    pub card_required: bool,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash, Default)]
#[serde(rename_all = "snake_case")]
pub enum FreeTrialDuration {
    Day,
    #[default]
    Month,
    Year,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct CustomerEligibility {
    #[serde(default)]
    pub trial_available: Option<bool>,
    #[serde(default)]
    pub status: Option<EligibilityStatus>,
    #[serde(default)]
    pub canceling: Option<bool>,
    #[serde(default)]
    pub trialing: Option<bool>,
    pub attach_action: AttachAction,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum EligibilityStatus {
    Active,
    Scheduled,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AttachAction {
    Activate,
    Upgrade,
    Downgrade,
    None,
    Purchase,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct CreatePlanRequest {
    pub plan_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub add_on: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_enable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price: Option<BasePrice>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub items: Vec<PlanItemInput>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub free_trial: Option<FreeTrialParams>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct GetPlanRequest {
    pub plan_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<f64>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct ListPlansParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_archived: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct ListPlansResponse {
    #[serde(default)]
    pub list: Vec<Plan>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct UpdatePlanRequest {
    pub plan_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub add_on: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_enable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price: Option<BasePrice>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub items: Vec<PlanItemInput>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub free_trial: Option<FreeTrialParams>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_plan_id: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct DeletePlanRequest {
    pub plan_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub all_versions: Option<bool>,
}

