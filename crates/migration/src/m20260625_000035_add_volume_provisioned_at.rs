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
            -- When the volume was actually provisioned on the provider (status
            -- left 'queued' for 'created'). Volume billing opens its GB-hours
            -- interval here, not at created_at (row-insert time, while still
            -- queued), so a queued or never-provisioned volume isn't billed —
            -- mirroring the compute path billing from a deployment's started_at.
            ALTER TABLE deploy_service_volumes
                ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ;

            -- Backfill: any existing volume that already left 'queued' was
            -- provisioned at some point; bill it from created_at so it keeps
            -- accruing without a gap. Genuinely queued rows stay NULL (unbilled).
            UPDATE deploy_service_volumes
                SET provisioned_at = created_at
                WHERE provisioned_at IS NULL
                  AND status <> 'queued';
            "#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(
            r#"
            ALTER TABLE deploy_service_volumes
                DROP COLUMN IF EXISTS provisioned_at;
            "#,
        )
        .await?;
        Ok(())
    }
}
