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
            CREATE TABLE IF NOT EXISTS notification_channels (
                id              UUID PRIMARY KEY,
                workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                name            VARCHAR NOT NULL,
                kind            SMALLINT NOT NULL,
                webhook_url     TEXT NOT NULL,
                enabled         BOOLEAN NOT NULL DEFAULT true,
                notify_resolved BOOLEAN NOT NULL DEFAULT true,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE INDEX IF NOT EXISTS idx_notification_channels_workspace
                ON notification_channels (workspace_id);

            CREATE TABLE IF NOT EXISTS notifications (
                id            UUID PRIMARY KEY,
                workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                monitor_id    UUID REFERENCES monitors(id) ON DELETE SET NULL,
                incident_id   UUID REFERENCES incidents(id) ON DELETE SET NULL,
                kind          SMALLINT NOT NULL,
                title         TEXT NOT NULL,
                body          TEXT NOT NULL,
                created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE INDEX IF NOT EXISTS idx_notifications_workspace_created_at
                ON notifications (workspace_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS notification_deliveries (
                id              UUID PRIMARY KEY,
                notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
                channel_id      UUID NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
                status          SMALLINT NOT NULL,
                error_message   TEXT,
                sent_at         TIMESTAMPTZ,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification
                ON notification_deliveries (notification_id);
            "#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(
            r#"
            DROP INDEX IF EXISTS idx_notification_deliveries_notification;
            DROP TABLE IF EXISTS notification_deliveries;
            DROP INDEX IF EXISTS idx_notifications_workspace_created_at;
            DROP TABLE IF EXISTS notifications;
            DROP INDEX IF EXISTS idx_notification_channels_workspace;
            DROP TABLE IF EXISTS notification_channels;
            "#,
        )
        .await?;
        Ok(())
    }
}
