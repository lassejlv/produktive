use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(ProduktiveOauthClients::Table)
                    .if_not_exists()
                    .col(text_pk(ProduktiveOauthClients::Id))
                    .col(text(ProduktiveOauthClients::ClientId))
                    .col(text_null(ProduktiveOauthClients::ClientSecretHash))
                    .col(text(ProduktiveOauthClients::ClientName))
                    .col(json(ProduktiveOauthClients::RedirectUris))
                    .col(json(ProduktiveOauthClients::GrantTypes))
                    .col(json(ProduktiveOauthClients::ResponseTypes))
                    .col(text(ProduktiveOauthClients::TokenEndpointAuthMethod))
                    .col(timestamp(ProduktiveOauthClients::CreatedAt))
                    .col(timestamp(ProduktiveOauthClients::UpdatedAt))
                    .to_owned(),
            )
            .await?;
        unique_index(
            manager,
            "produktive_oauth_clients_client_id_key",
            ProduktiveOauthClients::Table,
            ProduktiveOauthClients::ClientId,
        )
        .await?;

        manager
            .create_table(
                Table::create()
                    .table(ProduktiveOauthGrants::Table)
                    .if_not_exists()
                    .col(text_pk(ProduktiveOauthGrants::Id))
                    .col(text(ProduktiveOauthGrants::UserId))
                    .col(text(ProduktiveOauthGrants::ClientId))
                    .col(text_null(ProduktiveOauthGrants::SelectedOrganizationId))
                    .col(text(ProduktiveOauthGrants::Scope))
                    .col(text(ProduktiveOauthGrants::Resource))
                    .col(timestamp_null(ProduktiveOauthGrants::RevokedAt))
                    .col(timestamp(ProduktiveOauthGrants::CreatedAt))
                    .col(timestamp(ProduktiveOauthGrants::UpdatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("produktive_oauth_grants_user_id_fkey")
                            .from(ProduktiveOauthGrants::Table, ProduktiveOauthGrants::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("produktive_oauth_grants_client_id_fkey")
                            .from(
                                ProduktiveOauthGrants::Table,
                                ProduktiveOauthGrants::ClientId,
                            )
                            .to(ProduktiveOauthClients::Table, ProduktiveOauthClients::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("produktive_oauth_grants_selected_org_id_fkey")
                            .from(
                                ProduktiveOauthGrants::Table,
                                ProduktiveOauthGrants::SelectedOrganizationId,
                            )
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;
        index(
            manager,
            "produktive_oauth_grants_user_id_idx",
            ProduktiveOauthGrants::Table,
            ProduktiveOauthGrants::UserId,
        )
        .await?;
        index(
            manager,
            "produktive_oauth_grants_client_id_idx",
            ProduktiveOauthGrants::Table,
            ProduktiveOauthGrants::ClientId,
        )
        .await?;

        manager
            .create_table(
                Table::create()
                    .table(ProduktiveOauthCodes::Table)
                    .if_not_exists()
                    .col(text_pk(ProduktiveOauthCodes::Id))
                    .col(text(ProduktiveOauthCodes::CodeHash))
                    .col(text(ProduktiveOauthCodes::ClientId))
                    .col(text(ProduktiveOauthCodes::UserId))
                    .col(text(ProduktiveOauthCodes::GrantId))
                    .col(text(ProduktiveOauthCodes::RedirectUri))
                    .col(text(ProduktiveOauthCodes::CodeChallenge))
                    .col(text(ProduktiveOauthCodes::Resource))
                    .col(text(ProduktiveOauthCodes::Scope))
                    .col(timestamp(ProduktiveOauthCodes::ExpiresAt))
                    .col(timestamp_null(ProduktiveOauthCodes::UsedAt))
                    .col(timestamp(ProduktiveOauthCodes::CreatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("produktive_oauth_codes_client_id_fkey")
                            .from(ProduktiveOauthCodes::Table, ProduktiveOauthCodes::ClientId)
                            .to(ProduktiveOauthClients::Table, ProduktiveOauthClients::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("produktive_oauth_codes_user_id_fkey")
                            .from(ProduktiveOauthCodes::Table, ProduktiveOauthCodes::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("produktive_oauth_codes_grant_id_fkey")
                            .from(ProduktiveOauthCodes::Table, ProduktiveOauthCodes::GrantId)
                            .to(ProduktiveOauthGrants::Table, ProduktiveOauthGrants::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;
        unique_index(
            manager,
            "produktive_oauth_codes_code_hash_key",
            ProduktiveOauthCodes::Table,
            ProduktiveOauthCodes::CodeHash,
        )
        .await?;

        manager
            .create_table(
                Table::create()
                    .table(ProduktiveOauthTokens::Table)
                    .if_not_exists()
                    .col(text_pk(ProduktiveOauthTokens::Id))
                    .col(text(ProduktiveOauthTokens::AccessTokenHash))
                    .col(text(ProduktiveOauthTokens::RefreshTokenHash))
                    .col(text(ProduktiveOauthTokens::ClientId))
                    .col(text(ProduktiveOauthTokens::UserId))
                    .col(text(ProduktiveOauthTokens::GrantId))
                    .col(text(ProduktiveOauthTokens::Scope))
                    .col(text(ProduktiveOauthTokens::Resource))
                    .col(timestamp(ProduktiveOauthTokens::ExpiresAt))
                    .col(timestamp(ProduktiveOauthTokens::RefreshExpiresAt))
                    .col(timestamp_null(ProduktiveOauthTokens::RevokedAt))
                    .col(timestamp_null(ProduktiveOauthTokens::LastUsedAt))
                    .col(timestamp(ProduktiveOauthTokens::CreatedAt))
                    .col(timestamp(ProduktiveOauthTokens::UpdatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("produktive_oauth_tokens_client_id_fkey")
                            .from(
                                ProduktiveOauthTokens::Table,
                                ProduktiveOauthTokens::ClientId,
                            )
                            .to(ProduktiveOauthClients::Table, ProduktiveOauthClients::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("produktive_oauth_tokens_user_id_fkey")
                            .from(ProduktiveOauthTokens::Table, ProduktiveOauthTokens::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("produktive_oauth_tokens_grant_id_fkey")
                            .from(ProduktiveOauthTokens::Table, ProduktiveOauthTokens::GrantId)
                            .to(ProduktiveOauthGrants::Table, ProduktiveOauthGrants::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;
        unique_index(
            manager,
            "produktive_oauth_tokens_access_hash_key",
            ProduktiveOauthTokens::Table,
            ProduktiveOauthTokens::AccessTokenHash,
        )
        .await?;
        unique_index(
            manager,
            "produktive_oauth_tokens_refresh_hash_key",
            ProduktiveOauthTokens::Table,
            ProduktiveOauthTokens::RefreshTokenHash,
        )
        .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(ProduktiveOauthTokens::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(ProduktiveOauthCodes::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(ProduktiveOauthGrants::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(ProduktiveOauthClients::Table)
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

fn json<T: Iden + 'static>(name: T) -> ColumnDef {
    ColumnDef::new(name).json_binary().not_null().to_owned()
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

async fn index<T, C>(
    manager: &SchemaManager<'_>,
    name: &str,
    table: T,
    column: C,
) -> Result<(), DbErr>
where
    T: Iden + Copy + 'static,
    C: Iden + Copy + 'static,
{
    manager
        .create_index(
            Index::create()
                .name(name)
                .table(table)
                .col(column)
                .if_not_exists()
                .to_owned(),
        )
        .await
}

async fn unique_index<T, C>(
    manager: &SchemaManager<'_>,
    name: &str,
    table: T,
    column: C,
) -> Result<(), DbErr>
where
    T: Iden + Copy + 'static,
    C: Iden + Copy + 'static,
{
    manager
        .create_index(
            Index::create()
                .name(name)
                .table(table)
                .col(column)
                .unique()
                .if_not_exists()
                .to_owned(),
        )
        .await
}

#[derive(Copy, Clone, Iden)]
enum ProduktiveOauthClients {
    Table,
    Id,
    ClientId,
    ClientSecretHash,
    ClientName,
    RedirectUris,
    GrantTypes,
    ResponseTypes,
    TokenEndpointAuthMethod,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum ProduktiveOauthGrants {
    Table,
    Id,
    UserId,
    ClientId,
    SelectedOrganizationId,
    Scope,
    Resource,
    RevokedAt,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum ProduktiveOauthCodes {
    Table,
    Id,
    CodeHash,
    ClientId,
    UserId,
    GrantId,
    RedirectUri,
    CodeChallenge,
    Resource,
    Scope,
    ExpiresAt,
    UsedAt,
    CreatedAt,
}

#[derive(Copy, Clone, Iden)]
enum ProduktiveOauthTokens {
    Table,
    Id,
    AccessTokenHash,
    RefreshTokenHash,
    ClientId,
    UserId,
    GrantId,
    Scope,
    Resource,
    ExpiresAt,
    RefreshExpiresAt,
    RevokedAt,
    LastUsedAt,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum Users {
    Table,
    Id,
}

#[derive(Copy, Clone, Iden)]
enum Organizations {
    Table,
    Id,
}
