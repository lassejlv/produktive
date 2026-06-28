use std::collections::BTreeMap;

use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{DeployError, DeployResult, DeploymentStatus};

pub const DEFAULT_PROVIDER: ProviderKind = ProviderKind::Fly;
pub const DEFAULT_RESOURCE_PRESET: ResourcePreset = ResourcePreset::PreviewSmall;
pub const DEFAULT_MACHINE_COUNT: u16 = 1;
pub const MAX_MACHINE_COUNT: u16 = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    Fly,
    CloudRun,
}

impl ProviderKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Fly => "fly",
            Self::CloudRun => "cloud_run",
        }
    }

    /// Parse the persisted provider string (the `deploy_services.provider` /
    /// `deployments.provider` column). Unknown values are rejected so a typo can't
    /// silently route a deployment to the wrong cloud.
    pub fn parse(value: &str) -> DeployResult<Self> {
        match value.trim() {
            "fly" => Ok(Self::Fly),
            "cloud_run" | "cloudrun" => Ok(Self::CloudRun),
            other => Err(DeployError::Validation(format!(
                "unknown deploy provider '{other}'"
            ))),
        }
    }

    /// Whether this provider supports attaching persistent volumes. Cloud Run is
    /// stateless and rejects volume specs.
    pub fn supports_volumes(self) -> bool {
        match self {
            Self::Fly => true,
            Self::CloudRun => false,
        }
    }

    /// Human label for UI/log surfaces.
    pub fn label(self) -> &'static str {
        match self {
            Self::Fly => "Fly.io",
            Self::CloudRun => "Google Cloud Run",
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

/// How a service's runnable image is obtained.
///
/// `Image` is the original path: the user supplies a pre-built image reference.
/// `Git` is the build path: the user supplies a source repository that is built
/// into an image before deployment.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceKind {
    Image,
    Git,
}

impl SourceKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Image => "image",
            Self::Git => "git",
        }
    }

    pub fn parse(value: &str) -> DeployResult<Self> {
        match value.trim() {
            "image" => Ok(Self::Image),
            "git" => Ok(Self::Git),
            _ => Err(DeployError::Validation(
                "source_kind must be image or git".into(),
            )),
        }
    }
}

/// A buildable source. For v1 only public GitHub repositories are supported.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceSpec {
    pub kind: SourceKind,
    /// Canonical `https://github.com/owner/repo` URL.
    pub repo_url: String,
    /// Branch, tag, or commit SHA. `None` builds the repository's default branch.
    pub git_ref: Option<String>,
    /// Path to the Dockerfile relative to `root_dir`. `None` triggers Dockerfile
    /// auto-detection, falling back to Railpack when absent.
    pub dockerfile_path: Option<String>,
    /// Build context subdirectory relative to the repo root. `None` uses the root.
    pub root_dir: Option<String>,
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

pub fn validate_machine_count(value: u16) -> DeployResult<u16> {
    if (DEFAULT_MACHINE_COUNT..=MAX_MACHINE_COUNT).contains(&value) {
        Ok(value)
    } else {
        Err(DeployError::Validation(format!(
            "machine_count must be between {DEFAULT_MACHINE_COUNT} and {MAX_MACHINE_COUNT}"
        )))
    }
}

fn default_machine_count() -> u16 {
    DEFAULT_MACHINE_COUNT
}

/// Serde default for the `provider` field on specs deserialized from older
/// snapshots that predate multi-provider support — they are all Fly.
fn default_provider() -> ProviderKind {
    DEFAULT_PROVIDER
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
    #[serde(default = "default_machine_count")]
    pub machine_count: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentSpec {
    pub workspace_id: Uuid,
    pub service_id: Uuid,
    pub deployment_id: Uuid,
    #[serde(default = "default_provider")]
    pub provider: ProviderKind,
    pub provider_service_id: Option<String>,
    pub provider_instance_id: Option<String>,
    pub provider_instance_ids: Vec<String>,
    pub app_name: String,
    pub image: String,
    pub image_digest: Option<String>,
    pub internal_port: u16,
    pub environment: String,
    pub health_check_path: String,
    pub region: String,
    pub resource_preset: ResourcePreset,
    #[serde(default = "default_machine_count")]
    pub machine_count: u16,
    pub volumes: Vec<VolumeSpec>,
    pub env: BTreeMap<String, String>,
    pub secrets: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentConfigSnapshot {
    #[serde(default = "default_provider")]
    pub provider: ProviderKind,
    pub provider_service_id: Option<String>,
    pub app_name: String,
    pub internal_port: u16,
    pub environment: String,
    pub health_check_path: String,
    pub region: String,
    pub resource_preset: ResourcePreset,
    #[serde(default = "default_machine_count")]
    pub machine_count: u16,
    pub volumes: Vec<VolumeSpec>,
    pub env: BTreeMap<String, String>,
    pub encrypted_secrets: BTreeMap<String, String>,
}

impl DeploymentConfigSnapshot {
    #[allow(clippy::too_many_arguments)]
    pub fn to_deployment_spec(
        &self,
        workspace_id: Uuid,
        service_id: Uuid,
        deployment_id: Uuid,
        provider_instance_id: Option<String>,
        provider_instance_ids: Vec<String>,
        image: String,
        image_digest: Option<String>,
        cipher: &crate::SecretCipher,
    ) -> DeployResult<DeploymentSpec> {
        let mut secrets = BTreeMap::new();
        for (name, encrypted_value) in &self.encrypted_secrets {
            secrets.insert(name.clone(), cipher.decrypt(encrypted_value)?);
        }

        Ok(DeploymentSpec {
            workspace_id,
            service_id,
            deployment_id,
            provider: self.provider,
            provider_service_id: self.provider_service_id.clone(),
            provider_instance_id,
            provider_instance_ids,
            app_name: self.app_name.clone(),
            image,
            image_digest,
            internal_port: self.internal_port,
            environment: self.environment.clone(),
            health_check_path: self.health_check_path.clone(),
            region: self.region.clone(),
            resource_preset: self.resource_preset,
            machine_count: validate_machine_count(self.machine_count)?,
            volumes: self.volumes.clone(),
            env: self.env.clone(),
            secrets,
        })
    }
}

/// Which builder produced (or will produce) the image for a git source.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BuildEngine {
    Dockerfile,
    Railpack,
}

impl BuildEngine {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Dockerfile => "dockerfile",
            Self::Railpack => "railpack",
        }
    }
}

/// Registry credentials a build provider should authenticate with when pushing
/// the built image. When present this overrides the build provider's own default
/// registry config — used so a Cloud Run service's image is pushed to Google
/// Artifact Registry (authed with a short-lived GCP token) instead of the default
/// Fly registry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryAuth {
    /// Registry host the credentials authenticate against, e.g.
    /// `europe-west4-docker.pkg.dev` — must match the host of `image_repository`.
    pub host: String,
    pub username: String,
    pub password: String,
}

/// Input to a [`crate::BuildProvider`]: a source to build and the registry image
/// name to push the result to.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildSpec {
    pub workspace_id: Uuid,
    pub service_id: Uuid,
    pub deployment_id: Uuid,
    pub source: SourceSpec,
    /// Fully-qualified target image repository (without a tag), e.g.
    /// `registry.fly.io/<app>`. The provider appends the resolved tag.
    pub image_repository: String,
    /// Optional per-build registry credentials. `None` falls back to the build
    /// provider's configured default registry.
    #[serde(default)]
    pub registry_auth: Option<RegistryAuth>,
}

/// Result of a successful build: the pushed image plus build provenance that the
/// worker writes back onto the deployment row.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildOutcome {
    /// The pushed image reference (repository + tag) the deploy step consumes.
    pub image_ref: String,
    /// Digest of the pushed image, if the builder reports one.
    pub digest: Option<String>,
    /// Commit SHA that was built, if resolved during clone.
    pub commit_sha: Option<String>,
    /// Which builder produced the image.
    pub build_engine: BuildEngine,
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
    #[serde(default = "default_provider")]
    pub provider: ProviderKind,
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
    pub instances: Vec<ProviderInstance>,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInstance {
    pub provider_instance_id: String,
    pub status: DeploymentStatus,
    pub region: String,
    pub cpu_kind: String,
    pub cpus: u16,
    pub memory_mb: u16,
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
    #[serde(default = "default_provider")]
    pub provider: ProviderKind,
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
    #[serde(default = "default_provider")]
    pub provider: ProviderKind,
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
    crate::regions::validate_allowed_region(&spec.region)?;
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

/// Validate a build source URL for v1: only public `https://github.com/owner/repo`
/// is accepted. Rejects SSH/`git@` forms, credentials-in-URL, non-`github.com`
/// hosts (including `*.github.com` and Enterprise), and malformed owner/repo paths.
/// Returns the normalized `https://github.com/owner/repo` URL (no `.git`, no trailing slash).
pub fn validate_public_github_url(url: &str) -> DeployResult<String> {
    let raw = url.trim();
    if raw.is_empty() || raw.len() > 256 || raw.contains(char::is_whitespace) {
        return Err(DeployError::Validation(
            "repository URL is required and must be a single https://github.com/... URL".into(),
        ));
    }

    let rest = raw.strip_prefix("https://").ok_or_else(|| {
        DeployError::Validation(
            "repository URL must start with https:// (SSH is not supported)".into(),
        )
    })?;

    // Reject credentials-in-URL (user:pass@host) and any userinfo component.
    let (host_and_path, _) = match rest.split_once('/') {
        Some((host, path)) => ((host, path), ()),
        None => {
            return Err(DeployError::Validation(
                "repository URL must be https://github.com/owner/repo".into(),
            ))
        }
    };
    let (host, path) = host_and_path;
    if host.contains('@') || host.contains(':') {
        return Err(DeployError::Validation(
            "repository host must be exactly github.com with no credentials or port".into(),
        ));
    }
    if !host.eq_ignore_ascii_case("github.com") {
        return Err(DeployError::Validation(
            "only public github.com repositories are supported".into(),
        ));
    }

    // Strip query/fragment, an optional trailing `.git`, and a trailing slash.
    let path = path.split(['?', '#']).next().unwrap_or(path);
    let path = path.trim_end_matches('/');
    let path = path.strip_suffix(".git").unwrap_or(path);

    let mut segments = path.split('/');
    let owner = segments.next().unwrap_or("");
    let repo = segments.next().unwrap_or("");
    if owner.is_empty() || repo.is_empty() || segments.next().is_some() {
        return Err(DeployError::Validation(
            "repository URL must be https://github.com/owner/repo".into(),
        ));
    }
    let valid_segment = |s: &str| {
        !s.is_empty()
            && s.len() <= 100
            && s.chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    };
    if !valid_segment(owner) || !valid_segment(repo) {
        return Err(DeployError::Validation(
            "repository owner and name may only contain letters, numbers, '-', '_', and '.'".into(),
        ));
    }

    Ok(format!("https://github.com/{owner}/{repo}"))
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
    fn provider_kind_parses_and_round_trips() {
        for kind in [ProviderKind::Fly, ProviderKind::CloudRun] {
            assert_eq!(ProviderKind::parse(kind.as_str()).unwrap(), kind);
        }
        assert_eq!(
            ProviderKind::parse("cloudrun").unwrap(),
            ProviderKind::CloudRun
        );
        assert_eq!(ProviderKind::as_str(ProviderKind::CloudRun), "cloud_run");
        assert!(ProviderKind::parse("gcp").is_err());
        // Serde wire format must match the persisted column strings.
        assert_eq!(
            serde_json::to_string(&ProviderKind::CloudRun).unwrap(),
            "\"cloud_run\""
        );
        assert!(ProviderKind::Fly.supports_volumes());
        assert!(!ProviderKind::CloudRun.supports_volumes());
    }

    #[test]
    fn validates_env_names() {
        assert!(validate_env_name("DATABASE_URL").is_ok());
        assert!(validate_env_name("FLY_SECRET").is_err());
        assert!(validate_env_name("1BAD").is_err());
    }

    #[test]
    fn accepts_and_normalizes_public_github_urls() {
        assert_eq!(
            validate_public_github_url("https://github.com/owner/repo").unwrap(),
            "https://github.com/owner/repo"
        );
        // .git suffix, trailing slash, query string all normalize away.
        assert_eq!(
            validate_public_github_url("https://github.com/owner/repo.git/").unwrap(),
            "https://github.com/owner/repo"
        );
        assert_eq!(
            validate_public_github_url("https://github.com/owner/repo?ref=main").unwrap(),
            "https://github.com/owner/repo"
        );
    }

    #[test]
    fn rejects_non_public_github_urls() {
        // SSH / git@ form
        assert!(validate_public_github_url("git@github.com:owner/repo.git").is_err());
        // credentials in URL
        assert!(validate_public_github_url("https://user:pass@github.com/owner/repo").is_err());
        // non-github host
        assert!(validate_public_github_url("https://gitlab.com/owner/repo").is_err());
        // GitHub Enterprise / subdomain
        assert!(validate_public_github_url("https://ghe.github.com/owner/repo").is_err());
        // missing repo segment
        assert!(validate_public_github_url("https://github.com/owner").is_err());
        // extra path segments
        assert!(validate_public_github_url("https://github.com/owner/repo/tree/main").is_err());
        // plain http
        assert!(validate_public_github_url("http://github.com/owner/repo").is_err());
    }

    #[test]
    fn source_kind_round_trips() {
        for kind in [SourceKind::Image, SourceKind::Git] {
            assert_eq!(SourceKind::parse(kind.as_str()).unwrap(), kind);
        }
        assert!(SourceKind::parse("bogus").is_err());
    }

    #[test]
    fn deployment_config_snapshot_decrypts_secrets_into_spec() {
        let cipher =
            crate::SecretCipher::from_hex_key(&"11".repeat(32)).expect("valid test cipher");
        let encrypted = cipher.encrypt("secret-value").expect("encrypts");
        let workspace_id = Uuid::now_v7();
        let service_id = Uuid::now_v7();
        let deployment_id = Uuid::now_v7();
        let snapshot = DeploymentConfigSnapshot {
            provider: ProviderKind::Fly,
            provider_service_id: Some("prd-service".into()),
            app_name: "api".into(),
            internal_port: 3000,
            environment: "production".into(),
            health_check_path: "/health".into(),
            region: "fra".into(),
            resource_preset: ResourcePreset::PreviewSmall,
            machine_count: 1,
            volumes: Vec::new(),
            env: BTreeMap::from([("PUBLIC".into(), "value".into())]),
            encrypted_secrets: BTreeMap::from([("TOKEN".into(), encrypted)]),
        };

        let spec = snapshot
            .to_deployment_spec(
                workspace_id,
                service_id,
                deployment_id,
                Some("machine-1".into()),
                Vec::new(),
                "ghcr.io/acme/api:latest".into(),
                Some("sha256:abc".into()),
                &cipher,
            )
            .expect("snapshot converts");

        assert_eq!(spec.workspace_id, workspace_id);
        assert_eq!(spec.service_id, service_id);
        assert_eq!(spec.deployment_id, deployment_id);
        assert_eq!(spec.provider_service_id.as_deref(), Some("prd-service"));
        assert_eq!(spec.provider_instance_id.as_deref(), Some("machine-1"));
        assert_eq!(spec.image, "ghcr.io/acme/api:latest");
        assert_eq!(spec.image_digest.as_deref(), Some("sha256:abc"));
        assert_eq!(spec.env.get("PUBLIC").map(String::as_str), Some("value"));
        assert_eq!(
            spec.secrets.get("TOKEN").map(String::as_str),
            Some("secret-value")
        );
    }
}
