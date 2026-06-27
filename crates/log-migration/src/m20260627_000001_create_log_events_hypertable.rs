use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::Statement;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        let backend = db.get_database_backend();

        db.execute(Statement::from_string(
            backend,
            r#"
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'
                ) THEN
                    RAISE EXCEPTION 'TimescaleDB extension is required before running log events migration';
                END IF;
            END
            $$;
            "#
            .to_owned(),
        ))
        .await?;

        db.execute(Statement::from_string(
            backend,
            r#"
            CREATE TABLE IF NOT EXISTS log_events (
                time          TIMESTAMPTZ NOT NULL,
                received_at   TIMESTAMPTZ NOT NULL,
                project_id    UUID        NOT NULL,
                workspace_id  UUID        NOT NULL,
                event_id      TEXT        NOT NULL,
                level         TEXT        NOT NULL,
                message       TEXT        NOT NULL,
                service       TEXT,
                environment   TEXT,
                operation     TEXT,
                request_id    TEXT,
                trace_id      TEXT,
                source        TEXT        NOT NULL DEFAULT 'evlog',
                fields        JSONB       NOT NULL DEFAULT '{}'
            );
            "#
            .to_owned(),
        ))
        .await?;

        db.execute(Statement::from_string(
            backend,
            "SELECT create_hypertable('log_events', 'time', if_not_exists => TRUE);".to_owned(),
        ))
        .await?;

        db.execute(Statement::from_string(
            backend,
            r#"
            CREATE INDEX IF NOT EXISTS idx_log_events_project_time
                ON log_events (project_id, time DESC);
            "#
            .to_owned(),
        ))
        .await?;

        db.execute(Statement::from_string(
            backend,
            r#"
            CREATE INDEX IF NOT EXISTS idx_log_events_project_level_time
                ON log_events (project_id, level, time DESC);
            "#
            .to_owned(),
        ))
        .await?;

        db.execute(Statement::from_string(
            backend,
            r#"
            CREATE INDEX IF NOT EXISTS idx_log_events_project_service_time
                ON log_events (project_id, service, time DESC)
                WHERE service IS NOT NULL;
            "#
            .to_owned(),
        ))
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        let backend = db.get_database_backend();
        db.execute(Statement::from_string(
            backend,
            "DROP TABLE IF EXISTS log_events;".to_owned(),
        ))
        .await?;
        Ok(())
    }
}
