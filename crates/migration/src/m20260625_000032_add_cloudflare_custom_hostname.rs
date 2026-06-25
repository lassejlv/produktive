use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Cloudflare for SaaS migration: a custom domain is now backed by a
        // Cloudflare Custom Hostname. We track its id (for get/delete), the
        // reported SSL/cert status, and when we last polled it. Additive and
        // nullable so existing Caddy-era rows keep working during the cutover.
        manager
            .get_connection()
            .execute_unprepared(
                r#"
            ALTER TABLE custom_domains
              ADD COLUMN IF NOT EXISTS cf_hostname_id TEXT,
              ADD COLUMN IF NOT EXISTS ssl_status TEXT,
              ADD COLUMN IF NOT EXISTS cf_synced_at TIMESTAMPTZ;
            "#,
            )
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                r#"
            ALTER TABLE custom_domains
              DROP COLUMN IF EXISTS cf_synced_at,
              DROP COLUMN IF EXISTS ssl_status,
              DROP COLUMN IF EXISTS cf_hostname_id;
            "#,
            )
            .await?;
        Ok(())
    }
}
