use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::ConnectionTrait;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                r#"
                ALTER TABLE deploy_services
                    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

                DROP INDEX IF EXISTS uniq_deploy_services_workspace_slug;

                CREATE UNIQUE INDEX IF NOT EXISTS uniq_deploy_services_workspace_slug
                    ON deploy_services (workspace_id, slug)
                    WHERE deleted_at IS NULL;

                CREATE INDEX IF NOT EXISTS idx_deploy_services_deleted_cleanup
                    ON deploy_services (deleted_at ASC)
                    WHERE deleted_at IS NOT NULL;

                CREATE TABLE IF NOT EXISTS deploy_service_volumes (
                    id                 UUID PRIMARY KEY,
                    workspace_id       UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                    service_id         UUID NOT NULL REFERENCES deploy_services(id) ON DELETE CASCADE,
                    provider           VARCHAR NOT NULL DEFAULT 'fly',
                    provider_volume_id VARCHAR,
                    name               VARCHAR NOT NULL,
                    mount_path         VARCHAR NOT NULL,
                    region             VARCHAR NOT NULL,
                    size_gb            INTEGER NOT NULL,
                    status             VARCHAR NOT NULL DEFAULT 'queued',
                    provider_metadata  JSONB NOT NULL DEFAULT '{}',
                    deleted_at         TIMESTAMPTZ,
                    created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
                    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
                );

                CREATE UNIQUE INDEX IF NOT EXISTS uniq_deploy_service_volumes_mount_active
                    ON deploy_service_volumes (service_id, mount_path)
                    WHERE deleted_at IS NULL;

                CREATE INDEX IF NOT EXISTS idx_deploy_service_volumes_service
                    ON deploy_service_volumes (service_id, created_at DESC)
                    WHERE deleted_at IS NULL;

                CREATE INDEX IF NOT EXISTS idx_deploy_service_volumes_cleanup
                    ON deploy_service_volumes (status, updated_at ASC)
                    WHERE deleted_at IS NOT NULL OR status = 'deleting';
                "#,
            )
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                r#"
                DROP INDEX IF EXISTS idx_deploy_service_volumes_cleanup;
                DROP INDEX IF EXISTS idx_deploy_service_volumes_service;
                DROP INDEX IF EXISTS uniq_deploy_service_volumes_mount_active;
                DROP TABLE IF EXISTS deploy_service_volumes;

                DROP INDEX IF EXISTS idx_deploy_services_deleted_cleanup;
                DROP INDEX IF EXISTS uniq_deploy_services_workspace_slug;

                CREATE UNIQUE INDEX IF NOT EXISTS uniq_deploy_services_workspace_slug
                    ON deploy_services (workspace_id, slug);

                ALTER TABLE deploy_services
                    DROP COLUMN IF EXISTS deleted_at;
                "#,
            )
            .await?;
        Ok(())
    }
}
