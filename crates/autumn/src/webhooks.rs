use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::models::JsonMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookEvent {
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub event_type: Option<WebhookEventType>,
    pub created_at: Option<i64>,
    pub data: Option<Value>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WebhookEventType {
    #[serde(rename = "balances.limit_reached")]
    BalancesLimitReached,
    #[serde(rename = "balances.usage_alert_triggered")]
    BalancesUsageAlertTriggered,
    #[serde(rename = "billing.auto_topup_succeeded")]
    BillingAutoTopupSucceeded,
    #[serde(rename = "vercel.resources.deleted")]
    VercelResourcesDeleted,
    #[serde(rename = "vercel.resources.provisioned")]
    VercelResourcesProvisioned,
    #[serde(rename = "vercel.resources.rotate_secrets")]
    VercelResourcesRotateSecrets,
    #[serde(rename = "vercel.webhooks.event")]
    VercelWebhookEvent,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BalanceLimitReachedData {
    pub customer_id: Option<String>,
    pub entity_id: Option<String>,
    pub feature_id: Option<String>,
    pub balance: Option<Value>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BalanceUsageAlertTriggeredData {
    pub customer_id: Option<String>,
    pub entity_id: Option<String>,
    pub feature_id: Option<String>,
    pub threshold: Option<f64>,
    pub threshold_type: Option<String>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillingAutoTopupSucceededData {
    pub customer_id: Option<String>,
    pub entity_id: Option<String>,
    pub feature_id: Option<String>,
    pub quantity: Option<f64>,
    #[serde(flatten)]
    pub extra: JsonMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VercelResourceEventData {
    pub resource_id: Option<String>,
    pub user_id: Option<String>,
    pub access_token: Option<String>,
    #[serde(flatten)]
    pub extra: JsonMap,
}
