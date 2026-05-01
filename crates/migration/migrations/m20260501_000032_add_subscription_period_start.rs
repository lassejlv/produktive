use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(OrganizationSubscriptions::Table)
                    .add_column(
                        ColumnDef::new(OrganizationSubscriptions::CurrentPeriodStart)
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
                    .table(OrganizationSubscriptions::Table)
                    .drop_column(OrganizationSubscriptions::CurrentPeriodStart)
                    .to_owned(),
            )
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum OrganizationSubscriptions {
    Table,
    CurrentPeriodStart,
}
