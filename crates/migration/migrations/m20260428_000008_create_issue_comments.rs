use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(IssueComments::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(IssueComments::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(IssueComments::OrganizationId)
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(IssueComments::IssueId).string().not_null())
                    .col(ColumnDef::new(IssueComments::AuthorId).string().null())
                    .col(ColumnDef::new(IssueComments::Body).text().not_null())
                    .col(
                        ColumnDef::new(IssueComments::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(IssueComments::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("issue_comments_organization_id_fkey")
                            .from(IssueComments::Table, IssueComments::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("issue_comments_issue_id_fkey")
                            .from(IssueComments::Table, IssueComments::IssueId)
                            .to(Issues::Table, Issues::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("issue_comments_author_id_fkey")
                            .from(IssueComments::Table, IssueComments::AuthorId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("issue_comments_issue_created_idx")
                    .table(IssueComments::Table)
                    .col(IssueComments::IssueId)
                    .col((IssueComments::CreatedAt, IndexOrder::Asc))
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("issue_comments_org_created_idx")
                    .table(IssueComments::Table)
                    .col(IssueComments::OrganizationId)
                    .col((IssueComments::CreatedAt, IndexOrder::Desc))
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
                    .table(IssueComments::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum IssueComments {
    Table,
    Id,
    OrganizationId,
    IssueId,
    AuthorId,
    Body,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum Organizations {
    Table,
    Id,
}

#[derive(Copy, Clone, Iden)]
enum Issues {
    Table,
    Id,
}

#[derive(Copy, Clone, Iden)]
enum Users {
    Table,
    Id,
}
