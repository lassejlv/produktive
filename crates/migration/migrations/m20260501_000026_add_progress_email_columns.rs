use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(NotificationPreferences::Table)
                    .add_column_if_not_exists(
                        ColumnDef::new(NotificationPreferences::EmailProgress)
                            .boolean()
                            .not_null()
                            .default(true),
                    )
                    .add_column_if_not_exists(
                        ColumnDef::new(NotificationPreferences::NextProgressEmailAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .add_column_if_not_exists(
                        ColumnDef::new(NotificationPreferences::LastProgressEmailAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(NotificationPreferences::Table)
                    .drop_column(NotificationPreferences::EmailProgress)
                    .drop_column(NotificationPreferences::NextProgressEmailAt)
                    .drop_column(NotificationPreferences::LastProgressEmailAt)
                    .to_owned(),
            )
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum NotificationPreferences {
    Table,
    EmailProgress,
    NextProgressEmailAt,
    LastProgressEmailAt,
}
