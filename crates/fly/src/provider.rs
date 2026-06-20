use std::collections::BTreeMap;

use async_trait::async_trait;
use deploy::{
    provider_app_name, DeployProvider, DeployResult, DeploymentSpec, DeploymentStatus, LogLine,
    LogQuery, MetricPoint, MetricQuery, ProviderDeployment, ProviderKind, ProviderService,
};
use serde_json::json;

use crate::{
    client::Fly,
    models::{
        CheckConfig, CreateMachineRequest, GuestConfig, MachineConfig, RestartConfig,
        ServiceConfig, ServicePort,
    },
};

#[derive(Clone)]
pub struct FlyProvider {
    client: Fly,
}

impl FlyProvider {
    pub fn new(client: Fly) -> Self {
        Self { client }
    }

    fn app_name(&self, deployment: &DeploymentSpec) -> String {
        deployment.provider_service_id.clone().unwrap_or_else(|| {
            provider_app_name(
                self.client.app_name_prefix(),
                deployment.workspace_id,
                deployment.service_id,
                &deployment.app_name,
            )
        })
    }

    fn network_name(&self, deployment: &DeploymentSpec) -> String {
        format!("{}-network", self.app_name(deployment))
    }
}

#[async_trait]
impl DeployProvider for FlyProvider {
    fn provider(&self) -> ProviderKind {
        ProviderKind::Fly
    }

    async fn ensure_service(&self, deployment: &DeploymentSpec) -> DeployResult<ProviderService> {
        let app_name = self.app_name(deployment);
        let network = self.network_name(deployment);
        let app = self.client.ensure_app(&app_name, &network).await?;
        Ok(ProviderService {
            provider: ProviderKind::Fly,
            provider_service_id: app.name,
            url: Some(self.client.app_url(&app_name)),
            metadata: json!({
                "fly_app_id": app.id,
                "network": network,
                "status": app.status,
                "organization": app.organization,
            }),
        })
    }

    async fn deploy_image(&self, deployment: &DeploymentSpec) -> DeployResult<ProviderDeployment> {
        let service = self.ensure_service(deployment).await?;
        let app_name = service.provider_service_id.clone();
        let mut env = deployment.env.clone();
        env.extend(deployment.secrets.clone());
        env.insert("PORT".into(), deployment.internal_port.to_string());

        let mut checks = BTreeMap::new();
        checks.insert(
            "http".into(),
            CheckConfig {
                kind: "http".into(),
                port: deployment.internal_port,
                interval: "15s".into(),
                timeout: "10s".into(),
                grace_period: "30s".into(),
                method: "GET".into(),
                path: deployment.health_check_path.clone(),
                protocol: "http".into(),
            },
        );
        let mut metadata = BTreeMap::new();
        metadata.insert(
            "produktive_service_id".into(),
            deployment.service_id.to_string(),
        );
        metadata.insert(
            "produktive_deployment_id".into(),
            deployment.deployment_id.to_string(),
        );

        let body = CreateMachineRequest {
            name: format!("deploy-{}", deployment.deployment_id.simple()),
            region: deployment.region.clone(),
            skip_launch: false,
            skip_service_registration: false,
            config: MachineConfig {
                image: deployment.image.clone(),
                env,
                guest: GuestConfig {
                    cpu_kind: deployment.resource_preset.cpu_kind().into(),
                    cpus: deployment.resource_preset.cpus(),
                    memory_mb: deployment.resource_preset.memory_mb(),
                },
                services: vec![ServiceConfig {
                    protocol: "tcp".into(),
                    internal_port: deployment.internal_port,
                    ports: vec![
                        ServicePort {
                            port: 80,
                            handlers: vec!["http".into()],
                        },
                        ServicePort {
                            port: 443,
                            handlers: vec!["tls".into(), "http".into()],
                        },
                    ],
                }],
                checks,
                restart: RestartConfig {
                    policy: "always".into(),
                },
                metadata,
            },
        };

        let machine = self.client.create_machine(&app_name, &body).await?;
        let machine_id = machine.id.clone();
        Ok(ProviderDeployment {
            provider: ProviderKind::Fly,
            provider_deployment_id: machine_id.clone(),
            provider_instance_id: Some(machine_id.clone()),
            status: DeploymentStatus::from_provider_state(machine.state.as_deref().unwrap_or("")),
            image_digest: machine.image_ref.and_then(|image| image.digest),
            url: Some(self.client.app_url(&app_name)),
            metadata: json!({
                "app_name": app_name,
                "machine_id": machine_id,
                "machine_instance_id": machine.instance_id,
                "region": machine.region,
                "state": machine.state,
                "name": machine.name,
                "created_at": machine.created_at,
                "updated_at": machine.updated_at,
                "config": machine.config,
            }),
        })
    }

    async fn refresh_deployment(
        &self,
        deployment: &DeploymentSpec,
    ) -> DeployResult<ProviderDeployment> {
        let app_name = self.app_name(deployment);
        let Some(machine_id) = deployment.provider_instance_id.as_deref() else {
            return Ok(ProviderDeployment {
                provider: ProviderKind::Fly,
                provider_deployment_id: deployment.deployment_id.to_string(),
                provider_instance_id: None,
                status: DeploymentStatus::Queued,
                image_digest: deployment.image_digest.clone(),
                url: Some(self.client.app_url(&app_name)),
                metadata: json!({ "app_name": app_name }),
            });
        };
        let machine = self.client.get_machine(&app_name, machine_id).await?;
        let refreshed_machine_id = machine.id.clone();
        Ok(ProviderDeployment {
            provider: ProviderKind::Fly,
            provider_deployment_id: refreshed_machine_id.clone(),
            provider_instance_id: Some(refreshed_machine_id.clone()),
            status: DeploymentStatus::from_provider_state(machine.state.as_deref().unwrap_or("")),
            image_digest: machine.image_ref.and_then(|image| image.digest),
            url: Some(self.client.app_url(&app_name)),
            metadata: json!({
                "app_name": app_name,
                "machine_id": refreshed_machine_id,
                "machine_instance_id": machine.instance_id,
                "state": machine.state,
                "region": machine.region,
                "updated_at": machine.updated_at,
            }),
        })
    }

    async fn stop_service(&self, deployment: &DeploymentSpec) -> DeployResult<()> {
        let Some(machine_id) = deployment.provider_instance_id.as_deref() else {
            return Ok(());
        };
        self.client
            .stop_machine(&self.app_name(deployment), machine_id)
            .await
    }

    async fn logs(&self, _query: &LogQuery) -> DeployResult<Vec<LogLine>> {
        Ok(Vec::new())
    }

    async fn metrics(&self, _query: &MetricQuery) -> DeployResult<Vec<MetricPoint>> {
        Ok(Vec::new())
    }
}

#[cfg(test)]
mod tests {
    use deploy::ResourcePreset;
    use uuid::Uuid;

    use super::*;

    #[test]
    fn derives_app_name_without_provider_id() {
        let fly = Fly::builder()
            .api_token("token")
            .org_slug("personal")
            .app_name_prefix("prd")
            .build()
            .unwrap();
        let provider = FlyProvider::new(fly);
        let deployment = DeploymentSpec {
            workspace_id: Uuid::parse_str("018f18e0-0000-7000-8000-000000000000").unwrap(),
            service_id: Uuid::parse_str("018f18e0-1111-7000-8000-000000000000").unwrap(),
            deployment_id: Uuid::now_v7(),
            provider_service_id: None,
            provider_instance_id: None,
            app_name: "api".into(),
            image: "ghcr.io/acme/api:latest".into(),
            image_digest: None,
            internal_port: 3000,
            environment: "production".into(),
            health_check_path: "/health".into(),
            region: "fra".into(),
            resource_preset: ResourcePreset::PreviewSmall,
            env: BTreeMap::new(),
            secrets: BTreeMap::new(),
        };

        assert_eq!(provider.app_name(&deployment), "prd-018f18e0-018f18e0-api");
    }
}
