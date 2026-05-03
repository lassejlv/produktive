use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(SlackConnections::Table)
                    .if_not_exists()
                    .col(text_pk(SlackConnections::Id))
                    .col(text(SlackConnections::OrganizationId))
                    .col(text_null(SlackConnections::ConnectedById))
                    .col(text(SlackConnections::SlackTeamId))
                    .col(text(SlackConnections::SlackTeamName))
                    .col(text_null(SlackConnections::BotUserId))
                    .col(text_null(SlackConnections::BotId))
                    .col(text(SlackConnections::AccessTokenCiphertext))
                    .col(text_null(SlackConnections::Scope))
                    .col(boolean_default(SlackConnections::AgentEnabled, false))
                    .col(timestamp(SlackConnections::CreatedAt))
                    .col(timestamp(SlackConnections::UpdatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("slack_connections_organization_id_fkey")
                            .from(SlackConnections::Table, SlackConnections::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("slack_connections_connected_by_id_fkey")
                            .from(SlackConnections::Table, SlackConnections::ConnectedById)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("slack_connections_organization_key")
                    .table(SlackConnections::Table)
                    .col(SlackConnections::OrganizationId)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .create_index(
                Index::create()
                    .name("slack_connections_team_key")
                    .table(SlackConnections::Table)
                    .col(SlackConnections::SlackTeamId)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(SlackOauthStates::Table)
                    .if_not_exists()
                    .col(text_pk(SlackOauthStates::Id))
                    .col(text(SlackOauthStates::State))
                    .col(text(SlackOauthStates::OrganizationId))
                    .col(text(SlackOauthStates::CreatedById))
                    .col(timestamp_null(SlackOauthStates::ConsumedAt))
                    .col(timestamp(SlackOauthStates::ExpiresAt))
                    .col(timestamp(SlackOauthStates::CreatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("slack_oauth_states_organization_id_fkey")
                            .from(SlackOauthStates::Table, SlackOauthStates::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("slack_oauth_states_created_by_id_fkey")
                            .from(SlackOauthStates::Table, SlackOauthStates::CreatedById)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("slack_oauth_states_state_key")
                    .table(SlackOauthStates::Table)
                    .col(SlackOauthStates::State)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(SlackUserLinks::Table)
                    .if_not_exists()
                    .col(text_pk(SlackUserLinks::Id))
                    .col(text(SlackUserLinks::SlackTeamId))
                    .col(text(SlackUserLinks::SlackUserId))
                    .col(text(SlackUserLinks::UserId))
                    .col(timestamp(SlackUserLinks::CreatedAt))
                    .col(timestamp(SlackUserLinks::UpdatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("slack_user_links_user_id_fkey")
                            .from(SlackUserLinks::Table, SlackUserLinks::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("slack_user_links_team_user_key")
                    .table(SlackUserLinks::Table)
                    .col(SlackUserLinks::SlackTeamId)
                    .col(SlackUserLinks::SlackUserId)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(SlackLinkStates::Table)
                    .if_not_exists()
                    .col(text_pk(SlackLinkStates::Id))
                    .col(text(SlackLinkStates::State))
                    .col(text(SlackLinkStates::SlackTeamId))
                    .col(text(SlackLinkStates::SlackUserId))
                    .col(timestamp_null(SlackLinkStates::ConsumedAt))
                    .col(timestamp(SlackLinkStates::ExpiresAt))
                    .col(timestamp(SlackLinkStates::CreatedAt))
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("slack_link_states_state_key")
                    .table(SlackLinkStates::Table)
                    .col(SlackLinkStates::State)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(SlackEventClaims::Table)
                    .if_not_exists()
                    .col(text_pk(SlackEventClaims::Id))
                    .col(text(SlackEventClaims::EventId))
                    .col(text(SlackEventClaims::SlackTeamId))
                    .col(text(SlackEventClaims::EventType))
                    .col(text_null(SlackEventClaims::IssueId))
                    .col(timestamp(SlackEventClaims::CreatedAt))
                    .col(timestamp(SlackEventClaims::UpdatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("slack_event_claims_issue_id_fkey")
                            .from(SlackEventClaims::Table, SlackEventClaims::IssueId)
                            .to(Issues::Table, Issues::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("slack_event_claims_event_key")
                    .table(SlackEventClaims::Table)
                    .col(SlackEventClaims::EventId)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(SlackEventClaims::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(SlackLinkStates::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(SlackUserLinks::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(SlackOauthStates::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(SlackConnections::Table)
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

fn boolean_default<T: Iden + 'static>(name: T, default: bool) -> ColumnDef {
    ColumnDef::new(name)
        .boolean()
        .not_null()
        .default(default)
        .to_owned()
}

#[derive(DeriveIden)]
enum SlackConnections {
    Table,
    Id,
    OrganizationId,
    ConnectedById,
    SlackTeamId,
    SlackTeamName,
    BotUserId,
    BotId,
    AccessTokenCiphertext,
    Scope,
    AgentEnabled,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum SlackOauthStates {
    Table,
    Id,
    State,
    OrganizationId,
    CreatedById,
    ConsumedAt,
    ExpiresAt,
    CreatedAt,
}

#[derive(DeriveIden)]
enum SlackUserLinks {
    Table,
    Id,
    SlackTeamId,
    SlackUserId,
    UserId,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum SlackLinkStates {
    Table,
    Id,
    State,
    SlackTeamId,
    SlackUserId,
    ConsumedAt,
    ExpiresAt,
    CreatedAt,
}

#[derive(DeriveIden)]
enum SlackEventClaims {
    Table,
    Id,
    EventId,
    SlackTeamId,
    EventType,
    IssueId,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum Organizations {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum Users {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum Issues {
    Table,
    Id,
}
