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
                    .add_column_if_not_exists(ColumnDef::new(Issues::ProjectId).string().null())
                    .to_owned(),
            )
            .await?;

        manager
            .create_foreign_key(
                ForeignKey::create()
                    .name("issues_project_id_fkey")
                    .from(Issues::Table, Issues::ProjectId)
                    .to(Projects::Table, Projects::Id)
                    .on_delete(ForeignKeyAction::SetNull)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("issues_project_id_idx")
                    .table(Issues::Table)
                    .col(Issues::ProjectId)
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
                    .name("issues_project_id_fkey")
                    .table(Issues::Table)
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Issues::Table)
                    .drop_column(Issues::ProjectId)
                    .to_owned(),
            )
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum Issues {
    Table,
    ProjectId,
}

#[derive(Copy, Clone, Iden)]
enum Projects {
    Table,
    Id,
}
