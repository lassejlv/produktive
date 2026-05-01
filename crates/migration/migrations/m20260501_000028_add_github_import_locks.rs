use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(GithubRepositories::Table)
                    .add_column_if_not_exists(
                        ColumnDef::new(GithubRepositories::ImportLockToken)
                            .string()
                            .null(),
                    )
                    .add_column_if_not_exists(
                        ColumnDef::new(GithubRepositories::ImportLockedUntil)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("github_repositories_import_lock_idx")
                    .table(GithubRepositories::Table)
                    .col(GithubRepositories::ImportLockedUntil)
                    .if_not_exists()
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_index(
                Index::drop()
                    .name("github_repositories_import_lock_idx")
                    .table(GithubRepositories::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(GithubRepositories::Table)
                    .drop_column(GithubRepositories::ImportLockToken)
                    .drop_column(GithubRepositories::ImportLockedUntil)
                    .to_owned(),
            )
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum GithubRepositories {
    Table,
    ImportLockToken,
    ImportLockedUntil,
}
