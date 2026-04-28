//! Feature types.
//!
//! Note: Autumn ships **two** distinct feature schemas. Standalone features
//! returned by `features.*` use [`FeatureType`] (3 values: `boolean`,
//! `metered`, `credit_system`). When the same feature is embedded in a plan
//! item it is rendered as [`FeatureRef`] with [`FeatureRefType`] (5 values
//! that include `static`, `single_use`, `continuous_use`). Don't merge them.

use serde::{Deserialize, Serialize};

use super::shared::Extra;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum FeatureType {
    Boolean,
    Metered,
    CreditSystem,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum FeatureRefType {
    Static,
    Boolean,
    SingleUse,
    ContinuousUse,
    CreditSystem,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Feature {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: FeatureType,
    pub consumable: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub event_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub credit_schema: Vec<CreditSchemaEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display: Option<FeatureDisplay>,
    pub archived: bool,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct FeatureRef {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub kind: FeatureRefType,
    #[serde(default)]
    pub display: Option<FeatureDisplay>,
    #[serde(default)]
    pub credit_schema: Option<Vec<CreditSchemaEntry>>,
    #[serde(default)]
    pub archived: Option<bool>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct FeatureDisplay {
    pub singular: String,
    pub plural: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct CreditSchemaEntry {
    pub metered_feature_id: String,
    pub credit_cost: f64,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct CreateFeatureRequest {
    pub feature_id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: FeatureType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub consumable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display: Option<FeatureDisplay>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub credit_schema: Vec<CreditSchemaEntry>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub event_names: Vec<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct GetFeatureRequest {
    pub feature_id: String,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct UpdateFeatureRequest {
    pub feature_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub kind: Option<FeatureType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub consumable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display: Option<FeatureDisplay>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub credit_schema: Vec<CreditSchemaEntry>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub event_names: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_feature_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct DeleteFeatureRequest {
    pub feature_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct ListFeaturesResponse {
    #[serde(default)]
    pub list: Vec<Feature>,
    #[serde(default, flatten)]
    pub extra: Extra,
}
