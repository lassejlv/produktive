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
            ALTER TABLE workspaces
              ADD COLUMN IF NOT EXISTS slug VARCHAR;

            ALTER TABLE monitors
              ADD COLUMN IF NOT EXISTS slug VARCHAR;

            WITH workspace_bases AS (
              SELECT
                id,
                left(CASE
                  WHEN lower(trim(both '-' from regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))) IN
                    ('api', 'auth', 'login', 'logout', 'public', 's', 'signup', 'workspaces')
                    THEN 'workspace-' || lower(trim(both '-' from regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')))
                  WHEN trim(both '-' from regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) = ''
                    THEN 'workspace'
                  ELSE lower(trim(both '-' from regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')))
                END, 56) AS base
              FROM workspaces
              WHERE slug IS NULL OR slug = ''
            ),
            workspace_ranked AS (
              SELECT
                id,
                base,
                row_number() OVER (PARTITION BY base ORDER BY id) AS n
              FROM workspace_bases
            )
            UPDATE workspaces w
            SET slug = CASE
              WHEN r.n = 1 THEN r.base
              ELSE r.base || '-' || r.n::text
            END
            FROM workspace_ranked r
            WHERE w.id = r.id;

            WITH monitor_bases AS (
              SELECT
                id,
                workspace_id,
                left(CASE
                  WHEN trim(both '-' from regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) = ''
                    THEN 'monitor'
                  ELSE lower(trim(both '-' from regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')))
                END, 56) AS base
              FROM monitors
              WHERE slug IS NULL OR slug = ''
            ),
            monitor_ranked AS (
              SELECT
                id,
                base,
                row_number() OVER (PARTITION BY workspace_id, base ORDER BY id) AS n
              FROM monitor_bases
            )
            UPDATE monitors m
            SET slug = CASE
              WHEN r.n = 1 THEN r.base
              ELSE r.base || '-' || r.n::text
            END
            FROM monitor_ranked r
            WHERE m.id = r.id;

            ALTER TABLE workspaces
              ALTER COLUMN slug SET NOT NULL;

            ALTER TABLE monitors
              ALTER COLUMN slug SET NOT NULL;

            CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_slug
              ON workspaces (slug);

            CREATE UNIQUE INDEX IF NOT EXISTS idx_monitors_workspace_slug
              ON monitors (workspace_id, slug);
            "#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(
            r#"
            DROP INDEX IF EXISTS idx_monitors_workspace_slug;
            DROP INDEX IF EXISTS idx_workspaces_slug;

            ALTER TABLE monitors
              DROP COLUMN IF EXISTS slug;

            ALTER TABLE workspaces
              DROP COLUMN IF EXISTS slug;
            "#,
        )
        .await?;
        Ok(())
    }
}
