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
            -- Admin usage-reset bookkeeping, stored on the billing-customer
            -- workspace's billing-state row.
            --   usage_reset_at:             checks before this no longer count toward the period.
            --   events_consumed_baseline:   Polar consumed_units observed at reset; subtracted from
            --                               the meter so the reset is independent of Polar's
            --                               negative-event handling.
            --   events_baseline_period_end: the period the baseline applies to (so it never bleeds
            --                               into the next billing period, where the meter resets).
            ALTER TABLE workspace_billing_states
                ADD COLUMN IF NOT EXISTS usage_reset_at TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS events_consumed_baseline DOUBLE PRECISION NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS events_baseline_period_end TIMESTAMPTZ;
            "#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(
            r#"
            ALTER TABLE workspace_billing_states
                DROP COLUMN IF EXISTS events_baseline_period_end,
                DROP COLUMN IF EXISTS events_consumed_baseline,
                DROP COLUMN IF EXISTS usage_reset_at;
            "#,
        )
        .await?;
        Ok(())
    }
}
