use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{models::*, Autumn, Result};

#[derive(Clone, Debug)]
pub struct BalancesClient {
    autumn: Autumn,
}

impl BalancesClient {
    pub(crate) fn new(autumn: Autumn) -> Self {
        Self { autumn }
    }

    pub async fn create(&self, params: CreateBalanceParams) -> Result<SuccessResponse> {
        self.autumn.post("/v1/balances.create", params).await
    }

    pub async fn update(&self, params: UpdateBalanceParams) -> Result<SuccessResponse> {
        self.autumn.post("/v1/balances.update", params).await
    }

    pub async fn delete(&self, params: DeleteBalanceParams) -> Result<SuccessResponse> {
        self.autumn.post("/v1/balances.delete", params).await
    }

    pub async fn finalize(&self, params: FinalizeBalanceParams) -> Result<SuccessResponse> {
        self.autumn.post("/v1/balances.finalize", params).await
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateBalanceParams {
    pub customer_id: String,
    pub feature_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub included_grant: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unlimited: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reset: Option<CreateBalanceReset>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rollover: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub balance_id: Option<String>,
}

impl CreateBalanceParams {
    pub fn new(customer_id: impl Into<String>, feature_id: impl Into<String>) -> Self {
        Self {
            customer_id: customer_id.into(),
            feature_id: feature_id.into(),
            entity_id: None,
            included_grant: None,
            unlimited: None,
            reset: None,
            rollover: None,
            expires_at: None,
            balance_id: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateBalanceParams {
    pub customer_id: String,
    pub feature_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub balance_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub included_grant: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub balance: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unlimited: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reset: Option<CreateBalanceReset>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rollover: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteBalanceParams {
    pub customer_id: String,
    pub feature_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub balance_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinalizeBalanceParams {
    pub lock_id: String,
    pub action: FinalizeAction,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub override_value: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub properties: Option<JsonMap>,
}

impl FinalizeBalanceParams {
    pub fn new(lock_id: impl Into<String>, action: FinalizeAction) -> Self {
        Self {
            lock_id: lock_id.into(),
            action,
            override_value: None,
            properties: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FinalizeAction {
    Confirm,
    Release,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateBalanceReset {
    pub interval: Interval,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interval_count: Option<f64>,
}
