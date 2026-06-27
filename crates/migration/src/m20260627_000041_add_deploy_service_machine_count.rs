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
            ALTER TABLE deploy_services
                ADD COLUMN IF NOT EXISTS machine_count INTEGER NOT NULL DEFAULT 1;

            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'deploy_services_machine_count_range'
                ) THEN
                    ALTER TABLE deploy_services
                        ADD CONSTRAINT deploy_services_machine_count_range
                        CHECK (machine_count >= 1 AND machine_count <= 5)
                        NOT VALID;
                END IF;
            END $$;

            ALTER TABLE deploy_services
                VALIDATE CONSTRAINT deploy_services_machine_count_range;
            "#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(
            r#"
            ALTER TABLE deploy_services
                DROP CONSTRAINT IF EXISTS deploy_services_machine_count_range;

            ALTER TABLE deploy_services
                DROP COLUMN IF EXISTS machine_count;
            "#,
        )
        .await?;
        Ok(())
    }
}
