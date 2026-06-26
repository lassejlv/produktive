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
                CREATE TABLE IF NOT EXISTS object_storage_buckets (
                    id                     UUID PRIMARY KEY,
                    workspace_id           UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                    slug                   VARCHAR NOT NULL,
                    name                   VARCHAR NOT NULL,
                    provider               VARCHAR NOT NULL DEFAULT 'tigris',
                    provider_bucket_name   VARCHAR NOT NULL,
                    region                 VARCHAR NOT NULL,
                    access                 VARCHAR NOT NULL DEFAULT 'private',
                    endpoint               VARCHAR NOT NULL DEFAULT 'https://t3.storage.dev',
                    access_key_id          VARCHAR,
                    encrypted_secret       TEXT,
                    status                 VARCHAR NOT NULL DEFAULT 'creating',
                    failure_message        TEXT,
                    created_by             UUID REFERENCES users(id) ON DELETE SET NULL,
                    deleted_at             TIMESTAMPTZ,
                    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
                );

                CREATE UNIQUE INDEX IF NOT EXISTS uniq_object_storage_buckets_workspace_slug
                    ON object_storage_buckets (workspace_id, slug)
                    WHERE deleted_at IS NULL;

                CREATE INDEX IF NOT EXISTS idx_object_storage_buckets_workspace_created
                    ON object_storage_buckets (workspace_id, created_at DESC)
                    WHERE deleted_at IS NULL;

                CREATE INDEX IF NOT EXISTS idx_object_storage_buckets_provider_name
                    ON object_storage_buckets (provider_bucket_name);
                "#,
            )
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared("DROP TABLE IF EXISTS object_storage_buckets")
            .await?;
        Ok(())
    }
}
