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
                CREATE TABLE IF NOT EXISTS deploy_log_lines (
                    id                   UUID PRIMARY KEY,
                    workspace_id         UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                    service_id           UUID NOT NULL REFERENCES deploy_services(id) ON DELETE CASCADE,
                    deployment_id        UUID REFERENCES deployments(id) ON DELETE SET NULL,
                    provider_instance_id VARCHAR,
                    provider_log_id      TEXT NOT NULL,
                    stream               VARCHAR NOT NULL DEFAULT 'stdout',
                    message              TEXT NOT NULL,
                    data                 JSONB NOT NULL DEFAULT '{}',
                    observed_at          TIMESTAMPTZ NOT NULL,
                    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
                );

                CREATE UNIQUE INDEX IF NOT EXISTS uniq_deploy_log_lines_provider
                    ON deploy_log_lines (service_id, provider_log_id);

                CREATE INDEX IF NOT EXISTS idx_deploy_log_lines_service_observed
                    ON deploy_log_lines (service_id, observed_at DESC);

                CREATE INDEX IF NOT EXISTS idx_deploy_log_lines_deployment_observed
                    ON deploy_log_lines (deployment_id, observed_at DESC);
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
                DROP INDEX IF EXISTS idx_deploy_log_lines_deployment_observed;
                DROP INDEX IF EXISTS idx_deploy_log_lines_service_observed;
                DROP INDEX IF EXISTS uniq_deploy_log_lines_provider;
                DROP TABLE IF EXISTS deploy_log_lines;
                "#,
            )
            .await?;
        Ok(())
    }
}
