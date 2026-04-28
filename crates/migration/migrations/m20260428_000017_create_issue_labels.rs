use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(IssueLabels::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(IssueLabels::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(IssueLabels::IssueId).string().not_null())
                    .col(ColumnDef::new(IssueLabels::LabelId).string().not_null())
                    .col(
                        ColumnDef::new(IssueLabels::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("issue_labels_issue_id_fkey")
                            .from(IssueLabels::Table, IssueLabels::IssueId)
                            .to(Issues::Table, Issues::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("issue_labels_label_id_fkey")
                            .from(IssueLabels::Table, IssueLabels::LabelId)
                            .to(Labels::Table, Labels::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("issue_labels_issue_label_key")
                    .table(IssueLabels::Table)
                    .col(IssueLabels::IssueId)
                    .col(IssueLabels::LabelId)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("issue_labels_label_idx")
                    .table(IssueLabels::Table)
                    .col(IssueLabels::LabelId)
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
                    .table(IssueLabels::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum IssueLabels {
    Table,
    Id,
    IssueId,
    LabelId,
    CreatedAt,
}

#[derive(Copy, Clone, Iden)]
enum Issues {
    Table,
    Id,
}

#[derive(Copy, Clone, Iden)]
enum Labels {
    Table,
    Id,
}
