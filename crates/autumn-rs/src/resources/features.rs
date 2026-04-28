use serde_json::json;

use crate::models::{
    CreateFeatureRequest, DeleteFeatureRequest, Feature, GetFeatureRequest, ListFeaturesResponse,
    SuccessResponse, UpdateFeatureRequest,
};
use crate::{Autumn, Result};

/// Feature resource. Construct via [`Autumn::features`](crate::Autumn::features).
///
/// Features come in three flavors (see
/// [`FeatureType`](crate::models::FeatureType)): `boolean` (gated on/off),
/// `metered` (counts up to a cap), and `credit_system` (denominated in
/// credits, configured via `credit_schema`).
#[derive(Clone, Debug)]
pub struct Features {
    client: Autumn,
}

impl Features {
    pub(crate) fn new(client: Autumn) -> Self {
        Self { client }
    }

    /// `POST /v1/features.create` — create a new feature.
    pub async fn create(&self, request: CreateFeatureRequest) -> Result<Feature> {
        self.client.post("/features.create", &request).await
    }

    /// `POST /v1/features.get` — fetch a single feature.
    pub async fn get(&self, request: GetFeatureRequest) -> Result<Feature> {
        self.client.post("/features.get", &request).await
    }

    /// `POST /v1/features.list` — every feature in the current environment.
    pub async fn list(&self) -> Result<ListFeaturesResponse> {
        self.client.post("/features.list", &json!({})).await
    }

    /// `POST /v1/features.update` — modify a feature. Use `new_feature_id`
    /// on the request to rename.
    pub async fn update(&self, request: UpdateFeatureRequest) -> Result<Feature> {
        self.client.post("/features.update", &request).await
    }

    /// `POST /v1/features.delete` — delete a feature. Features used by plans
    /// can't be deleted; set `archived: true` via `update` instead.
    pub async fn delete(&self, request: DeleteFeatureRequest) -> Result<SuccessResponse> {
        self.client.post("/features.delete", &request).await
    }
}
