use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::{
    BuildOutcome, BuildSpec, DeployResult, DeploymentSpec, LogLine, LogQuery, MetricPoint,
    MetricQuery, ProviderDeployment, ProviderDomain, ProviderKind, ProviderService,
    ProviderServiceRef,
};

#[async_trait]
pub trait DeployProvider: Send + Sync {
    fn provider(&self) -> ProviderKind;

    async fn ensure_service(&self, deployment: &DeploymentSpec) -> DeployResult<ProviderService>;

    async fn deploy_image(&self, deployment: &DeploymentSpec) -> DeployResult<ProviderDeployment>;

    async fn refresh_deployment(
        &self,
        deployment: &DeploymentSpec,
    ) -> DeployResult<ProviderDeployment>;

    async fn stop_service(&self, deployment: &DeploymentSpec) -> DeployResult<()>;

    async fn destroy_deployment(&self, deployment: &DeploymentSpec) -> DeployResult<()>;

    async fn destroy_service(&self, service: &ProviderServiceRef) -> DeployResult<()>;

    async fn delete_volume(
        &self,
        service: &ProviderServiceRef,
        provider_volume_id: &str,
    ) -> DeployResult<()>;

    async fn ensure_domain(
        &self,
        service: &ProviderServiceRef,
        hostname: &str,
    ) -> DeployResult<ProviderDomain>;

    async fn check_domain(
        &self,
        service: &ProviderServiceRef,
        hostname: &str,
    ) -> DeployResult<ProviderDomain>;

    async fn delete_domain(&self, service: &ProviderServiceRef, hostname: &str)
        -> DeployResult<()>;

    async fn logs(&self, query: &LogQuery) -> DeployResult<Vec<LogLine>>;

    async fn metrics(&self, query: &MetricQuery) -> DeployResult<Vec<MetricPoint>>;
}

/// Build providers turn a [`BuildSpec`] (a source repository) into a pushed image
/// reference, mirroring the [`DeployProvider`] split so the build engine stays
/// swappable. The Depot adapter (`crates/depot`) is the first implementation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BuildProviderKind {
    Depot,
}

impl BuildProviderKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Depot => "depot",
        }
    }
}

/// A single line of build output, streamed back so the worker can persist it as a
/// deploy event while the build runs.
pub type BuildLogSink<'a> = dyn FnMut(&str) + Send + 'a;

#[async_trait]
pub trait BuildProvider: Send + Sync {
    fn provider(&self) -> BuildProviderKind;

    /// Build the source described by `spec`, streaming log lines to `on_log`, and
    /// return the pushed image plus build provenance.
    async fn build(
        &self,
        spec: &BuildSpec,
        on_log: &mut BuildLogSink<'_>,
    ) -> DeployResult<BuildOutcome>;
}
