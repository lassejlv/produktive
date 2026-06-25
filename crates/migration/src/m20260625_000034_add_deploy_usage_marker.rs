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
            -- High-water mark for the deploy usage sweep. The sweep computes
            -- GB-hours / vCPU-hours / volume GB-hours over
            -- [deploy_usage_last_sent_at, now) and ingests a deterministic
            -- Polar event per window. NULL = "never swept" (first sweep covers
            -- a single tick from boot).
            ALTER TABLE workspace_billing_states
                ADD COLUMN IF NOT EXISTS deploy_usage_last_sent_at TIMESTAMPTZ;
            "#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(
            r#"
            ALTER TABLE workspace_billing_states
                DROP COLUMN IF EXISTS deploy_usage_last_sent_at;
            "#,
        )
        .await?;
        Ok(())
    }
}
