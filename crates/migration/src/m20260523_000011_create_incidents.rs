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
            CREATE TABLE IF NOT EXISTS incidents (
                id            UUID PRIMARY KEY,
                workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                monitor_id    UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
                status        SMALLINT NOT NULL,
                severity      SMALLINT NOT NULL,
                started_at    TIMESTAMPTZ NOT NULL,
                last_seen_at  TIMESTAMPTZ NOT NULL,
                resolved_at   TIMESTAMPTZ,
                error_message TEXT,
                created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE INDEX IF NOT EXISTS idx_incidents_workspace_started_at
                ON incidents (workspace_id, started_at DESC);

            CREATE INDEX IF NOT EXISTS idx_incidents_monitor_started_at
                ON incidents (monitor_id, started_at DESC);

            CREATE UNIQUE INDEX IF NOT EXISTS idx_incidents_open_monitor
                ON incidents (monitor_id)
                WHERE status = 0;
            "#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(
            r#"
            DROP INDEX IF EXISTS idx_incidents_open_monitor;
            DROP INDEX IF EXISTS idx_incidents_monitor_started_at;
            DROP INDEX IF EXISTS idx_incidents_workspace_started_at;
            DROP TABLE IF EXISTS incidents;
            "#,
        )
        .await?;
        Ok(())
    }
}
