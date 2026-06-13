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
                    .add_column(integer(MonitorCanvas::CanvasX).default(0))
                    .add_column(integer(MonitorCanvas::CanvasY).default(0))
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Monitors::Table)
                    .drop_column(MonitorCanvas::CanvasX)
                    .drop_column(MonitorCanvas::CanvasY)
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum MonitorCanvas {
    CanvasX,
    CanvasY,
}
