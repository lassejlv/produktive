use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                r#"
                CREATE TABLE IF NOT EXISTS deploy_sandboxes (
                    id                 UUID PRIMARY KEY,
                    workspace_id       UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                    slug               VARCHAR NOT NULL,
                    name               VARCHAR NOT NULL,
                    provider_name      VARCHAR NOT NULL,
                    provider_metadata  JSONB NOT NULL DEFAULT '{}',
                    region             VARCHAR NOT NULL DEFAULT 'ord',
                    cpus               INTEGER NOT NULL DEFAULT 1,
                    ram_mb             INTEGER NOT NULL DEFAULT 512,
                    storage_gb         INTEGER NOT NULL DEFAULT 10,
                    url                TEXT,
                    status             VARCHAR NOT NULL DEFAULT 'cold',
                    created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
                    deleted_at         TIMESTAMPTZ,
                    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
                );

                CREATE UNIQUE INDEX IF NOT EXISTS uniq_deploy_sandboxes_workspace_slug
                    ON deploy_sandboxes (workspace_id, slug)
                    WHERE deleted_at IS NULL;

                CREATE INDEX IF NOT EXISTS idx_deploy_sandboxes_workspace_created
                    ON deploy_sandboxes (workspace_id, created_at DESC)
                    WHERE deleted_at IS NULL;

                CREATE INDEX IF NOT EXISTS idx_deploy_sandboxes_provider_name
                    ON deploy_sandboxes (provider_name);
                "#,
            )
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared("DROP TABLE IF EXISTS deploy_sandboxes")
            .await?;
        Ok(())
    }
}
