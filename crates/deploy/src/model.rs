use std::collections::BTreeMap;

use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{DeployError, DeployResult, DeploymentStatus};

pub const DEFAULT_PROVIDER: ProviderKind = ProviderKind::Fly;
pub const DEFAULT_RESOURCE_PRESET: ResourcePreset = ResourcePreset::PreviewSmall;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProviderKind {
    Fly,
}

impl ProviderKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Fly => "fly",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RegistryKind {
    Ghcr,
    DockerHub,
}

impl RegistryKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Ghcr => "ghcr",
            Self::DockerHub => "docker_hub",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResourcePreset {
    PreviewSmall,
    PreviewMedium,
    PreviewLarge,
}

impl ResourcePreset {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::PreviewSmall => "preview_small",
            Self::PreviewMedium => "preview_medium",
            Self::PreviewLarge => "preview_large",
        }
    }

    pub fn parse(value: &str) -> DeployResult<Self> {
        match value.trim() {
            "preview_small" | "small" => Ok(Self::PreviewSmall),
            "preview_medium" | "medium" => Ok(Self::PreviewMedium),
            "preview_large" | "large" => Ok(Self::PreviewLarge),
            _ => Err(DeployError::Validation(
                "resource_preset must be preview_small, preview_medium, or preview_large".into(),
            )),
        }
    }

    pub fn cpus(self) -> u16 {
        match self {
            Self::PreviewSmall | Self::PreviewMedium => 1,
            Self::PreviewLarge => 2,
        }
    }

    pub fn memory_mb(self) -> u16 {
        match self {
            Self::PreviewSmall => 512,
            Self::PreviewMedium => 1024,
            Self::PreviewLarge => 2048,
        }
    }

    pub fn cpu_kind(self) -> &'static str {
        "shared"
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceSpec {
    pub workspace_id: Uuid,
    pub service_id: Uuid,
    pub name: String,
    pub slug: String,
    pub image: String,
    pub registry: RegistryKind,
    pub internal_port: u16,
    pub environment: String,
    pub health_check_path: String,
    pub region: String,
    pub resource_preset: ResourcePreset,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentSpec {
    pub workspace_id: Uuid,
    pub service_id: Uuid,
    pub deployment_id: Uuid,
    pub provider_service_id: Option<String>,
    pub provider_instance_id: Option<String>,
    pub app_name: String,
    pub image: String,
    pub image_digest: Option<String>,
    pub internal_port: u16,
    pub environment: String,
    pub health_check_path: String,
    pub region: String,
    pub resource_preset: ResourcePreset,
    pub volumes: Vec<VolumeSpec>,
    pub env: BTreeMap<String, String>,
    pub secrets: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeSpec {
    pub id: Uuid,
    pub provider_volume_id: Option<String>,
    pub name: String,
    pub mount_path: String,
    pub region: String,
    pub size_gb: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderService {
    pub provider: ProviderKind,
    pub provider_service_id: String,
    pub url: Option<String>,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderServiceRef {
    pub workspace_id: Uuid,
    pub service_id: Uuid,
    pub provider_service_id: Option<String>,
    pub app_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderDeployment {
    pub provider: ProviderKind,
    pub provider_deployment_id: String,
    pub provider_instance_id: Option<String>,
    pub status: DeploymentStatus,
    pub image_digest: Option<String>,
    pub url: Option<String>,
    pub volumes: Vec<ProviderVolume>,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderVolume {
    pub volume_id: Uuid,
    pub provider_volume_id: String,
    pub name: String,
    pub mount_path: String,
    pub region: String,
    pub size_gb: i32,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderDomain {
    pub provider: ProviderKind,
    pub hostname: String,
    pub provider_domain_id: Option<String>,
    pub status: String,
    pub configured: bool,
    pub dns_requirements: serde_json::Value,
    pub validation_errors: serde_json::Value,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogLine {
    pub timestamp: DateTime<FixedOffset>,
    pub stream: String,
    pub message: String,
    pub source_id: Option<String>,
    pub provider_instance_id: Option<String>,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogQuery {
    pub service_id: Uuid,
    pub deployment_id: Option<Uuid>,
    pub provider_service_id: Option<String>,
    pub provider_instance_id: Option<String>,
    pub limit: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricPoint {
    pub timestamp: DateTime<FixedOffset>,
    pub cpu_percent: Option<f64>,
    pub memory_mb: Option<f64>,
    pub requests: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricQuery {
    pub service_id: Uuid,
    pub provider_service_id: Option<String>,
    pub from: DateTime<FixedOffset>,
    pub to: DateTime<FixedOffset>,
}

pub fn provider_app_name(prefix: &str, workspace_id: Uuid, service_id: Uuid, slug: &str) -> String {
    let workspace = workspace_id.simple().to_string();
    let service = service_id.simple().to_string();
    let raw = format!(
        "{}-{}-{}-{}",
        prefix.trim_matches('-'),
        &workspace[..8],
        &service[..8],
        slug.trim_matches('-')
    );
    sanitize_provider_name(&raw, 63)
}

pub fn validate_service_spec(spec: &ServiceSpec) -> DeployResult<()> {
    validate_internal_port(spec.internal_port)?;
    validate_image_for_registry(spec.registry, &spec.image)?;
    validate_health_path(&spec.health_check_path)?;
    validate_region(&spec.region)?;
    if spec.slug.trim().is_empty() {
        return Err(DeployError::Validation("service slug is required".into()));
    }
    Ok(())
}

pub fn validate_internal_port(port: u16) -> DeployResult<()> {
    if port == 0 {
        return Err(DeployError::Validation("internal port is required".into()));
    }
    Ok(())
}

pub fn validate_health_path(path: &str) -> DeployResult<()> {
    let path = path.trim();
    if !path.starts_with('/') || path.len() > 512 || path.contains(' ') {
        return Err(DeployError::Validation(
            "health check path must start with / and contain no spaces".into(),
        ));
    }
    Ok(())
}

pub fn validate_region(region: &str) -> DeployResult<()> {
    let region = region.trim();
    let valid = !region.is_empty()
        && region.len() <= 32
        && region
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if !valid {
        return Err(DeployError::Validation("invalid deployment region".into()));
    }
    Ok(())
}

pub fn validate_volume_name(name: &str) -> DeployResult<()> {
    let name = name.trim();
    let valid = !name.is_empty()
        && name.len() <= 63
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_');
    if !valid {
        return Err(DeployError::Validation(
            "volume name must be lowercase letters, numbers, dashes, or underscores".into(),
        ));
    }
    Ok(())
}

pub fn validate_volume_mount_path(path: &str) -> DeployResult<()> {
    let path = path.trim();
    let valid = path.starts_with('/')
        && path.len() <= 256
        && !path.contains(char::is_whitespace)
        && !path.ends_with('/');
    if !valid
        || matches!(
            path,
            "/" | "/app" | "/tmp" | "/var" | "/usr" | "/bin" | "/etc"
        )
    {
        return Err(DeployError::Validation(
            "volume mount_path must be an absolute non-system path like /data".into(),
        ));
    }
    Ok(())
}

pub fn validate_volume_size_gb(size_gb: i32) -> DeployResult<()> {
    if !(1..=50).contains(&size_gb) {
        return Err(DeployError::Validation(
            "volume size_gb must be between 1 and 50 for private preview".into(),
        ));
    }
    Ok(())
}

pub fn validate_image_for_registry(kind: RegistryKind, image: &str) -> DeployResult<()> {
    let image = image.trim();
    if image.len() < 3 || image.len() > 512 || image.contains(char::is_whitespace) {
        return Err(DeployError::Validation("invalid image reference".into()));
    }
    match kind {
        RegistryKind::Ghcr if !image.starts_with("ghcr.io/") => Err(DeployError::Validation(
            "GHCR images must start with ghcr.io/".into(),
        )),
        RegistryKind::DockerHub if image.starts_with("ghcr.io/") => Err(DeployError::Validation(
            "Docker Hub images must not use the ghcr.io registry".into(),
        )),
        _ => Ok(()),
    }
}

pub fn validate_env_name(name: &str) -> DeployResult<()> {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return Err(DeployError::Validation(
            "environment variable name is required".into(),
        ));
    };
    if !(first.is_ascii_alphabetic() || first == '_')
        || !chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
        || name.starts_with("FLY_")
    {
        return Err(DeployError::Validation(
            "environment variable names must be shell-style names and cannot start with FLY_"
                .into(),
        ));
    }
    Ok(())
}

fn sanitize_provider_name(value: &str, max: usize) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for c in value.to_ascii_lowercase().chars() {
        let c = if c.is_ascii_lowercase() || c.is_ascii_digit() {
            c
        } else {
            '-'
        };
        if c == '-' {
            if !last_dash && !out.is_empty() {
                out.push(c);
            }
            last_dash = true;
        } else {
            out.push(c);
            last_dash = false;
        }
        if out.len() >= max {
            break;
        }
    }
    out.trim_matches('-').to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_registry_prefixes() {
        assert!(validate_image_for_registry(RegistryKind::Ghcr, "ghcr.io/acme/app:sha").is_ok());
        assert!(validate_image_for_registry(RegistryKind::Ghcr, "acme/app:latest").is_err());
        assert!(
            validate_image_for_registry(RegistryKind::DockerHub, "library/nginx:latest").is_ok()
        );
    }

    #[test]
    fn provider_app_names_are_stable_and_bounded() {
        let name = provider_app_name(
            "prd",
            Uuid::parse_str("018f18e0-0000-7000-8000-000000000000").unwrap(),
            Uuid::parse_str("018f18e0-1111-7000-8000-000000000000").unwrap(),
            "api_service!!with_long_suffix",
        );
        assert!(name.starts_with("prd-018f18e0-018f18e0-api-service"));
        assert!(name.len() <= 63);
    }

    #[test]
    fn validates_env_names() {
        assert!(validate_env_name("DATABASE_URL").is_ok());
        assert!(validate_env_name("FLY_SECRET").is_err());
        assert!(validate_env_name("1BAD").is_err());
    }
}
