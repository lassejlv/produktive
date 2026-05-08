use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Organizations::Table)
                    .add_column(
                        ColumnDef::new(Organizations::AiPlan)
                            .string()
                            .not_null()
                            .default("free"),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(AiUsageEvents::Table)
                    .if_not_exists()
                    .col(text_pk(AiUsageEvents::Id))
                    .col(text(AiUsageEvents::OrganizationId))
                    .col(text_null(AiUsageEvents::UserId))
                    .col(text(AiUsageEvents::Source))
                    .col(text(AiUsageEvents::ModelId))
                    .col(text_null(AiUsageEvents::RequestedModelId))
                    .col(bigint(AiUsageEvents::PromptTokens))
                    .col(bigint(AiUsageEvents::CompletionTokens))
                    .col(bigint(AiUsageEvents::TotalTokens))
                    .col(bigint(AiUsageEvents::NormalizedUnits))
                    .col(bigint(AiUsageEvents::EstimatedMicroUsd))
                    .col(boolean_default(AiUsageEvents::UsageMissing, false))
                    .col(timestamp(AiUsageEvents::WeekStart))
                    .col(timestamp(AiUsageEvents::MonthStart))
                    .col(timestamp(AiUsageEvents::CreatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("ai_usage_events_organization_id_fkey")
                            .from(AiUsageEvents::Table, AiUsageEvents::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("ai_usage_events_user_id_fkey")
                            .from(AiUsageEvents::Table, AiUsageEvents::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        create_index(
            manager,
            "ai_usage_events_organization_week_idx",
            AiUsageEvents::Table,
            [AiUsageEvents::OrganizationId, AiUsageEvents::WeekStart],
        )
        .await?;
        create_index(
            manager,
            "ai_usage_events_organization_month_idx",
            AiUsageEvents::Table,
            [AiUsageEvents::OrganizationId, AiUsageEvents::MonthStart],
        )
        .await?;
        create_index(
            manager,
            "ai_usage_events_organization_created_at_idx",
            AiUsageEvents::Table,
            [AiUsageEvents::OrganizationId, AiUsageEvents::CreatedAt],
        )
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(AiUsageEvents::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Organizations::Table)
                    .drop_column(Organizations::AiPlan)
                    .to_owned(),
            )
            .await
    }
}

fn text_pk<T: Iden + 'static>(name: T) -> ColumnDef {
    ColumnDef::new(name)
        .string()
        .not_null()
        .primary_key()
        .to_owned()
}

fn text<T: Iden + 'static>(name: T) -> ColumnDef {
    ColumnDef::new(name).string().not_null().to_owned()
}

fn text_null<T: Iden + 'static>(name: T) -> ColumnDef {
    ColumnDef::new(name).string().null().to_owned()
}

fn bigint<T: Iden + 'static>(name: T) -> ColumnDef {
    ColumnDef::new(name)
        .big_integer()
        .not_null()
        .default(0)
        .to_owned()
}

fn boolean_default<T: Iden + 'static>(name: T, default: bool) -> ColumnDef {
    ColumnDef::new(name)
        .boolean()
        .not_null()
        .default(default)
        .to_owned()
}

fn timestamp<T: Iden + 'static>(name: T) -> ColumnDef {
    ColumnDef::new(name)
        .timestamp_with_time_zone()
        .not_null()
        .default(Expr::current_timestamp())
        .to_owned()
}

async fn create_index<T, C, I>(
    manager: &SchemaManager<'_>,
    name: &str,
    table: T,
    columns: I,
) -> Result<(), DbErr>
where
    T: Iden + Copy + 'static,
    C: Iden + Copy + 'static,
    I: IntoIterator<Item = C>,
{
    let mut index = Index::create();
    index.name(name).table(table).if_not_exists();
    for column in columns {
        index.col(column);
    }
    manager.create_index(index.to_owned()).await
}

#[derive(Copy, Clone, Iden)]
enum Users {
    Table,
    Id,
}

#[derive(Copy, Clone, Iden)]
enum Organizations {
    Table,
    Id,
    AiPlan,
}

#[derive(Copy, Clone, Iden)]
enum AiUsageEvents {
    Table,
    Id,
    OrganizationId,
    UserId,
    Source,
    ModelId,
    RequestedModelId,
    PromptTokens,
    CompletionTokens,
    TotalTokens,
    NormalizedUnits,
    EstimatedMicroUsd,
    UsageMissing,
    WeekStart,
    MonthStart,
    CreatedAt,
}
