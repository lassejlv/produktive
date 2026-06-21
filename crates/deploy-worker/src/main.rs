use std::{collections::BTreeMap, time::Duration};

use anyhow::{Context, Result};
use chrono::{DateTime, FixedOffset, Utc};
use deploy::{
    DeployProvider, DeploymentSpec, DeploymentStatus, LogLine, LogQuery, ResourcePreset,
    SecretCipher,
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
    loop {
        if let Err(error) = stop_disabled_services(&db, &cipher, &provider).await {
            tracing::warn!(error = ?error, "stop disabled deployment services failed");
        }
        if let Err(error) = refresh_inflight(&db, &cipher, &provider).await {
            tracing::warn!(error = ?error, "refresh inflight deployments failed");
        }
        if let Err(error) = collect_logs(&db, &provider).await {
            tracing::warn!(error = ?error, "deployment log collection failed");
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
    match provider.deploy_image(&spec).await {
        Ok(provider_deployment) => {
            let status = provider_deployment.status;
            update_deployment_from_provider(db, &job, provider_deployment).await?;
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
               environment, health_check_path, region
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
        resource_preset: ResourcePreset::PreviewSmall,
        env,
        secrets,
    })
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
                update_deployment_from_provider(db, &job, provider_deployment).await?;
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
          AND status IN ($4, $5)
          AND provider_instance_id IS NOT NULL
        ORDER BY updated_at ASC
        "#,
        [
            current.workspace_id.into(),
            current.service_id.into(),
            current.id.into(),
            DeploymentStatus::Healthy.code().into(),
            DeploymentStatus::Live.code().into(),
        ],
    ))
    .all(db)
    .await?;

    for job in rows {
        let spec = build_spec(db, cipher, &job).await?;
        if let Err(error) = provider.stop_service(&spec).await {
            tracing::warn!(
                deployment_id = %job.id,
                error = ?error,
                "failed to stop superseded deployment"
            );
            continue;
        }
        mark_deployment_stopped(db, &job, "superseded deployment stopped").await?;
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

fn init_tracing() {
    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("produktive_deploy_worker=info,fly=info")),
        )
        .with(tracing_subscriber::fmt::layer().compact())
        .init();
}
