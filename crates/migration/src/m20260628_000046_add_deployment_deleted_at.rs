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
                ALTER TABLE deployments
                    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

                CREATE INDEX IF NOT EXISTS idx_deployments_deleted_cleanup
                    ON deployments (deleted_at ASC)
                    WHERE deleted_at IS NOT NULL;
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
                DROP INDEX IF EXISTS idx_deployments_deleted_cleanup;

                ALTER TABLE deployments
                    DROP COLUMN IF EXISTS deleted_at;
                "#,
            )
            .await?;
        Ok(())
    }
}
