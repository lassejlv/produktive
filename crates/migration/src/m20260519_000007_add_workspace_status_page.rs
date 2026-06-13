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
            ALTER TABLE workspaces
              ADD COLUMN IF NOT EXISTS status_slug VARCHAR,
              ADD COLUMN IF NOT EXISTS status_page_enabled BOOLEAN NOT NULL DEFAULT false,
              ADD COLUMN IF NOT EXISTS status_page_title VARCHAR,
              ADD COLUMN IF NOT EXISTS status_page_description VARCHAR;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_status_slug
              ON workspaces (status_slug);
            "#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(
            r#"
            DROP INDEX IF EXISTS idx_workspaces_status_slug;
            ALTER TABLE workspaces
              DROP COLUMN IF EXISTS status_slug,
              DROP COLUMN IF EXISTS status_page_enabled,
              DROP COLUMN IF EXISTS status_page_title,
              DROP COLUMN IF EXISTS status_page_description;
            "#,
        )
        .await?;
        Ok(())
    }
}
