use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(GithubConnections::Table)
                    .if_not_exists()
                    .col(text_pk(GithubConnections::Id))
                    .col(text(GithubConnections::OrganizationId))
                    .col(text_null(GithubConnections::ConnectedById))
                    .col(big_integer(GithubConnections::GithubUserId))
                    .col(text(GithubConnections::GithubLogin))
                    .col(text(GithubConnections::AccessTokenCiphertext))
                    .col(text_null(GithubConnections::Scope))
                    .col(timestamp(GithubConnections::CreatedAt))
                    .col(timestamp(GithubConnections::UpdatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("github_connections_organization_id_fkey")
                            .from(GithubConnections::Table, GithubConnections::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("github_connections_connected_by_id_fkey")
                            .from(GithubConnections::Table, GithubConnections::ConnectedById)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("github_connections_organization_key")
                    .table(GithubConnections::Table)
                    .col(GithubConnections::OrganizationId)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(GithubOauthStates::Table)
                    .if_not_exists()
                    .col(text_pk(GithubOauthStates::Id))
                    .col(text(GithubOauthStates::OrganizationId))
                    .col(text(GithubOauthStates::CreatedById))
                    .col(text(GithubOauthStates::State))
                    .col(text(GithubOauthStates::CodeVerifier))
                    .col(timestamp(GithubOauthStates::ExpiresAt))
                    .col(timestamp(GithubOauthStates::CreatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("github_oauth_states_organization_id_fkey")
                            .from(GithubOauthStates::Table, GithubOauthStates::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("github_oauth_states_created_by_id_fkey")
                            .from(GithubOauthStates::Table, GithubOauthStates::CreatedById)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("github_oauth_states_state_key")
                    .table(GithubOauthStates::Table)
                    .col(GithubOauthStates::State)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

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
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(GithubImportedIssues::Table)
                    .if_not_exists()
                    .col(text_pk(GithubImportedIssues::Id))
                    .col(text(GithubImportedIssues::OrganizationId))
                    .col(text(GithubImportedIssues::IssueId))
                    .col(text(GithubImportedIssues::Owner))
                    .col(text(GithubImportedIssues::Repo))
                    .col(big_integer(GithubImportedIssues::GithubIssueId))
                    .col(integer(GithubImportedIssues::GithubIssueNumber))
                    .col(text(GithubImportedIssues::GithubHtmlUrl))
                    .col(timestamp(GithubImportedIssues::ImportedAt))
                    .col(timestamp(GithubImportedIssues::UpdatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("github_imported_issues_organization_id_fkey")
                            .from(
                                GithubImportedIssues::Table,
                                GithubImportedIssues::OrganizationId,
                            )
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("github_imported_issues_issue_id_fkey")
                            .from(GithubImportedIssues::Table, GithubImportedIssues::IssueId)
                            .to(Issues::Table, Issues::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("github_imported_issues_source_key")
                    .table(GithubImportedIssues::Table)
                    .col(GithubImportedIssues::OrganizationId)
                    .col(GithubImportedIssues::Owner)
                    .col(GithubImportedIssues::Repo)
                    .col(GithubImportedIssues::GithubIssueNumber)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("github_imported_issues_issue_key")
                    .table(GithubImportedIssues::Table)
                    .col(GithubImportedIssues::IssueId)
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
                    .table(GithubImportedIssues::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(GithubRepositories::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(GithubOauthStates::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(GithubConnections::Table)
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

fn big_integer<T: Iden + 'static>(name: T) -> ColumnDef {
    ColumnDef::new(name).big_integer().not_null().to_owned()
}

fn integer<T: Iden + 'static>(name: T) -> ColumnDef {
    ColumnDef::new(name).integer().not_null().to_owned()
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
enum GithubConnections {
    Table,
    Id,
    OrganizationId,
    ConnectedById,
    GithubUserId,
    GithubLogin,
    AccessTokenCiphertext,
    Scope,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum GithubOauthStates {
    Table,
    Id,
    OrganizationId,
    CreatedById,
    State,
    CodeVerifier,
    ExpiresAt,
    CreatedAt,
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
enum GithubImportedIssues {
    Table,
    Id,
    OrganizationId,
    IssueId,
    Owner,
    Repo,
    GithubIssueId,
    GithubIssueNumber,
    GithubHtmlUrl,
    ImportedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum Organizations {
    Table,
    Id,
}

#[derive(Copy, Clone, Iden)]
enum Users {
    Table,
    Id,
}

#[derive(Copy, Clone, Iden)]
enum Issues {
    Table,
    Id,
}
