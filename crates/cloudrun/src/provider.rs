use std::collections::BTreeMap;

use async_trait::async_trait;
use chrono::Utc;
use deploy::{
    cloud_run_region, provider_app_name, validate_machine_count, DeployError, DeployProvider,
    DeployResult, DeploymentSpec, DeploymentStatus, LogLine, LogQuery, MetricPoint, MetricQuery,
    ProviderDeployment, ProviderDomain, ProviderInstance, ProviderKind, ProviderService,
    ProviderServiceRef,
};
use serde_json::{json, Value};

use crate::client::CloudRun;
use crate::models::{
    Container, EnvVar, Port, Resources, RevisionTemplate, Scaling, ServiceRequest, ServiceResponse,
};

/// Cloud Run service names back a `*.run.app` subdomain and are limited to 49
/// characters (stricter than the generic 63-char provider name cap).
const MAX_SERVICE_NAME: usize = 49;
/// Revision names must be `<= 63` chars and prefixed with the service name.
const MAX_REVISION_NAME: usize = 63;

#[derive(Clone)]
pub struct CloudRunProvider {
    client: CloudRun,
}

impl CloudRunProvider {
    pub fn new(client: CloudRun) -> Self {
        Self { client }
    }

    /// The underlying Artifact Registry base for git builds, if configured.
    pub fn artifact_registry(&self) -> Option<&str> {
        self.client.artifact_registry()
    }

    /// A short-lived Artifact Registry push token (username `oauth2accesstoken`).
    pub async fn access_token(&self) -> DeployResult<String> {
        self.client.access_token().await
    }

    fn service_name(&self, deployment: &DeploymentSpec) -> String {
        deployment.provider_service_id.clone().unwrap_or_else(|| {
            cloud_run_service_name(
                self.client.app_name_prefix(),
                deployment.workspace_id,
                deployment.service_id,
                &deployment.app_name,
            )
        })
    }

    fn ref_service_name(&self, service: &ProviderServiceRef) -> String {
        service.provider_service_id.clone().unwrap_or_else(|| {
            cloud_run_service_name(
                self.client.app_name_prefix(),
                service.workspace_id,
                service.service_id,
                &service.app_name,
            )
        })
    }
}

#[async_trait]
impl DeployProvider for CloudRunProvider {
    fn provider(&self) -> ProviderKind {
        ProviderKind::CloudRun
    }

    async fn ensure_service(&self, deployment: &DeploymentSpec) -> DeployResult<ProviderService> {
        // Cloud Run has no separate "app" resource — a service is created on the
        // first deploy. We only resolve the deterministic name here.
        let name = self.service_name(deployment);
        Ok(ProviderService {
            provider: ProviderKind::CloudRun,
            provider_service_id: name.clone(),
            url: None,
            metadata: json!({ "service_name": name }),
        })
    }

    async fn deploy_image(&self, deployment: &DeploymentSpec) -> DeployResult<ProviderDeployment> {
        if !deployment.volumes.is_empty() {
            return Err(DeployError::Validation(
                "Cloud Run services do not support volumes".into(),
            ));
        }
        let max_instances = u32::from(validate_machine_count(deployment.machine_count)?);
        let location = cloud_run_region(&deployment.region);
        let service_name = self.service_name(deployment);
        let revision = revision_name(&service_name, deployment);

        // Cloud Run reserves the PORT env var (it injects PORT = containerPort), so
        // it must not be set explicitly. The container is told to listen on the
        // service's internal port.
        let mut env = deployment.env.clone();
        env.extend(deployment.secrets.clone());
        let env = env
            .into_iter()
            .map(|(name, value)| EnvVar { name, value })
            .collect();

        let mut limits = BTreeMap::new();
        limits.insert(
            "cpu".to_owned(),
            deployment.resource_preset.cpus().to_string(),
        );
        limits.insert(
            "memory".to_owned(),
            format!("{}Mi", deployment.resource_preset.memory_mb()),
        );

        let mut labels = BTreeMap::new();
        labels.insert(
            "produktive-service-id".to_owned(),
            deployment.service_id.simple().to_string(),
        );
        labels.insert(
            "produktive-deployment-id".to_owned(),
            deployment.deployment_id.simple().to_string(),
        );

        let body = ServiceRequest {
            labels,
            ingress: "INGRESS_TRAFFIC_ALL",
            template: RevisionTemplate {
                revision: Some(revision.clone()),
                containers: vec![Container {
                    image: deployment.image.clone(),
                    ports: vec![Port {
                        container_port: deployment.internal_port,
                    }],
                    env,
                    resources: Resources { limits },
                }],
                scaling: Scaling {
                    min_instance_count: 0,
                    max_instance_count: max_instances,
                },
            },
        };

        self.client
            .upsert_service(location, &service_name, &body)
            .await?;

        // Make the service publicly reachable. Best-effort: some org policies
        // forbid `allUsers`, in which case the deploy still succeeds and the
        // failure is recorded in metadata rather than aborting the deployment.
        let iam_error = self
            .client
            .set_invoker_public(location, &service_name)
            .await
            .err()
            .map(|error| error.to_string());

        let service = self
            .client
            .get_service(location, &service_name)
            .await?
            .unwrap_or_default();
        let status = map_status(&service, &revision);
        let url = service.uri.clone();
        let metadata = deployment_metadata(
            &service_name,
            location,
            &revision,
            &service,
            &url,
            iam_error.as_deref(),
        );

        Ok(ProviderDeployment {
            provider: ProviderKind::CloudRun,
            provider_deployment_id: revision.clone(),
            provider_instance_id: Some(revision.clone()),
            status,
            image_digest: None,
            url,
            volumes: Vec::new(),
            instances: vec![instance(deployment, &revision, location, status, &service)],
            metadata,
        })
    }

    async fn refresh_deployment(
        &self,
        deployment: &DeploymentSpec,
    ) -> DeployResult<ProviderDeployment> {
        let location = cloud_run_region(&deployment.region);
        let service_name = self.service_name(deployment);
        let revision = deployment
            .provider_instance_id
            .clone()
            .unwrap_or_else(|| revision_name(&service_name, deployment));

        let Some(service) = self.client.get_service(location, &service_name).await? else {
            // The service is gone — treat this deployment as stopped.
            return Ok(ProviderDeployment {
                provider: ProviderKind::CloudRun,
                provider_deployment_id: revision.clone(),
                provider_instance_id: Some(revision),
                status: DeploymentStatus::Stopped,
                image_digest: deployment.image_digest.clone(),
                url: None,
                volumes: Vec::new(),
                instances: Vec::new(),
                metadata: json!({ "service_name": service_name }),
            });
        };
        let status = map_status(&service, &revision);
        let url = service.uri.clone();
        let metadata =
            deployment_metadata(&service_name, location, &revision, &service, &url, None);
        Ok(ProviderDeployment {
            provider: ProviderKind::CloudRun,
            provider_deployment_id: revision.clone(),
            provider_instance_id: Some(revision.clone()),
            status,
            image_digest: deployment.image_digest.clone(),
            url,
            volumes: Vec::new(),
            instances: vec![instance(deployment, &revision, location, status, &service)],
            metadata,
        })
    }

    async fn stop_service(&self, _deployment: &DeploymentSpec) -> DeployResult<()> {
        // Cloud Run revisions cannot be individually stopped; superseded revisions
        // scale to zero on their own. Nothing to do per deployment.
        Ok(())
    }

    async fn destroy_deployment(&self, deployment: &DeploymentSpec) -> DeployResult<()> {
        // Best-effort delete of this deployment's (non-serving) revision so old
        // revisions don't accumulate. Deleting the serving revision fails on the
        // Cloud Run side and is ignored.
        let Some(revision) = deployment.provider_instance_id.as_deref() else {
            return Ok(());
        };
        let location = cloud_run_region(&deployment.region);
        let service_name = self.service_name(deployment);
        let _ = self
            .client
            .delete_revision(location, &service_name, revision)
            .await;
        Ok(())
    }

    async fn destroy_service(&self, service: &ProviderServiceRef) -> DeployResult<()> {
        // The service ref carries no region, so attempt deletion across every
        // enabled location; a missing service in a location is a no-op.
        let service_name = self.ref_service_name(service);
        let mut first_error = None;
        for code in deploy::ALLOWED_REGION_CODES {
            let location = cloud_run_region(code);
            match self.client.delete_service(location, &service_name).await {
                Ok(()) => {}
                Err(error) if first_error.is_none() => first_error = Some(error),
                Err(_) => {}
            }
        }
        match first_error {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }

    async fn delete_volume(
        &self,
        _service: &ProviderServiceRef,
        _provider_volume_id: &str,
    ) -> DeployResult<()> {
        // Cloud Run has no volumes; nothing to delete.
        Ok(())
    }

    async fn ensure_domain(
        &self,
        _service: &ProviderServiceRef,
        _hostname: &str,
    ) -> DeployResult<ProviderDomain> {
        Err(DeployError::Validation(
            "custom domains are not supported on Cloud Run services yet".into(),
        ))
    }

    async fn check_domain(
        &self,
        _service: &ProviderServiceRef,
        hostname: &str,
    ) -> DeployResult<ProviderDomain> {
        Ok(ProviderDomain {
            provider: ProviderKind::CloudRun,
            hostname: hostname.to_owned(),
            provider_domain_id: None,
            status: "failed".into(),
            configured: false,
            dns_requirements: json!([]),
            validation_errors: json!(["custom domains are not supported on Cloud Run"]),
            metadata: json!({}),
        })
    }

    async fn delete_domain(
        &self,
        _service: &ProviderServiceRef,
        _hostname: &str,
    ) -> DeployResult<()> {
        Ok(())
    }

    async fn logs(&self, query: &LogQuery) -> DeployResult<Vec<LogLine>> {
        let Some(service_name) = query.provider_service_id.as_deref() else {
            return Ok(Vec::new());
        };
        let entries = self.client.list_logs(service_name, query.limit).await?;
        Ok(entries.into_iter().map(log_line).collect())
    }

    async fn metrics(&self, _query: &MetricQuery) -> DeployResult<Vec<MetricPoint>> {
        // Cloud Monitoring time-series ingestion is not implemented for v1.
        Ok(Vec::new())
    }
}

/// Build a Cloud-Run-safe service name (`<= 49` chars, leading letter, trailing
/// alphanumeric) from the shared provider naming scheme.
fn cloud_run_service_name(
    prefix: &str,
    workspace_id: uuid::Uuid,
    service_id: uuid::Uuid,
    slug: &str,
) -> String {
    let base = provider_app_name(prefix, workspace_id, service_id, slug);
    let mut truncated: String = base.chars().take(MAX_SERVICE_NAME).collect();
    while truncated.ends_with('-') {
        truncated.pop();
    }
    truncated
}

fn revision_name(service_name: &str, deployment: &DeploymentSpec) -> String {
    let suffix = &deployment.deployment_id.simple().to_string()[..8];
    let mut name = format!("{service_name}-{suffix}");
    if name.len() > MAX_REVISION_NAME {
        // Trim the service portion so the suffix (which makes the revision unique
        // per deployment) is preserved.
        let keep = MAX_REVISION_NAME - suffix.len() - 1;
        let mut head: String = service_name.chars().take(keep).collect();
        while head.ends_with('-') {
            head.pop();
        }
        name = format!("{head}-{suffix}");
    }
    name
}

fn map_status(service: &ServiceResponse, our_revision: &str) -> DeploymentStatus {
    let state = service
        .terminal_condition
        .as_ref()
        .and_then(|condition| condition.state.as_deref())
        .or_else(|| {
            service
                .conditions
                .iter()
                .find(|condition| condition.type_.as_deref() == Some("Ready"))
                .and_then(|condition| condition.state.as_deref())
        })
        .unwrap_or("");
    let ready_is_ours = service
        .latest_ready_revision
        .as_deref()
        .is_some_and(|revision| revision_matches(revision, our_revision));
    let created_is_ours = service
        .latest_created_revision
        .as_deref()
        .is_some_and(|revision| revision_matches(revision, our_revision));
    match state {
        "CONDITION_SUCCEEDED" if ready_is_ours => DeploymentStatus::Live,
        // Only surface a failure for the revision we just created; a failure on a
        // newer revision must not fail this (older) deployment.
        "CONDITION_FAILED" if created_is_ours => DeploymentStatus::Failed,
        _ => DeploymentStatus::Provisioning,
    }
}

fn revision_matches(value: &str, revision: &str) -> bool {
    value == revision || value.rsplit('/').next() == Some(revision)
}

fn instance(
    deployment: &DeploymentSpec,
    revision: &str,
    location: &str,
    status: DeploymentStatus,
    service: &ServiceResponse,
) -> ProviderInstance {
    ProviderInstance {
        provider_instance_id: revision.to_owned(),
        status,
        region: deployment.region.clone(),
        cpu_kind: "shared".to_owned(),
        cpus: deployment.resource_preset.cpus(),
        memory_mb: deployment.resource_preset.memory_mb(),
        metadata: json!({
            "revision": revision,
            "location": location,
            "uri": service.uri,
            "latest_ready_revision": service.latest_ready_revision,
        }),
    }
}

fn deployment_metadata(
    service_name: &str,
    location: &str,
    revision: &str,
    service: &ServiceResponse,
    url: &Option<String>,
    iam_error: Option<&str>,
) -> Value {
    json!({
        // `app_name` is consumed by the worker to backfill deploy_services.provider_service_id.
        "app_name": service_name,
        "service_name": service_name,
        "location": location,
        "revision": revision,
        "url": url,
        "latest_ready_revision": service.latest_ready_revision,
        "latest_created_revision": service.latest_created_revision,
        "terminal_condition": service.terminal_condition.as_ref().map(|condition| json!({
            "type": condition.type_,
            "state": condition.state,
            "message": condition.message,
            "reason": condition.reason,
        })),
        "iam_error": iam_error,
    })
}

fn log_line(entry: crate::models::LogEntry) -> LogLine {
    let timestamp = entry
        .timestamp
        .as_deref()
        .and_then(|raw| chrono::DateTime::parse_from_rfc3339(raw).ok())
        .unwrap_or_else(|| Utc::now().fixed_offset());
    let severity = entry.severity.clone().unwrap_or_default();
    let stream = if matches!(
        severity.as_str(),
        "ERROR" | "CRITICAL" | "ALERT" | "EMERGENCY"
    ) {
        "stderr"
    } else {
        "stdout"
    };
    let message = entry
        .text_payload
        .clone()
        .or_else(|| entry.json_payload.as_ref().map(|value| value.to_string()))
        .unwrap_or_default();
    LogLine {
        timestamp,
        stream: stream.to_owned(),
        message,
        source_id: entry.insert_id.clone(),
        provider_instance_id: None,
        metadata: json!({ "severity": severity, "labels": entry.labels }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn spec(region: &str, machine_count: u16) -> DeploymentSpec {
        DeploymentSpec {
            workspace_id: Uuid::parse_str("018f18e0-0000-7000-8000-000000000000").unwrap(),
            service_id: Uuid::parse_str("018f18e0-1111-7000-8000-000000000000").unwrap(),
            deployment_id: Uuid::parse_str("018f18e0-2222-7000-8000-000000000000").unwrap(),
            provider: ProviderKind::CloudRun,
            provider_service_id: None,
            provider_instance_id: None,
            provider_instance_ids: Vec::new(),
            app_name: "api".into(),
            image: "ghcr.io/acme/api:latest".into(),
            image_digest: None,
            internal_port: 8080,
            environment: "production".into(),
            health_check_path: "/health".into(),
            region: region.into(),
            resource_preset: deploy::ResourcePreset::PreviewSmall,
            machine_count,
            volumes: Vec::new(),
            env: BTreeMap::new(),
            secrets: BTreeMap::new(),
        }
    }

    #[test]
    fn service_name_is_bounded_and_well_formed() {
        let name = cloud_run_service_name(
            "prd",
            Uuid::parse_str("018f18e0-0000-7000-8000-000000000000").unwrap(),
            Uuid::parse_str("018f18e0-1111-7000-8000-000000000000").unwrap(),
            "a-very-long-service-slug-that-keeps-going-and-going",
        );
        assert!(name.len() <= MAX_SERVICE_NAME, "{name} too long");
        assert!(!name.ends_with('-'));
        assert!(name.starts_with("prd-"));
    }

    #[test]
    fn revision_name_is_deterministic_and_bounded() {
        let deployment = spec("ams", 1);
        let service = cloud_run_service_name(
            "prd",
            deployment.workspace_id,
            deployment.service_id,
            &deployment.app_name,
        );
        let revision = revision_name(&service, &deployment);
        assert!(revision.starts_with(&service));
        assert!(revision.len() <= MAX_REVISION_NAME);
        // Stable across calls for the same deployment id (idempotent retries).
        assert_eq!(revision, revision_name(&service, &deployment));
    }

    #[test]
    fn maps_terminal_conditions_to_status() {
        let revision = "svc-abcd1234";
        let mut service = ServiceResponse {
            latest_ready_revision: Some(format!(
                "projects/test/locations/europe-west4/services/svc/revisions/{revision}"
            )),
            latest_created_revision: Some(format!(
                "projects/test/locations/europe-west4/services/svc/revisions/{revision}"
            )),
            ..Default::default()
        };
        service.terminal_condition = Some(crate::models::Condition {
            state: Some("CONDITION_SUCCEEDED".into()),
            ..Default::default()
        });
        assert_eq!(map_status(&service, revision), DeploymentStatus::Live);

        // Succeeded but a different revision is ready → still provisioning for us.
        service.latest_ready_revision = Some("svc-other".into());
        assert_eq!(
            map_status(&service, revision),
            DeploymentStatus::Provisioning
        );

        // Failure on our created revision surfaces as Failed.
        service.terminal_condition = Some(crate::models::Condition {
            state: Some("CONDITION_FAILED".into()),
            ..Default::default()
        });
        assert_eq!(map_status(&service, revision), DeploymentStatus::Failed);

        // Failure attributed to a newer revision does not fail us.
        service.latest_created_revision = Some("svc-newer".into());
        assert_eq!(
            map_status(&service, revision),
            DeploymentStatus::Provisioning
        );
    }

    #[test]
    fn maps_ready_condition_to_live_without_terminal_condition() {
        let revision = "svc-abcd1234";
        let service = ServiceResponse {
            latest_ready_revision: Some(format!(
                "projects/test/locations/europe-west4/services/svc/revisions/{revision}"
            )),
            conditions: vec![crate::models::Condition {
                type_: Some("Ready".into()),
                state: Some("CONDITION_SUCCEEDED".into()),
                ..Default::default()
            }],
            ..Default::default()
        };
        assert_eq!(map_status(&service, revision), DeploymentStatus::Live);
    }

    #[tokio::test]
    async fn rejects_volumes() {
        let client = CloudRun::from_config(crate::client::CloudRunConfig {
            service_account_json: test_sa_json(),
            project_id: Some("test-project".into()),
            app_name_prefix: "prd".into(),
            artifact_registry: None,
            api_hostname: None,
            logging_hostname: None,
        })
        .expect("client builds");
        let provider = CloudRunProvider::new(client);
        let mut deployment = spec("ams", 1);
        deployment.volumes = vec![deploy::VolumeSpec {
            id: Uuid::now_v7(),
            provider_volume_id: None,
            name: "data".into(),
            mount_path: "/data".into(),
            region: "ams".into(),
            size_gb: 1,
        }];
        let error = provider.deploy_image(&deployment).await.unwrap_err();
        assert!(matches!(error, DeployError::Validation(message) if message.contains("volumes")));
    }

    /// A throwaway RSA key (PKCS#8) so the client/auth layer can be constructed in
    /// tests without a real service account. Never used to reach Google.
    fn test_sa_json() -> String {
        json!({
            "client_email": "test@test-project.iam.gserviceaccount.com",
            "private_key": TEST_PRIVATE_KEY,
            "token_uri": "https://oauth2.googleapis.com/token",
            "project_id": "test-project",
        })
        .to_string()
    }

    const TEST_PRIVATE_KEY: &str = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC8/i0xnUqJH4pr\n+hOVfehn0tPX3itExiiG7ltd1vxlN9kQFg9dPm/V5gCVgHVOQjh7DjAID8l/i4sl\nNo64r11YzQF3mPIWvHkOiuGsfcCIkhwevMrfsTRuTrG93ZqhEgvlZnzwTYeOHIAI\n0f8VobgSzzHVHl9cxjug6CFt2IvGUw9HujVwIjWvzRoAc8uwLQWlxgftjp37o8tB\nfHXK8pcJF9NcWJL0s3987UY1HXVQIbwKjiy00xjBqAswNa/i0aD05rwj0NDna+v4\nSFlxUIjRbZ4N5jFuP3xQAIoSr0r2EpYwQWc9Iq9Zq7+HC5degQhJyUSmtQWHn6vk\nUfWrR/tJAgMBAAECggEAHRxevD1w6XG3Cd5FjXmNJo7iLCZPzmJihDQrVSdEDdg+\nIlzvhWqUYeNxdBXLG+CV4BiFm/xIipGlP3hpn/d9HqxHPVOM+KUT1YJddAsTsMWm\nuLJWYoHiZFpRRQBhLM3BkNaKSJ58ko5/xzwHeV7FYnpRP/VTdZAgR67x1UBteUD2\nrzReJx+N0xT91vwFStOvMJiBIwS65lGRh44w5fEounX0xHNdeU3HOV8smysr6ikv\nLnT6lPnn7vJA2s09azToNneuQ3sAGBjYlgQs5dsInZle/5Hzur4FbN9nstcOq/FD\nYw8QkJj48AJVcK5hDHoWhXYLx9HH7MNDKyb2/h/oPQKBgQDlceYwNBSpvOcNKNxf\nJVpD9NVSnPQANbOf16VVmMuTREVPAbk3ewxh2iF1vsnSWsuSVSbIqX4jAiy0iNyR\nd6VPuVqGxU1t3gXPTnEAzhl5918pSDQoxTCSAG/J3X4N+xw3bXbSZPqUyc6P28NP\npjG3nl2hOL2MVFnbpBMsyFFIlQKBgQDS3b7WBXeb0g/9o72iUkjMoHU2ld7+mGl0\nzsKUSHEwBLygM4owsgcDSIsiiV1kP34BzS/tmLTNjntpzIRIJKB15KyhoDAuA288\noGNYw3lwE9uh/xeSqB0UrUlchNP6QKisHNAuyvF8ADT+2erHhh6WIo1nsrpejW2X\niT8D/3BW5QKBgQC95rFgQBrCCckqCSGr1hyJlkBhKeqBqfDLYQ5EdDw53Q2IQKLt\nmng7HPEIpSohYmiO6s840Z/GlewuWABGncJC4+RbGz3kqxgf5op84hgP7H/kiRAy\nllKG5LmhWCMWqzlFXuIzbMRBFW5Tfs5+Q81ubjKMV4v6c24T7g64x+sOqQKBgHOf\n4+S3Wr62kM4j2vgG5qRN1/f2djBkom7KcSeeEXKjJksx97R76hyCyshFSlCOACo8\nuOsvsPSGDGYXHvHwI4yBt6dojwKsH3K+/7rMdOpf+S77EZH5XPjZjECPFS1EBzlZ\nE06VOZUlB+o20+ZURLFOgPs7pbXzFwTg3Qz0JEWBAoGAMIsD7K2pnbuyeBeZSL5r\nXif9ofYqUFBCe1Uu4tYXBrUxI3dGGIhS9hcL00fLO9m5onRLUpId70q9X5bk4816\nN8SxJibd81+Y1fDIArp9I5FgWZZ0jAcgApE8YP3AxcxE/pKETo9p7omzbb8FR4/0\n3vjBhXrZOHBe/FI4KnoAFpg=\n-----END PRIVATE KEY-----\n";
}
