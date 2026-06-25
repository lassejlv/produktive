use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};

use anyhow::{Context, Result};
use chrono::{DateTime, FixedOffset, TimeDelta, Utc};
use deploy::{
    DeployError, DeployProvider, DeploymentSpec, DeploymentStatus, LogLine, LogQuery, MetricPoint,
    MetricQuery, ProviderServiceRef, ProviderVolume, ResourcePreset, SecretCipher, VolumeSpec,
};
use fly::{Fly, FlyConfig, FlyProvider};
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
    deploy_secrets_key: String,
    fly_api_token: String,
    fly_org_slug: String,
    fly_api_hostname: String,
    fly_app_name_prefix: String,
    poll_interval: Duration,
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
    image: String,
    image_digest: Option<String>,
    provider_instance_id: Option<String>,
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
    deployment_id: Option<Uuid>,
    provider_service_id: String,
    provider_instance_id: Option<String>,
}

#[derive(Debug, FromQueryResult)]
struct MetricTarget {
    workspace_id: Uuid,
    service_id: Uuid,
    provider_service_id: String,
}

#[derive(Debug, FromQueryResult)]
struct DomainJob {
    id: Uuid,
    workspace_id: Uuid,
    service_id: Uuid,
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
    provider_service_id: Option<String>,
    slug: String,
}

#[derive(Debug, FromQueryResult)]
struct DeletedVolumeRow {
    id: Uuid,
    workspace_id: Uuid,
    service_id: Uuid,
    provider_service_id: Option<String>,
    slug: String,
    provider_volume_id: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();
    init_tracing();

    let config = Config::from_env()?;
    let mut opt = ConnectOptions::new(config.database_url.clone());
    opt.max_connections(5)
        .min_connections(1)
        .connect_timeout(Duration::from_secs(8))
        .acquire_timeout(Duration::from_secs(8))
        .idle_timeout(Duration::from_secs(60))
        .sqlx_logging(false);
    let db = Database::connect(opt).await?;
    let cipher = SecretCipher::from_hex_key(&config.deploy_secrets_key)
        .map_err(|error| anyhow::anyhow!(error))?;
    let provider = FlyProvider::new(
        Fly::from_config(FlyConfig {
            api_token: config.fly_api_token.clone(),
            org_slug: config.fly_org_slug.clone(),
            api_hostname: Some(config.fly_api_hostname.clone()),
            app_name_prefix: config.fly_app_name_prefix.clone(),
        })
        .map_err(|error| anyhow::anyhow!(error))?,
    );

    tracing::info!("produktive deploy worker started");
    let mut last_metric_collection = Instant::now() - Duration::from_secs(60);
    let mut last_retention_cleanup = Instant::now() - config.retention_cleanup_interval;
    loop {
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
        if let Err(error) = collect_logs(&db, &provider).await {
            tracing::warn!(error = ?error, "deployment log collection failed");
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
        match claim_next(&db).await {
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
            deploy_secrets_key: required_env("DEPLOY_SECRETS_KEY")?,
            fly_api_token: required_env("FLY_API_TOKEN")?,
            fly_org_slug: required_env("FLY_ORG_SLUG")?,
            fly_api_hostname: optional_env("FLY_API_HOSTNAME")
                .unwrap_or_else(|| "https://api.machines.dev".into()),
            fly_app_name_prefix: optional_env("FLY_APP_NAME_PREFIX")
                .unwrap_or_else(|| "prd".into()),
            poll_interval,
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

async fn claim_next(db: &DatabaseConnection) -> Result<Option<DeploymentJob>> {
    let row = DeploymentJob::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        UPDATE deployments
        SET status = $2, started_at = COALESCE(started_at, now()), updated_at = now()
        WHERE id = (
            SELECT d.id
            FROM deployments d
            WHERE d.status = $1
              AND EXISTS (
                SELECT 1
                FROM deploy_services s
                WHERE s.workspace_id = d.workspace_id
                  AND s.id = d.service_id
                  AND s.disabled_at IS NULL
              )
            ORDER BY d.created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, workspace_id, service_id, image, image_digest, provider_instance_id
        "#,
        [
            DeploymentStatus::Queued.code().into(),
            DeploymentStatus::Provisioning.code().into(),
        ],
    ))
    .one(db)
    .await?;
    Ok(row)
}

async fn run_job(
    db: &DatabaseConnection,
    cipher: &SecretCipher,
    provider: &impl DeployProvider,
    job: DeploymentJob,
) -> Result<()> {
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
            update_deployment_from_provider(db, &job, provider_deployment).await?;
            sync_provider_volumes(db, job.workspace_id, job.service_id, &provider_volumes).await?;
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
    let service = ServiceRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT provider_service_id, slug, internal_port, env,
               environment, health_check_path, region, resource_preset
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
        provider_service_id: service.provider_service_id,
        provider_instance_id: job.provider_instance_id.clone(),
        app_name: service.slug,
        image: job.image.clone(),
        image_digest: job.image_digest.clone(),
        internal_port: service.internal_port as u16,
        environment: service.environment,
        health_check_path: service.health_check_path,
        region: service.region,
        resource_preset: ResourcePreset::parse(&service.resource_preset)
            .map_err(|error| anyhow::anyhow!(error))?,
        volumes,
        env,
        secrets,
    })
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
        SELECT id, workspace_id, service_id, image, image_digest, provider_instance_id
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
        let spec = build_spec(db, cipher, &job).await?;
        match provider.refresh_deployment(&spec).await {
            Ok(provider_deployment) => {
                let status = provider_deployment.status;
                let provider_volumes = provider_deployment.volumes.clone();
                update_deployment_from_provider(db, &job, provider_deployment).await?;
                sync_provider_volumes(db, job.workspace_id, job.service_id, &provider_volumes)
                    .await?;
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

async fn stop_disabled_services(
    db: &DatabaseConnection,
    cipher: &SecretCipher,
    provider: &impl DeployProvider,
) -> Result<()> {
    let rows = DeploymentJob::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT d.id, d.workspace_id, d.service_id, d.image, d.image_digest, d.provider_instance_id
        FROM deployments d
        INNER JOIN deploy_services s
            ON s.workspace_id = d.workspace_id AND s.id = d.service_id
        WHERE s.disabled_at IS NOT NULL
          AND s.deleted_at IS NULL
          AND d.status IN ($1, $2, $3, $4, $5, $6, $7)
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
            SELECT id, workspace_id, service_id, image, image_digest, provider_instance_id
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
        SELECT id, workspace_id, service_id, $3 AS provider_service_id, $4 AS slug, provider_volume_id
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
        r#"
        SELECT id, workspace_id, service_id, image, image_digest, provider_instance_id
        FROM deployments
        WHERE workspace_id = $1
          AND service_id = $2
          AND id <> $3
          AND provider_instance_id IS NOT NULL
        ORDER BY updated_at ASC
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
        r#"
        WITH current_live AS (
            SELECT DISTINCT ON (workspace_id, service_id)
                   id, workspace_id, service_id
            FROM deployments
            WHERE provider = $1
              AND provider_instance_id IS NOT NULL
              AND status IN ($2, $3)
            ORDER BY workspace_id, service_id, updated_at DESC
        )
        SELECT d.id, d.workspace_id, d.service_id, d.image, d.image_digest, d.provider_instance_id
        FROM deployments d
        INNER JOIN current_live live
            ON live.workspace_id = d.workspace_id AND live.service_id = d.service_id
        WHERE d.id <> live.id
          AND d.provider = $1
          AND d.provider_instance_id IS NOT NULL
        ORDER BY d.updated_at ASC
        LIMIT 20
        "#,
        [
            provider.provider().as_str().into(),
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
               s.provider_service_id AS provider_service_id,
               s.slug,
               d.hostname,
               d.status
        FROM deploy_service_domains d
        INNER JOIN deploy_services s
            ON s.workspace_id = d.workspace_id AND s.id = d.service_id
        WHERE s.provider = $1
          AND s.provider_service_id IS NOT NULL
          AND d.status IN ('queued', 'pending_validation', 'checking', 'failed', 'removing')
        ORDER BY d.updated_at ASC
        LIMIT 20
        "#,
        [provider.provider().as_str().into()],
    ))
    .all(db)
    .await?;

    for row in rows {
        let service = ProviderServiceRef {
            workspace_id: row.workspace_id,
            service_id: row.service_id,
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

async fn collect_logs(db: &DatabaseConnection, provider: &impl DeployProvider) -> Result<()> {
    let targets = LogTarget::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT s.workspace_id,
               s.id AS service_id,
               d.id AS deployment_id,
               s.provider_service_id AS provider_service_id,
               d.provider_instance_id AS provider_instance_id
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
          AND s.provider = $6
          AND s.provider_service_id IS NOT NULL
        ORDER BY s.updated_at DESC
        LIMIT 25
        "#,
        [
            DeploymentStatus::Provisioning.code().into(),
            DeploymentStatus::Pulling.code().into(),
            DeploymentStatus::Starting.code().into(),
            DeploymentStatus::Healthy.code().into(),
            DeploymentStatus::Live.code().into(),
            provider.provider().as_str().into(),
        ],
    ))
    .all(db)
    .await?;

    for target in targets {
        let logs = match provider
            .logs(&LogQuery {
                service_id: target.service_id,
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
            insert_log_line(db, &target, line).await?;
        }
    }
    Ok(())
}

async fn insert_log_line(db: &DatabaseConnection, target: &LogTarget, line: LogLine) -> Result<()> {
    let provider_log_id = line
        .source_id
        .clone()
        .unwrap_or_else(|| fallback_log_id(target, &line));
    let provider_instance_id = line
        .provider_instance_id
        .clone()
        .or_else(|| target.provider_instance_id.clone());
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
    Ok(())
}

async fn collect_metrics(db: &DatabaseConnection, provider: &impl DeployProvider) -> Result<()> {
    let targets = MetricTarget::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT workspace_id,
               id AS service_id,
               provider_service_id AS provider_service_id
        FROM deploy_services
        WHERE disabled_at IS NULL
          AND provider = $1
          AND provider_service_id IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 25
        "#,
        [provider.provider().as_str().into()],
    ))
    .all(db)
    .await?;

    let to = Utc::now().fixed_offset();
    let from = to - TimeDelta::minutes(30);
    for target in targets {
        let metrics = match provider
            .metrics(&MetricQuery {
                service_id: target.service_id,
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

async fn provider_instance_count(
    db: &DatabaseConnection,
    workspace_id: Uuid,
    service_id: Uuid,
) -> Result<i64> {
    let row = db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT COUNT(*)::BIGINT AS count
            FROM deployments
            WHERE workspace_id = $1
              AND service_id = $2
              AND provider_instance_id IS NOT NULL
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
        DeploymentStatus::Live
        | DeploymentStatus::Failed
        | DeploymentStatus::RolledBack
        | DeploymentStatus::Stopped => Some(Utc::now().fixed_offset()),
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
            finished_at = COALESCE($8, finished_at),
            updated_at = now()
        WHERE id = $1
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
        SET status = $2, finished_at = COALESCE(finished_at, now()), updated_at = now()
        WHERE id = $1
        "#,
        [job.id.into(), DeploymentStatus::Stopped.code().into()],
    ))
    .await?;
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
            finished_at = COALESCE(finished_at, now()),
            updated_at = now()
        WHERE id = $1
        "#,
        [job.id.into(), DeploymentStatus::Stopped.code().into()],
    ))
    .await?;
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

fn init_tracing() {
    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("produktive_deploy_worker=info,fly=info")),
        )
        .with(tracing_subscriber::fmt::layer().compact())
        .init();
}
