use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(IssueEvents::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(IssueEvents::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(IssueEvents::OrganizationId)
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(IssueEvents::IssueId).string().not_null())
                    .col(ColumnDef::new(IssueEvents::ActorId).string().null())
                    .col(ColumnDef::new(IssueEvents::Action).string().not_null())
                    .col(
                        ColumnDef::new(IssueEvents::Changes)
                            .json_binary()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(IssueEvents::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("issue_events_organization_id_fkey")
                            .from(IssueEvents::Table, IssueEvents::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("issue_events_issue_id_fkey")
                            .from(IssueEvents::Table, IssueEvents::IssueId)
                            .to(Issues::Table, Issues::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("issue_events_actor_id_fkey")
                            .from(IssueEvents::Table, IssueEvents::ActorId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("issue_events_issue_created_idx")
                    .table(IssueEvents::Table)
                    .col(IssueEvents::IssueId)
                    .col((IssueEvents::CreatedAt, IndexOrder::Desc))
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("issue_events_org_created_idx")
                    .table(IssueEvents::Table)
                    .col(IssueEvents::OrganizationId)
                    .col((IssueEvents::CreatedAt, IndexOrder::Desc))
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
                    .table(IssueEvents::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum IssueEvents {
    Table,
    Id,
    OrganizationId,
    IssueId,
    ActorId,
    Action,
    Changes,
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
