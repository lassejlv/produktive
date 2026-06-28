use std::{
    collections::{BTreeMap, HashSet},
    time::{Duration, Instant},
};

use anyhow::{Context, Result};
use async_trait::async_trait;
use chrono::{DateTime, FixedOffset, TimeDelta, Utc};
use cloudrun::{CloudRun, CloudRunConfig, CloudRunProvider};
use deploy::{
    provider_app_name, validate_machine_count, BuildOutcome, BuildProvider, BuildProviderKind,
    BuildSpec, DeployError, DeployProvider, DeployResult, DeploymentConfigSnapshot, DeploymentSpec,
    DeploymentStatus, LogLine, LogQuery, MetricPoint, MetricQuery, ProviderDeployment,
    ProviderDomain, ProviderKind, ProviderService, ProviderServiceRef, ProviderVolume,
    RegistryAuth, ResourcePreset, SecretCipher, SourceKind, SourceSpec, VolumeSpec,
    DEFAULT_MACHINE_COUNT, DEFAULT_PROVIDER,
};
use depot::{DepotConfig, DepotProvider};
use fly::{Fly, FlyConfig, FlyProvider};

/// Registry of configured deploy providers. Implements [`DeployProvider`] by
/// dispatching each call to the concrete provider named on the spec / service ref
/// / query, so the reconciler loop can stay provider-agnostic. Fly is always
/// present; Cloud Run is optional (configured via `CLOUD_RUN_*` env).
struct Providers {
    fly: FlyProvider,
    cloud_run: Option<CloudRunProvider>,
}

impl Providers {
    fn resolve(&self, kind: ProviderKind) -> DeployResult<&dyn DeployProvider> {
        match kind {
            ProviderKind::Fly => Ok(&self.fly),
            ProviderKind::CloudRun => self
                .cloud_run
                .as_ref()
                .map(|provider| provider as &dyn DeployProvider)
                .ok_or_else(|| {
                    DeployError::Config(
                        "Cloud Run provider is not configured on this worker (set CLOUD_RUN_SERVICE_ACCOUNT_JSON)".into(),
                    )
                }),
        }
    }

    /// The `deployments.provider` / `deploy_services.provider` values this worker
    /// can actually act on. Used to scope job claims (`claim_next`,
    /// `claim_and_spawn_builds`) so a worker never grabs a build/deploy whose
    /// provider it can't handle — an old binary that predates a provider, or a
    /// worker where Cloud Run is unconfigured, leaves such jobs for a capable
    /// worker instead of deploying them to the wrong cloud (or failing them).
    ///
    /// This relies on the operational invariant that at least one running worker
    /// supports every provider the platform offers (e.g. Cloud Run is only enabled
    /// once a Cloud-Run-configured worker exists); otherwise a job for an
    /// unsupported provider stays `Queued` until such a worker appears.
    fn supported_provider_kinds(&self) -> Vec<String> {
        // Fly is always constructed; Cloud Run only when configured.
        supported_provider_kinds(self.cloud_run.is_some())
    }
}

/// The persisted `provider` column values a worker can claim, given whether Cloud
/// Run is configured. Returned strings MUST equal the values stored in
/// `deployments.provider` / `deploy_services.provider` (i.e. [`ProviderKind::as_str`])
/// for the `= ANY(...)` claim filter to match.
fn supported_provider_kinds(cloud_run_configured: bool) -> Vec<String> {
    let mut kinds = vec![ProviderKind::Fly.as_str().to_owned()];
    if cloud_run_configured {
        kinds.push(ProviderKind::CloudRun.as_str().to_owned());
    }
    kinds
}

#[async_trait]
impl DeployProvider for Providers {
    fn provider(&self) -> ProviderKind {
        // The registry is not a single provider; callers must not depend on this.
        DEFAULT_PROVIDER
    }

    async fn ensure_service(&self, deployment: &DeploymentSpec) -> DeployResult<ProviderService> {
        self.resolve(deployment.provider)?
            .ensure_service(deployment)
            .await
    }

    async fn deploy_image(&self, deployment: &DeploymentSpec) -> DeployResult<ProviderDeployment> {
        self.resolve(deployment.provider)?
            .deploy_image(deployment)
            .await
    }

    async fn refresh_deployment(
        &self,
        deployment: &DeploymentSpec,
    ) -> DeployResult<ProviderDeployment> {
        self.resolve(deployment.provider)?
            .refresh_deployment(deployment)
            .await
    }

    async fn stop_service(&self, deployment: &DeploymentSpec) -> DeployResult<()> {
        self.resolve(deployment.provider)?
            .stop_service(deployment)
            .await
    }

    async fn destroy_deployment(&self, deployment: &DeploymentSpec) -> DeployResult<()> {
        self.resolve(deployment.provider)?
            .destroy_deployment(deployment)
            .await
    }

    async fn destroy_service(&self, service: &ProviderServiceRef) -> DeployResult<()> {
        self.resolve(service.provider)?
            .destroy_service(service)
            .await
    }

    async fn delete_volume(
        &self,
        service: &ProviderServiceRef,
        provider_volume_id: &str,
    ) -> DeployResult<()> {
        self.resolve(service.provider)?
            .delete_volume(service, provider_volume_id)
            .await
    }

    async fn ensure_domain(
        &self,
        service: &ProviderServiceRef,
        hostname: &str,
    ) -> DeployResult<ProviderDomain> {
        self.resolve(service.provider)?
            .ensure_domain(service, hostname)
            .await
    }

    async fn check_domain(
        &self,
        service: &ProviderServiceRef,
        hostname: &str,
    ) -> DeployResult<ProviderDomain> {
        self.resolve(service.provider)?
            .check_domain(service, hostname)
            .await
    }

    async fn delete_domain(
        &self,
        service: &ProviderServiceRef,
        hostname: &str,
    ) -> DeployResult<()> {
        self.resolve(service.provider)?
            .delete_domain(service, hostname)
            .await
    }

    async fn logs(&self, query: &LogQuery) -> DeployResult<Vec<LogLine>> {
        self.resolve(query.provider)?.logs(query).await
    }

    async fn metrics(&self, query: &MetricQuery) -> DeployResult<Vec<MetricPoint>> {
        self.resolve(query.provider)?.metrics(query).await
    }
}
use sea_orm::{
    ConnectOptions, ConnectionTrait, Database, DatabaseBackend, DatabaseConnection,
    FromQueryResult, Statement,
};
use serde_json::json;
use sha2::{Digest, Sha256};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use uuid::Uuid;

#[derive(Clone)]
struct Config {
    database_url: String,
    log_database_url: Option<String>,
    deploy_secrets_key: String,
    fly_api_token: String,
    fly_org_slug: String,
    fly_api_hostname: String,
    fly_app_name_prefix: String,
    cloud_run_service_account_json: Option<String>,
    cloud_run_project_id: Option<String>,
    cloud_run_artifact_registry: Option<String>,
    cloud_run_app_name_prefix: String,
    depot_token: Option<String>,
    depot_project_id: Option<String>,
    build_registry_host: String,
    fly_registry_token: Option<String>,
    poll_interval: Duration,
    deploy_watch_interval: Duration,
    deploy_watch_timeout: Duration,
    deploy_watch_batch_size: i64,
    deploy_health_failure_threshold: i32,
    retention_cleanup_interval: Duration,
    retention_delete_batch_size: i64,
    log_retention_days: i64,
    metric_retention_days: i64,
    event_retention_days: i64,
}

#[derive(Debug, FromQueryResult)]
struct DeploymentJob {
    id: Uuid,
    workspace_id: Uuid,
    service_id: Uuid,
    provider: String,
    image: String,
    image_digest: Option<String>,
    provider_instance_id: Option<String>,
    config_snapshot: Option<serde_json::Value>,
}

/// A deployment in `Building` status joined with its service's source config.
#[derive(Debug, FromQueryResult)]
struct BuildJob {
    id: Uuid,
    workspace_id: Uuid,
    service_id: Uuid,
    source_kind: String,
    repo_url: Option<String>,
    git_ref: Option<String>,
    dockerfile_path: Option<String>,
    root_dir: Option<String>,
    slug: String,
    name: String,
    environment: String,
    provider: String,
    provider_service_id: Option<String>,
    build_log_project_id: Option<Uuid>,
}

/// Fail a build whose task has been running longer than this (seconds). Must be
/// comfortably greater than the Depot build timeout (default 2700s) so a healthy
/// long build is bounded by the builder, not reaped out from under it.
const BUILD_STUCK_SECONDS: i64 = 3900;
/// Grace before a `Building` row is failed when this worker has no build provider.
const NO_PROVIDER_GRACE_SECONDS: i64 = 60;
const BUILD_LOG_RETENTION_DAYS: i32 = 1;

/// Sends a deployment id back to the reconciler loop on drop, so the in-flight
/// build set is freed on every task exit path including a panic.
struct BuildDoneGuard {
    id: Uuid,
    tx: tokio::sync::mpsc::UnboundedSender<Uuid>,
}

impl Drop for BuildDoneGuard {
    fn drop(&mut self) {
        let _ = self.tx.send(self.id);
    }
}

#[derive(Debug, FromQueryResult)]
struct ServiceRow {
    provider_service_id: Option<String>,
    slug: String,
    internal_port: i32,
    env: serde_json::Value,
    environment: String,
    health_check_path: String,
    region: String,
    resource_preset: String,
    machine_count: i32,
}

#[derive(Debug, FromQueryResult)]
struct SecretRow {
    name: String,
    encrypted_value: String,
}

#[derive(Debug, FromQueryResult)]
struct LogTarget {
    workspace_id: Uuid,
    service_id: Uuid,
    provider: String,
    deployment_id: Option<Uuid>,
    provider_service_id: String,
    provider_instance_id: Option<String>,
    log_project_id: Option<Uuid>,
    slug: String,
    name: String,
}

#[derive(Debug, FromQueryResult)]
struct MetricTarget {
    workspace_id: Uuid,
    service_id: Uuid,
    provider: String,
    provider_service_id: String,
}

#[derive(Debug, FromQueryResult)]
struct HealthWatchTarget {
    workspace_id: Uuid,
    service_id: Uuid,
    deployment_id: Uuid,
    url: String,
    health_check_path: String,
    health_status: String,
    health_failure_count: i32,
}

#[derive(Debug)]
struct HealthProbeOutcome {
    ok: bool,
    status_code: Option<i32>,
    latency_ms: i32,
    error: Option<String>,
    checked_url: String,
}

#[derive(Debug, FromQueryResult)]
struct DomainJob {
    id: Uuid,
    workspace_id: Uuid,
    service_id: Uuid,
    provider: String,
    provider_service_id: String,
    slug: String,
    hostname: String,
    status: String,
}

#[derive(Debug, FromQueryResult)]
struct VolumeRow {
    id: Uuid,
    provider_volume_id: Option<String>,
    name: String,
    mount_path: String,
    region: String,
    size_gb: i32,
}

#[derive(Debug, FromQueryResult)]
struct DeletedServiceRow {
    workspace_id: Uuid,
    service_id: Uuid,
    provider: String,
    provider_service_id: Option<String>,
    slug: String,
}

#[derive(Debug, FromQueryResult)]
struct DeletedVolumeRow {
    id: Uuid,
    workspace_id: Uuid,
    service_id: Uuid,
    provider: String,
    provider_service_id: Option<String>,
    slug: String,
    provider_volume_id: Option<String>,
}

#[derive(Debug, FromQueryResult)]
struct PendingLogProjectLine {
    id: Uuid,
    workspace_id: Uuid,
    service_id: Uuid,
    deployment_id: Option<Uuid>,
    provider_instance_id: Option<String>,
    provider_log_id: String,
    stream: String,
    message: String,
    data: serde_json::Value,
    observed_at: DateTime<FixedOffset>,
    log_project_id: Uuid,
    service_slug: String,
    environment: String,
}

#[derive(Debug, FromQueryResult)]
struct ProviderInstanceIdRow {
    provider_instance_id: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();
    init_tracing();

    let config = Config::from_env()?;
    let mut opt = ConnectOptions::new(config.database_url.clone());
    // Headroom for concurrent build tasks (each uses a log-drain + write connection)
    // alongside the reconciler's own queries.
    opt.max_connections(8)
        .min_connections(1)
        .connect_timeout(Duration::from_secs(8))
        .acquire_timeout(Duration::from_secs(8))
        .idle_timeout(Duration::from_secs(60))
        .sqlx_logging(false);
    let db = Database::connect(opt).await?;
    let log_db = connect_log_db(&config).await;
    let cipher = SecretCipher::from_hex_key(&config.deploy_secrets_key)
        .map_err(|error| anyhow::anyhow!(error))?;
    let fly = Fly::from_config(FlyConfig {
        api_token: config.fly_api_token.clone(),
        org_slug: config.fly_org_slug.clone(),
        api_hostname: Some(config.fly_api_hostname.clone()),
        app_name_prefix: config.fly_app_name_prefix.clone(),
    })
    .map_err(|error| anyhow::anyhow!(error))?;
    let cloud_run = build_cloud_run_provider(&config);
    let provider = Providers {
        fly: FlyProvider::new(fly.clone()),
        cloud_run: cloud_run.clone(),
    };
    // Providers this worker can claim build/deploy jobs for. Computed once: the
    // configured provider set is fixed for the process lifetime.
    let supported_providers = provider.supported_provider_kinds();
    let build_provider = build_provider_from_config(&config);
    let health_client = reqwest::Client::builder()
        .user_agent("produktive-deploy-watch/0.1")
        .timeout(config.deploy_watch_timeout)
        .redirect(reqwest::redirect::Policy::limited(3))
        .build()
        .context("failed to build deployment health check HTTP client")?;

    tracing::info!("produktive deploy worker started");
    let mut last_metric_collection = Instant::now() - Duration::from_secs(60);
    let mut last_deploy_watch = Instant::now() - config.deploy_watch_interval;
    let mut last_retention_cleanup = Instant::now() - config.retention_cleanup_interval;
    // Deployment ids whose build is running in a spawned task; the authoritative
    // double-spawn guard for this (single) process. Ids are returned via
    // `build_done_rx` (including on panic, via a Drop guard) and removed below.
    let mut inflight_builds: HashSet<Uuid> = HashSet::new();
    let (build_done_tx, mut build_done_rx) = tokio::sync::mpsc::unbounded_channel::<Uuid>();
    loop {
        while let Ok(id) = build_done_rx.try_recv() {
            inflight_builds.remove(&id);
        }
        match build_provider.as_ref() {
            Some(bp) => {
                if let Err(error) = claim_and_spawn_builds(
                    &db,
                    log_db.as_ref(),
                    &fly,
                    cloud_run.as_ref(),
                    bp,
                    &config,
                    &supported_providers,
                    &mut inflight_builds,
                    &build_done_tx,
                )
                .await
                {
                    tracing::warn!(error = ?error, "build claim failed");
                }
                if let Err(error) = reap_hung_builds(&db).await {
                    tracing::warn!(error = ?error, "build reaper failed");
                }
            }
            // No build provider on this worker: a git-source deployment would hang
            // in Building forever, so fail it (after a short grace) with a clear
            // message. Safe under the single-worker-process assumption.
            None => {
                if let Err(error) = fail_unbuildable_deployments(&db).await {
                    tracing::warn!(error = ?error, "build reaper failed");
                }
            }
        }
        if let Err(error) = cleanup_cancelled_deployments(&db, &cipher, &provider).await {
            tracing::warn!(error = ?error, "cleanup cancelled deployments failed");
        }
        if let Err(error) = stop_disabled_services(&db, &cipher, &provider).await {
            tracing::warn!(error = ?error, "stop disabled deployment services failed");
        }
        if let Err(error) = cleanup_deleted_volumes(&db, &provider).await {
            tracing::warn!(error = ?error, "cleanup deleted deployment volumes failed");
        }
        if let Err(error) = cleanup_deleted_services(&db, &cipher, &provider).await {
            tracing::warn!(error = ?error, "cleanup deleted deployment services failed");
        }
        if let Err(error) = refresh_inflight(&db, &cipher, &provider).await {
            tracing::warn!(error = ?error, "refresh inflight deployments failed");
        }
        if let Err(error) = cleanup_superseded_provider_deployments(&db, &cipher, &provider).await {
            tracing::warn!(error = ?error, "cleanup superseded provider deployments failed");
        }
        if let Err(error) = reconcile_domains(&db, &provider).await {
            tracing::warn!(error = ?error, "deployment domain reconciliation failed");
        }
        if let Err(error) = collect_logs(&db, log_db.as_ref(), &provider).await {
            tracing::warn!(error = ?error, "deployment log collection failed");
        }
        if last_deploy_watch.elapsed() >= config.deploy_watch_interval {
            if let Err(error) = watch_deployment_health(&db, &health_client, &config).await {
                tracing::warn!(error = ?error, "deployment health watch failed");
            }
            last_deploy_watch = Instant::now();
        }
        if last_metric_collection.elapsed() >= Duration::from_secs(60) {
            if let Err(error) = collect_metrics(&db, &provider).await {
                tracing::warn!(error = ?error, "deployment metric collection failed");
            }
            last_metric_collection = Instant::now();
        }
        if last_retention_cleanup.elapsed() >= config.retention_cleanup_interval {
            if let Err(error) = cleanup_deploy_retention(&db, &config).await {
                tracing::warn!(error = ?error, "deployment retention cleanup failed");
            }
            last_retention_cleanup = Instant::now();
        }
        match claim_next(&db, &supported_providers).await {
            Ok(Some(job)) => {
                if let Err(error) = run_job(&db, &cipher, &provider, job).await {
                    tracing::warn!(error = ?error, "deployment job failed");
                }
            }
            Ok(None) => tokio::time::sleep(config.poll_interval).await,
            Err(error) => {
                tracing::warn!(error = ?error, "claim deployment failed");
                tokio::time::sleep(config.poll_interval).await;
            }
        }
    }
}

impl Config {
    fn from_env() -> Result<Self> {
        let database_url = optional_env("DATABASE_POOLED_URL")
            .or_else(|| optional_env("DATABASE_URL"))
            .context("DATABASE_URL not set")?;
        let poll_interval = Duration::from_millis(
            optional_env("DEPLOY_WORKER_POLL_INTERVAL_MS")
                .unwrap_or_else(|| "2000".into())
                .parse()
                .context("DEPLOY_WORKER_POLL_INTERVAL_MS must be u64")?,
        );
        let retention_cleanup_interval = Duration::from_secs(parse_positive_u64_env(
            "DEPLOY_RETENTION_CLEANUP_INTERVAL_SECONDS",
            3600,
            60,
            86_400,
        )?);
        let retention_delete_batch_size =
            parse_positive_i64_env("DEPLOY_RETENTION_DELETE_BATCH_SIZE", 5_000, 1, 100_000)?;
        Ok(Self {
            database_url,
            log_database_url: optional_env("LOG_DATABASE_POOLED_URL")
                .or_else(|| optional_env("LOG_DATABASE_URL")),
            deploy_secrets_key: required_env("DEPLOY_SECRETS_KEY")?,
            fly_api_token: required_env("FLY_API_TOKEN")?,
            fly_org_slug: required_env("FLY_ORG_SLUG")?,
            fly_api_hostname: optional_env("FLY_API_HOSTNAME")
                .unwrap_or_else(|| "https://api.machines.dev".into()),
            fly_app_name_prefix: optional_env("FLY_APP_NAME_PREFIX")
                .unwrap_or_else(|| "prd".into()),
            cloud_run_service_account_json: cloud_run_service_account_from_env(),
            cloud_run_project_id: optional_env("CLOUD_RUN_PROJECT_ID"),
            cloud_run_artifact_registry: optional_env("CLOUD_RUN_ARTIFACT_REGISTRY"),
            cloud_run_app_name_prefix: optional_env("CLOUD_RUN_APP_NAME_PREFIX")
                .unwrap_or_else(|| "prd".into()),
            depot_token: optional_env("DEPOT_TOKEN"),
            depot_project_id: optional_env("DEPOT_PROJECT_ID"),
            build_registry_host: optional_env("BUILD_REGISTRY_HOST")
                .unwrap_or_else(|| "registry.fly.io".into()),
            fly_registry_token: optional_env("FLY_REGISTRY_TOKEN"),
            poll_interval,
            deploy_watch_interval: Duration::from_secs(parse_positive_u64_env(
                "DEPLOY_WATCH_INTERVAL_SECONDS",
                30,
                5,
                3_600,
            )?),
            deploy_watch_timeout: Duration::from_secs(parse_positive_u64_env(
                "DEPLOY_WATCH_TIMEOUT_SECONDS",
                5,
                1,
                60,
            )?),
            deploy_watch_batch_size: parse_positive_i64_env("DEPLOY_WATCH_BATCH_SIZE", 25, 1, 200)?,
            deploy_health_failure_threshold: parse_positive_i64_env(
                "DEPLOY_HEALTH_FAILURE_THRESHOLD",
                3,
                1,
                20,
            )? as i32,
            retention_cleanup_interval,
            retention_delete_batch_size,
            log_retention_days: parse_positive_i64_env("DEPLOY_LOG_RETENTION_DAYS", 7, 1, 365)?,
            metric_retention_days: parse_positive_i64_env(
                "DEPLOY_METRIC_RETENTION_DAYS",
                30,
                1,
                365,
            )?,
            event_retention_days: parse_positive_i64_env(
                "DEPLOY_EVENT_RETENTION_DAYS",
                90,
                1,
                365,
            )?,
        })
    }
}

async fn connect_log_db(config: &Config) -> Option<DatabaseConnection> {
    let Some(url) = config.log_database_url.as_ref() else {
        tracing::warn!("LOG_DATABASE_URL not set; deployment log-project ingest disabled");
        return None;
    };

    let mut opt = ConnectOptions::new(url.clone());
    opt.max_connections(3)
        .min_connections(0)
        .connect_timeout(Duration::from_secs(8))
        .acquire_timeout(Duration::from_secs(8))
        .idle_timeout(Duration::from_secs(60))
        .sqlx_logging(false);

    match Database::connect(opt).await {
        Ok(db) => {
            tracing::info!("deployment log-project ingest initialized");
            Some(db)
        }
        Err(error) => {
            tracing::warn!(
                error = ?error,
                "failed to connect log database; deployment logs will remain in deploy_log_lines"
            );
            None
        }
    }
}

async fn claim_next(
    db: &DatabaseConnection,
    supported_providers: &[String],
) -> Result<Option<DeploymentJob>> {
    let row = DeploymentJob::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        UPDATE deployments
        SET status = $2, started_at = COALESCE(started_at, now()), updated_at = now()
        WHERE id = (
            SELECT d.id
            FROM deployments d
            WHERE d.status = $1
              -- Only claim deployments this worker can route to a provider; jobs
              -- for an unsupported provider are left for a capable worker.
              AND d.provider = ANY($8)
              AND EXISTS (
                SELECT 1
                FROM deploy_services s
                WHERE s.workspace_id = d.workspace_id
                  AND s.id = d.service_id
                  AND s.disabled_at IS NULL
              )
              AND NOT EXISTS (
                SELECT 1
                FROM deployments active
                WHERE active.workspace_id = d.workspace_id
                  AND active.service_id = d.service_id
                  AND active.id <> d.id
                  AND active.status IN ($2, $3, $4, $5, $6, $7)
              )
            ORDER BY d.created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, workspace_id, service_id, provider, image, image_digest, provider_instance_id, config_snapshot
        "#,
        [
            DeploymentStatus::Queued.code().into(),
            DeploymentStatus::Provisioning.code().into(),
            DeploymentStatus::Pulling.code().into(),
            DeploymentStatus::Starting.code().into(),
            DeploymentStatus::Healthy.code().into(),
            DeploymentStatus::RollingBack.code().into(),
            // A service mid-build must block a concurrent deploy claim.
            DeploymentStatus::Building.code().into(),
            supported_providers.to_vec().into(),
        ],
    ))
    .one(db)
    .await?;
    Ok(row)
}

/// Read the Cloud Run service-account key from `CLOUD_RUN_SERVICE_ACCOUNT_JSON`
/// (raw JSON) or, failing that, the file at `CLOUD_RUN_SERVICE_ACCOUNT_FILE`.
fn cloud_run_service_account_from_env() -> Option<String> {
    if let Some(json) = optional_env("CLOUD_RUN_SERVICE_ACCOUNT_JSON") {
        return Some(json);
    }
    let path = optional_env("CLOUD_RUN_SERVICE_ACCOUNT_FILE")?;
    match std::fs::read_to_string(&path) {
        Ok(contents) => Some(contents),
        Err(error) => {
            tracing::warn!(path = %path, error = ?error, "failed to read Cloud Run service account file");
            None
        }
    }
}

/// Build the optional Cloud Run provider. Returns `None` (with a log) when the
/// service account is unset or invalid, so the worker keeps running Fly-only.
fn build_cloud_run_provider(config: &Config) -> Option<CloudRunProvider> {
    let service_account_json = config.cloud_run_service_account_json.clone()?;
    match CloudRun::from_config(CloudRunConfig {
        service_account_json,
        project_id: config.cloud_run_project_id.clone(),
        app_name_prefix: config.cloud_run_app_name_prefix.clone(),
        artifact_registry: config.cloud_run_artifact_registry.clone(),
        api_hostname: None,
        logging_hostname: None,
    }) {
        Ok(client) => {
            tracing::info!("cloud run provider initialized");
            Some(CloudRunProvider::new(client))
        }
        Err(error) => {
            tracing::warn!(error = ?error, "cloud run provider disabled");
            None
        }
    }
}

fn build_provider_from_config(config: &Config) -> Option<DepotProvider> {
    let (Some(token), Some(project_id), Some(registry_password)) = (
        config.depot_token.clone(),
        config.depot_project_id.clone(),
        config.fly_registry_token.clone(),
    ) else {
        tracing::warn!(
            "depot build provider disabled (DEPOT_TOKEN/DEPOT_PROJECT_ID/FLY_REGISTRY_TOKEN not all set)"
        );
        return None;
    };
    match DepotProvider::new(DepotConfig::new(
        token,
        project_id,
        config.build_registry_host.clone(),
        registry_password,
    )) {
        Ok(provider) => {
            tracing::info!("depot build provider initialized");
            Some(provider)
        }
        Err(error) => {
            tracing::warn!(error = ?error, "depot build provider disabled");
            None
        }
    }
}

/// Claim `Building` deployments not already building in this process and spawn a
/// detached task per build, so the reconciler loop never blocks on a build.
#[allow(clippy::too_many_arguments)]
async fn claim_and_spawn_builds(
    db: &DatabaseConnection,
    log_db: Option<&DatabaseConnection>,
    fly: &Fly,
    cloud_run: Option<&CloudRunProvider>,
    provider: &DepotProvider,
    config: &Config,
    supported_providers: &[String],
    inflight: &mut HashSet<Uuid>,
    done_tx: &tokio::sync::mpsc::UnboundedSender<Uuid>,
) -> Result<()> {
    let rows = BuildJob::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT d.id, d.workspace_id, d.service_id,
               s.source_kind, COALESCE(d.source_repo_url, s.repo_url) AS repo_url,
               COALESCE(d.git_ref, s.git_ref) AS git_ref, s.dockerfile_path, s.root_dir,
               s.slug, s.name, s.environment, s.provider, s.provider_service_id, s.build_log_project_id
        FROM deployments d
        INNER JOIN deploy_services s
            ON s.workspace_id = d.workspace_id AND s.id = d.service_id
        WHERE d.status = $1
          AND s.disabled_at IS NULL
          AND s.deleted_at IS NULL
          -- Only build for a provider this worker can publish to (Cloud Run builds
          -- need its Artifact Registry token); leave others for a capable worker.
          AND s.provider = ANY($2)
        ORDER BY d.created_at ASC
        LIMIT 2
        "#,
        [
            DeploymentStatus::Building.code().into(),
            supported_providers.to_vec().into(),
        ],
    ))
    .all(db)
    .await?;

    for job in rows {
        if !inflight.insert(job.id) {
            continue; // already building in this process
        }
        let db = db.clone();
        let log_db = log_db.cloned();
        let fly = fly.clone();
        let cloud_run = cloud_run.cloned();
        let provider = provider.clone();
        let prefix = config.fly_app_name_prefix.clone();
        let registry_host = config.build_registry_host.clone();
        let guard = BuildDoneGuard {
            id: job.id,
            tx: done_tx.clone(),
        };
        tokio::spawn(async move {
            let _guard = guard; // frees the in-flight id on every exit path
            run_build_job(
                &db,
                log_db.as_ref(),
                &fly,
                cloud_run.as_ref(),
                &provider,
                &prefix,
                &registry_host,
                job,
            )
            .await;
        });
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn run_build_job(
    db: &DatabaseConnection,
    log_db: Option<&DatabaseConnection>,
    fly: &Fly,
    cloud_run: Option<&CloudRunProvider>,
    provider: &DepotProvider,
    prefix: &str,
    registry_host: &str,
    job: BuildJob,
) {
    let (id, workspace_id, service_id) = (job.id, job.workspace_id, job.service_id);
    // Run the build in a nested task so a *panic* (not just an Err) is caught and
    // converted into a terminal BuildFailed. Otherwise the row would stay Building
    // and the reconciler would re-spawn it every tick.
    let db_inner = db.clone();
    let log_db = log_db.cloned();
    let fly = fly.clone();
    let cloud_run = cloud_run.cloned();
    let provider = provider.clone();
    let prefix = prefix.to_owned();
    let registry_host = registry_host.to_owned();
    let result = tokio::spawn(async move {
        run_build_job_inner(
            &db_inner,
            log_db.as_ref(),
            &fly,
            cloud_run.as_ref(),
            &provider,
            &prefix,
            &registry_host,
            &job,
        )
        .await
    })
    .await;

    let failure = match result {
        Ok(Ok(())) => None,
        Ok(Err(error)) => Some(error.to_string()),
        Err(join_error) => {
            tracing::error!(deployment_id = %id, error = ?join_error, "build task panicked");
            Some("build task panicked".to_owned())
        }
    };
    if let Some(message) = failure {
        tracing::warn!(deployment_id = %id, error = %message, "build job failed");
        if let Err(error) = fail_build(db, id, workspace_id, service_id, &message).await {
            tracing::warn!(deployment_id = %id, error = ?error, "failed to record build failure");
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_build_job_inner(
    db: &DatabaseConnection,
    log_db: Option<&DatabaseConnection>,
    fly: &Fly,
    cloud_run: Option<&CloudRunProvider>,
    provider: &DepotProvider,
    prefix: &str,
    registry_host: &str,
    job: &BuildJob,
) -> Result<()> {
    insert_event(
        db,
        job.workspace_id,
        job.service_id,
        Some(job.id),
        "info",
        "build started",
        json!({}),
    )
    .await?;
    // Stamp the build start so the reaper measures from when the build actually
    // began (not deployment creation), and so a row waiting for a build slot is
    // never mistaken for a hung build.
    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        UPDATE deployments
        SET started_at = now(), updated_at = now()
        WHERE id = $1 AND status = $2
        "#,
        [job.id.into(), DeploymentStatus::Building.code().into()],
    ))
    .await?;

    let kind = SourceKind::parse(&job.source_kind).map_err(|error| anyhow::anyhow!(error))?;
    let repo_url = job
        .repo_url
        .clone()
        .context("git-source deployment is missing a repository URL")?;

    let provider_kind = ProviderKind::parse(&job.provider).unwrap_or(DEFAULT_PROVIDER);
    let app_name = job
        .provider_service_id
        .clone()
        .unwrap_or_else(|| provider_app_name(prefix, job.workspace_id, job.service_id, &job.slug));

    // Choose where the built image is published so the deploy target can pull it.
    // Fly pushes to the Fly registry under the app namespace (the app must exist
    // first). Cloud Run pushes to Google Artifact Registry, authed with a
    // short-lived GCP token, since Cloud Run cannot pull from the Fly registry.
    let (image_repository, registry_auth) = match provider_kind {
        ProviderKind::Fly => {
            let network = format!("{app_name}-network");
            fly.ensure_app(&app_name, &network)
                .await
                .map_err(|error| anyhow::anyhow!(error))?;
            (format!("{registry_host}/{app_name}"), None)
        }
        ProviderKind::CloudRun => {
            let cloud_run =
                cloud_run.context("Cloud Run provider is not configured on this worker")?;
            let artifact_registry = cloud_run.artifact_registry().context(
                "CLOUD_RUN_ARTIFACT_REGISTRY is not set; cannot publish Cloud Run image",
            )?;
            let host = artifact_registry
                .split('/')
                .next()
                .unwrap_or(artifact_registry)
                .to_owned();
            let token = cloud_run
                .access_token()
                .await
                .map_err(|error| anyhow::anyhow!(error))?;
            (
                format!("{artifact_registry}/{app_name}"),
                Some(RegistryAuth {
                    host,
                    username: "oauth2accesstoken".to_owned(),
                    password: token,
                }),
            )
        }
    };

    let spec = BuildSpec {
        workspace_id: job.workspace_id,
        service_id: job.service_id,
        deployment_id: job.id,
        source: SourceSpec {
            kind,
            repo_url,
            git_ref: job.git_ref.clone(),
            dockerfile_path: job.dockerfile_path.clone(),
            root_dir: job.root_dir.clone(),
        },
        image_repository,
        registry_auth,
    };

    // Bridge the synchronous log sink to async ingest via a bounded channel;
    // try_send drops lines under backpressure rather than blocking the build.
    let build_log_project_id = ensure_build_log_project(
        db,
        job.workspace_id,
        job.service_id,
        &job.slug,
        &job.name,
        &job.source_kind,
        job.build_log_project_id,
    )
    .await?;
    let (log_tx, mut log_rx) = tokio::sync::mpsc::channel::<String>(256);
    let log_db_worker = log_db.cloned();
    let event_db = db.clone();
    let (ws, svc, did) = (job.workspace_id, job.service_id, job.id);
    let slug = job.slug.clone();
    let environment = job.environment.clone();
    let drain = tokio::spawn(async move {
        let mut seq = 0u64;
        while let Some(line) = log_rx.recv().await {
            if let (Some(log_db), Some(project_id)) = (log_db_worker.as_ref(), build_log_project_id)
            {
                if let Err(error) = insert_build_log_event(
                    log_db,
                    ws,
                    svc,
                    did,
                    project_id,
                    &slug,
                    &environment,
                    seq,
                    &line,
                )
                .await
                {
                    tracing::warn!(
                        deployment_id = %did,
                        error = ?error,
                        "failed to ingest build log line"
                    );
                }
            } else {
                let _ = insert_event(
                    &event_db,
                    ws,
                    svc,
                    Some(did),
                    "info",
                    &line,
                    json!({ "phase": "build" }),
                )
                .await;
            }
            seq += 1;
        }
    });

    let mut sink: Box<dyn FnMut(&str) + Send> = Box::new(move |line: &str| {
        let _ = log_tx.try_send(line.to_owned());
    });
    let outcome = provider.build(&spec, &mut *sink).await;
    drop(sink); // closes log_tx so the drain task can finish
    let _ = drain.await;

    let outcome = outcome.map_err(|error| anyhow::anyhow!(error))?;
    finish_build(db, job, &outcome).await
}

/// Record a successful build: write the pushed image + provenance and flip the
/// row to `Queued` so the existing Fly deploy path takes over. The `status =
/// Building` guard prevents clobbering a row already advanced or reaped.
async fn finish_build(
    db: &DatabaseConnection,
    job: &BuildJob,
    outcome: &BuildOutcome,
) -> Result<()> {
    let result = db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
        UPDATE deployments
        SET image = $2,
            image_digest = COALESCE($3, image_digest),
            commit_sha = COALESCE($4, commit_sha),
            build_provider = $5,
            status = $6,
            updated_at = now()
        WHERE id = $1 AND status = $7
        "#,
            [
                job.id.into(),
                outcome.image_ref.clone().into(),
                outcome.digest.clone().into(),
                outcome.commit_sha.clone().into(),
                BuildProviderKind::Depot.as_str().into(),
                DeploymentStatus::Queued.code().into(),
                DeploymentStatus::Building.code().into(),
            ],
        ))
        .await?;
    if result.rows_affected() == 0 {
        // The row left Building (reaped/stopped) while the build ran; the pushed
        // image is now orphaned. Don't deploy it; just record the race.
        tracing::warn!(
            deployment_id = %job.id,
            image = %outcome.image_ref,
            "build finished but deployment was no longer Building; image not deployed"
        );
        return Ok(());
    }
    insert_event(
        db,
        job.workspace_id,
        job.service_id,
        Some(job.id),
        "info",
        "build succeeded",
        json!({ "image": outcome.image_ref, "engine": outcome.build_engine.as_str() }),
    )
    .await?;
    Ok(())
}

/// Record a failed build as terminal `BuildFailed`. Guarded so it never overrides
/// a row already advanced past `Building`.
async fn fail_build(
    db: &DatabaseConnection,
    deployment_id: Uuid,
    workspace_id: Uuid,
    service_id: Uuid,
    message: &str,
) -> Result<()> {
    let result = db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
        UPDATE deployments
        SET status = $2, failure_message = $3, finished_at = now(), updated_at = now()
        WHERE id = $1 AND status = $4
        "#,
            [
                deployment_id.into(),
                DeploymentStatus::BuildFailed.code().into(),
                message.into(),
                DeploymentStatus::Building.code().into(),
            ],
        ))
        .await?;
    if result.rows_affected() == 0 {
        tracing::warn!(
            deployment_id = %deployment_id,
            "build failed but deployment was no longer Building; status unchanged"
        );
        return Ok(());
    }
    insert_event(
        db,
        workspace_id,
        service_id,
        Some(deployment_id),
        "error",
        "build failed",
        json!({ "error": message }),
    )
    .await?;
    Ok(())
}

/// Reap builds whose task has been running longer than [`BUILD_STUCK_SECONDS`]
/// (keyed on `started_at`, set when the build actually begins). Recovers rows
/// whose build task died (worker restart) without touching rows still waiting
/// for a build slot (`started_at IS NULL`).
async fn reap_hung_builds(db: &DatabaseConnection) -> Result<()> {
    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        UPDATE deployments
        SET status = $1, failure_message = $2, finished_at = now(), updated_at = now()
        WHERE status = $3
          AND started_at IS NOT NULL
          AND started_at < now() - ($4::bigint * interval '1 second')
        "#,
        [
            DeploymentStatus::BuildFailed.code().into(),
            "build timed out".into(),
            DeploymentStatus::Building.code().into(),
            BUILD_STUCK_SECONDS.into(),
        ],
    ))
    .await
    .map(|_| ())
    .map_err(Into::into)
}

/// Fail `Building` deployments when this worker has no build provider. Bounded by
/// a short grace so a just-created row isn't failed instantly. Safe under the
/// single-worker-process assumption (no other process is building these rows).
async fn fail_unbuildable_deployments(db: &DatabaseConnection) -> Result<()> {
    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        UPDATE deployments
        SET status = $1, failure_message = $2, finished_at = now(), updated_at = now()
        WHERE status = $3
          AND created_at < now() - ($4::bigint * interval '1 second')
        "#,
        [
            DeploymentStatus::BuildFailed.code().into(),
            "build provider not configured on this worker".into(),
            DeploymentStatus::Building.code().into(),
            NO_PROVIDER_GRACE_SECONDS.into(),
        ],
    ))
    .await
    .map(|_| ())
    .map_err(Into::into)
}

async fn run_job(
    db: &DatabaseConnection,
    cipher: &SecretCipher,
    provider: &impl DeployProvider,
    job: DeploymentJob,
) -> Result<()> {
    if deployment_is_cancelled(db, job.id).await? {
        return Ok(());
    }
    insert_event(
        db,
        job.workspace_id,
        job.service_id,
        Some(job.id),
        "info",
        "deployment started",
        json!({}),
    )
    .await?;
    let spec = build_spec(db, cipher, &job).await?;
    if needs_existing_volume_detach(&spec) {
        if let Err(error) = stop_superseded_deployments(db, cipher, provider, &job).await {
            let message = format!("failed to detach existing volume before deployment: {error}");
            fail_deployment(db, &job, &message).await?;
            return Err(error);
        }
    }
    match provider.deploy_image(&spec).await {
        Ok(provider_deployment) => {
            let status = provider_deployment.status;
            let provider_volumes = provider_deployment.volumes.clone();
            let provider_instances = provider_deployment.instances.clone();
            update_deployment_from_provider(db, &job, provider_deployment).await?;
            sync_provider_volumes(db, job.workspace_id, job.service_id, &provider_volumes).await?;
            sync_provider_instances(db, &job, &provider_instances).await?;
            update_service_after_deploy(db, job.workspace_id, job.service_id, status).await?;
            if status == DeploymentStatus::Live {
                if let Err(error) = stop_superseded_deployments(db, cipher, provider, &job).await {
                    tracing::warn!(
                        deployment_id = %job.id,
                        error = ?error,
                        "failed to stop superseded deployments"
                    );
                }
            }
            insert_event(
                db,
                job.workspace_id,
                job.service_id,
                Some(job.id),
                "info",
                "provider deployment created",
                json!({ "status": status.as_str() }),
            )
            .await?;
        }
        Err(error) => {
            fail_deployment(db, &job, &error.to_string()).await?;
            return Err(anyhow::anyhow!(error));
        }
    }
    Ok(())
}

async fn build_spec(
    db: &DatabaseConnection,
    cipher: &SecretCipher,
    job: &DeploymentJob,
) -> Result<DeploymentSpec> {
    // The deployment row's `provider` column is authoritative (set at deploy
    // creation from the service); it routes the spec to the right cloud adapter.
    let provider = ProviderKind::parse(&job.provider).unwrap_or(DEFAULT_PROVIDER);
    let provider_instance_ids = deployment_provider_instance_ids(db, job).await?;
    if let Some(snapshot) = job
        .config_snapshot
        .as_ref()
        .filter(|value| !value.is_null())
    {
        let snapshot: DeploymentConfigSnapshot = serde_json::from_value(snapshot.clone())
            .context("invalid deployment config snapshot")?;
        let mut spec = snapshot
            .to_deployment_spec(
                job.workspace_id,
                job.service_id,
                job.id,
                job.provider_instance_id.clone(),
                provider_instance_ids,
                job.image.clone(),
                job.image_digest.clone(),
                cipher,
            )
            .map_err(|error| anyhow::anyhow!(error))?;
        spec.provider = provider;
        return Ok(spec);
    }

    let service = ServiceRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT provider_service_id, slug, internal_port, env,
               environment, health_check_path, region, resource_preset, machine_count
        FROM deploy_services
        WHERE workspace_id = $1 AND id = $2
        LIMIT 1
        "#,
        [job.workspace_id.into(), job.service_id.into()],
    ))
    .one(db)
    .await?
    .context("deployment service not found")?;

    let env: BTreeMap<String, String> =
        serde_json::from_value(service.env.clone()).unwrap_or_default();
    let mut secrets = BTreeMap::new();
    let rows = SecretRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT name, encrypted_value
        FROM deploy_service_secrets
        WHERE workspace_id = $1 AND service_id = $2
        "#,
        [job.workspace_id.into(), job.service_id.into()],
    ))
    .all(db)
    .await?;
    for row in rows {
        let value = cipher
            .decrypt(&row.encrypted_value)
            .map_err(|error| anyhow::anyhow!(error))?;
        secrets.insert(row.name, value);
    }
    let volume_rows = VolumeRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT id, provider_volume_id, name, mount_path, region, size_gb
        FROM deploy_service_volumes
        WHERE workspace_id = $1
          AND service_id = $2
          AND deleted_at IS NULL
        ORDER BY created_at ASC
        "#,
        [job.workspace_id.into(), job.service_id.into()],
    ))
    .all(db)
    .await?;
    let volumes = volume_rows
        .into_iter()
        .map(|row| VolumeSpec {
            id: row.id,
            provider_volume_id: row.provider_volume_id,
            name: row.name,
            mount_path: row.mount_path,
            region: row.region,
            size_gb: row.size_gb,
        })
        .collect();

    Ok(DeploymentSpec {
        workspace_id: job.workspace_id,
        service_id: job.service_id,
        deployment_id: job.id,
        provider,
        provider_service_id: service.provider_service_id,
        provider_instance_id: job.provider_instance_id.clone(),
        provider_instance_ids,
        app_name: service.slug,
        image: job.image.clone(),
        image_digest: job.image_digest.clone(),
        internal_port: service.internal_port as u16,
        environment: service.environment,
        health_check_path: service.health_check_path,
        region: service.region,
        resource_preset: ResourcePreset::parse(&service.resource_preset)
            .map_err(|error| anyhow::anyhow!(error))?,
        machine_count: u16::try_from(service.machine_count)
            .ok()
            .and_then(|value| validate_machine_count(value).ok())
            .unwrap_or(DEFAULT_MACHINE_COUNT),
        volumes,
        env,
        secrets,
    })
}

async fn deployment_provider_instance_ids(
    db: &DatabaseConnection,
    job: &DeploymentJob,
) -> Result<Vec<String>> {
    let rows = ProviderInstanceIdRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT provider_instance_id
        FROM deploy_instances
        WHERE workspace_id = $1
          AND service_id = $2
          AND deployment_id = $3
          AND stopped_at IS NULL
        ORDER BY created_at ASC
        "#,
        [
            job.workspace_id.into(),
            job.service_id.into(),
            job.id.into(),
        ],
    ))
    .all(db)
    .await?;
    let mut ids = Vec::new();
    if let Some(primary) = job.provider_instance_id.as_deref() {
        ids.push(primary.to_owned());
    }
    for row in rows {
        if !ids.iter().any(|id| id == &row.provider_instance_id) {
            ids.push(row.provider_instance_id);
        }
    }
    Ok(ids)
}

fn needs_existing_volume_detach(spec: &DeploymentSpec) -> bool {
    spec.volumes
        .iter()
        .any(|volume| volume.provider_volume_id.is_some())
}

async fn refresh_inflight(
    db: &DatabaseConnection,
    cipher: &SecretCipher,
    provider: &impl DeployProvider,
) -> Result<()> {
    let rows = DeploymentJob::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT id, workspace_id, service_id, provider, image, image_digest, provider_instance_id, config_snapshot
        FROM deployments
        WHERE status IN ($1, $2, $3, $4)
          AND provider_instance_id IS NOT NULL
        ORDER BY updated_at ASC
        LIMIT 10
        "#,
        [
            DeploymentStatus::Provisioning.code().into(),
            DeploymentStatus::Pulling.code().into(),
            DeploymentStatus::Starting.code().into(),
            DeploymentStatus::Healthy.code().into(),
        ],
    ))
    .all(db)
    .await?;

    for job in rows {
        if deployment_is_cancelled(db, job.id).await? {
            continue;
        }
        let spec = build_spec(db, cipher, &job).await?;
        match provider.refresh_deployment(&spec).await {
            Ok(provider_deployment) => {
                let status = provider_deployment.status;
                let provider_volumes = provider_deployment.volumes.clone();
                let provider_instances = provider_deployment.instances.clone();
                update_deployment_from_provider(db, &job, provider_deployment).await?;
                sync_provider_volumes(db, job.workspace_id, job.service_id, &provider_volumes)
                    .await?;
                sync_provider_instances(db, &job, &provider_instances).await?;
                update_service_after_deploy(db, job.workspace_id, job.service_id, status).await?;
                if status == DeploymentStatus::Live {
                    if let Err(error) =
                        stop_superseded_deployments(db, cipher, provider, &job).await
                    {
                        tracing::warn!(
                            deployment_id = %job.id,
                            error = ?error,
                            "failed to stop superseded deployments"
                        );
                    }
                }
            }
            Err(error) => tracing::warn!(deployment_id = %job.id, error = ?error, "refresh failed"),
        }
    }
    Ok(())
}

async fn deployment_is_cancelled(db: &DatabaseConnection, deployment_id: Uuid) -> Result<bool> {
    let row = db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT status
            FROM deployments
            WHERE id = $1
            LIMIT 1
            "#,
            [deployment_id.into()],
        ))
        .await?;
    Ok(row
        .and_then(|row| row.try_get::<i16>("", "status").ok())
        .map(|code| code == DeploymentStatus::Cancelled.code())
        .unwrap_or(false))
}

async fn cleanup_cancelled_deployments(
    db: &DatabaseConnection,
    cipher: &SecretCipher,
    provider: &impl DeployProvider,
) -> Result<()> {
    let rows = DeploymentJob::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT id, workspace_id, service_id, provider, image, image_digest, provider_instance_id, config_snapshot
        FROM deployments
        WHERE status = $1
          AND provider_instance_id IS NOT NULL
        ORDER BY updated_at ASC
        LIMIT 20
        "#,
        [DeploymentStatus::Cancelled.code().into()],
    ))
    .all(db)
    .await?;

    for job in rows {
        let spec = build_spec(db, cipher, &job).await?;
        if let Err(error) = provider.stop_service(&spec).await {
            tracing::warn!(
                deployment_id = %job.id,
                error = ?error,
                "failed to stop cancelled deployment provider instance"
            );
            continue;
        }
        db.execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE deployments
            SET provider_instance_id = NULL,
                updated_at = now()
            WHERE id = $1
              AND status = $2
            "#,
            [job.id.into(), DeploymentStatus::Cancelled.code().into()],
        ))
        .await?;
    }
    Ok(())
}

async fn stop_disabled_services(
    db: &DatabaseConnection,
    cipher: &SecretCipher,
    provider: &impl DeployProvider,
) -> Result<()> {
    let rows = DeploymentJob::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT d.id, d.workspace_id, d.service_id, d.provider, d.image, d.image_digest, d.provider_instance_id, d.config_snapshot
        FROM deployments d
        INNER JOIN deploy_services s
            ON s.workspace_id = d.workspace_id AND s.id = d.service_id
        WHERE s.disabled_at IS NOT NULL
          AND s.deleted_at IS NULL
          AND d.status IN ($1, $2, $3, $4, $5, $6, $7, $8)
        ORDER BY d.updated_at ASC
        LIMIT 20
        "#,
        [
            DeploymentStatus::Queued.code().into(),
            DeploymentStatus::Provisioning.code().into(),
            DeploymentStatus::Pulling.code().into(),
            DeploymentStatus::Starting.code().into(),
            DeploymentStatus::Healthy.code().into(),
            DeploymentStatus::Live.code().into(),
            DeploymentStatus::RollingBack.code().into(),
            // Reap a build in flight when its service is disabled.
            DeploymentStatus::Building.code().into(),
        ],
    ))
    .all(db)
    .await?;

    for job in rows {
        if job.provider_instance_id.is_some() {
            let spec = build_spec(db, cipher, &job).await?;
            if let Err(error) = provider.stop_service(&spec).await {
                tracing::warn!(
                    deployment_id = %job.id,
                    error = ?error,
                    "failed to stop disabled deployment"
                );
                continue;
            }
        }
        mark_deployment_stopped(db, &job, "deployment stopped").await?;
    }
    Ok(())
}

async fn cleanup_deleted_volumes(
    db: &DatabaseConnection,
    provider: &impl DeployProvider,
) -> Result<()> {
    let rows = DeletedVolumeRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT v.id,
               v.workspace_id,
               v.service_id,
               s.provider,
               s.provider_service_id,
               s.slug,
               v.provider_volume_id
        FROM deploy_service_volumes v
        INNER JOIN deploy_services s
            ON s.workspace_id = v.workspace_id AND s.id = v.service_id
        WHERE v.deleted_at IS NOT NULL
          AND s.deleted_at IS NULL
        ORDER BY v.updated_at ASC
        LIMIT 20
        "#,
        [],
    ))
    .all(db)
    .await?;

    for row in rows {
        if let (Some(provider_service_id), Some(provider_volume_id)) = (
            row.provider_service_id.as_deref(),
            row.provider_volume_id.as_deref(),
        ) {
            let service = ProviderServiceRef {
                workspace_id: row.workspace_id,
                service_id: row.service_id,
                provider: ProviderKind::parse(&row.provider).unwrap_or(DEFAULT_PROVIDER),
                provider_service_id: Some(provider_service_id.to_owned()),
                app_name: row.slug.clone(),
            };
            if let Err(error) = provider.delete_volume(&service, provider_volume_id).await {
                tracing::warn!(
                    volume_id = %row.id,
                    error = ?error,
                    "failed to delete provider volume"
                );
                continue;
            }
        }
        delete_volume_row(db, row.id).await?;
    }
    Ok(())
}

async fn cleanup_deleted_services(
    db: &DatabaseConnection,
    cipher: &SecretCipher,
    provider: &impl DeployProvider,
) -> Result<()> {
    let rows = DeletedServiceRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT workspace_id,
               id AS service_id,
               provider,
               provider_service_id,
               slug
        FROM deploy_services
        WHERE deleted_at IS NOT NULL
        ORDER BY deleted_at ASC
        LIMIT 10
        "#,
        [],
    ))
    .all(db)
    .await?;

    for row in rows {
        let deployments = DeploymentJob::find_by_statement(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT id, workspace_id, service_id, provider, image, image_digest, provider_instance_id, config_snapshot
            FROM deployments
            WHERE workspace_id = $1
              AND service_id = $2
              AND provider_instance_id IS NOT NULL
            ORDER BY updated_at ASC
            LIMIT 50
            "#,
            [row.workspace_id.into(), row.service_id.into()],
        ))
        .all(db)
        .await?;

        for job in deployments {
            destroy_provider_deployment(db, cipher, provider, &job, "deleted service destroyed")
                .await?;
        }

        if provider_instance_count(db, row.workspace_id, row.service_id).await? > 0 {
            continue;
        }

        if let Some(provider_service_id) = row.provider_service_id.clone() {
            let service = ProviderServiceRef {
                workspace_id: row.workspace_id,
                service_id: row.service_id,
                provider: ProviderKind::parse(&row.provider).unwrap_or(DEFAULT_PROVIDER),
                provider_service_id: Some(provider_service_id),
                app_name: row.slug.clone(),
            };
            if !delete_all_service_volumes(db, provider, &service).await? {
                continue;
            }
            if let Err(error) = provider.destroy_service(&service).await {
                tracing::warn!(
                    service_id = %row.service_id,
                    error = ?error,
                    "failed to delete provider service app"
                );
                continue;
            }
        }

        hard_delete_service(db, row.workspace_id, row.service_id).await?;
    }
    Ok(())
}

async fn delete_all_service_volumes(
    db: &DatabaseConnection,
    provider: &impl DeployProvider,
    service: &ProviderServiceRef,
) -> Result<bool> {
    let rows = DeletedVolumeRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT id, workspace_id, service_id, provider, $3 AS provider_service_id, $4 AS slug, provider_volume_id
        FROM deploy_service_volumes
        WHERE workspace_id = $1 AND service_id = $2
        ORDER BY updated_at ASC
        LIMIT 50
        "#,
        [
            service.workspace_id.into(),
            service.service_id.into(),
            service.provider_service_id.clone().into(),
            service.app_name.clone().into(),
        ],
    ))
    .all(db)
    .await?;

    for row in rows {
        if let Some(provider_volume_id) = row.provider_volume_id.as_deref() {
            if let Err(error) = provider.delete_volume(service, provider_volume_id).await {
                tracing::warn!(
                    volume_id = %row.id,
                    error = ?error,
                    "failed to delete provider volume for deleted service"
                );
                return Ok(false);
            }
        }
        delete_volume_row(db, row.id).await?;
    }
    Ok(true)
}

async fn stop_superseded_deployments(
    db: &DatabaseConnection,
    cipher: &SecretCipher,
    provider: &impl DeployProvider,
    current: &DeploymentJob,
) -> Result<()> {
    let rows = DeploymentJob::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        // Only retire deployments OLDER (by created_at) than the one being cut
        // over to. The current deployment is excluded by id; the `created_at`
        // guard additionally protects any even-newer in-flight deployment from
        // being torn down by an older deploy that happens to reach Live.
        r#"
        SELECT id, workspace_id, service_id, provider, image, image_digest, provider_instance_id, config_snapshot
        FROM deployments
        WHERE workspace_id = $1
          AND service_id = $2
          AND id <> $3
          AND provider_instance_id IS NOT NULL
          AND created_at < (SELECT created_at FROM deployments WHERE id = $3)
        ORDER BY created_at ASC
        "#,
        [
            current.workspace_id.into(),
            current.service_id.into(),
            current.id.into(),
        ],
    ))
    .all(db)
    .await?;

    for job in rows {
        destroy_provider_deployment(db, cipher, provider, &job, "superseded deployment stopped")
            .await?;
    }
    Ok(())
}

async fn cleanup_superseded_provider_deployments(
    db: &DatabaseConnection,
    cipher: &SecretCipher,
    provider: &impl DeployProvider,
) -> Result<()> {
    let rows = DeploymentJob::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        // Retire only deployments STRICTLY OLDER (by created_at) than the newest
        // healthy/live deployment for each service. The keeper is chosen by
        // `created_at` (immutable), not `updated_at` (churned by reconcile
        // writes), and a freshly-created deployment that is still booting
        // (Queued/Provisioning/Pulling/Starting) is newer than any current
        // keeper, so it is never destroyed. Without the `created_at < keeper`
        // guard this reaper killed the brand-new machine whenever it had not yet
        // reached Healthy/Live, leaving the old deployment serving.
        r#"
        -- Keeper is per (workspace, service); a service has exactly one provider,
        -- so this is provider-agnostic. The concrete cloud adapter is resolved
        -- per row by the registry via the deployment's `provider` column.
        WITH keeper AS (
            SELECT DISTINCT ON (workspace_id, service_id)
                   id, workspace_id, service_id, created_at
            FROM deployments
            WHERE provider_instance_id IS NOT NULL
              AND status IN ($1, $2)
            ORDER BY workspace_id, service_id, created_at DESC
        )
        SELECT d.id, d.workspace_id, d.service_id, d.provider, d.image, d.image_digest, d.provider_instance_id, d.config_snapshot
        FROM deployments d
        INNER JOIN keeper
            ON keeper.workspace_id = d.workspace_id AND keeper.service_id = d.service_id
        WHERE d.id <> keeper.id
          AND d.provider_instance_id IS NOT NULL
          AND d.created_at < keeper.created_at
        ORDER BY d.created_at ASC
        LIMIT 20
        "#,
        [
            DeploymentStatus::Healthy.code().into(),
            DeploymentStatus::Live.code().into(),
        ],
    ))
    .all(db)
    .await?;

    for job in rows {
        destroy_provider_deployment(
            db,
            cipher,
            provider,
            &job,
            "old provider deployment destroyed",
        )
        .await?;
    }
    Ok(())
}

async fn destroy_provider_deployment(
    db: &DatabaseConnection,
    cipher: &SecretCipher,
    provider: &impl DeployProvider,
    job: &DeploymentJob,
    message: &str,
) -> Result<()> {
    let spec = build_spec(db, cipher, job).await?;
    if let Err(error) = provider.stop_service(&spec).await {
        match error {
            DeployError::NotFound(_) => {
                tracing::debug!(
                    deployment_id = %job.id,
                    "provider deployment already absent before destroy"
                );
            }
            error => {
                tracing::warn!(
                    deployment_id = %job.id,
                    error = ?error,
                    "failed to stop provider deployment before destroy"
                );
            }
        }
    }
    if let Err(error) = provider.destroy_deployment(&spec).await {
        tracing::warn!(
            deployment_id = %job.id,
            error = ?error,
            "failed to destroy provider deployment"
        );
        return Ok(());
    }
    mark_deployment_destroyed(db, job, message).await?;
    Ok(())
}

async fn reconcile_domains(db: &DatabaseConnection, provider: &impl DeployProvider) -> Result<()> {
    let rows = DomainJob::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT d.id,
               d.workspace_id,
               d.service_id,
               s.provider,
               s.provider_service_id AS provider_service_id,
               s.slug,
               d.hostname,
               d.status
        FROM deploy_service_domains d
        INNER JOIN deploy_services s
            ON s.workspace_id = d.workspace_id AND s.id = d.service_id
        WHERE s.provider_service_id IS NOT NULL
          AND d.status IN ('queued', 'pending_validation', 'checking', 'failed', 'removing')
        ORDER BY d.updated_at ASC
        LIMIT 20
        "#,
        [],
    ))
    .all(db)
    .await?;

    for row in rows {
        let service = ProviderServiceRef {
            workspace_id: row.workspace_id,
            service_id: row.service_id,
            provider: ProviderKind::parse(&row.provider).unwrap_or(DEFAULT_PROVIDER),
            provider_service_id: Some(row.provider_service_id.clone()),
            app_name: row.slug.clone(),
        };
        if row.status == "removing" {
            match provider.delete_domain(&service, &row.hostname).await {
                Ok(()) => {
                    delete_domain_row(db, &row).await?;
                    insert_event(
                        db,
                        row.workspace_id,
                        row.service_id,
                        None,
                        "warn",
                        "custom domain removed",
                        json!({ "hostname": row.hostname }),
                    )
                    .await?;
                }
                Err(error) => {
                    tracing::warn!(
                        domain_id = %row.id,
                        hostname = %row.hostname,
                        error = ?error,
                        "failed to delete provider domain"
                    );
                }
            }
            continue;
        }

        let result = if row.status == "queued" {
            provider.ensure_domain(&service, &row.hostname).await
        } else {
            provider.check_domain(&service, &row.hostname).await
        };
        match result {
            Ok(domain) => {
                let status = domain.status.clone();
                update_domain_from_provider(db, &row, domain).await?;
                if status == "active" {
                    insert_event(
                        db,
                        row.workspace_id,
                        row.service_id,
                        None,
                        "info",
                        "custom domain active",
                        json!({ "hostname": row.hostname }),
                    )
                    .await?;
                }
            }
            Err(error) => {
                tracing::warn!(
                    domain_id = %row.id,
                    hostname = %row.hostname,
                    error = ?error,
                    "failed to reconcile provider domain"
                );
                mark_domain_failed(db, &row, &error.to_string()).await?;
            }
        }
    }
    Ok(())
}

async fn collect_logs(
    db: &DatabaseConnection,
    log_db: Option<&DatabaseConnection>,
    provider: &impl DeployProvider,
) -> Result<()> {
    let log_project_columns_available = match deploy_log_project_columns_available(db).await {
        Ok(available) => available,
        Err(error) => {
            tracing::warn!(
                error = ?error,
                "failed to inspect deployment log-project columns"
            );
            false
        }
    };
    if log_project_columns_available {
        flush_pending_log_project_lines_best_effort(db, log_db).await;
    }

    let log_project_id_select = if log_project_columns_available {
        "s.log_project_id AS log_project_id"
    } else {
        "NULL::uuid AS log_project_id"
    };

    let sql = format!(
        r#"
        SELECT s.workspace_id,
               s.id AS service_id,
               s.provider,
               d.id AS deployment_id,
               s.provider_service_id AS provider_service_id,
               d.provider_instance_id AS provider_instance_id,
               {log_project_id_select},
               s.slug,
               s.name
        FROM deploy_services s
        JOIN LATERAL (
            SELECT id, provider_instance_id
            FROM deployments d
            WHERE d.workspace_id = s.workspace_id
              AND d.service_id = s.id
              AND d.provider_instance_id IS NOT NULL
              AND d.status IN ($1, $2, $3, $4, $5)
            ORDER BY updated_at DESC
            LIMIT 1
        ) d ON TRUE
        WHERE s.disabled_at IS NULL
          AND s.provider_service_id IS NOT NULL
        ORDER BY s.updated_at DESC
        LIMIT 25
        "#
    );
    let targets = LogTarget::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        &sql,
        [
            DeploymentStatus::Provisioning.code().into(),
            DeploymentStatus::Pulling.code().into(),
            DeploymentStatus::Starting.code().into(),
            DeploymentStatus::Healthy.code().into(),
            DeploymentStatus::Live.code().into(),
        ],
    ))
    .all(db)
    .await?;

    for target in targets {
        let log_project_id = if log_project_columns_available {
            match ensure_service_log_project(db, &target).await {
                Ok(log_project_id) => log_project_id,
                Err(error) => {
                    tracing::warn!(
                        service_id = %target.service_id,
                        error = ?error,
                        "failed to ensure deployment service log project"
                    );
                    continue;
                }
            }
        } else {
            None
        };
        let logs = match provider
            .logs(&LogQuery {
                service_id: target.service_id,
                provider: ProviderKind::parse(&target.provider).unwrap_or(DEFAULT_PROVIDER),
                deployment_id: target.deployment_id,
                provider_service_id: Some(target.provider_service_id.clone()),
                provider_instance_id: target.provider_instance_id.clone(),
                limit: 100,
            })
            .await
        {
            Ok(logs) => logs,
            Err(error) => {
                tracing::warn!(
                    service_id = %target.service_id,
                    error = ?error,
                    "failed to fetch deployment service logs"
                );
                continue;
            }
        };
        for line in logs {
            if let Err(error) = insert_log_line(
                db,
                &target,
                log_project_id,
                line,
                log_project_columns_available,
            )
            .await
            {
                tracing::warn!(
                    service_id = %target.service_id,
                    error = ?error,
                    "failed to store deployment service log line"
                );
            }
        }
    }
    if log_project_columns_available {
        flush_pending_log_project_lines_best_effort(db, log_db).await;
    }
    Ok(())
}

async fn watch_deployment_health(
    db: &DatabaseConnection,
    http: &reqwest::Client,
    config: &Config,
) -> Result<()> {
    if !deploy_health_columns_available(db).await? {
        tracing::debug!("deployment health-watch columns not available yet; skipping health watch");
        return Ok(());
    }

    let watch_interval_seconds = i64::try_from(config.deploy_watch_interval.as_secs())
        .unwrap_or(i64::MAX)
        .max(1);
    let targets = HealthWatchTarget::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT s.workspace_id,
               s.id AS service_id,
               d.id AS deployment_id,
               COALESCE(d.url, s.url) AS url,
               s.health_check_path,
               s.health_status,
               s.health_failure_count
        FROM deploy_services s
        JOIN LATERAL (
            SELECT d.id, d.url
            FROM deployments d
            WHERE d.workspace_id = s.workspace_id
              AND d.service_id = s.id
              AND d.provider_instance_id IS NOT NULL
              AND d.status IN ($1, $2)
            ORDER BY d.updated_at DESC
            LIMIT 1
        ) d ON TRUE
        WHERE s.disabled_at IS NULL
          AND s.deleted_at IS NULL
          AND s.provider_service_id IS NOT NULL
          AND COALESCE(d.url, s.url) IS NOT NULL
          AND (
              s.last_health_checked_at IS NULL
              OR s.last_health_checked_at <= now() - ($3::BIGINT * INTERVAL '1 second')
          )
        ORDER BY s.last_health_checked_at ASC NULLS FIRST, s.updated_at DESC
        LIMIT $4
        "#,
        [
            DeploymentStatus::Healthy.code().into(),
            DeploymentStatus::Live.code().into(),
            watch_interval_seconds.into(),
            config.deploy_watch_batch_size.into(),
        ],
    ))
    .all(db)
    .await?;

    for target in targets {
        let outcome = probe_deployment_health(http, &target).await;
        persist_health_probe(
            db,
            &target,
            &outcome,
            config.deploy_health_failure_threshold,
        )
        .await?;
    }

    Ok(())
}

async fn deploy_health_columns_available(db: &DatabaseConnection) -> Result<bool> {
    let row = db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT COUNT(*) = 8 AS available
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'deploy_services'
              AND column_name IN (
                  'health_status',
                  'health_status_updated_at',
                  'last_health_checked_at',
                  'last_health_ok_at',
                  'last_health_status_code',
                  'last_health_latency_ms',
                  'health_failure_count',
                  'last_health_error'
              )
            "#,
            [],
        ))
        .await?;
    Ok(row
        .and_then(|row| row.try_get::<bool>("", "available").ok())
        .unwrap_or(false))
}

async fn probe_deployment_health(
    http: &reqwest::Client,
    target: &HealthWatchTarget,
) -> HealthProbeOutcome {
    let started = Instant::now();
    let checked_url = match deployment_health_url(&target.url, &target.health_check_path) {
        Ok(url) => url,
        Err(error) => {
            return HealthProbeOutcome {
                ok: false,
                status_code: None,
                latency_ms: 0,
                error: Some(error),
                checked_url: target.url.clone(),
            }
        }
    };

    match http.get(&checked_url).send().await {
        Ok(response) => {
            let status = response.status();
            let status_code = Some(i32::from(status.as_u16()));
            let latency_ms = elapsed_millis_i32(started.elapsed());
            if status.is_success() {
                HealthProbeOutcome {
                    ok: true,
                    status_code,
                    latency_ms,
                    error: None,
                    checked_url,
                }
            } else {
                HealthProbeOutcome {
                    ok: false,
                    status_code,
                    latency_ms,
                    error: Some(format!("HTTP {}", status.as_u16())),
                    checked_url,
                }
            }
        }
        Err(error) => HealthProbeOutcome {
            ok: false,
            status_code: None,
            latency_ms: elapsed_millis_i32(started.elapsed()),
            error: Some(error.to_string()),
            checked_url,
        },
    }
}

async fn persist_health_probe(
    db: &DatabaseConnection,
    target: &HealthWatchTarget,
    outcome: &HealthProbeOutcome,
    failure_threshold: i32,
) -> Result<()> {
    let previous_status = normalize_health_status(&target.health_status);
    let previous_failures = target.health_failure_count.max(0);
    let failure_count = if outcome.ok {
        0
    } else {
        previous_failures.saturating_add(1)
    };
    let health_status = if outcome.ok {
        "healthy"
    } else if failure_count >= failure_threshold {
        "unhealthy"
    } else {
        "degraded"
    };

    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        UPDATE deploy_services
        SET health_status = $3,
            health_status_updated_at = CASE
                WHEN health_status <> $3 THEN now()
                ELSE health_status_updated_at
            END,
            last_health_checked_at = now(),
            last_health_ok_at = CASE
                WHEN $4 THEN now()
                ELSE last_health_ok_at
            END,
            last_health_status_code = $5,
            last_health_latency_ms = $6,
            health_failure_count = $7,
            last_health_error = $8,
            updated_at = now()
        WHERE workspace_id = $1
          AND id = $2
          AND deleted_at IS NULL
        "#,
        [
            target.workspace_id.into(),
            target.service_id.into(),
            health_status.into(),
            outcome.ok.into(),
            outcome.status_code.into(),
            outcome.latency_ms.into(),
            failure_count.into(),
            outcome.error.clone().into(),
        ],
    ))
    .await?;

    if let Some((level, message)) = health_transition_event(
        previous_status,
        previous_failures,
        health_status,
        failure_count,
    ) {
        insert_event(
            db,
            target.workspace_id,
            target.service_id,
            Some(target.deployment_id),
            level,
            message,
            json!({
                "previous_status": previous_status,
                "health_status": health_status,
                "failure_count": failure_count,
                "failure_threshold": failure_threshold,
                "status_code": outcome.status_code,
                "latency_ms": outcome.latency_ms,
                "error": outcome.error,
                "url": outcome.checked_url,
            }),
        )
        .await?;
    }

    Ok(())
}

fn deployment_health_url(base_url: &str, health_check_path: &str) -> Result<String, String> {
    let mut url = reqwest::Url::parse(base_url.trim())
        .map_err(|error| format!("invalid deployment URL: {error}"))?;
    url.set_path("/");
    url.set_query(None);
    url.set_fragment(None);

    let path = health_check_path.trim();
    let path = if path.is_empty() { "/" } else { path };
    let path = path.trim_start_matches('/');
    let joined = if path.is_empty() {
        url
    } else {
        url.join(path)
            .map_err(|error| format!("invalid health check path: {error}"))?
    };
    Ok(joined.to_string())
}

fn elapsed_millis_i32(duration: Duration) -> i32 {
    i32::try_from(duration.as_millis()).unwrap_or(i32::MAX)
}

fn normalize_health_status(status: &str) -> &'static str {
    match status {
        "healthy" => "healthy",
        "degraded" => "degraded",
        "unhealthy" => "unhealthy",
        _ => "unknown",
    }
}

fn health_transition_event(
    previous_status: &'static str,
    previous_failures: i32,
    health_status: &'static str,
    _failure_count: i32,
) -> Option<(&'static str, &'static str)> {
    if health_status == "healthy" {
        if previous_status == "healthy" && previous_failures == 0 {
            None
        } else if previous_status == "unknown" {
            Some(("info", "deployment health healthy"))
        } else {
            Some(("info", "deployment health recovered"))
        }
    } else if health_status == "unhealthy" {
        if previous_status == "unhealthy" {
            None
        } else {
            Some(("error", "deployment health unhealthy"))
        }
    } else if health_status == "degraded" {
        if previous_status == "degraded" {
            None
        } else if previous_status == "healthy" || previous_status == "unknown" {
            Some(("warn", "deployment health degraded"))
        } else {
            None
        }
    } else {
        None
    }
}

async fn deploy_log_project_columns_available(db: &DatabaseConnection) -> Result<bool> {
    let row = db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT COUNT(*) = 3 AS available
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND (
                (table_name = 'deploy_services' AND column_name = 'log_project_id')
                OR (table_name = 'deploy_log_lines' AND column_name = 'log_project_id')
                OR (table_name = 'deploy_log_lines' AND column_name = 'log_project_ingested_at')
              )
            "#,
            [],
        ))
        .await?;
    Ok(row
        .and_then(|row| row.try_get::<bool>("", "available").ok())
        .unwrap_or(false))
}

async fn flush_pending_log_project_lines_best_effort(
    db: &DatabaseConnection,
    log_db: Option<&DatabaseConnection>,
) {
    let Some(log_db) = log_db else {
        return;
    };
    if let Err(error) = flush_pending_log_project_lines(db, log_db).await {
        tracing::warn!(
            error = ?error,
            "failed to flush pending deployment logs into log projects"
        );
    }
}

async fn ensure_service_log_project(
    db: &DatabaseConnection,
    target: &LogTarget,
) -> Result<Option<Uuid>> {
    if target.log_project_id.is_some() {
        return Ok(target.log_project_id);
    }

    let project_id = target.service_id;
    let project_slug = deploy_log_project_slug(&target.slug, target.service_id);
    let project_name = format!("{} runtime logs", target.name);
    let description = format!("Runtime logs for deployment service {}", target.name);

    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        INSERT INTO log_projects (
            id, workspace_id, bucket_id, slug, name, description,
            retention_days, created_at, updated_at
        )
        VALUES ($1, $2, NULL, $3, $4, $5, 30, now(), now())
        ON CONFLICT DO NOTHING
        "#,
        [
            project_id.into(),
            target.workspace_id.into(),
            project_slug.clone().into(),
            project_name.into(),
            description.into(),
        ],
    ))
    .await?;

    let row = db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
	            UPDATE deploy_services s
	            SET log_project_id = p.id,
	                updated_at = now()
	            FROM log_projects p
	            WHERE s.workspace_id = $1
	              AND s.id = $2
	              AND s.deleted_at IS NULL
	              AND s.log_project_id IS NULL
	              AND p.workspace_id = s.workspace_id
	              AND p.id = s.id
	            RETURNING s.log_project_id
	            "#,
            [target.workspace_id.into(), target.service_id.into()],
        ))
        .await?;

    let linked = row.and_then(|row| row.try_get::<Uuid>("", "log_project_id").ok());
    if let Some(log_project_id) = linked {
        insert_event(
            db,
            target.workspace_id,
            target.service_id,
            None,
            "info",
            "log project linked",
            json!({ "log_project_id": log_project_id, "slug": project_slug }),
        )
        .await?;
    }
    Ok(linked)
}

fn deploy_log_project_slug(service_slug: &str, service_id: Uuid) -> String {
    format!(
        "deploy-{}-{}",
        service_slug.trim_matches('-'),
        &service_id.simple().to_string()[..8]
    )
}

fn deploy_build_log_project_slug(service_slug: &str, service_id: Uuid) -> String {
    format!(
        "deploy-build-{}-{}",
        service_slug.trim_matches('-'),
        &service_id.simple().to_string()[..8]
    )
}

async fn ensure_build_log_project(
    db: &DatabaseConnection,
    workspace_id: Uuid,
    service_id: Uuid,
    slug: &str,
    name: &str,
    source_kind: &str,
    existing: Option<Uuid>,
) -> Result<Option<Uuid>> {
    if existing.is_some() {
        return Ok(existing);
    }
    if source_kind != "git" {
        return Ok(None);
    }

    let project_id = Uuid::now_v7();
    let project_slug = deploy_build_log_project_slug(slug, service_id);
    let project_name = format!("{} build logs", name);
    let description = format!("Build logs for deployment service {}", name);

    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        INSERT INTO log_projects (
            id, workspace_id, bucket_id, slug, name, description,
            retention_days, created_at, updated_at
        )
        VALUES ($1, $2, NULL, $3, $4, $5, $6, now(), now())
        ON CONFLICT DO NOTHING
        "#,
        [
            project_id.into(),
            workspace_id.into(),
            project_slug.clone().into(),
            project_name.into(),
            description.into(),
            BUILD_LOG_RETENTION_DAYS.into(),
        ],
    ))
    .await?;

    let row = db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE deploy_services
            SET build_log_project_id = $3,
                updated_at = now()
            WHERE workspace_id = $1
              AND id = $2
              AND deleted_at IS NULL
              AND build_log_project_id IS NULL
            RETURNING build_log_project_id
            "#,
            [workspace_id.into(), service_id.into(), project_id.into()],
        ))
        .await?;

    let linked = row.and_then(|row| row.try_get::<Uuid>("", "build_log_project_id").ok());
    if let Some(build_log_project_id) = linked {
        insert_event(
            db,
            workspace_id,
            service_id,
            None,
            "info",
            "build log project linked",
            json!({ "build_log_project_id": build_log_project_id, "slug": project_slug }),
        )
        .await?;
    }
    Ok(linked)
}

#[allow(clippy::too_many_arguments)]
async fn insert_build_log_event(
    log_db: &DatabaseConnection,
    workspace_id: Uuid,
    service_id: Uuid,
    deployment_id: Uuid,
    project_id: Uuid,
    service_slug: &str,
    environment: &str,
    line_seq: u64,
    message: &str,
) -> Result<()> {
    let now = Utc::now().fixed_offset();
    let fields = json!({
        "deployment_id": deployment_id,
        "deploy_service_id": service_id,
        "phase": "build",
        "line": line_seq,
    });
    log_db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO log_events (
                time, received_at, project_id, workspace_id, event_id,
                level, message, service, environment, operation,
                request_id, trace_id, source, fields
            )
            VALUES ($1, now(), $2, $3, $4, $5, $6, $7, $8, NULL, NULL, NULL, $9, $10)
            "#,
            [
                now.into(),
                project_id.into(),
                workspace_id.into(),
                format!("deploy-build:{}:{}", deployment_id, line_seq).into(),
                "info".into(),
                message.into(),
                service_slug.into(),
                environment.into(),
                "deploy.build".into(),
                fields.into(),
            ],
        ))
        .await?;
    Ok(())
}

async fn insert_log_line(
    db: &DatabaseConnection,
    target: &LogTarget,
    log_project_id: Option<Uuid>,
    line: LogLine,
    log_project_columns_available: bool,
) -> Result<()> {
    let provider_log_id = line
        .source_id
        .clone()
        .unwrap_or_else(|| fallback_log_id(target, &line));
    let provider_instance_id = line
        .provider_instance_id
        .clone()
        .or_else(|| target.provider_instance_id.clone());
    if log_project_columns_available {
        db.execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO deploy_log_lines (
                id, workspace_id, service_id, deployment_id, provider_instance_id,
                provider_log_id, stream, message, data, observed_at, log_project_id, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
            ON CONFLICT (service_id, provider_log_id)
            DO UPDATE SET log_project_id = COALESCE(deploy_log_lines.log_project_id, EXCLUDED.log_project_id)
            "#,
            [
                Uuid::now_v7().into(),
                target.workspace_id.into(),
                target.service_id.into(),
                target.deployment_id.into(),
                provider_instance_id.into(),
                provider_log_id.into(),
                line.stream.into(),
                line.message.into(),
                line.metadata.into(),
                line.timestamp.into(),
                log_project_id.into(),
            ],
        ))
        .await?;
    } else {
        db.execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO deploy_log_lines (
                id, workspace_id, service_id, deployment_id, provider_instance_id,
                provider_log_id, stream, message, data, observed_at, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
            ON CONFLICT (service_id, provider_log_id) DO NOTHING
            "#,
            [
                Uuid::now_v7().into(),
                target.workspace_id.into(),
                target.service_id.into(),
                target.deployment_id.into(),
                provider_instance_id.into(),
                provider_log_id.into(),
                line.stream.into(),
                line.message.into(),
                line.metadata.into(),
                line.timestamp.into(),
            ],
        ))
        .await?;
    }
    Ok(())
}

async fn flush_pending_log_project_lines(
    db: &DatabaseConnection,
    log_db: &DatabaseConnection,
) -> Result<()> {
    let rows = PendingLogProjectLine::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT l.id,
               l.workspace_id,
               l.service_id,
               l.deployment_id,
               l.provider_instance_id,
               l.provider_log_id,
               l.stream,
               l.message,
               l.data,
               l.observed_at,
               l.log_project_id AS log_project_id,
               s.slug AS service_slug,
               s.environment
        FROM deploy_log_lines l
        INNER JOIN deploy_services s
            ON s.workspace_id = l.workspace_id AND s.id = l.service_id
        WHERE l.log_project_id IS NOT NULL
          AND l.log_project_ingested_at IS NULL
        ORDER BY l.observed_at ASC
        LIMIT 200
        "#,
        [],
    ))
    .all(db)
    .await?;

    for row in rows {
        if let Err(error) = insert_log_project_event(log_db, &row).await {
            tracing::warn!(
                log_line_id = %row.id,
                service_id = %row.service_id,
                error = ?error,
                "failed to ingest deployment log line into log project"
            );
            continue;
        }
        db.execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE deploy_log_lines
            SET log_project_ingested_at = now()
            WHERE id = $1
              AND log_project_ingested_at IS NULL
            "#,
            [row.id.into()],
        ))
        .await?;
    }
    Ok(())
}

async fn insert_log_project_event(
    log_db: &DatabaseConnection,
    row: &PendingLogProjectLine,
) -> Result<()> {
    let level = deploy_log_level(&row.stream, &row.data);
    let fields = deploy_log_fields(row);
    log_db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO log_events (
                time, received_at, project_id, workspace_id, event_id,
                level, message, service, environment, operation,
                request_id, trace_id, source, fields
            )
            VALUES ($1, now(), $2, $3, $4, $5, $6, $7, $8, NULL, NULL, NULL, $9, $10)
            "#,
            [
                row.observed_at.into(),
                row.log_project_id.into(),
                row.workspace_id.into(),
                format!("deploy:{}:{}", row.service_id, row.provider_log_id).into(),
                level.into(),
                row.message.clone().into(),
                row.service_slug.clone().into(),
                row.environment.clone().into(),
                "deploy.fly".into(),
                fields.into(),
            ],
        ))
        .await?;
    Ok(())
}

fn deploy_log_level(stream: &str, data: &serde_json::Value) -> String {
    if stream == "stderr" {
        return "error".to_owned();
    }
    data.get("level")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(stream)
        .to_owned()
}

fn deploy_log_fields(row: &PendingLogProjectLine) -> serde_json::Value {
    let mut fields = match row.data.clone() {
        serde_json::Value::Object(map) => map,
        value => {
            let mut map = serde_json::Map::new();
            map.insert("provider_data".to_owned(), value);
            map
        }
    };
    fields.insert("stream".to_owned(), json!(row.stream));
    fields.insert("deployment_id".to_owned(), json!(row.deployment_id));
    fields.insert(
        "provider_instance_id".to_owned(),
        json!(row.provider_instance_id),
    );
    fields.insert("provider_log_id".to_owned(), json!(row.provider_log_id));
    fields.insert("deploy_service_id".to_owned(), json!(row.service_id));
    serde_json::Value::Object(fields)
}

async fn collect_metrics(db: &DatabaseConnection, provider: &impl DeployProvider) -> Result<()> {
    let targets = MetricTarget::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT workspace_id,
               id AS service_id,
               provider,
               provider_service_id AS provider_service_id
        FROM deploy_services
        WHERE disabled_at IS NULL
          AND provider_service_id IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 25
        "#,
        [],
    ))
    .all(db)
    .await?;

    let to = Utc::now().fixed_offset();
    let from = to - TimeDelta::minutes(30);
    for target in targets {
        let metrics = match provider
            .metrics(&MetricQuery {
                service_id: target.service_id,
                provider: ProviderKind::parse(&target.provider).unwrap_or(DEFAULT_PROVIDER),
                provider_service_id: Some(target.provider_service_id.clone()),
                from,
                to,
            })
            .await
        {
            Ok(metrics) => metrics,
            Err(error) => {
                tracing::warn!(
                    service_id = %target.service_id,
                    error = ?error,
                    "failed to fetch deployment service metrics"
                );
                continue;
            }
        };
        for point in metrics {
            insert_metric_point(db, &target, point).await?;
        }
    }
    Ok(())
}

async fn insert_metric_point(
    db: &DatabaseConnection,
    target: &MetricTarget,
    point: MetricPoint,
) -> Result<()> {
    if point.cpu_percent.is_none() && point.memory_mb.is_none() && point.requests.is_none() {
        return Ok(());
    }
    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        INSERT INTO deploy_metric_rollups (
            workspace_id, service_id, bucket_start, cpu_percent, memory_mb, requests
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (workspace_id, service_id, bucket_start)
        DO UPDATE SET
            cpu_percent = COALESCE(EXCLUDED.cpu_percent, deploy_metric_rollups.cpu_percent),
            memory_mb = COALESCE(EXCLUDED.memory_mb, deploy_metric_rollups.memory_mb),
            requests = COALESCE(EXCLUDED.requests, deploy_metric_rollups.requests)
        "#,
        [
            target.workspace_id.into(),
            target.service_id.into(),
            point.timestamp.into(),
            point.cpu_percent.into(),
            point.memory_mb.into(),
            point.requests.into(),
        ],
    ))
    .await?;
    Ok(())
}

async fn sync_provider_volumes(
    db: &DatabaseConnection,
    workspace_id: Uuid,
    service_id: Uuid,
    volumes: &[ProviderVolume],
) -> Result<()> {
    for volume in volumes {
        db.execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE deploy_service_volumes
            SET provider_volume_id = $4,
                name = $5,
                mount_path = $6,
                region = $7,
                size_gb = $8,
                status = 'created',
                provider_metadata = $9,
                provisioned_at = COALESCE(provisioned_at, now()),
                updated_at = now()
            WHERE workspace_id = $1
              AND service_id = $2
              AND id = $3
              AND deleted_at IS NULL
            "#,
            [
                workspace_id.into(),
                service_id.into(),
                volume.volume_id.into(),
                volume.provider_volume_id.clone().into(),
                volume.name.clone().into(),
                volume.mount_path.clone().into(),
                volume.region.clone().into(),
                volume.size_gb.into(),
                volume.metadata.clone().into(),
            ],
        ))
        .await?;
    }
    Ok(())
}

async fn sync_provider_instances(
    db: &DatabaseConnection,
    job: &DeploymentJob,
    instances: &[deploy::ProviderInstance],
) -> Result<()> {
    for instance in instances {
        db.execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO deploy_instances (
                id, workspace_id, service_id, deployment_id, provider_instance_id,
                status, region, cpu_kind, cpus, memory_mb, started_at, stopped_at,
                created_at, updated_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(),
                CASE WHEN $6 IN ($11, $12, $13) THEN now() ELSE NULL END,
                now(), now()
            )
            ON CONFLICT (provider_instance_id) DO UPDATE SET
                status = EXCLUDED.status,
                region = EXCLUDED.region,
                cpu_kind = EXCLUDED.cpu_kind,
                cpus = EXCLUDED.cpus,
                memory_mb = EXCLUDED.memory_mb,
                stopped_at = CASE
                    WHEN EXCLUDED.status IN ($11, $12, $13)
                        THEN COALESCE(deploy_instances.stopped_at, now())
                    ELSE deploy_instances.stopped_at
                END,
                updated_at = now()
            "#,
            [
                Uuid::now_v7().into(),
                job.workspace_id.into(),
                job.service_id.into(),
                job.id.into(),
                instance.provider_instance_id.clone().into(),
                instance.status.code().into(),
                instance.region.clone().into(),
                instance.cpu_kind.clone().into(),
                i32::from(instance.cpus).into(),
                i32::from(instance.memory_mb).into(),
                DeploymentStatus::Failed.code().into(),
                DeploymentStatus::RolledBack.code().into(),
                DeploymentStatus::Stopped.code().into(),
            ],
        ))
        .await?;
    }
    Ok(())
}

async fn provider_instance_count(
    db: &DatabaseConnection,
    workspace_id: Uuid,
    service_id: Uuid,
) -> Result<i64> {
    let row = db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT (
                SELECT COUNT(*)::BIGINT
                FROM deployments
                WHERE workspace_id = $1
                  AND service_id = $2
                  AND provider_instance_id IS NOT NULL
            ) + (
                SELECT COUNT(*)::BIGINT
                FROM deploy_instances
                WHERE workspace_id = $1
                  AND service_id = $2
                  AND stopped_at IS NULL
            ) AS count
            "#,
            [workspace_id.into(), service_id.into()],
        ))
        .await?;
    Ok(row
        .and_then(|row| row.try_get::<i64>("", "count").ok())
        .unwrap_or(0))
}

async fn delete_volume_row(db: &DatabaseConnection, volume_id: Uuid) -> Result<()> {
    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        "DELETE FROM deploy_service_volumes WHERE id = $1",
        [volume_id.into()],
    ))
    .await?;
    Ok(())
}

async fn hard_delete_service(
    db: &DatabaseConnection,
    workspace_id: Uuid,
    service_id: Uuid,
) -> Result<()> {
    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        DELETE FROM deploy_services
        WHERE workspace_id = $1
          AND id = $2
          AND deleted_at IS NOT NULL
        "#,
        [workspace_id.into(), service_id.into()],
    ))
    .await?;
    Ok(())
}

async fn cleanup_deploy_retention(db: &DatabaseConnection, config: &Config) -> Result<()> {
    let now = Utc::now().fixed_offset();
    let log_cutoff = now - TimeDelta::days(config.log_retention_days);
    let metric_cutoff = now - TimeDelta::days(config.metric_retention_days);
    let event_cutoff = now - TimeDelta::days(config.event_retention_days);

    let logs = delete_old_deploy_logs(db, log_cutoff, config.retention_delete_batch_size).await?;
    let metrics =
        delete_old_deploy_metrics(db, metric_cutoff, config.retention_delete_batch_size).await?;
    let events =
        delete_old_deploy_events(db, event_cutoff, config.retention_delete_batch_size).await?;

    if logs > 0 || metrics > 0 || events > 0 {
        tracing::info!(
            logs_deleted = logs,
            metrics_deleted = metrics,
            events_deleted = events,
            "deployment retention cleanup completed"
        );
    }
    Ok(())
}

async fn delete_old_deploy_logs(
    db: &DatabaseConnection,
    cutoff: DateTime<FixedOffset>,
    limit: i64,
) -> Result<u64> {
    let result = db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            WITH doomed AS (
                SELECT id
                FROM deploy_log_lines
                WHERE observed_at < $1
                ORDER BY observed_at ASC
                LIMIT $2
            )
            DELETE FROM deploy_log_lines
            WHERE id IN (SELECT id FROM doomed)
            "#,
            [cutoff.into(), limit.into()],
        ))
        .await?;
    Ok(result.rows_affected())
}

async fn delete_old_deploy_metrics(
    db: &DatabaseConnection,
    cutoff: DateTime<FixedOffset>,
    limit: i64,
) -> Result<u64> {
    let result = db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            WITH doomed AS (
                SELECT workspace_id, service_id, bucket_start
                FROM deploy_metric_rollups
                WHERE bucket_start < $1
                ORDER BY bucket_start ASC
                LIMIT $2
            )
            DELETE FROM deploy_metric_rollups rollup
            USING doomed
            WHERE rollup.workspace_id = doomed.workspace_id
              AND rollup.service_id = doomed.service_id
              AND rollup.bucket_start = doomed.bucket_start
            "#,
            [cutoff.into(), limit.into()],
        ))
        .await?;
    Ok(result.rows_affected())
}

async fn delete_old_deploy_events(
    db: &DatabaseConnection,
    cutoff: DateTime<FixedOffset>,
    limit: i64,
) -> Result<u64> {
    let result = db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            WITH doomed AS (
                SELECT id
                FROM deploy_events
                WHERE created_at < $1
                ORDER BY created_at ASC
                LIMIT $2
            )
            DELETE FROM deploy_events
            WHERE id IN (SELECT id FROM doomed)
            "#,
            [cutoff.into(), limit.into()],
        ))
        .await?;
    Ok(result.rows_affected())
}

fn fallback_log_id(target: &LogTarget, line: &LogLine) -> String {
    let mut hasher = Sha256::new();
    hasher.update(target.service_id.as_bytes());
    if let Some(deployment_id) = target.deployment_id {
        hasher.update(deployment_id.as_bytes());
    }
    if let Some(instance_id) = line
        .provider_instance_id
        .as_deref()
        .or(target.provider_instance_id.as_deref())
    {
        hasher.update(instance_id.as_bytes());
    }
    hasher.update(line.timestamp.to_rfc3339().as_bytes());
    hasher.update(line.stream.as_bytes());
    hasher.update(line.message.as_bytes());
    format!("sha256:{:x}", hasher.finalize())
}

async fn update_deployment_from_provider(
    db: &DatabaseConnection,
    job: &DeploymentJob,
    provider_deployment: deploy::ProviderDeployment,
) -> Result<()> {
    let finished_at: Option<DateTime<FixedOffset>> = match provider_deployment.status {
        DeploymentStatus::Failed
        | DeploymentStatus::RolledBack
        | DeploymentStatus::Stopped
        | DeploymentStatus::Cancelled => Some(Utc::now().fixed_offset()),
        _ => None,
    };
    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        UPDATE deployments
        SET status = $2,
            provider_deployment_id = $3,
            provider_instance_id = COALESCE($4, provider_instance_id),
            provider_metadata = $5,
            image_digest = COALESCE($6, image_digest),
            url = COALESCE($7, url),
            finished_at = $8,
            updated_at = now()
        WHERE id = $1
          AND status <> $9
        "#,
        [
            job.id.into(),
            provider_deployment.status.code().into(),
            provider_deployment.provider_deployment_id.into(),
            provider_deployment.provider_instance_id.into(),
            provider_deployment.metadata.into(),
            provider_deployment.image_digest.into(),
            provider_deployment.url.into(),
            finished_at.into(),
            DeploymentStatus::Cancelled.code().into(),
        ],
    ))
    .await?;
    Ok(())
}

async fn update_service_after_deploy(
    db: &DatabaseConnection,
    workspace_id: Uuid,
    service_id: Uuid,
    status: DeploymentStatus,
) -> Result<()> {
    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        UPDATE deploy_services
        SET status = $3,
            provider_service_id = COALESCE(provider_service_id, (
                SELECT provider_metadata->>'app_name'
                FROM deployments
                WHERE service_id = $2
                ORDER BY updated_at DESC
                LIMIT 1
            )),
            url = COALESCE(url, (
                SELECT url
                FROM deployments
                WHERE service_id = $2
                ORDER BY updated_at DESC
                LIMIT 1
            )),
            updated_at = now()
        WHERE workspace_id = $1 AND id = $2
        "#,
        [workspace_id.into(), service_id.into(), status.code().into()],
    ))
    .await?;
    Ok(())
}

async fn fail_deployment(
    db: &DatabaseConnection,
    job: &DeploymentJob,
    message: &str,
) -> Result<()> {
    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        UPDATE deployments
        SET status = $2, failure_message = $3, finished_at = now(), updated_at = now()
        WHERE id = $1
        "#,
        [
            job.id.into(),
            DeploymentStatus::Failed.code().into(),
            message.into(),
        ],
    ))
    .await?;
    close_deployment_instances(db, job, DeploymentStatus::Failed).await?;
    insert_event(
        db,
        job.workspace_id,
        job.service_id,
        Some(job.id),
        "error",
        "deployment failed",
        json!({ "error": message }),
    )
    .await?;
    Ok(())
}

async fn mark_deployment_stopped(
    db: &DatabaseConnection,
    job: &DeploymentJob,
    message: &str,
) -> Result<()> {
    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        UPDATE deployments
        SET status = $2, finished_at = now(), updated_at = now()
        WHERE id = $1
        "#,
        [job.id.into(), DeploymentStatus::Stopped.code().into()],
    ))
    .await?;
    close_deployment_instances(db, job, DeploymentStatus::Stopped).await?;
    insert_event(
        db,
        job.workspace_id,
        job.service_id,
        Some(job.id),
        "warn",
        message,
        json!({}),
    )
    .await?;
    Ok(())
}

async fn mark_deployment_destroyed(
    db: &DatabaseConnection,
    job: &DeploymentJob,
    message: &str,
) -> Result<()> {
    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        UPDATE deployments
        SET status = $2,
            provider_instance_id = NULL,
            finished_at = now(),
            updated_at = now()
        WHERE id = $1
        "#,
        [job.id.into(), DeploymentStatus::Stopped.code().into()],
    ))
    .await?;
    close_deployment_instances(db, job, DeploymentStatus::Stopped).await?;
    insert_event(
        db,
        job.workspace_id,
        job.service_id,
        Some(job.id),
        "warn",
        message,
        json!({ "provider_instance_removed": true }),
    )
    .await?;
    Ok(())
}

async fn close_deployment_instances(
    db: &DatabaseConnection,
    job: &DeploymentJob,
    status: DeploymentStatus,
) -> Result<()> {
    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        UPDATE deploy_instances
        SET status = $4,
            stopped_at = COALESCE(stopped_at, now()),
            updated_at = now()
        WHERE workspace_id = $1
          AND service_id = $2
          AND deployment_id = $3
          AND stopped_at IS NULL
        "#,
        [
            job.workspace_id.into(),
            job.service_id.into(),
            job.id.into(),
            status.code().into(),
        ],
    ))
    .await?;
    Ok(())
}

async fn update_domain_from_provider(
    db: &DatabaseConnection,
    row: &DomainJob,
    domain: deploy::ProviderDomain,
) -> Result<()> {
    let active = domain.configured || domain.status == "active";
    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        UPDATE deploy_service_domains
        SET status = $2,
            provider_domain_id = COALESCE($3, provider_domain_id),
            dns_requirements = $4,
            validation_errors = $5,
            provider_metadata = $6,
            verified_at = CASE
                WHEN $7 THEN COALESCE(verified_at, now())
                ELSE verified_at
            END,
            updated_at = now()
        WHERE id = $1
        "#,
        [
            row.id.into(),
            domain.status.into(),
            domain.provider_domain_id.into(),
            domain.dns_requirements.into(),
            domain.validation_errors.into(),
            domain.metadata.into(),
            active.into(),
        ],
    ))
    .await?;
    Ok(())
}

async fn mark_domain_failed(db: &DatabaseConnection, row: &DomainJob, message: &str) -> Result<()> {
    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        UPDATE deploy_service_domains
        SET status = 'failed',
            validation_errors = $2,
            updated_at = now()
        WHERE id = $1
        "#,
        [row.id.into(), json!([message]).into()],
    ))
    .await?;
    Ok(())
}

async fn delete_domain_row(db: &DatabaseConnection, row: &DomainJob) -> Result<()> {
    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        "DELETE FROM deploy_service_domains WHERE id = $1",
        [row.id.into()],
    ))
    .await?;
    Ok(())
}

async fn insert_event(
    db: &DatabaseConnection,
    workspace_id: Uuid,
    service_id: Uuid,
    deployment_id: Option<Uuid>,
    level: &str,
    message: &str,
    data: serde_json::Value,
) -> Result<()> {
    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        INSERT INTO deploy_events (
            id, workspace_id, service_id, deployment_id, level, message, data, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, now())
        "#,
        [
            Uuid::now_v7().into(),
            workspace_id.into(),
            service_id.into(),
            deployment_id.into(),
            level.into(),
            message.into(),
            data.into(),
        ],
    ))
    .await?;
    Ok(())
}

fn required_env(name: &str) -> Result<String> {
    optional_env(name).with_context(|| format!("{name} not set"))
}

fn optional_env(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn parse_positive_u64_env(name: &str, default: u64, min: u64, max: u64) -> Result<u64> {
    let raw = optional_env(name).unwrap_or_else(|| default.to_string());
    let value = raw
        .parse::<u64>()
        .with_context(|| format!("{name} must be u64"))?;
    anyhow::ensure!(
        value >= min && value <= max,
        "{name} must be between {min} and {max}"
    );
    Ok(value)
}

fn parse_positive_i64_env(name: &str, default: i64, min: i64, max: i64) -> Result<i64> {
    let raw = optional_env(name).unwrap_or_else(|| default.to_string());
    let value = raw
        .parse::<i64>()
        .with_context(|| format!("{name} must be i64"))?;
    anyhow::ensure!(
        value >= min && value <= max,
        "{name} must be between {min} and {max}"
    );
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deployment_health_url_joins_path_from_root() {
        assert_eq!(
            deployment_health_url("https://example.fly.dev/app", "/health").unwrap(),
            "https://example.fly.dev/health"
        );
        assert_eq!(
            deployment_health_url("https://example.fly.dev", "/").unwrap(),
            "https://example.fly.dev/"
        );
    }

    #[test]
    fn health_transition_events_fire_only_on_transitions() {
        assert_eq!(
            health_transition_event("unknown", 0, "healthy", 0),
            Some(("info", "deployment health healthy"))
        );
        assert_eq!(
            health_transition_event("healthy", 0, "degraded", 1),
            Some(("warn", "deployment health degraded"))
        );
        assert_eq!(health_transition_event("degraded", 1, "degraded", 2), None);
        assert_eq!(
            health_transition_event("degraded", 2, "unhealthy", 3),
            Some(("error", "deployment health unhealthy"))
        );
        assert_eq!(
            health_transition_event("unhealthy", 3, "unhealthy", 4),
            None
        );
        assert_eq!(
            health_transition_event("unhealthy", 4, "healthy", 0),
            Some(("info", "deployment health recovered"))
        );
        assert_eq!(health_transition_event("healthy", 0, "healthy", 0), None);
    }

    #[test]
    fn supported_provider_kinds_scope_by_cloud_run_config() {
        // Fly-only worker (Cloud Run unconfigured) must not claim Cloud Run jobs.
        assert_eq!(supported_provider_kinds(false), vec!["fly".to_owned()]);
        // With Cloud Run configured it claims both.
        assert_eq!(
            supported_provider_kinds(true),
            vec!["fly".to_owned(), "cloud_run".to_owned()]
        );
    }

    #[test]
    fn supported_provider_kinds_match_persisted_provider_values() {
        // The `= ANY(...)` claim filter compares against the stored `provider`
        // column, so every advertised kind must round-trip through the same
        // parser the rest of the system uses.
        for kind in supported_provider_kinds(true) {
            assert!(
                ProviderKind::parse(&kind).is_ok(),
                "claim allowlist value {kind:?} is not a valid persisted provider"
            );
        }
    }
}

fn init_tracing() {
    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("produktive_deploy_worker=info,fly=info")),
        )
        .with(tracing_subscriber::fmt::layer().compact())
        .init();
}
