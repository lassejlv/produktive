use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        add_oauth_actor_column(
            manager,
            Issues::Table,
            Issues::CreatedByOauthClientId,
            "issues_created_by_oauth_client_id_fkey",
        )
        .await?;
        add_oauth_actor_column(
            manager,
            IssueComments::Table,
            IssueComments::AuthorOauthClientId,
            "issue_comments_author_oauth_client_id_fkey",
        )
        .await?;
        add_oauth_actor_column(
            manager,
            IssueEvents::Table,
            IssueEvents::ActorOauthClientId,
            "issue_events_actor_oauth_client_id_fkey",
        )
        .await?;
        add_oauth_actor_column(
            manager,
            Projects::Table,
            Projects::CreatedByOauthClientId,
            "projects_created_by_oauth_client_id_fkey",
        )
        .await?;
        add_oauth_actor_column(
            manager,
            Labels::Table,
            Labels::CreatedByOauthClientId,
            "labels_created_by_oauth_client_id_fkey",
        )
        .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        drop_oauth_actor_column(
            manager,
            Labels::Table,
            Labels::CreatedByOauthClientId,
            "labels_created_by_oauth_client_id_fkey",
        )
        .await?;
        drop_oauth_actor_column(
            manager,
            Projects::Table,
            Projects::CreatedByOauthClientId,
            "projects_created_by_oauth_client_id_fkey",
        )
        .await?;
        drop_oauth_actor_column(
            manager,
            IssueEvents::Table,
            IssueEvents::ActorOauthClientId,
            "issue_events_actor_oauth_client_id_fkey",
        )
        .await?;
        drop_oauth_actor_column(
            manager,
            IssueComments::Table,
            IssueComments::AuthorOauthClientId,
            "issue_comments_author_oauth_client_id_fkey",
        )
        .await?;
        drop_oauth_actor_column(
            manager,
            Issues::Table,
            Issues::CreatedByOauthClientId,
            "issues_created_by_oauth_client_id_fkey",
        )
        .await
    }
}

async fn add_oauth_actor_column<T, C>(
    manager: &SchemaManager<'_>,
    table: T,
    column: C,
    foreign_key_name: &str,
) -> Result<(), DbErr>
where
    T: IntoIden + Copy + 'static,
    C: IntoIden + Copy + 'static,
{
    manager
        .alter_table(
            Table::alter()
                .table(table)
                .add_column_if_not_exists(ColumnDef::new(column).string().null())
                .to_owned(),
        )
        .await?;

    manager
        .create_foreign_key(
            ForeignKey::create()
                .name(foreign_key_name)
                .from(table, column)
                .to(ProduktiveOauthClients::Table, ProduktiveOauthClients::Id)
                .on_delete(ForeignKeyAction::SetNull)
                .to_owned(),
        )
        .await
}

async fn drop_oauth_actor_column<T, C>(
    manager: &SchemaManager<'_>,
    table: T,
    column: C,
    foreign_key_name: &str,
) -> Result<(), DbErr>
where
    T: IntoIden + Copy + 'static,
    C: IntoIden + Copy + 'static,
{
    manager
        .drop_foreign_key(
            ForeignKey::drop()
                .name(foreign_key_name)
                .table(table)
                .to_owned(),
        )
        .await?;

    manager
        .alter_table(Table::alter().table(table).drop_column(column).to_owned())
        .await
}

#[derive(Copy, Clone, Iden)]
enum Issues {
    Table,
    CreatedByOauthClientId,
}

#[derive(Copy, Clone, Iden)]
enum IssueComments {
    Table,
    AuthorOauthClientId,
}

#[derive(Copy, Clone, Iden)]
enum IssueEvents {
    Table,
    ActorOauthClientId,
}

#[derive(Copy, Clone, Iden)]
enum Projects {
    Table,
    CreatedByOauthClientId,
}

#[derive(Copy, Clone, Iden)]
enum Labels {
    Table,
    CreatedByOauthClientId,
}

#[derive(Copy, Clone, Iden)]
enum ProduktiveOauthClients {
    Table,
    Id,
}
