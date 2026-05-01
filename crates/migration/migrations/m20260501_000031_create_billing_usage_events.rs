use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(BillingUsageEvents::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(BillingUsageEvents::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(BillingUsageEvents::OrganizationId)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BillingUsageEvents::ChatId)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BillingUsageEvents::UserMessageId)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BillingUsageEvents::ExternalId)
                            .string()
                            .not_null()
                            .unique_key(),
                    )
                    .col(
                        ColumnDef::new(BillingUsageEvents::Model)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BillingUsageEvents::Credits)
                            .big_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BillingUsageEvents::PromptTokens)
                            .big_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BillingUsageEvents::CompletionTokens)
                            .big_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BillingUsageEvents::TotalTokens)
                            .big_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BillingUsageEvents::UsageSource)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BillingUsageEvents::ToolCallCount)
                            .big_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BillingUsageEvents::ToolResultBytes)
                            .big_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BillingUsageEvents::RoundCount)
                            .big_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BillingUsageEvents::Metadata)
                            .json_binary()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BillingUsageEvents::Status)
                            .string()
                            .not_null()
                            .default("pending"),
                    )
                    .col(
                        ColumnDef::new(BillingUsageEvents::Attempts)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(ColumnDef::new(BillingUsageEvents::LastError).text().null())
                    .col(
                        ColumnDef::new(BillingUsageEvents::NextRetryAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(BillingUsageEvents::SentAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(BillingUsageEvents::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(BillingUsageEvents::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("billing_usage_events_organization_id_fkey")
                            .from(
                                BillingUsageEvents::Table,
                                BillingUsageEvents::OrganizationId,
                            )
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("billing_usage_events_chat_id_fkey")
                            .from(BillingUsageEvents::Table, BillingUsageEvents::ChatId)
                            .to(Chats::Table, Chats::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("billing_usage_events_status_retry_idx")
                    .table(BillingUsageEvents::Table)
                    .col(BillingUsageEvents::Status)
                    .col(BillingUsageEvents::NextRetryAt)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("billing_usage_events_org_created_idx")
                    .table(BillingUsageEvents::Table)
                    .col(BillingUsageEvents::OrganizationId)
                    .col((BillingUsageEvents::CreatedAt, IndexOrder::Desc))
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(BillingUsageEvents::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        Ok(())
    }
}

#[derive(Copy, Clone, Iden)]
enum BillingUsageEvents {
    Table,
    Id,
    OrganizationId,
    ChatId,
    UserMessageId,
    ExternalId,
    Model,
    Credits,
    PromptTokens,
    CompletionTokens,
    TotalTokens,
    UsageSource,
    ToolCallCount,
    ToolResultBytes,
    RoundCount,
    Metadata,
    Status,
    Attempts,
    LastError,
    NextRetryAt,
    SentAt,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum Organizations {
    Table,
    Id,
}

#[derive(Copy, Clone, Iden)]
enum Chats {
    Table,
    Id,
}
