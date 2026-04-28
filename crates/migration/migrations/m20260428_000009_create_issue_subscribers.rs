use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(IssueSubscribers::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(IssueSubscribers::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(IssueSubscribers::OrganizationId)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(IssueSubscribers::IssueId)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(IssueSubscribers::UserId)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(IssueSubscribers::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("issue_subscribers_organization_id_fkey")
                            .from(
                                IssueSubscribers::Table,
                                IssueSubscribers::OrganizationId,
                            )
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("issue_subscribers_issue_id_fkey")
                            .from(IssueSubscribers::Table, IssueSubscribers::IssueId)
                            .to(Issues::Table, Issues::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("issue_subscribers_user_id_fkey")
                            .from(IssueSubscribers::Table, IssueSubscribers::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("issue_subscribers_issue_user_key")
                    .table(IssueSubscribers::Table)
                    .col(IssueSubscribers::IssueId)
                    .col(IssueSubscribers::UserId)
                    .unique()
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
                    .table(IssueSubscribers::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum IssueSubscribers {
    Table,
    Id,
    OrganizationId,
    IssueId,
    UserId,
    CreatedAt,
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
