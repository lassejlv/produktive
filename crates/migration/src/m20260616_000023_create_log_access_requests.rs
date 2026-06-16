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
            -- Access gate for the logs feature. One row per workspace.
            -- status: 0 = pending, 1 = approved, 2 = denied.
            CREATE TABLE IF NOT EXISTS log_access_requests (
                id            UUID PRIMARY KEY,
                workspace_id  UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
                status        SMALLINT NOT NULL DEFAULT 0,
                requested_by  UUID REFERENCES users(id) ON DELETE SET NULL,
                requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                decided_by    UUID REFERENCES users(id) ON DELETE SET NULL,
                decided_at    TIMESTAMPTZ,
                created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE INDEX IF NOT EXISTS idx_log_access_requests_status
                ON log_access_requests (status, requested_at DESC);

            -- Grandfather existing users: any workspace that already has a log
            -- project keeps access without having to request it.
            INSERT INTO log_access_requests (id, workspace_id, status, requested_at, decided_at)
            SELECT gen_random_uuid(), p.workspace_id, 1, now(), now()
            FROM (SELECT DISTINCT workspace_id FROM log_projects) p
            ON CONFLICT (workspace_id) DO NOTHING;
            "#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(
            r#"
            DROP INDEX IF EXISTS idx_log_access_requests_status;
            DROP TABLE IF EXISTS log_access_requests;
            "#,
        )
        .await?;
        Ok(())
    }
}
