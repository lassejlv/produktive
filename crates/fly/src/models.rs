use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize)]
pub struct CreateAppRequest {
    pub app_name: String,
    pub org_slug: String,
    pub network: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAppResponse {
    pub id: String,
    pub created_at: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct AppResponse {
    pub id: String,
    pub name: String,
    pub status: Option<String>,
    pub organization: Option<Value>,
}

#[derive(Debug, Serialize)]
pub struct CreateMachineRequest {
    pub name: String,
    pub region: String,
    pub config: MachineConfig,
    pub skip_launch: bool,
    pub skip_service_registration: bool,
}

#[derive(Debug, Serialize)]
pub struct MachineConfig {
    pub image: String,
    pub env: BTreeMap<String, String>,
    pub guest: GuestConfig,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub mounts: Vec<MachineMountConfig>,
    pub services: Vec<ServiceConfig>,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub checks: BTreeMap<String, CheckConfig>,
    pub restart: RestartConfig,
    pub metadata: BTreeMap<String, String>,
}

#[derive(Debug, Serialize)]
pub struct MachineMountConfig {
    pub volume: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct GuestConfig {
    pub cpu_kind: String,
    pub cpus: u16,
    pub memory_mb: u16,
}

#[derive(Debug, Serialize)]
pub struct ServiceConfig {
    pub protocol: String,
    pub internal_port: u16,
    pub ports: Vec<ServicePort>,
}

#[derive(Debug, Serialize)]
pub struct ServicePort {
    pub port: u16,
    pub handlers: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct CheckConfig {
    #[serde(rename = "type")]
    pub kind: String,
    pub port: u16,
    pub interval: String,
    pub timeout: String,
    pub grace_period: String,
    pub method: String,
    pub path: String,
    pub protocol: String,
}

#[derive(Debug, Serialize)]
pub struct RestartConfig {
    pub policy: String,
}

#[derive(Debug, Serialize)]
pub struct CreateCertificateRequest {
    pub hostname: String,
}

#[derive(Debug, Serialize)]
pub struct CreateVolumeRequest {
    pub name: String,
    pub region: String,
    pub size_gb: i32,
}

#[derive(Debug, Deserialize, Clone)]
pub struct VolumeResponse {
    pub id: String,
    pub name: Option<String>,
    pub region: Option<String>,
    pub size_gb: Option<i32>,
    pub state: Option<String>,
    pub created_at: Option<String>,
    pub attached_machine_id: Option<String>,
    pub host_status: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct MachineResponse {
    pub id: String,
    pub name: Option<String>,
    pub state: Option<String>,
    pub region: Option<String>,
    pub image_ref: Option<ImageRef>,
    pub instance_id: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub config: Option<Value>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ImageRef {
    pub digest: Option<String>,
    pub registry: Option<String>,
    pub repository: Option<String>,
    pub tag: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct CertificateResponse {
    pub hostname: String,
    pub configured: Option<bool>,
    pub acme_requested: Option<bool>,
    pub status: Option<String>,
    pub dns_provider: Option<String>,
    pub rate_limited_until: Option<Value>,
    pub certificates: Option<Value>,
    pub validation: Option<Value>,
    pub dns_requirements: Option<Value>,
    pub validation_errors: Option<Value>,
    pub dns_records: Option<Value>,
}
