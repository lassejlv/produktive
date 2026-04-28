//! Events types: raw event listing and timeseries aggregation.
//!
//! For [`AggregateEventsRequest`], pass either `range` (a preset like `7d`) or
//! `custom_range`, but not both. `group_by` accepts dot-paths like
//! `properties.region` or the special tokens `$customer_id`, `$entity_id`.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::shared::{CustomRange, Extra, FeatureIdFilter};

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct ListEventsRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feature_id: Option<FeatureIdFilter>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_range: Option<CustomRange>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct ListEventsResponse {
    #[serde(default)]
    pub list: Vec<Event>,
    pub has_more: bool,
    pub offset: f64,
    pub limit: f64,
    pub total: f64,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Event {
    pub id: String,
    pub timestamp: i64,
    pub feature_id: String,
    pub customer_id: String,
    pub value: f64,
    #[serde(default)]
    pub properties: HashMap<String, Value>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct AggregateEventsRequest {
    pub feature_id: FeatureIdFilter,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<AggregateRange>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bin_size: Option<BinSize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_range: Option<CustomRange>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub filter_by: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_groups: Option<u16>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
pub enum AggregateRange {
    #[serde(rename = "24h")]
    Last24Hours,
    #[serde(rename = "7d")]
    Last7Days,
    #[serde(rename = "30d")]
    Last30Days,
    #[serde(rename = "90d")]
    Last90Days,
    #[serde(rename = "last_cycle")]
    LastCycle,
    #[serde(rename = "1bc")]
    OneBillingCycle,
    #[serde(rename = "3bc")]
    ThreeBillingCycles,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash, Default)]
#[serde(rename_all = "snake_case")]
pub enum BinSize {
    #[default]
    Day,
    Hour,
    Month,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct AggregateEventsResponse {
    #[serde(default)]
    pub list: Vec<AggregateDataPoint>,
    #[serde(default)]
    pub total: HashMap<String, AggregateTotal>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct AggregateDataPoint {
    pub period: i64,
    #[serde(default)]
    pub values: HashMap<String, f64>,
    #[serde(default)]
    pub grouped_values: HashMap<String, HashMap<String, f64>>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct AggregateTotal {
    pub count: f64,
    pub sum: f64,
    #[serde(default, flatten)]
    pub extra: Extra,
}
