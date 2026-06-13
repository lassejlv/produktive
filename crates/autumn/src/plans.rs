use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{models::*, Autumn, Result};

#[derive(Clone, Debug)]
pub struct PlansClient {
    autumn: Autumn,
}

impl PlansClient {
    pub(crate) fn new(autumn: Autumn) -> Self {
        Self { autumn }
    }

    pub async fn create(&self, params: PlanParams) -> Result<Plan> {
        self.autumn.post("/v1/plans.create", params).await
    }

    pub async fn get(&self, params: GetPlanParams) -> Result<Plan> {
        self.autumn.post("/v1/plans.get", params).await
    }

    pub async fn update(&self, params: PlanParams) -> Result<Plan> {
        self.autumn.post("/v1/plans.update", params).await
    }

    pub async fn list(&self, params: ListPlansParams) -> Result<ListResponse<Plan>> {
        self.autumn.post("/v1/plans.list", params).await
    }

    pub async fn delete(&self, params: DeletePlanParams) -> Result<SuccessResponse> {
        self.autumn.post("/v1/plans.delete", params).await
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanParams {
    pub plan_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub items: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub free_trial: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub add_on: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_enable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_version: Option<bool>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

impl PlanParams {
    pub fn new(plan_id: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            plan_id: plan_id.into(),
            name: name.into(),
            description: None,
            group: None,
            price: None,
            items: None,
            free_trial: None,
            add_on: None,
            auto_enable: None,
            config: None,
            disable_version: None,
            extra: JsonMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetPlanParams {
    pub plan_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<f64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ListPlansParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_archived: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeletePlanParams {
    pub plan_id: String,
}
