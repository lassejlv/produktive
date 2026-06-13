use sea_orm_migration::{prelude::*, schema::*};

use crate::m20260517_000003_create_workspaces::Workspaces;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Monitors::Table)
                    .if_not_exists()
                    .col(uuid(Monitors::Id).primary_key())
                    .col(uuid(Monitors::WorkspaceId))
                    .col(string(Monitors::Name))
                    .col(small_integer(Monitors::Kind))
                    .col(string(Monitors::Target))
                    .col(integer(Monitors::IntervalSeconds).default(60))
                    .col(integer(Monitors::TimeoutMs).default(5000))
                    .col(integer_null(Monitors::ExpectedStatus))
                    .col(string_null(Monitors::ExpectedBodyContains))
                    .col(boolean(Monitors::Enabled).default(true))
                    .col(small_integer_null(Monitors::LastStatus))
                    .col(integer_null(Monitors::LastLatencyMs))
                    .col(timestamp_with_time_zone_null(Monitors::LastCheckedAt))
                    .col(
                        timestamp_with_time_zone(Monitors::CreatedAt)
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        timestamp_with_time_zone(Monitors::UpdatedAt)
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_monitors_workspace")
                            .from(Monitors::Table, Monitors::WorkspaceId)
                            .to(Workspaces::Table, Workspaces::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_monitors_workspace")
                    .table(Monitors::Table)
                    .col(Monitors::WorkspaceId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_monitors_due")
                    .table(Monitors::Table)
                    .col(Monitors::Enabled)
                    .col(Monitors::LastCheckedAt)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Monitors::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
pub enum Monitors {
    Table,
    Id,
    WorkspaceId,
    Name,
    Kind,
    Target,
    IntervalSeconds,
    TimeoutMs,
    ExpectedStatus,
    ExpectedBodyContains,
    Enabled,
    LastStatus,
    LastLatencyMs,
    LastCheckedAt,
    CreatedAt,
    UpdatedAt,
}
