use sea_orm_migration::{prelude::*, schema::*};

use crate::m20260517_000004_create_monitors::Monitors;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Monitors::Table)
                    .add_column(text_null(MonitorDsl::DslSource))
                    .add_column(json_binary_null(MonitorDsl::DslAst))
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Monitors::Table)
                    .drop_column(MonitorDsl::DslSource)
                    .drop_column(MonitorDsl::DslAst)
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum MonitorDsl {
    DslSource,
    DslAst,
}
