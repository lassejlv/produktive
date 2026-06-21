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
                CREATE INDEX IF NOT EXISTS idx_deploy_log_lines_observed_retention
                    ON deploy_log_lines (observed_at ASC);

                CREATE INDEX IF NOT EXISTS idx_deploy_metric_rollups_bucket_retention
                    ON deploy_metric_rollups (bucket_start ASC);

                CREATE INDEX IF NOT EXISTS idx_deploy_events_created_retention
                    ON deploy_events (created_at ASC);
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
                DROP INDEX IF EXISTS idx_deploy_events_created_retention;
                DROP INDEX IF EXISTS idx_deploy_metric_rollups_bucket_retention;
                DROP INDEX IF EXISTS idx_deploy_log_lines_observed_retention;
                "#,
            )
            .await?;
        Ok(())
    }
}
