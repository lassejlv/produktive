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
                ADD COLUMN IF NOT EXISTS source_kind VARCHAR NOT NULL DEFAULT 'image',
                ADD COLUMN IF NOT EXISTS repo_url TEXT,
                ADD COLUMN IF NOT EXISTS git_ref VARCHAR,
                ADD COLUMN IF NOT EXISTS dockerfile_path VARCHAR,
                ADD COLUMN IF NOT EXISTS root_dir VARCHAR;

            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'deploy_services_source_kind_check'
                ) THEN
                    ALTER TABLE deploy_services
                        ADD CONSTRAINT deploy_services_source_kind_check
                        CHECK (source_kind IN ('image', 'git'))
                        NOT VALID;
                END IF;
            END $$;

            ALTER TABLE deploy_services
                VALIDATE CONSTRAINT deploy_services_source_kind_check;

            ALTER TABLE deployments
                ADD COLUMN IF NOT EXISTS source_repo_url TEXT,
                ADD COLUMN IF NOT EXISTS git_ref VARCHAR,
                ADD COLUMN IF NOT EXISTS commit_sha VARCHAR,
                ADD COLUMN IF NOT EXISTS build_provider VARCHAR;
            "#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(
            r#"
            ALTER TABLE deployments
                DROP COLUMN IF EXISTS build_provider,
                DROP COLUMN IF EXISTS commit_sha,
                DROP COLUMN IF EXISTS git_ref,
                DROP COLUMN IF EXISTS source_repo_url;

            ALTER TABLE deploy_services
                DROP CONSTRAINT IF EXISTS deploy_services_source_kind_check;

            ALTER TABLE deploy_services
                DROP COLUMN IF EXISTS root_dir,
                DROP COLUMN IF EXISTS dockerfile_path,
                DROP COLUMN IF EXISTS git_ref,
                DROP COLUMN IF EXISTS repo_url,
                DROP COLUMN IF EXISTS source_kind;
            "#,
        )
        .await?;
        Ok(())
    }
}
