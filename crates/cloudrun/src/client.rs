use std::time::Duration;

use deploy::{DeployError, DeployResult};
use reqwest::{RequestBuilder, StatusCode};
use serde::de::DeserializeOwned;

use crate::auth::{ServiceAccountKey, TokenSource};
use crate::models::{
    IamBinding, IamPolicy, ListLogEntriesRequest, ListLogEntriesResponse, LogEntry, Operation,
    ServiceRequest, ServiceResponse, SetIamPolicyRequest,
};

const DEFAULT_RUN_HOST: &str = "https://run.googleapis.com";
const DEFAULT_LOGGING_HOST: &str = "https://logging.googleapis.com";
const DEFAULT_ARTIFACT_REGISTRY_HOST: &str = "https://artifactregistry.googleapis.com";

/// Configuration for the Cloud Run provider. `service_account_json` is the raw
/// JSON service-account key (file contents); the remaining fields are resolved
/// from env by the API/worker.
#[derive(Debug, Clone)]
pub struct CloudRunConfig {
    pub service_account_json: String,
    /// Overrides the project id from the service-account key when set.
    pub project_id: Option<String>,
    pub app_name_prefix: String,
    /// Google Artifact Registry base for git-built images, e.g.
    /// `europe-west4-docker.pkg.dev/my-project/produktive`. `None` disables
    /// git-source builds for Cloud Run.
    pub artifact_registry: Option<String>,
    /// Override the Cloud Run API host (for tests). Defaults to the public API.
    pub api_hostname: Option<String>,
    /// Override the Cloud Logging API host (for tests).
    pub logging_hostname: Option<String>,
}

/// Thin typed client over the Cloud Run Admin API v2. Cheap to clone.
#[derive(Clone)]
pub struct CloudRun {
    http: reqwest::Client,
    tokens: TokenSource,
    project_id: String,
    run_base: String,
    logging_base: String,
    artifact_registry_base: String,
    app_name_prefix: String,
    artifact_registry: Option<String>,
}

impl CloudRun {
    pub fn from_config(config: CloudRunConfig) -> DeployResult<Self> {
        let key = ServiceAccountKey::from_json(&config.service_account_json)?;
        let project_id = config
            .project_id
            .clone()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| key.project_id.clone())
            .ok_or_else(|| {
                DeployError::Config(
                    "Cloud Run project id is required (set CLOUD_RUN_PROJECT_ID or use a key with project_id)".into(),
                )
            })?;
        let http = reqwest::Client::builder()
            .user_agent("produktive-cloudrun/0.1")
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|error| {
                DeployError::Config(format!("failed to build Cloud Run HTTP client: {error}"))
            })?;
        let tokens = TokenSource::new(key, http.clone())?;
        let host = config
            .api_hostname
            .unwrap_or_else(|| DEFAULT_RUN_HOST.to_owned());
        let logging_host = config
            .logging_hostname
            .unwrap_or_else(|| DEFAULT_LOGGING_HOST.to_owned());
        Ok(Self {
            http,
            tokens,
            project_id,
            run_base: format!("{}/v2", host.trim_end_matches('/')),
            logging_base: format!("{}/v2", logging_host.trim_end_matches('/')),
            artifact_registry_base: format!("{}/v1", DEFAULT_ARTIFACT_REGISTRY_HOST),
            app_name_prefix: config.app_name_prefix,
            artifact_registry: config.artifact_registry,
        })
    }

    pub fn app_name_prefix(&self) -> &str {
        &self.app_name_prefix
    }

    pub fn project_id(&self) -> &str {
        &self.project_id
    }

    pub fn artifact_registry(&self) -> Option<&str> {
        self.artifact_registry.as_deref()
    }

    /// A short-lived OAuth access token, used as the Artifact Registry push
    /// password (username `oauth2accesstoken`) during git builds.
    pub async fn access_token(&self) -> DeployResult<String> {
        self.tokens.token().await
    }

    fn service_path(&self, location: &str, service_id: &str) -> String {
        format!(
            "{}/projects/{}/locations/{}/services/{}",
            self.run_base, self.project_id, location, service_id
        )
    }

    fn services_path(&self, location: &str) -> String {
        format!(
            "{}/projects/{}/locations/{}/services",
            self.run_base, self.project_id, location
        )
    }

    /// Create or update a service (idempotent upsert via `allowMissing=true`).
    /// Returns the long-running operation; reconciliation completes asynchronously
    /// and is observed via [`Self::get_service`].
    pub async fn upsert_service(
        &self,
        location: &str,
        service_id: &str,
        body: &ServiceRequest,
    ) -> DeployResult<Operation> {
        // Create first; on 409 (already exists) fall back to PATCH so we never
        // depend on a single endpoint's upsert semantics.
        let create = self
            .http
            .post(self.services_path(location))
            .query(&[("serviceId", service_id)])
            .json(body);
        match self.send_json::<Operation>(create).await {
            Ok(op) => Ok(op),
            Err(DeployError::Provider(message)) if message.contains("409") => {
                let patch = self
                    .http
                    .patch(self.service_path(location, service_id))
                    .query(&[("allowMissing", "true")])
                    .json(body);
                self.send_json::<Operation>(patch).await
            }
            Err(error) => Err(error),
        }
    }

    /// Fetch a service. Returns `None` when the service does not exist.
    pub async fn get_service(
        &self,
        location: &str,
        service_id: &str,
    ) -> DeployResult<Option<ServiceResponse>> {
        let request = self.http.get(self.service_path(location, service_id));
        match self.send_json::<ServiceResponse>(request).await {
            Ok(service) => Ok(Some(service)),
            Err(DeployError::NotFound(_)) => Ok(None),
            Err(error) => Err(error),
        }
    }

    /// Delete a service. A missing service is treated as success.
    pub async fn delete_service(&self, location: &str, service_id: &str) -> DeployResult<()> {
        let request = self.http.delete(self.service_path(location, service_id));
        match self.send_operation(request).await {
            Ok(operation) => self.wait_operation(&self.run_base, operation).await,
            Err(DeployError::NotFound(_)) => Ok(()),
            Err(error) => Err(error),
        }
    }

    /// Delete all tags/versions for an image package in the configured Artifact
    /// Registry repository. Missing package/repository is treated as success.
    pub async fn delete_artifact_image_package(&self, image_name: &str) -> DeployResult<()> {
        let Some(target) = self.artifact_target(image_name)? else {
            return Ok(());
        };
        let package = urlencoding::encode(&target.package).into_owned();
        let url = format!(
            "{}/projects/{}/locations/{}/repositories/{}/packages/{}",
            self.artifact_registry_base,
            target.project,
            target.location,
            target.repository,
            package
        );
        let request = self.http.delete(url);
        match self.send_operation(request).await {
            Ok(operation) => {
                self.wait_operation(&self.artifact_registry_base, operation)
                    .await
            }
            Err(DeployError::NotFound(_)) => Ok(()),
            Err(error) => Err(error),
        }
    }

    /// Delete the Artifact Registry package that backs a pushed image reference.
    /// References outside the configured `CLOUD_RUN_ARTIFACT_REGISTRY` are ignored.
    pub async fn delete_artifact_image_ref(&self, image_ref: &str) -> DeployResult<()> {
        let Some(registry) = self.artifact_registry.as_deref() else {
            return Ok(());
        };
        let Some(package) = artifact_package_from_image_ref(registry, image_ref) else {
            return Ok(());
        };
        self.delete_artifact_image_package(&package).await
    }

    /// Best-effort delete of a single (superseded, non-serving) revision.
    pub async fn delete_revision(
        &self,
        location: &str,
        service_id: &str,
        revision: &str,
    ) -> DeployResult<()> {
        let url = format!(
            "{}/revisions/{}",
            self.service_path(location, service_id),
            revision
        );
        let request = self.http.delete(url);
        match self.send_ignore(request).await {
            Ok(()) | Err(DeployError::NotFound(_)) => Ok(()),
            Err(error) => Err(error),
        }
    }

    /// Grant `allUsers` the invoker role so the `*.run.app` URL is publicly
    /// reachable. Replaces the service IAM policy.
    pub async fn set_invoker_public(&self, location: &str, service_id: &str) -> DeployResult<()> {
        let url = format!("{}:setIamPolicy", self.service_path(location, service_id));
        let body = SetIamPolicyRequest {
            policy: IamPolicy {
                bindings: vec![IamBinding {
                    role: "roles/run.invoker".into(),
                    members: vec!["allUsers".into()],
                }],
            },
        };
        let request = self.http.post(url).json(&body);
        self.send_ignore(request).await
    }

    /// Fetch recent Cloud Logging entries for a service's revisions. Service
    /// names are unique within the project, so no location filter is needed.
    pub async fn list_logs(&self, service_id: &str, limit: u16) -> DeployResult<Vec<LogEntry>> {
        let filter = format!(
            "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"{service_id}\""
        );
        let body = ListLogEntriesRequest {
            resource_names: vec![format!("projects/{}", self.project_id)],
            filter,
            order_by: "timestamp desc".into(),
            page_size: limit.clamp(1, 1000),
        };
        let request = self
            .http
            .post(format!("{}/entries:list", self.logging_base))
            .json(&body);
        let response: ListLogEntriesResponse = self.send_json(request).await?;
        Ok(response.entries)
    }

    async fn send_json<T: DeserializeOwned>(&self, request: RequestBuilder) -> DeployResult<T> {
        let body = self.send_text(request).await?;
        serde_json::from_str::<T>(&body).map_err(|error| {
            DeployError::Decode(format!("Cloud Run response decode failed: {error}"))
        })
    }

    async fn send_operation(&self, request: RequestBuilder) -> DeployResult<Operation> {
        self.send_json::<Operation>(request).await
    }

    async fn send_ignore(&self, request: RequestBuilder) -> DeployResult<()> {
        self.send_text(request).await.map(|_| ())
    }

    async fn send_text(&self, request: RequestBuilder) -> DeployResult<String> {
        let token = self.tokens.token().await?;
        let response = request
            .bearer_auth(token)
            .send()
            .await
            .map_err(|error| DeployError::Transport(error.to_string()))?;
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        if status.is_success() {
            return Ok(body);
        }
        let snippet = body.chars().take(500).collect::<String>();
        match status {
            StatusCode::NOT_FOUND => Err(DeployError::NotFound(format!(
                "Cloud Run resource not found: {snippet}"
            ))),
            StatusCode::TOO_MANY_REQUESTS => Err(DeployError::RateLimited(snippet)),
            _ => Err(DeployError::Provider(format!(
                "Cloud Run API returned {}: {snippet}",
                status.as_u16()
            ))),
        }
    }

    async fn wait_operation(&self, base: &str, operation: Operation) -> DeployResult<()> {
        if let Some(error) = operation.error {
            return Err(DeployError::Provider(format!(
                "Google operation failed: {}",
                error.message
            )));
        }
        if operation.done {
            return Ok(());
        }
        let Some(name) = operation.name else {
            return Ok(());
        };
        for _ in 0..30 {
            tokio::time::sleep(Duration::from_secs(1)).await;
            let url = if name.starts_with("http://") || name.starts_with("https://") {
                name.clone()
            } else {
                format!("{}/{}", base.trim_end_matches('/'), name)
            };
            let request = self.http.get(url);
            let operation = self.send_json::<Operation>(request).await?;
            if let Some(error) = operation.error {
                return Err(DeployError::Provider(format!(
                    "Google operation failed: {}",
                    error.message
                )));
            }
            if operation.done {
                return Ok(());
            }
        }
        Err(DeployError::Provider(format!(
            "Google operation {name} did not finish before timeout"
        )))
    }

    fn artifact_target(&self, image_name: &str) -> DeployResult<Option<ArtifactTarget>> {
        let Some(registry) = self.artifact_registry.as_deref() else {
            return Ok(None);
        };
        let mut parts = registry.trim_matches('/').split('/');
        let host = parts.next().unwrap_or_default();
        let project = parts.next().unwrap_or_default();
        let repository = parts.next().unwrap_or_default();
        if host.is_empty() || project.is_empty() || repository.is_empty() {
            return Err(DeployError::Config(
                "CLOUD_RUN_ARTIFACT_REGISTRY must look like REGION-docker.pkg.dev/PROJECT/REPOSITORY"
                    .into(),
            ));
        }
        let location = host
            .strip_suffix("-docker.pkg.dev")
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                DeployError::Config(
                    "CLOUD_RUN_ARTIFACT_REGISTRY host must look like REGION-docker.pkg.dev".into(),
                )
            })?;
        Ok(Some(ArtifactTarget {
            project: project.to_owned(),
            location: location.to_owned(),
            repository: repository.to_owned(),
            package: image_name.to_owned(),
        }))
    }
}

struct ArtifactTarget {
    project: String,
    location: String,
    repository: String,
    package: String,
}

fn artifact_package_from_image_ref(registry: &str, image_ref: &str) -> Option<String> {
    let registry = registry.trim_end_matches('/');
    let image_ref = image_ref.trim();
    let rest = image_ref.strip_prefix(&format!("{registry}/"))?;
    let digestless = rest.split_once('@').map(|(name, _)| name).unwrap_or(rest);
    let package = match digestless.rsplit_once(':') {
        Some((name, tag)) if !tag.contains('/') => name,
        _ => digestless,
    };
    (!package.is_empty()).then(|| package.to_owned())
}

#[cfg(test)]
mod tests {
    use super::artifact_package_from_image_ref;

    #[test]
    fn parses_artifact_package_from_tagged_image_ref() {
        let package = artifact_package_from_image_ref(
            "europe-west4-docker.pkg.dev/prod/produktive",
            "europe-west4-docker.pkg.dev/prod/produktive/prd-api:abc123",
        );
        assert_eq!(package.as_deref(), Some("prd-api"));
    }

    #[test]
    fn parses_artifact_package_from_digest_image_ref() {
        let package = artifact_package_from_image_ref(
            "europe-west4-docker.pkg.dev/prod/produktive/",
            "europe-west4-docker.pkg.dev/prod/produktive/prd-api@sha256:deadbeef",
        );
        assert_eq!(package.as_deref(), Some("prd-api"));
    }

    #[test]
    fn ignores_images_outside_configured_artifact_registry() {
        let package = artifact_package_from_image_ref(
            "europe-west4-docker.pkg.dev/prod/produktive",
            "registry.fly.io/prd-api:abc123",
        );
        assert!(package.is_none());
    }
}
