use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(UserTabs::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(UserTabs::Id).text().not_null().primary_key())
                    .col(ColumnDef::new(UserTabs::UserId).text().not_null())
                    .col(ColumnDef::new(UserTabs::OrganizationId).text().not_null())
                    .col(ColumnDef::new(UserTabs::TabType).text().not_null())
                    .col(ColumnDef::new(UserTabs::TargetId).text().not_null())
                    .col(ColumnDef::new(UserTabs::Title).text().not_null())
                    .col(
                        ColumnDef::new(UserTabs::OpenedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(UserTabs::Table, UserTabs::UserId)
                            .to(Alias::new("users"), Alias::new("id"))
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(UserTabs::Table, UserTabs::OrganizationId)
                            .to(Alias::new("organizations"), Alias::new("id"))
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("user_tabs_unique")
                    .table(UserTabs::Table)
                    .col(UserTabs::UserId)
                    .col(UserTabs::OrganizationId)
                    .col(UserTabs::TabType)
                    .col(UserTabs::TargetId)
                    .unique()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("user_tabs_lookup")
                    .table(UserTabs::Table)
                    .col(UserTabs::UserId)
                    .col(UserTabs::OrganizationId)
                    .col(UserTabs::OpenedAt)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(NotificationPreferences::Table)
                    .add_column_if_not_exists(
                        ColumnDef::new(NotificationPreferences::TabsEnabled)
                            .boolean()
                            .not_null()
                            .default(true),
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
                    .drop_column(NotificationPreferences::TabsEnabled)
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(Table::drop().table(UserTabs::Table).to_owned())
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum UserTabs {
    Table,
    Id,
    UserId,
    OrganizationId,
    TabType,
    TargetId,
    Title,
    OpenedAt,
}

#[derive(Copy, Clone, Iden)]
enum NotificationPreferences {
    Table,
    TabsEnabled,
}
