//! Request/response shapes for the Cloud Run Admin API v2 and the small slice of
//! the IAM and Cloud Logging APIs the provider uses. Only the fields Produktive
//! reads or writes are modeled; unknown fields are ignored on decode.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Service (request)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct ServiceRequest {
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub labels: BTreeMap<String, String>,
    pub ingress: &'static str,
    pub template: RevisionTemplate,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionTemplate {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revision: Option<String>,
    pub containers: Vec<Container>,
    pub scaling: Scaling,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Container {
    pub image: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub ports: Vec<Port>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub env: Vec<EnvVar>,
    pub resources: Resources,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Port {
    pub container_port: u16,
}

#[derive(Debug, Clone, Serialize)]
pub struct EnvVar {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Resources {
    pub limits: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Scaling {
    pub min_instance_count: u32,
    pub max_instance_count: u32,
}

// ---------------------------------------------------------------------------
// Service (response)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceResponse {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub uri: Option<String>,
    #[serde(default)]
    pub latest_ready_revision: Option<String>,
    #[serde(default)]
    pub latest_created_revision: Option<String>,
    #[serde(default)]
    pub terminal_condition: Option<Condition>,
    #[serde(default)]
    pub conditions: Vec<Condition>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Condition {
    #[serde(default, rename = "type")]
    pub type_: Option<String>,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub reason: Option<String>,
}

// ---------------------------------------------------------------------------
// Long-running operation
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Operation {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub done: bool,
    #[serde(default)]
    pub error: Option<OperationError>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct OperationError {
    #[serde(default)]
    pub code: i32,
    #[serde(default)]
    pub message: String,
}

// ---------------------------------------------------------------------------
// IAM (setIamPolicy)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct SetIamPolicyRequest {
    pub policy: IamPolicy,
}

#[derive(Debug, Clone, Serialize)]
pub struct IamPolicy {
    pub bindings: Vec<IamBinding>,
}

#[derive(Debug, Clone, Serialize)]
pub struct IamBinding {
    pub role: String,
    pub members: Vec<String>,
}

// ---------------------------------------------------------------------------
// Cloud Logging (entries:list)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListLogEntriesRequest {
    pub resource_names: Vec<String>,
    pub filter: String,
    pub order_by: String,
    pub page_size: u16,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ListLogEntriesResponse {
    #[serde(default)]
    pub entries: Vec<LogEntry>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    #[serde(default)]
    pub timestamp: Option<String>,
    #[serde(default)]
    pub severity: Option<String>,
    #[serde(default)]
    pub text_payload: Option<String>,
    #[serde(default)]
    pub json_payload: Option<serde_json::Value>,
    #[serde(default)]
    pub insert_id: Option<String>,
    #[serde(default)]
    pub labels: Option<serde_json::Value>,
}
