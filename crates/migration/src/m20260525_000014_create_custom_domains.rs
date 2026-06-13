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
            CREATE TABLE IF NOT EXISTS custom_domains (
              id UUID PRIMARY KEY,
              workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
              hostname VARCHAR(255) NOT NULL,
              verification_name VARCHAR(255) NOT NULL,
              verification_value TEXT NOT NULL,
              verified_at TIMESTAMPTZ,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_domains_hostname
              ON custom_domains (hostname);
            CREATE INDEX IF NOT EXISTS idx_custom_domains_workspace_id
              ON custom_domains (workspace_id);
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
            DROP INDEX IF EXISTS idx_custom_domains_workspace_id;
            DROP INDEX IF EXISTS idx_custom_domains_hostname;
            DROP TABLE IF EXISTS custom_domains;
            "#,
            )
            .await?;
        Ok(())
    }
}
