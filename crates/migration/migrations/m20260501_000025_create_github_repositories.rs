use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(GithubRepositories::Table)
                    .if_not_exists()
                    .col(text_pk(GithubRepositories::Id))
                    .col(text(GithubRepositories::OrganizationId))
                    .col(text(GithubRepositories::Owner))
                    .col(text(GithubRepositories::Repo))
                    .col(boolean_default(
                        GithubRepositories::AutoImportEnabled,
                        false,
                    ))
                    .col(integer_default(
                        GithubRepositories::ImportIntervalMinutes,
                        360,
                    ))
                    .col(timestamp_null(GithubRepositories::LastImportedAt))
                    .col(timestamp_null(GithubRepositories::NextImportAt))
                    .col(text_null(GithubRepositories::LastImportStatus))
                    .col(text_null(GithubRepositories::LastImportError))
                    .col(integer_default(GithubRepositories::LastImportedCount, 0))
                    .col(integer_default(GithubRepositories::LastUpdatedCount, 0))
                    .col(integer_default(GithubRepositories::LastSkippedCount, 0))
                    .col(timestamp(GithubRepositories::CreatedAt))
                    .col(timestamp(GithubRepositories::UpdatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("github_repositories_organization_id_fkey")
                            .from(
                                GithubRepositories::Table,
                                GithubRepositories::OrganizationId,
                            )
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("github_repositories_source_key")
                    .table(GithubRepositories::Table)
                    .col(GithubRepositories::OrganizationId)
                    .col(GithubRepositories::Owner)
                    .col(GithubRepositories::Repo)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("github_repositories_auto_import_idx")
                    .table(GithubRepositories::Table)
                    .col(GithubRepositories::AutoImportEnabled)
                    .col(GithubRepositories::NextImportAt)
                    .if_not_exists()
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(GithubRepositories::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await
    }
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

fn text_null<T: Iden + 'static>(name: T) -> ColumnDef {
    ColumnDef::new(name).string().null().to_owned()
}

fn timestamp<T: Iden + 'static>(name: T) -> ColumnDef {
    ColumnDef::new(name)
        .timestamp_with_time_zone()
        .not_null()
        .to_owned()
}

fn timestamp_null<T: Iden + 'static>(name: T) -> ColumnDef {
    ColumnDef::new(name)
        .timestamp_with_time_zone()
        .null()
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

#[derive(Copy, Clone, Iden)]
enum GithubRepositories {
    Table,
    Id,
    OrganizationId,
    Owner,
    Repo,
    AutoImportEnabled,
    ImportIntervalMinutes,
    LastImportedAt,
    NextImportAt,
    LastImportStatus,
    LastImportError,
    LastImportedCount,
    LastUpdatedCount,
    LastSkippedCount,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum Organizations {
    Table,
    Id,
}
