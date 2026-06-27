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
                ADD COLUMN IF NOT EXISTS log_project_id UUID REFERENCES log_projects(id) ON DELETE SET NULL;

            CREATE INDEX IF NOT EXISTS idx_deploy_services_log_project
                ON deploy_services (log_project_id)
                WHERE log_project_id IS NOT NULL;

            CREATE UNIQUE INDEX IF NOT EXISTS uniq_deploy_services_log_project_active
                ON deploy_services (log_project_id)
                WHERE log_project_id IS NOT NULL AND deleted_at IS NULL;

            ALTER TABLE deploy_log_lines
                ADD COLUMN IF NOT EXISTS log_project_id UUID REFERENCES log_projects(id) ON DELETE SET NULL,
                ADD COLUMN IF NOT EXISTS log_project_ingested_at TIMESTAMPTZ;

            CREATE INDEX IF NOT EXISTS idx_deploy_log_lines_project_ingest_retry
                ON deploy_log_lines (log_project_id, observed_at ASC)
                WHERE log_project_id IS NOT NULL AND log_project_ingested_at IS NULL;

            INSERT INTO log_projects (
                id, workspace_id, bucket_id, slug, name, description,
                retention_days, created_at, updated_at
            )
            SELECT s.id,
                   s.workspace_id,
                   NULL,
                   'deploy-' || s.slug || '-' || substr(replace(s.id::text, '-', ''), 1, 8),
                   s.name || ' runtime logs',
                   'Runtime logs for deployment service ' || s.name,
                   30,
                   now(),
                   now()
            FROM deploy_services s
            WHERE s.deleted_at IS NULL
              AND s.log_project_id IS NULL
            ON CONFLICT DO NOTHING;

	            UPDATE deploy_services s
	            SET log_project_id = p.id,
	                updated_at = now()
	            FROM log_projects p
	            WHERE s.deleted_at IS NULL
	              AND s.log_project_id IS NULL
	              AND p.workspace_id = s.workspace_id
	              AND p.id = s.id;

            UPDATE deploy_log_lines l
            SET log_project_id = s.log_project_id
            FROM deploy_services s
            WHERE l.service_id = s.id
              AND l.log_project_id IS NULL
              AND s.log_project_id IS NOT NULL;
            "#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(
            r#"
            DROP INDEX IF EXISTS idx_deploy_log_lines_project_ingest_retry;

            ALTER TABLE deploy_log_lines
                DROP COLUMN IF EXISTS log_project_ingested_at,
                DROP COLUMN IF EXISTS log_project_id;

            DROP INDEX IF EXISTS uniq_deploy_services_log_project_active;
            DROP INDEX IF EXISTS idx_deploy_services_log_project;

            ALTER TABLE deploy_services
                DROP COLUMN IF EXISTS log_project_id;
            "#,
        )
        .await?;
        Ok(())
    }
}
