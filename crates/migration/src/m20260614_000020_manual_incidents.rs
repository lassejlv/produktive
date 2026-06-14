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
            ALTER TABLE incidents
              ADD COLUMN IF NOT EXISTS title TEXT,
              ADD COLUMN IF NOT EXISTS source SMALLINT NOT NULL DEFAULT 0;

            UPDATE incidents i
            SET title = COALESCE(i.title, m.name || ' incident')
            FROM monitors m
            WHERE i.monitor_id = m.id
              AND i.title IS NULL;

            UPDATE incidents
            SET title = 'Incident'
            WHERE title IS NULL;

            ALTER TABLE incidents
              ALTER COLUMN title SET NOT NULL,
              ALTER COLUMN monitor_id DROP NOT NULL;

            CREATE TABLE IF NOT EXISTS incident_updates (
                id           UUID PRIMARY KEY,
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                incident_id  UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
                status       SMALLINT NOT NULL,
                message      TEXT NOT NULL,
                created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
                created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE INDEX IF NOT EXISTS idx_incident_updates_incident_created_at
                ON incident_updates (incident_id, created_at ASC);

            CREATE INDEX IF NOT EXISTS idx_incident_updates_workspace_created_at
                ON incident_updates (workspace_id, created_at DESC);
            "#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(
            r#"
            DROP INDEX IF EXISTS idx_incident_updates_workspace_created_at;
            DROP INDEX IF EXISTS idx_incident_updates_incident_created_at;
            DROP TABLE IF EXISTS incident_updates;

            DELETE FROM incidents WHERE monitor_id IS NULL;

            ALTER TABLE incidents
              ALTER COLUMN monitor_id SET NOT NULL,
              DROP COLUMN IF EXISTS source,
              DROP COLUMN IF EXISTS title;
            "#,
        )
        .await?;
        Ok(())
    }
}
