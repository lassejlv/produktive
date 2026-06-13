use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                r#"
            ALTER TABLE custom_domains
              ADD COLUMN IF NOT EXISTS verification_name VARCHAR(255),
              ADD COLUMN IF NOT EXISTS verification_value TEXT,
              ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
            UPDATE custom_domains
              SET verification_name = '_unstatus.' || hostname
              WHERE verification_name IS NULL;
            UPDATE custom_domains
              SET verification_value = 'unstatus-verification=' || replace(id::text, '-', '')
              WHERE verification_value IS NULL;
            ALTER TABLE custom_domains
              ALTER COLUMN verification_name SET NOT NULL,
              ALTER COLUMN verification_value SET NOT NULL;
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
              DROP COLUMN IF EXISTS verified_at,
              DROP COLUMN IF EXISTS verification_value,
              DROP COLUMN IF EXISTS verification_name;
            "#,
            )
            .await?;
        Ok(())
    }
}
