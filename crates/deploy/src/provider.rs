use async_trait::async_trait;

use crate::{
    DeployResult, DeploymentSpec, LogLine, LogQuery, MetricPoint, MetricQuery, ProviderDeployment,
    ProviderDomain, ProviderKind, ProviderService, ProviderServiceRef,
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
