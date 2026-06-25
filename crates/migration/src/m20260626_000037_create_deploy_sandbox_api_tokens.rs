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
                CREATE TABLE IF NOT EXISTS deploy_sandbox_api_tokens (
                    id            UUID PRIMARY KEY,
                    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                    name          VARCHAR NOT NULL,
                    token_hash    TEXT NOT NULL,
                    token_prefix  VARCHAR NOT NULL,
                    last_used_at  TIMESTAMPTZ,
                    expires_at    TIMESTAMPTZ,
                    revoked_at    TIMESTAMPTZ,
                    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
                    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
                );

                CREATE UNIQUE INDEX IF NOT EXISTS uniq_deploy_sandbox_api_tokens_hash
                    ON deploy_sandbox_api_tokens (token_hash);

                CREATE INDEX IF NOT EXISTS idx_deploy_sandbox_api_tokens_workspace_created
                    ON deploy_sandbox_api_tokens (workspace_id, created_at DESC);
                "#,
            )
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared("DROP TABLE IF EXISTS deploy_sandbox_api_tokens")
            .await?;
        Ok(())
    }
}
