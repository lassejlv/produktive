use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(IssueStatuses::Table)
                    .if_not_exists()
                    .col(text_pk(IssueStatuses::Id))
                    .col(text(IssueStatuses::OrganizationId))
                    .col(text(IssueStatuses::Key))
                    .col(text(IssueStatuses::Name))
                    .col(string_default(IssueStatuses::Color, "gray"))
                    .col(string_default(IssueStatuses::Category, "active"))
                    .col(integer_default(IssueStatuses::SortOrder, 0))
                    .col(boolean_default(IssueStatuses::IsSystem, false))
                    .col(timestamp_null(IssueStatuses::ArchivedAt))
                    .col(timestamp(IssueStatuses::CreatedAt))
                    .col(timestamp(IssueStatuses::UpdatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("issue_statuses_organization_id_fkey")
                            .from(IssueStatuses::Table, IssueStatuses::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("issue_statuses_org_key")
                    .table(IssueStatuses::Table)
                    .col(IssueStatuses::OrganizationId)
                    .col(IssueStatuses::Key)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("issue_statuses_organization_id_idx")
                    .table(IssueStatuses::Table)
                    .col(IssueStatuses::OrganizationId)
                    .if_not_exists()
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(IssueStatuses::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum IssueStatuses {
    Table,
    Id,
    OrganizationId,
    Key,
    Name,
    Color,
    Category,
    SortOrder,
    IsSystem,
    ArchivedAt,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum Organizations {
    Table,
    Id,
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

fn string_default<T: Iden + 'static>(name: T, default: &str) -> ColumnDef {
    ColumnDef::new(name)
        .string()
        .not_null()
        .default(default)
        .to_owned()
}

fn integer_default<T: Iden + 'static>(name: T, default: i32) -> ColumnDef {
    ColumnDef::new(name)
        .integer()
        .not_null()
        .default(default)
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

fn timestamp_null<T: Iden + 'static>(name: T) -> ColumnDef {
    ColumnDef::new(name)
        .timestamp_with_time_zone()
        .null()
        .to_owned()
}
