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
            CREATE TABLE IF NOT EXISTS log_storage_buckets (
                id                UUID PRIMARY KEY,
                name              VARCHAR NOT NULL,
                storage_uri       TEXT NOT NULL,
                region            VARCHAR,
                endpoint          TEXT,
                access_key_id     TEXT,
                secret_access_key TEXT,
                enabled           BOOLEAN NOT NULL DEFAULT true,
                max_projects      INTEGER NOT NULL DEFAULT 100,
                created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE INDEX IF NOT EXISTS idx_log_storage_buckets_enabled
                ON log_storage_buckets (enabled, created_at ASC);

            CREATE TABLE IF NOT EXISTS log_projects (
                id             UUID PRIMARY KEY,
                workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                bucket_id      UUID REFERENCES log_storage_buckets(id) ON DELETE SET NULL,
                slug           VARCHAR NOT NULL,
                name           VARCHAR NOT NULL,
                description    TEXT,
                retention_days INTEGER NOT NULL DEFAULT 14,
                created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE UNIQUE INDEX IF NOT EXISTS uniq_log_projects_workspace_slug
                ON log_projects (workspace_id, slug);

            CREATE INDEX IF NOT EXISTS idx_log_projects_workspace_created_at
                ON log_projects (workspace_id, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_log_projects_bucket
                ON log_projects (bucket_id);

            CREATE TABLE IF NOT EXISTS log_ingest_tokens (
                id            UUID PRIMARY KEY,
                workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                project_id    UUID NOT NULL REFERENCES log_projects(id) ON DELETE CASCADE,
                name          VARCHAR NOT NULL,
                token_hash    VARCHAR NOT NULL UNIQUE,
                token_prefix  VARCHAR NOT NULL,
                last_used_at  TIMESTAMPTZ,
                expires_at    TIMESTAMPTZ,
                revoked_at    TIMESTAMPTZ,
                created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE INDEX IF NOT EXISTS idx_log_ingest_tokens_project_created_at
                ON log_ingest_tokens (project_id, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_log_ingest_tokens_workspace
                ON log_ingest_tokens (workspace_id);

            CREATE TABLE IF NOT EXISTS log_usage_rollups (
                workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                project_id       UUID NOT NULL REFERENCES log_projects(id) ON DELETE CASCADE,
                bucket_start     TIMESTAMPTZ NOT NULL,
                event_count      BIGINT NOT NULL DEFAULT 0,
                bytes_ingested   BIGINT NOT NULL DEFAULT 0,
                last_ingested_at TIMESTAMPTZ,
                PRIMARY KEY (project_id, bucket_start)
            );

            CREATE INDEX IF NOT EXISTS idx_log_usage_rollups_workspace_bucket
                ON log_usage_rollups (workspace_id, bucket_start DESC);

            CREATE TABLE IF NOT EXISTS log_alert_rules (
                id                 UUID PRIMARY KEY,
                workspace_id       UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                project_id         UUID NOT NULL REFERENCES log_projects(id) ON DELETE CASCADE,
                name               VARCHAR NOT NULL,
                query              TEXT NOT NULL DEFAULT '',
                level              VARCHAR,
                threshold_count    INTEGER NOT NULL DEFAULT 1,
                window_seconds     INTEGER NOT NULL DEFAULT 300,
                enabled            BOOLEAN NOT NULL DEFAULT true,
                last_evaluated_at  TIMESTAMPTZ,
                last_fired_at      TIMESTAMPTZ,
                created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE INDEX IF NOT EXISTS idx_log_alert_rules_project
                ON log_alert_rules (project_id, enabled);

            CREATE TABLE IF NOT EXISTS log_alert_firings (
                id            UUID PRIMARY KEY,
                workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                project_id    UUID NOT NULL REFERENCES log_projects(id) ON DELETE CASCADE,
                rule_id       UUID NOT NULL REFERENCES log_alert_rules(id) ON DELETE CASCADE,
                matched_count BIGINT NOT NULL,
                window_start  TIMESTAMPTZ NOT NULL,
                window_end    TIMESTAMPTZ NOT NULL,
                sample        JSONB,
                created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE INDEX IF NOT EXISTS idx_log_alert_firings_rule_created_at
                ON log_alert_firings (rule_id, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_log_alert_firings_workspace_created_at
                ON log_alert_firings (workspace_id, created_at DESC);
            "#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(
            r#"
            DROP INDEX IF EXISTS idx_log_alert_firings_workspace_created_at;
            DROP INDEX IF EXISTS idx_log_alert_firings_rule_created_at;
            DROP TABLE IF EXISTS log_alert_firings;

            DROP INDEX IF EXISTS idx_log_alert_rules_project;
            DROP TABLE IF EXISTS log_alert_rules;

            DROP INDEX IF EXISTS idx_log_usage_rollups_workspace_bucket;
            DROP TABLE IF EXISTS log_usage_rollups;

            DROP INDEX IF EXISTS idx_log_ingest_tokens_workspace;
            DROP INDEX IF EXISTS idx_log_ingest_tokens_project_created_at;
            DROP TABLE IF EXISTS log_ingest_tokens;

            DROP INDEX IF EXISTS idx_log_projects_workspace_created_at;
            DROP INDEX IF EXISTS idx_log_projects_bucket;
            DROP INDEX IF EXISTS uniq_log_projects_workspace_slug;
            DROP TABLE IF EXISTS log_projects;

            DROP INDEX IF EXISTS idx_log_storage_buckets_enabled;
            DROP TABLE IF EXISTS log_storage_buckets;
            "#,
        )
        .await?;
        Ok(())
    }
}
