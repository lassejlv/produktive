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
                ALTER TABLE deploy_services
                    ADD COLUMN IF NOT EXISTS canvas_x INTEGER NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS canvas_y INTEGER NOT NULL DEFAULT 0;
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
                ALTER TABLE deploy_services
                    DROP COLUMN IF EXISTS canvas_y,
                    DROP COLUMN IF EXISTS canvas_x;
                "#,
            )
            .await?;
        Ok(())
    }
}
