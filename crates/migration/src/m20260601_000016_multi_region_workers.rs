use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::Statement;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        let backend = db.get_database_backend();

        for sql in [
            r#"
            CREATE TABLE IF NOT EXISTS regions (
                id UUID PRIMARY KEY,
                slug TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                enabled BOOLEAN NOT NULL DEFAULT TRUE,
                heartbeat_at TIMESTAMPTZ,
                version TEXT,
                capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            "#,
            r#"
            INSERT INTO regions (id, slug, name, enabled, capabilities)
            VALUES (
                '00000000-0000-0000-0000-000000000001',
                'eu-west',
                'eu-west',
                TRUE,
                '["http","tcp","ping","postgres","redis","ssh"]'::jsonb
            )
            ON CONFLICT (slug) DO UPDATE
            SET enabled = TRUE,
                capabilities = EXCLUDED.capabilities,
                updated_at = now();
            "#,
            r#"
            CREATE TABLE IF NOT EXISTS monitor_regions (
                monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
                region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
                enabled BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (monitor_id, region_id)
            );
            "#,
            r#"
            CREATE TABLE IF NOT EXISTS monitor_region_states (
                monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
                region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
                last_status SMALLINT,
                last_latency_ms INTEGER,
                last_checked_at TIMESTAMPTZ,
                last_error TEXT,
                lease_id UUID,
                lease_expires_at TIMESTAMPTZ,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (monitor_id, region_id)
            );
            "#,
            r#"
            INSERT INTO monitor_regions (monitor_id, region_id, enabled)
            SELECT id, '00000000-0000-0000-0000-000000000001'::uuid, TRUE
            FROM monitors
            ON CONFLICT (monitor_id, region_id) DO NOTHING;
            "#,
            r#"
            INSERT INTO monitor_region_states (
                monitor_id,
                region_id,
                last_status,
                last_latency_ms,
                last_checked_at,
                updated_at
            )
            SELECT id,
                   '00000000-0000-0000-0000-000000000001'::uuid,
                   last_status,
                   last_latency_ms,
                   last_checked_at,
                   now()
            FROM monitors
            ON CONFLICT (monitor_id, region_id) DO NOTHING;
            "#,
            r#"
            ALTER TABLE checks
            ADD COLUMN IF NOT EXISTS region_id UUID;
            "#,
            r#"
            UPDATE checks
            SET region_id = '00000000-0000-0000-0000-000000000001'::uuid
            WHERE region_id IS NULL;
            "#,
            r#"
            CREATE INDEX IF NOT EXISTS idx_monitor_regions_region
            ON monitor_regions (region_id, enabled);
            "#,
            r#"
            CREATE INDEX IF NOT EXISTS idx_monitor_region_states_due
            ON monitor_region_states (region_id, last_checked_at, lease_expires_at);
            "#,
            r#"
            CREATE INDEX IF NOT EXISTS idx_checks_monitor_region_time
            ON checks (monitor_id, region_id, time DESC);
            "#,
        ] {
            db.execute(Statement::from_string(backend, sql.to_owned()))
                .await?;
        }

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        let backend = db.get_database_backend();
        for sql in [
            "DROP INDEX IF EXISTS idx_checks_monitor_region_time;",
            "DROP INDEX IF EXISTS idx_monitor_region_states_due;",
            "DROP INDEX IF EXISTS idx_monitor_regions_region;",
            "ALTER TABLE checks DROP COLUMN IF EXISTS region_id;",
            "DROP TABLE IF EXISTS monitor_region_states;",
            "DROP TABLE IF EXISTS monitor_regions;",
            "DROP TABLE IF EXISTS regions;",
        ] {
            db.execute(Statement::from_string(backend, sql.to_owned()))
                .await?;
        }
        Ok(())
    }
}
