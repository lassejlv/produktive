use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::ConnectionTrait;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(
            r#"
            CREATE TABLE IF NOT EXISTS deploy_access_requests (
                id            UUID PRIMARY KEY,
                workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                status        SMALLINT NOT NULL DEFAULT 0,
                requested_by  UUID REFERENCES users(id) ON DELETE SET NULL,
                requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                decided_by    UUID REFERENCES users(id) ON DELETE SET NULL,
                decided_at    TIMESTAMPTZ,
                created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE UNIQUE INDEX IF NOT EXISTS uniq_deploy_access_workspace
                ON deploy_access_requests (workspace_id);

            CREATE INDEX IF NOT EXISTS idx_deploy_access_status_requested
                ON deploy_access_requests (status, requested_at DESC);

            CREATE TABLE IF NOT EXISTS deploy_registry_credentials (
                id                 UUID PRIMARY KEY,
                workspace_id       UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                name               VARCHAR NOT NULL,
                registry_kind      VARCHAR NOT NULL,
                username           VARCHAR NOT NULL,
                encrypted_password TEXT NOT NULL,
                created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
                revoked_at         TIMESTAMPTZ,
                created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE INDEX IF NOT EXISTS idx_deploy_registry_credentials_workspace
                ON deploy_registry_credentials (workspace_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS deploy_services (
                id                     UUID PRIMARY KEY,
                workspace_id           UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                registry_credential_id UUID REFERENCES deploy_registry_credentials(id) ON DELETE SET NULL,
                provider               VARCHAR NOT NULL DEFAULT 'fly',
                provider_service_id    VARCHAR,
                provider_metadata      JSONB NOT NULL DEFAULT '{}',
                slug                   VARCHAR NOT NULL,
                name                   VARCHAR NOT NULL,
                image                  TEXT NOT NULL,
                registry_kind          VARCHAR NOT NULL,
                internal_port          INTEGER NOT NULL,
                env                    JSONB NOT NULL DEFAULT '{}',
                environment            VARCHAR NOT NULL DEFAULT 'production',
                health_check_path      VARCHAR NOT NULL DEFAULT '/',
                region                 VARCHAR NOT NULL DEFAULT 'fra',
                resource_preset        VARCHAR NOT NULL DEFAULT 'preview_small',
                url                    TEXT,
                status                 SMALLINT NOT NULL DEFAULT 9,
                disabled_at            TIMESTAMPTZ,
                created_by             UUID REFERENCES users(id) ON DELETE SET NULL,
                created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE UNIQUE INDEX IF NOT EXISTS uniq_deploy_services_workspace_slug
                ON deploy_services (workspace_id, slug);

            CREATE INDEX IF NOT EXISTS idx_deploy_services_workspace_created
                ON deploy_services (workspace_id, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_deploy_services_provider_id
                ON deploy_services (provider, provider_service_id);

            CREATE TABLE IF NOT EXISTS deploy_service_secrets (
                id              UUID PRIMARY KEY,
                workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                service_id      UUID NOT NULL REFERENCES deploy_services(id) ON DELETE CASCADE,
                name            VARCHAR NOT NULL,
                encrypted_value TEXT NOT NULL,
                created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE UNIQUE INDEX IF NOT EXISTS uniq_deploy_service_secret_name
                ON deploy_service_secrets (service_id, name);

            CREATE INDEX IF NOT EXISTS idx_deploy_service_secrets_workspace
                ON deploy_service_secrets (workspace_id);

            CREATE TABLE IF NOT EXISTS deployments (
                id                     UUID PRIMARY KEY,
                workspace_id           UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                service_id             UUID NOT NULL REFERENCES deploy_services(id) ON DELETE CASCADE,
                image                  TEXT NOT NULL,
                image_digest           TEXT,
                status                 SMALLINT NOT NULL DEFAULT 0,
                requested_by           UUID REFERENCES users(id) ON DELETE SET NULL,
                provider               VARCHAR NOT NULL DEFAULT 'fly',
                provider_deployment_id VARCHAR,
                provider_instance_id   VARCHAR,
                provider_metadata      JSONB NOT NULL DEFAULT '{}',
                failure_message        TEXT,
                url                    TEXT,
                started_at             TIMESTAMPTZ,
                finished_at            TIMESTAMPTZ,
                created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE INDEX IF NOT EXISTS idx_deployments_workspace_created
                ON deployments (workspace_id, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_deployments_service_created
                ON deployments (service_id, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_deployments_status_created
                ON deployments (status, created_at ASC);

            CREATE TABLE IF NOT EXISTS deploy_instances (
                id                   UUID PRIMARY KEY,
                workspace_id         UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                service_id           UUID NOT NULL REFERENCES deploy_services(id) ON DELETE CASCADE,
                deployment_id        UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
                provider_instance_id VARCHAR NOT NULL,
                status               SMALLINT NOT NULL,
                region               VARCHAR NOT NULL,
                cpu_kind             VARCHAR NOT NULL,
                cpus                 INTEGER NOT NULL,
                memory_mb            INTEGER NOT NULL,
                started_at           TIMESTAMPTZ,
                stopped_at           TIMESTAMPTZ,
                created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE INDEX IF NOT EXISTS idx_deploy_instances_deployment
                ON deploy_instances (deployment_id);

            CREATE UNIQUE INDEX IF NOT EXISTS uniq_deploy_instances_provider
                ON deploy_instances (provider_instance_id);

            CREATE TABLE IF NOT EXISTS deploy_events (
                id            UUID PRIMARY KEY,
                workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                service_id    UUID NOT NULL REFERENCES deploy_services(id) ON DELETE CASCADE,
                deployment_id UUID REFERENCES deployments(id) ON DELETE SET NULL,
                level         VARCHAR NOT NULL DEFAULT 'info',
                message       TEXT NOT NULL,
                data          JSONB NOT NULL DEFAULT '{}',
                created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE INDEX IF NOT EXISTS idx_deploy_events_service_created
                ON deploy_events (service_id, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_deploy_events_deployment_created
                ON deploy_events (deployment_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS deploy_metric_rollups (
                workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                service_id    UUID NOT NULL REFERENCES deploy_services(id) ON DELETE CASCADE,
                bucket_start  TIMESTAMPTZ NOT NULL,
                cpu_percent   DOUBLE PRECISION,
                memory_mb     DOUBLE PRECISION,
                requests      DOUBLE PRECISION,
                PRIMARY KEY (workspace_id, service_id, bucket_start)
            );

            CREATE INDEX IF NOT EXISTS idx_deploy_metric_rollups_service_bucket
                ON deploy_metric_rollups (service_id, bucket_start DESC);
            "#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(
            r#"
            DROP INDEX IF EXISTS idx_deploy_metric_rollups_service_bucket;
            DROP TABLE IF EXISTS deploy_metric_rollups;

            DROP INDEX IF EXISTS idx_deploy_events_deployment_created;
            DROP INDEX IF EXISTS idx_deploy_events_service_created;
            DROP TABLE IF EXISTS deploy_events;

            DROP INDEX IF EXISTS uniq_deploy_instances_provider;
            DROP INDEX IF EXISTS idx_deploy_instances_deployment;
            DROP TABLE IF EXISTS deploy_instances;

            DROP INDEX IF EXISTS idx_deployments_status_created;
            DROP INDEX IF EXISTS idx_deployments_service_created;
            DROP INDEX IF EXISTS idx_deployments_workspace_created;
            DROP TABLE IF EXISTS deployments;

            DROP INDEX IF EXISTS idx_deploy_service_secrets_workspace;
            DROP INDEX IF EXISTS uniq_deploy_service_secret_name;
            DROP TABLE IF EXISTS deploy_service_secrets;

            DROP INDEX IF EXISTS idx_deploy_services_provider_id;
            DROP INDEX IF EXISTS idx_deploy_services_workspace_created;
            DROP INDEX IF EXISTS uniq_deploy_services_workspace_slug;
            DROP TABLE IF EXISTS deploy_services;

            DROP INDEX IF EXISTS idx_deploy_registry_credentials_workspace;
            DROP TABLE IF EXISTS deploy_registry_credentials;

            DROP INDEX IF EXISTS idx_deploy_access_status_requested;
            DROP INDEX IF EXISTS uniq_deploy_access_workspace;
            DROP TABLE IF EXISTS deploy_access_requests;
            "#,
        )
        .await?;
        Ok(())
    }
}
