use std::collections::BTreeMap;

use async_trait::async_trait;
use deploy::{
    provider_app_name, validate_machine_count, DeployError, DeployProvider, DeployResult,
    DeploymentSpec, DeploymentStatus, LogLine, LogQuery, MetricPoint, MetricQuery,
    ProviderDeployment, ProviderDomain, ProviderInstance, ProviderKind, ProviderService,
    ProviderServiceRef, ProviderVolume, VolumeSpec,
};
use serde_json::{json, Value};

use crate::{
    client::Fly,
    models::{
        CertificateResponse, CreateMachineRequest, CreateVolumeRequest, GuestConfig, MachineConfig,
        MachineMountConfig, MachineResponse, RestartConfig, ServiceConfig, ServicePort,
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

    fn service_app_name(&self, service: &ProviderServiceRef) -> String {
        service.provider_service_id.clone().unwrap_or_else(|| {
            provider_app_name(
                self.client.app_name_prefix(),
                service.workspace_id,
                service.service_id,
                &service.app_name,
            )
        })
    }

    fn network_name(&self, deployment: &DeploymentSpec) -> String {
        format!("{}-network", self.app_name(deployment))
    }

    fn deployment_machine_ids(deployment: &DeploymentSpec) -> Vec<String> {
        let mut ids = Vec::new();
        if let Some(id) = deployment.provider_instance_id.as_deref() {
            ids.push(id.to_owned());
        }
        for id in &deployment.provider_instance_ids {
            if !ids.iter().any(|existing| existing == id) {
                ids.push(id.clone());
            }
        }
        ids
    }

    fn provider_domain(&self, certificate: CertificateResponse) -> ProviderDomain {
        let status = normalize_certificate_status(&certificate);
        let configured = certificate.configured.unwrap_or(false) || status == "active";
        ProviderDomain {
            provider: ProviderKind::Fly,
            provider_domain_id: Some(certificate.hostname.clone()),
            hostname: certificate.hostname.clone(),
            status,
            configured,
            dns_requirements: certificate.dns_requirements.unwrap_or_else(|| json!({})),
            validation_errors: certificate.validation_errors.unwrap_or_else(|| json!([])),
            metadata: json!({
                "hostname": certificate.hostname,
                "configured": certificate.configured,
                "acme_requested": certificate.acme_requested,
                "provider_status": certificate.status,
                "dns_provider": certificate.dns_provider,
                "rate_limited_until": certificate.rate_limited_until,
                "certificates": certificate.certificates,
                "validation": certificate.validation,
                "dns_records": certificate.dns_records,
            }),
        }
    }

    async fn ensure_volume(
        &self,
        app_name: &str,
        volume: &VolumeSpec,
    ) -> DeployResult<ProviderVolume> {
        if let Some(provider_volume_id) = volume.provider_volume_id.as_deref() {
            return Ok(ProviderVolume {
                volume_id: volume.id,
                provider_volume_id: provider_volume_id.to_owned(),
                name: volume.name.clone(),
                mount_path: volume.mount_path.clone(),
                region: volume.region.clone(),
                size_gb: volume.size_gb,
                metadata: json!({ "volume_id": provider_volume_id, "reused": true }),
            });
        }

        let created = self
            .client
            .create_volume(
                app_name,
                &CreateVolumeRequest {
                    name: volume.name.clone(),
                    region: volume.region.clone(),
                    size_gb: volume.size_gb,
                },
            )
            .await?;
        Ok(ProviderVolume {
            volume_id: volume.id,
            provider_volume_id: created.id.clone(),
            name: created.name.unwrap_or_else(|| volume.name.clone()),
            mount_path: volume.mount_path.clone(),
            region: created.region.unwrap_or_else(|| volume.region.clone()),
            size_gb: created.size_gb.unwrap_or(volume.size_gb),
            metadata: json!({
                "volume_id": created.id,
                "state": created.state,
                "created_at": created.created_at,
                "attached_machine_id": created.attached_machine_id,
                "host_status": created.host_status,
            }),
        })
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
        let public_ips = self.client.ensure_public_ips(&app_name).await?;
        Ok(ProviderService {
            provider: ProviderKind::Fly,
            provider_service_id: app.name,
            url: Some(self.client.app_url(&app_name)),
            metadata: json!({
                "fly_app_id": app.id,
                "network": network,
                "public_ips": public_ips
                    .into_iter()
                    .map(|ip| json!({
                        "id": ip.id,
                        "address": ip.address,
                        "type": ip.kind,
                    }))
                    .collect::<Vec<_>>(),
                "status": app.status,
                "organization": app.organization,
            }),
        })
    }

    async fn deploy_image(&self, deployment: &DeploymentSpec) -> DeployResult<ProviderDeployment> {
        let machine_count = validate_machine_count(deployment.machine_count)?;
        if deployment.volumes.len() > 1 {
            return Err(DeployError::Validation(
                "Fly Machines support only one volume mount per machine".into(),
            ));
        }
        if machine_count > 1 && !deployment.volumes.is_empty() {
            return Err(DeployError::Validation(
                "Fly Machines cannot attach the same volume to multiple machines".into(),
            ));
        }

        let service = self.ensure_service(deployment).await?;
        let app_name = service.provider_service_id.clone();
        let mut env = deployment.env.clone();
        env.extend(deployment.secrets.clone());
        env.insert("PORT".into(), deployment.internal_port.to_string());

        let mut provider_volumes = Vec::new();
        let mut mounts = Vec::new();
        for volume in &deployment.volumes {
            if volume.region != deployment.region {
                return Err(DeployError::Validation(format!(
                    "volume {} is in {}, but service deploy region is {}",
                    volume.name, volume.region, deployment.region
                )));
            }
            let provider_volume = self.ensure_volume(&app_name, volume).await?;
            mounts.push(MachineMountConfig {
                volume: provider_volume.provider_volume_id.clone(),
                path: provider_volume.mount_path.clone(),
            });
            provider_volumes.push(provider_volume);
        }

        let mut metadata = BTreeMap::new();
        metadata.insert(
            "produktive_service_id".into(),
            deployment.service_id.to_string(),
        );
        metadata.insert(
            "produktive_deployment_id".into(),
            deployment.deployment_id.to_string(),
        );

        // Adopt machines a prior attempt of THIS deployment already created
        // (machine names are deterministic per deployment id) so a retry —
        // whether the client-layer auth retry, a worker restart mid-deploy, or a
        // future job-level requeue — completes the deploy instead of duplicating
        // machines. A failed listing is propagated rather than risking a duplicate.
        let existing_machines = self.client.list_machines(&app_name).await?;

        let mut created = Vec::new();
        // Ids created in THIS attempt only; on partial failure we roll back our own
        // work but leave adopted/prior-progress machines for the next retry.
        let mut created_now = Vec::new();
        for index in 0..machine_count {
            let machine_name = if machine_count == 1 {
                format!("deploy-{}", deployment.deployment_id.simple())
            } else {
                format!(
                    "deploy-{}-{:02}",
                    deployment.deployment_id.simple(),
                    index + 1
                )
            };

            if let Some(existing) = find_adoptable_machine(&existing_machines, &machine_name) {
                created.push(existing.clone());
                continue;
            }

            let mut machine_metadata = metadata.clone();
            machine_metadata.insert("produktive_machine_index".into(), (index + 1).to_string());
            machine_metadata.insert("produktive_machine_count".into(), machine_count.to_string());
            let body = CreateMachineRequest {
                name: machine_name,
                region: deployment.region.clone(),
                skip_launch: false,
                skip_service_registration: false,
                config: MachineConfig {
                    image: deployment.image.clone(),
                    env: env.clone(),
                    guest: GuestConfig {
                        cpu_kind: deployment.resource_preset.cpu_kind().into(),
                        cpus: deployment.resource_preset.cpus(),
                        memory_mb: deployment.resource_preset.memory_mb(),
                    },
                    mounts: mounts
                        .iter()
                        .map(|mount| MachineMountConfig {
                            volume: mount.volume.clone(),
                            path: mount.path.clone(),
                        })
                        .collect(),
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
                    checks: BTreeMap::new(),
                    restart: RestartConfig {
                        policy: "always".into(),
                    },
                    metadata: machine_metadata,
                },
            };

            match self.client.create_machine(&app_name, &body).await {
                Ok(machine) => {
                    created_now.push(machine.id.clone());
                    created.push(machine);
                }
                Err(error) => {
                    for machine_id in &created_now {
                        let _ = self.client.delete_machine(&app_name, machine_id).await;
                    }
                    return Err(error);
                }
            }
        }

        let machine = created
            .first()
            .ok_or_else(|| DeployError::Provider("no Fly machine was created".into()))?;
        let machine_id = machine.id.clone();
        let instances = created
            .iter()
            .map(|machine| ProviderInstance {
                provider_instance_id: machine.id.clone(),
                status: DeploymentStatus::from_provider_state(
                    machine.state.as_deref().unwrap_or(""),
                ),
                region: machine
                    .region
                    .clone()
                    .unwrap_or_else(|| deployment.region.clone()),
                cpu_kind: deployment.resource_preset.cpu_kind().to_owned(),
                cpus: deployment.resource_preset.cpus(),
                memory_mb: deployment.resource_preset.memory_mb(),
                metadata: json!({
                    "machine_id": machine.id.clone(),
                    "machine_instance_id": machine.instance_id.clone(),
                    "region": machine.region.clone(),
                    "state": machine.state.clone(),
                    "name": machine.name.clone(),
                    "created_at": machine.created_at.clone(),
                    "updated_at": machine.updated_at.clone(),
                }),
            })
            .collect::<Vec<_>>();
        Ok(ProviderDeployment {
            provider: ProviderKind::Fly,
            provider_deployment_id: machine_id.clone(),
            provider_instance_id: Some(machine_id.clone()),
            status: DeploymentStatus::from_provider_state(machine.state.as_deref().unwrap_or("")),
            image_digest: machine.image_ref.clone().and_then(|image| image.digest),
            url: Some(self.client.app_url(&app_name)),
            volumes: provider_volumes.clone(),
            instances: instances.clone(),
            metadata: json!({
                "app_name": app_name,
                "machine_id": machine_id,
                "machine_count": machine_count,
                "machines": instances,
                "machine_instance_id": machine.instance_id.clone(),
                "region": machine.region.clone(),
                "state": machine.state.clone(),
                "name": machine.name.clone(),
                "created_at": machine.created_at.clone(),
                "updated_at": machine.updated_at.clone(),
                "volumes": provider_volumes,
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
                volumes: Vec::new(),
                instances: Vec::new(),
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
            image_digest: machine.image_ref.clone().and_then(|image| image.digest),
            url: Some(self.client.app_url(&app_name)),
            volumes: Vec::new(),
            instances: vec![ProviderInstance {
                provider_instance_id: refreshed_machine_id.clone(),
                status: DeploymentStatus::from_provider_state(
                    machine.state.as_deref().unwrap_or(""),
                ),
                region: machine
                    .region
                    .clone()
                    .unwrap_or_else(|| deployment.region.clone()),
                cpu_kind: deployment.resource_preset.cpu_kind().to_owned(),
                cpus: deployment.resource_preset.cpus(),
                memory_mb: deployment.resource_preset.memory_mb(),
                metadata: json!({
                    "machine_id": refreshed_machine_id.clone(),
                    "machine_instance_id": machine.instance_id.clone(),
                    "state": machine.state.clone(),
                    "region": machine.region.clone(),
                    "updated_at": machine.updated_at.clone(),
                }),
            }],
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
        let machine_ids = Self::deployment_machine_ids(deployment);
        if machine_ids.is_empty() {
            return Ok(());
        }
        let app_name = self.app_name(deployment);
        let mut first_error = None;
        for machine_id in machine_ids {
            match self.client.stop_machine(&app_name, &machine_id).await {
                Ok(()) | Err(deploy::DeployError::NotFound(_)) => {}
                Err(error) if first_error.is_none() => first_error = Some(error),
                Err(_) => {}
            }
        }
        if let Some(error) = first_error {
            return Err(error);
        }
        Ok(())
    }

    async fn destroy_deployment(&self, deployment: &DeploymentSpec) -> DeployResult<()> {
        let machine_ids = Self::deployment_machine_ids(deployment);
        if machine_ids.is_empty() {
            return Ok(());
        }
        let app_name = self.app_name(deployment);
        let mut first_error = None;
        for machine_id in machine_ids {
            match self.client.delete_machine(&app_name, &machine_id).await {
                Ok(()) | Err(deploy::DeployError::NotFound(_)) => {}
                Err(error) if first_error.is_none() => first_error = Some(error),
                Err(_) => {}
            }
        }
        if let Some(error) = first_error {
            return Err(error);
        }
        Ok(())
    }

    async fn destroy_service(&self, service: &ProviderServiceRef) -> DeployResult<()> {
        let app_name = self.service_app_name(service);
        match self.client.delete_app(&app_name).await {
            Ok(()) | Err(deploy::DeployError::NotFound(_)) => Ok(()),
            Err(error) => Err(error),
        }
    }

    async fn delete_volume(
        &self,
        service: &ProviderServiceRef,
        provider_volume_id: &str,
    ) -> DeployResult<()> {
        let app_name = self.service_app_name(service);
        match self
            .client
            .delete_volume(&app_name, provider_volume_id)
            .await
        {
            Ok(()) | Err(deploy::DeployError::NotFound(_)) => Ok(()),
            Err(error) => Err(error),
        }
    }

    async fn ensure_domain(
        &self,
        service: &ProviderServiceRef,
        hostname: &str,
    ) -> DeployResult<ProviderDomain> {
        let app_name = self.service_app_name(service);
        match self
            .client
            .request_acme_certificate(&app_name, hostname)
            .await
        {
            Ok(certificate) => Ok(self.provider_domain(certificate)),
            Err(deploy::DeployError::Provider(message))
                if message.contains("409") || message.to_ascii_lowercase().contains("already") =>
            {
                self.check_domain(service, hostname).await
            }
            Err(error) => Err(error),
        }
    }

    async fn check_domain(
        &self,
        service: &ProviderServiceRef,
        hostname: &str,
    ) -> DeployResult<ProviderDomain> {
        let app_name = self.service_app_name(service);
        let certificate = self.client.check_certificate(&app_name, hostname).await?;
        Ok(self.provider_domain(certificate))
    }

    async fn delete_domain(
        &self,
        service: &ProviderServiceRef,
        hostname: &str,
    ) -> DeployResult<()> {
        let app_name = self.service_app_name(service);
        match self.client.delete_certificate(&app_name, hostname).await {
            Ok(()) | Err(deploy::DeployError::NotFound(_)) => Ok(()),
            Err(error) => Err(error),
        }
    }

    async fn logs(&self, query: &LogQuery) -> DeployResult<Vec<LogLine>> {
        let Some(app_name) = query.provider_service_id.as_deref() else {
            return Ok(Vec::new());
        };
        self.client
            .logs(app_name, query.provider_instance_id.as_deref(), query.limit)
            .await
    }

    async fn metrics(&self, query: &MetricQuery) -> DeployResult<Vec<MetricPoint>> {
        let Some(app_name) = query.provider_service_id.as_deref() else {
            return Ok(Vec::new());
        };
        self.client.metrics(app_name, query.from, query.to).await
    }
}

/// Finds a machine a prior deploy attempt created that can be reused: one whose
/// name matches the deterministic per-deployment name and that is still alive.
/// Destroyed/destroying machines (e.g. rolled back by an earlier attempt) are
/// ignored so the deploy recreates them rather than adopting a dead machine.
fn find_adoptable_machine<'a>(
    machines: &'a [MachineResponse],
    name: &str,
) -> Option<&'a MachineResponse> {
    machines.iter().find(|machine| {
        machine.name.as_deref() == Some(name)
            && !matches!(
                machine.state.as_deref(),
                Some("destroyed") | Some("destroying")
            )
    })
}

fn normalize_certificate_status(certificate: &CertificateResponse) -> String {
    let provider_status = certificate
        .status
        .as_deref()
        .unwrap_or("pending_validation")
        .trim()
        .to_ascii_lowercase();
    if certificate.configured.unwrap_or(false) || provider_status == "active" {
        "active".into()
    } else if matches!(provider_status.as_str(), "failed" | "error") {
        "failed".into()
    } else if provider_status.is_empty()
        || has_validation_errors(certificate.validation_errors.as_ref())
    {
        "pending_validation".into()
    } else {
        provider_status
    }
}

fn has_validation_errors(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Array(values)) => !values.is_empty(),
        Some(Value::Null) | None => false,
        Some(Value::Object(values)) => !values.is_empty(),
        Some(Value::String(value)) => !value.trim().is_empty(),
        Some(_) => true,
    }
}

#[cfg(test)]
mod tests {
    use deploy::ResourcePreset;
    use uuid::Uuid;

    use super::*;

    fn machine(name: &str, state: &str) -> MachineResponse {
        MachineResponse {
            id: format!("id-{name}"),
            name: Some(name.into()),
            state: Some(state.into()),
            region: None,
            image_ref: None,
            instance_id: None,
            created_at: None,
            updated_at: None,
            config: None,
        }
    }

    #[test]
    fn adopts_live_machine_with_matching_name() {
        let machines = vec![machine("deploy-abc", "started")];
        let found = find_adoptable_machine(&machines, "deploy-abc");
        assert_eq!(found.map(|m| m.id.as_str()), Some("id-deploy-abc"));
    }

    #[test]
    fn ignores_machine_with_different_name() {
        let machines = vec![machine("deploy-other", "started")];
        assert!(find_adoptable_machine(&machines, "deploy-abc").is_none());
    }

    #[test]
    fn ignores_destroyed_or_destroying_machine() {
        for state in ["destroyed", "destroying"] {
            let machines = vec![machine("deploy-abc", state)];
            assert!(
                find_adoptable_machine(&machines, "deploy-abc").is_none(),
                "should not adopt a {state} machine"
            );
        }
    }

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
            provider_instance_ids: Vec::new(),
            app_name: "api".into(),
            image: "ghcr.io/acme/api:latest".into(),
            image_digest: None,
            internal_port: 3000,
            environment: "production".into(),
            health_check_path: "/health".into(),
            region: "fra".into(),
            resource_preset: ResourcePreset::PreviewSmall,
            machine_count: 1,
            volumes: Vec::new(),
            env: BTreeMap::new(),
            secrets: BTreeMap::new(),
        };

        assert_eq!(provider.app_name(&deployment), "prd-018f18e0-018f18e0-api");
    }

    #[tokio::test]
    async fn rejects_multiple_volumes_before_provider_calls() {
        let fly = Fly::builder()
            .api_token("token")
            .org_slug("personal")
            .app_name_prefix("prd")
            .build()
            .unwrap();
        let provider = FlyProvider::new(fly);
        let mut deployment = DeploymentSpec {
            workspace_id: Uuid::parse_str("018f18e0-0000-7000-8000-000000000000").unwrap(),
            service_id: Uuid::parse_str("018f18e0-1111-7000-8000-000000000000").unwrap(),
            deployment_id: Uuid::now_v7(),
            provider_service_id: None,
            provider_instance_id: None,
            provider_instance_ids: Vec::new(),
            app_name: "api".into(),
            image: "ghcr.io/acme/api:latest".into(),
            image_digest: None,
            internal_port: 3000,
            environment: "production".into(),
            health_check_path: "/health".into(),
            region: "fra".into(),
            resource_preset: ResourcePreset::PreviewSmall,
            machine_count: 1,
            volumes: Vec::new(),
            env: BTreeMap::new(),
            secrets: BTreeMap::new(),
        };
        deployment.volumes = vec![
            VolumeSpec {
                id: Uuid::now_v7(),
                provider_volume_id: None,
                name: "data".into(),
                mount_path: "/data".into(),
                region: "fra".into(),
                size_gb: 1,
            },
            VolumeSpec {
                id: Uuid::now_v7(),
                provider_volume_id: None,
                name: "cache".into(),
                mount_path: "/cache".into(),
                region: "fra".into(),
                size_gb: 1,
            },
        ];

        let error = provider.deploy_image(&deployment).await.unwrap_err();
        assert!(matches!(
            error,
            DeployError::Validation(message)
                if message == "Fly Machines support only one volume mount per machine"
        ));
    }

    #[tokio::test]
    async fn rejects_multi_machine_volume_before_provider_calls() {
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
            provider_instance_ids: Vec::new(),
            app_name: "api".into(),
            image: "ghcr.io/acme/api:latest".into(),
            image_digest: None,
            internal_port: 3000,
            environment: "production".into(),
            health_check_path: "/health".into(),
            region: "fra".into(),
            resource_preset: ResourcePreset::PreviewSmall,
            machine_count: 2,
            volumes: vec![VolumeSpec {
                id: Uuid::now_v7(),
                provider_volume_id: Some("vol_123".into()),
                name: "data".into(),
                mount_path: "/data".into(),
                region: "fra".into(),
                size_gb: 1,
            }],
            env: BTreeMap::new(),
            secrets: BTreeMap::new(),
        };

        let error = provider.deploy_image(&deployment).await.unwrap_err();
        assert!(matches!(
            error,
            DeployError::Validation(message)
                if message == "Fly Machines cannot attach the same volume to multiple machines"
        ));
    }
}
