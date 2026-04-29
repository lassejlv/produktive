use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(OrganizationSubscriptions::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(OrganizationSubscriptions::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(OrganizationSubscriptions::OrganizationId)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(OrganizationSubscriptions::ProductId)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(OrganizationSubscriptions::Status)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(OrganizationSubscriptions::CurrentPeriodEnd)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(OrganizationSubscriptions::CancelAtPeriodEnd)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(OrganizationSubscriptions::CanceledAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(OrganizationSubscriptions::EndsAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(OrganizationSubscriptions::CustomerId)
                            .string()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(OrganizationSubscriptions::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(OrganizationSubscriptions::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("organization_subscriptions_organization_id_fkey")
                            .from(
                                OrganizationSubscriptions::Table,
                                OrganizationSubscriptions::OrganizationId,
                            )
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("organization_subscriptions_organization_idx")
                    .table(OrganizationSubscriptions::Table)
                    .col(OrganizationSubscriptions::OrganizationId)
                    .if_not_exists()
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(OrganizationSubscriptions::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum OrganizationSubscriptions {
    Table,
    Id,
    OrganizationId,
    ProductId,
    Status,
    CurrentPeriodEnd,
    CancelAtPeriodEnd,
    CanceledAt,
    EndsAt,
    CustomerId,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum Organizations {
    Table,
    Id,
}
