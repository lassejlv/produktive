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
                ADD COLUMN IF NOT EXISTS health_status VARCHAR NOT NULL DEFAULT 'unknown',
                ADD COLUMN IF NOT EXISTS health_status_updated_at TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS last_health_checked_at TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS last_health_ok_at TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS last_health_status_code INTEGER,
                ADD COLUMN IF NOT EXISTS last_health_latency_ms INTEGER,
                ADD COLUMN IF NOT EXISTS health_failure_count INTEGER NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS last_health_error TEXT;

            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'deploy_services_health_status_check'
                ) THEN
                    ALTER TABLE deploy_services
                        ADD CONSTRAINT deploy_services_health_status_check
                        CHECK (health_status IN ('unknown', 'healthy', 'degraded', 'unhealthy'))
                        NOT VALID;
                END IF;

                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'deploy_services_health_failure_count_check'
                ) THEN
                    ALTER TABLE deploy_services
                        ADD CONSTRAINT deploy_services_health_failure_count_check
                        CHECK (health_failure_count >= 0)
                        NOT VALID;
                END IF;
            END $$;

            ALTER TABLE deploy_services
                VALIDATE CONSTRAINT deploy_services_health_status_check;

            ALTER TABLE deploy_services
                VALIDATE CONSTRAINT deploy_services_health_failure_count_check;

            CREATE INDEX IF NOT EXISTS idx_deploy_services_health_watch
                ON deploy_services (last_health_checked_at ASC)
                WHERE disabled_at IS NULL
                  AND deleted_at IS NULL
                  AND provider_service_id IS NOT NULL;
            "#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(
            r#"
            DROP INDEX IF EXISTS idx_deploy_services_health_watch;

            ALTER TABLE deploy_services
                DROP CONSTRAINT IF EXISTS deploy_services_health_failure_count_check;

            ALTER TABLE deploy_services
                DROP CONSTRAINT IF EXISTS deploy_services_health_status_check;

            ALTER TABLE deploy_services
                DROP COLUMN IF EXISTS last_health_error,
                DROP COLUMN IF EXISTS health_failure_count,
                DROP COLUMN IF EXISTS last_health_latency_ms,
                DROP COLUMN IF EXISTS last_health_status_code,
                DROP COLUMN IF EXISTS last_health_ok_at,
                DROP COLUMN IF EXISTS last_health_checked_at,
                DROP COLUMN IF EXISTS health_status_updated_at,
                DROP COLUMN IF EXISTS health_status;
            "#,
        )
        .await?;
        Ok(())
    }
}
