use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(DiscordUserLinks::Table)
                    .if_not_exists()
                    .col(text_pk(DiscordUserLinks::Id))
                    .col(text(DiscordUserLinks::DiscordUserId))
                    .col(text(DiscordUserLinks::UserId))
                    .col(timestamp(DiscordUserLinks::CreatedAt))
                    .col(timestamp(DiscordUserLinks::UpdatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("discord_user_links_user_id_fkey")
                            .from(DiscordUserLinks::Table, DiscordUserLinks::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("discord_user_links_discord_user_key")
                    .table(DiscordUserLinks::Table)
                    .col(DiscordUserLinks::DiscordUserId)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(DiscordServerLinks::Table)
                    .if_not_exists()
                    .col(text_pk(DiscordServerLinks::Id))
                    .col(text(DiscordServerLinks::GuildId))
                    .col(text(DiscordServerLinks::OrganizationId))
                    .col(text(DiscordServerLinks::LinkedById))
                    .col(boolean_default(DiscordServerLinks::AgentEnabled, false))
                    .col(timestamp(DiscordServerLinks::CreatedAt))
                    .col(timestamp(DiscordServerLinks::UpdatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("discord_server_links_organization_id_fkey")
                            .from(
                                DiscordServerLinks::Table,
                                DiscordServerLinks::OrganizationId,
                            )
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("discord_server_links_linked_by_id_fkey")
                            .from(DiscordServerLinks::Table, DiscordServerLinks::LinkedById)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("discord_server_links_guild_key")
                    .table(DiscordServerLinks::Table)
                    .col(DiscordServerLinks::GuildId)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(DiscordLinkStates::Table)
                    .if_not_exists()
                    .col(text_pk(DiscordLinkStates::Id))
                    .col(text(DiscordLinkStates::State))
                    .col(text(DiscordLinkStates::GuildId))
                    .col(text(DiscordLinkStates::DiscordUserId))
                    .col(timestamp_null(DiscordLinkStates::ConsumedAt))
                    .col(timestamp(DiscordLinkStates::ExpiresAt))
                    .col(timestamp(DiscordLinkStates::CreatedAt))
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("discord_link_states_state_key")
                    .table(DiscordLinkStates::Table)
                    .col(DiscordLinkStates::State)
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
                    .table(DiscordLinkStates::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(DiscordServerLinks::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(DiscordUserLinks::Table)
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
enum DiscordUserLinks {
    Table,
    Id,
    DiscordUserId,
    UserId,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum DiscordServerLinks {
    Table,
    Id,
    GuildId,
    OrganizationId,
    LinkedById,
    AgentEnabled,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum DiscordLinkStates {
    Table,
    Id,
    State,
    GuildId,
    DiscordUserId,
    ConsumedAt,
    ExpiresAt,
    CreatedAt,
}

#[derive(DeriveIden)]
enum Users {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum Organizations {
    Table,
    Id,
}
