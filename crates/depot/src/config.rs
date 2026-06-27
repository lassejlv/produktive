use std::path::PathBuf;
use std::time::Duration;

use deploy::{DeployError, DeployResult};

/// Default build platform. Fly machines run amd64.
pub const DEFAULT_PLATFORM: &str = "linux/amd64";
/// Railpack's BuildKit gateway frontend image.
pub const DEFAULT_RAILPACK_FRONTEND: &str = "ghcr.io/railwayapp/railpack-frontend";
/// Registry username for `registry.fly.io` — Fly accepts any username with a
/// deploy token as the password.
pub const DEFAULT_REGISTRY_USERNAME: &str = "x";
/// Default per-subprocess timeout (clone, build, etc.).
pub const DEFAULT_COMMAND_TIMEOUT: Duration = Duration::from_secs(30 * 60);
/// Default overall build timeout, bounding the whole multi-step build.
pub const DEFAULT_BUILD_TIMEOUT: Duration = Duration::from_secs(45 * 60);
/// Default cap on the cloned build context size (2 GiB) to bound disk use from
/// an untrusted repository.
pub const DEFAULT_MAX_CONTEXT_BYTES: u64 = 2 * 1024 * 1024 * 1024;

/// Configuration for the Depot build adapter.
///
/// `token`, `project_id`, `registry_host`, and `registry_password` are required;
/// everything else has a sensible default. Construct with [`DepotConfig::new`]
/// and override fields as needed before handing it to
/// [`crate::DepotProvider::new`].
#[derive(Debug, Clone)]
pub struct DepotConfig {
    /// `DEPOT_TOKEN` — Depot organization or project token.
    pub token: String,
    /// `DEPOT_PROJECT_ID` — the (shared, for v1) Depot project that owns the cache.
    pub project_id: String,
    /// Registry host images are pushed to, e.g. `registry.fly.io`.
    pub registry_host: String,
    /// Registry username (default [`DEFAULT_REGISTRY_USERNAME`]).
    pub registry_username: String,
    /// Registry password — for Fly this is a registry/deploy token, distinct from
    /// the Machines API token.
    pub registry_password: String,
    /// Target build platform (default [`DEFAULT_PLATFORM`]).
    pub platform: String,
    /// Root directory under which per-build working directories are created.
    pub work_root: PathBuf,
    /// `depot` binary name or path.
    pub depot_bin: String,
    /// `git` binary name or path.
    pub git_bin: String,
    /// `railpack` binary name or path (no-Dockerfile path only).
    pub railpack_bin: String,
    /// `buildctl` binary name or path (no-Dockerfile path only).
    pub buildctl_bin: String,
    /// Railpack BuildKit frontend image (default [`DEFAULT_RAILPACK_FRONTEND`]).
    pub railpack_frontend: String,
    /// Timeout applied to each individual subprocess.
    pub command_timeout: Duration,
    /// Timeout bounding the whole `build()` call end to end.
    pub build_timeout: Duration,
    /// Reject builds whose cloned context exceeds this many bytes (`None` disables).
    pub max_context_bytes: Option<u64>,
}

impl DepotConfig {
    /// Build a config from the required fields, defaulting the rest.
    pub fn new(
        token: impl Into<String>,
        project_id: impl Into<String>,
        registry_host: impl Into<String>,
        registry_password: impl Into<String>,
    ) -> Self {
        let mut work_root = std::env::temp_dir();
        work_root.push("produktive-builds");
        Self {
            token: token.into(),
            project_id: project_id.into(),
            registry_host: registry_host.into(),
            registry_username: DEFAULT_REGISTRY_USERNAME.to_owned(),
            registry_password: registry_password.into(),
            platform: DEFAULT_PLATFORM.to_owned(),
            work_root,
            depot_bin: "depot".to_owned(),
            git_bin: "git".to_owned(),
            railpack_bin: "railpack".to_owned(),
            buildctl_bin: "buildctl".to_owned(),
            railpack_frontend: DEFAULT_RAILPACK_FRONTEND.to_owned(),
            command_timeout: DEFAULT_COMMAND_TIMEOUT,
            build_timeout: DEFAULT_BUILD_TIMEOUT,
            max_context_bytes: Some(DEFAULT_MAX_CONTEXT_BYTES),
        }
    }

    pub(crate) fn validate(&self) -> DeployResult<()> {
        if self.token.trim().is_empty() {
            return Err(DeployError::Config("DEPOT_TOKEN is required".into()));
        }
        if self.project_id.trim().is_empty() {
            return Err(DeployError::Config("DEPOT_PROJECT_ID is required".into()));
        }
        if self.registry_host.trim().is_empty() {
            return Err(DeployError::Config(
                "Depot registry host is required".into(),
            ));
        }
        if self.registry_password.trim().is_empty() {
            return Err(DeployError::Config(
                "Depot registry password (Fly registry token) is required".into(),
            ));
        }
        Ok(())
    }
}
