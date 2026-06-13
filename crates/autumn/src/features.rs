use serde::{Deserialize, Serialize};

use crate::{models::*, Autumn, Result};

#[derive(Clone, Debug)]
pub struct FeaturesClient {
    autumn: Autumn,
}

impl FeaturesClient {
    pub(crate) fn new(autumn: Autumn) -> Self {
        Self { autumn }
    }

    pub async fn create(&self, params: FeatureParams) -> Result<Feature> {
        self.autumn.post("/v1/features.create", params).await
    }

    pub async fn get(&self, params: GetFeatureParams) -> Result<Feature> {
        self.autumn.post("/v1/features.get", params).await
    }

    pub async fn update(&self, params: FeatureParams) -> Result<Feature> {
        self.autumn.post("/v1/features.update", params).await
    }

    pub async fn list(&self) -> Result<ListResponse<Feature>> {
        self.autumn.post_empty("/v1/features.list").await
    }

    pub async fn delete(&self, params: DeleteFeatureParams) -> Result<SuccessResponse> {
        self.autumn.post("/v1/features.delete", params).await
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureParams {
    pub feature_id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub feature_type: FeatureType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub consumable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display: Option<DisplayNames>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credit_schema: Option<Vec<CreditSchemaItem>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_names: Option<Vec<String>>,
}

impl FeatureParams {
    pub fn new(
        feature_id: impl Into<String>,
        name: impl Into<String>,
        feature_type: FeatureType,
    ) -> Self {
        Self {
            feature_id: feature_id.into(),
            name: name.into(),
            feature_type,
            consumable: None,
            display: None,
            credit_schema: None,
            event_names: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetFeatureParams {
    pub feature_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteFeatureParams {
    pub feature_id: String,
}
