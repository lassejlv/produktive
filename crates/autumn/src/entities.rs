use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{models::*, Autumn, Result};

#[derive(Clone, Debug)]
pub struct EntitiesClient {
    autumn: Autumn,
}

impl EntitiesClient {
    pub(crate) fn new(autumn: Autumn) -> Self {
        Self { autumn }
    }

    pub async fn create(&self, params: EntityParams) -> Result<Entity> {
        self.autumn.post("/v1/entities.create", params).await
    }

    pub async fn get(&self, params: GetEntityParams) -> Result<Entity> {
        self.autumn.post("/v1/entities.get", params).await
    }

    pub async fn update(&self, params: EntityParams) -> Result<Entity> {
        self.autumn.post("/v1/entities.update", params).await
    }

    pub async fn list(&self, params: ListEntitiesParams) -> Result<PagedResponse<Entity>> {
        self.autumn.post("/v1/entities.list", params).await
    }

    pub async fn delete(&self, params: DeleteEntityParams) -> Result<SuccessResponse> {
        self.autumn.post("/v1/entities.delete", params).await
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityParams {
    pub entity_id: String,
    pub customer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feature_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<JsonMap>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expand: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<Value>,
}

impl EntityParams {
    pub fn new(entity_id: impl Into<String>, customer_id: impl Into<String>) -> Self {
        Self {
            entity_id: entity_id.into(),
            customer_id: customer_id.into(),
            feature_id: None,
            name: None,
            metadata: None,
            expand: None,
            config: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetEntityParams {
    pub entity_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expand: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ListEntitiesParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feature_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expand: Option<Vec<String>>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteEntityParams {
    pub entity_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_id: Option<String>,
}
