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
                        ColumnDef::new(NotificationPreferences::SidebarLayout).json_binary(),
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
                    .drop_column(NotificationPreferences::SidebarLayout)
                    .to_owned(),
            )
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum NotificationPreferences {
    Table,
    SidebarLayout,
}
