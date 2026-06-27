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
                ADD COLUMN IF NOT EXISTS build_log_project_id UUID REFERENCES log_projects(id) ON DELETE SET NULL;

            CREATE INDEX IF NOT EXISTS idx_deploy_services_build_log_project
                ON deploy_services (build_log_project_id)
                WHERE build_log_project_id IS NOT NULL;

            CREATE UNIQUE INDEX IF NOT EXISTS uniq_deploy_services_build_log_project_active
                ON deploy_services (build_log_project_id)
                WHERE build_log_project_id IS NOT NULL AND deleted_at IS NULL;
            "#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(
            r#"
            DROP INDEX IF EXISTS uniq_deploy_services_build_log_project_active;
            DROP INDEX IF EXISTS idx_deploy_services_build_log_project;
            ALTER TABLE deploy_services DROP COLUMN IF EXISTS build_log_project_id;
            "#,
        )
        .await?;
        Ok(())
    }
}
