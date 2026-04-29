use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Issues::Table)
                    .add_column_if_not_exists(ColumnDef::new(Issues::ParentId).string().null())
                    .to_owned(),
            )
            .await?;

        manager
            .create_foreign_key(
                ForeignKey::create()
                    .name("issues_parent_id_fkey")
                    .from(Issues::Table, Issues::ParentId)
                    .to(Issues::Table, Issues::Id)
                    .on_delete(ForeignKeyAction::Cascade)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("issues_parent_id_idx")
                    .table(Issues::Table)
                    .col(Issues::ParentId)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_foreign_key(
                ForeignKey::drop()
                    .name("issues_parent_id_fkey")
                    .table(Issues::Table)
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Issues::Table)
                    .drop_column(Issues::ParentId)
                    .to_owned(),
            )
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum Issues {
    Table,
    Id,
    ParentId,
}
