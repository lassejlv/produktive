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
                    RAISE EXCEPTION 'TimescaleDB extension is required before running checks migration';
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
            CREATE TABLE IF NOT EXISTS checks (
                time          TIMESTAMPTZ NOT NULL,
                monitor_id    UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
                status        SMALLINT NOT NULL,
                latency_ms    INTEGER,
                status_code   INTEGER,
                error_message TEXT
            );
            "#
            .to_owned(),
        ))
        .await?;

        db.execute(Statement::from_string(
            backend,
            "SELECT create_hypertable('checks', 'time', if_not_exists => TRUE);".to_owned(),
        ))
        .await?;

        db.execute(Statement::from_string(
            backend,
            "CREATE INDEX IF NOT EXISTS idx_checks_monitor_time ON checks (monitor_id, time DESC);"
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
            "DROP TABLE IF EXISTS checks;".to_owned(),
        ))
        .await?;
        Ok(())
    }
}
