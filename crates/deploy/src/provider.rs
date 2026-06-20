use async_trait::async_trait;

use crate::{
    DeployResult, DeploymentSpec, LogLine, LogQuery, MetricPoint, MetricQuery, ProviderDeployment,
    ProviderKind, ProviderService,
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

    async fn logs(&self, query: &LogQuery) -> DeployResult<Vec<LogLine>>;

    async fn metrics(&self, query: &MetricQuery) -> DeployResult<Vec<MetricPoint>>;
}
