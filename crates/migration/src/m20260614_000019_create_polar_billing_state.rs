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
            CREATE TABLE IF NOT EXISTS workspace_billing_states (
                workspace_id              UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
                polar_customer_id         TEXT NOT NULL,
                polar_external_id         TEXT NOT NULL,
                plan_id                   TEXT NOT NULL DEFAULT 'free',
                polar_product_id          TEXT,
                polar_subscription_id     TEXT,
                subscription_status       TEXT,
                cancel_at_period_end      BOOLEAN NOT NULL DEFAULT false,
                current_period_start      TIMESTAMPTZ,
                current_period_end        TIMESTAMPTZ,
                customer_state            JSONB NOT NULL,
                last_event_id             TEXT,
                last_synced_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
                created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE INDEX IF NOT EXISTS idx_workspace_billing_states_customer
                ON workspace_billing_states (polar_customer_id);

            CREATE INDEX IF NOT EXISTS idx_workspace_billing_states_external
                ON workspace_billing_states (polar_external_id);

            CREATE INDEX IF NOT EXISTS idx_workspace_billing_states_synced
                ON workspace_billing_states (last_synced_at);

            CREATE TABLE IF NOT EXISTS polar_webhook_events (
                id                         UUID PRIMARY KEY,
                webhook_id                 TEXT NOT NULL UNIQUE,
                polar_event_id             TEXT,
                event_type                 TEXT NOT NULL,
                workspace_id               UUID REFERENCES workspaces(id) ON DELETE SET NULL,
                polar_customer_id          TEXT,
                polar_external_id          TEXT,
                polar_subscription_id      TEXT,
                payload                    JSONB NOT NULL,
                status                     SMALLINT NOT NULL DEFAULT 0,
                error_message              TEXT,
                received_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
                processed_at               TIMESTAMPTZ
            );

            CREATE INDEX IF NOT EXISTS idx_polar_webhook_events_workspace_received
                ON polar_webhook_events (workspace_id, received_at DESC);

            CREATE INDEX IF NOT EXISTS idx_polar_webhook_events_status_received
                ON polar_webhook_events (status, received_at);

            CREATE INDEX IF NOT EXISTS idx_polar_webhook_events_event_id
                ON polar_webhook_events (polar_event_id);

            ALTER TABLE monitors
              ADD COLUMN IF NOT EXISTS billing_paused_at TIMESTAMPTZ;
            "#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(
            r#"
            DROP INDEX IF EXISTS idx_polar_webhook_events_event_id;
            DROP INDEX IF EXISTS idx_polar_webhook_events_status_received;
            DROP INDEX IF EXISTS idx_polar_webhook_events_workspace_received;
            DROP TABLE IF EXISTS polar_webhook_events;

            DROP INDEX IF EXISTS idx_workspace_billing_states_synced;
            DROP INDEX IF EXISTS idx_workspace_billing_states_external;
            DROP INDEX IF EXISTS idx_workspace_billing_states_customer;
            DROP TABLE IF EXISTS workspace_billing_states;

            ALTER TABLE monitors
              DROP COLUMN IF EXISTS billing_paused_at;
            "#,
        )
        .await?;
        Ok(())
    }
}
