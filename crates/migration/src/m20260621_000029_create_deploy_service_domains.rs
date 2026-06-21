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
            CREATE TABLE IF NOT EXISTS deploy_service_domains (
                id                 UUID PRIMARY KEY,
                workspace_id       UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                service_id         UUID NOT NULL REFERENCES deploy_services(id) ON DELETE CASCADE,
                provider           VARCHAR NOT NULL DEFAULT 'fly',
                provider_domain_id VARCHAR,
                hostname           VARCHAR NOT NULL,
                status             VARCHAR NOT NULL DEFAULT 'queued',
                dns_requirements   JSONB NOT NULL DEFAULT '{}',
                validation_errors  JSONB NOT NULL DEFAULT '[]',
                provider_metadata  JSONB NOT NULL DEFAULT '{}',
                verified_at        TIMESTAMPTZ,
                deleted_at         TIMESTAMPTZ,
                created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
                created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE UNIQUE INDEX IF NOT EXISTS uniq_deploy_service_domains_hostname_active
                ON deploy_service_domains (hostname)
                WHERE deleted_at IS NULL;

            CREATE INDEX IF NOT EXISTS idx_deploy_service_domains_service
                ON deploy_service_domains (service_id, created_at DESC)
                WHERE deleted_at IS NULL;

            CREATE INDEX IF NOT EXISTS idx_deploy_service_domains_reconcile
                ON deploy_service_domains (status, updated_at ASC)
                WHERE status IN ('queued', 'pending_validation', 'checking', 'removing');
            "#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(
            r#"
            DROP INDEX IF EXISTS idx_deploy_service_domains_reconcile;
            DROP INDEX IF EXISTS idx_deploy_service_domains_service;
            DROP INDEX IF EXISTS uniq_deploy_service_domains_hostname_active;
            DROP TABLE IF EXISTS deploy_service_domains;
            "#,
        )
        .await?;
        Ok(())
    }
}
