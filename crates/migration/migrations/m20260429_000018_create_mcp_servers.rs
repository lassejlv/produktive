use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(McpServers::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(McpServers::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(McpServers::OrganizationId)
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(McpServers::CreatedById).string().null())
                    .col(ColumnDef::new(McpServers::Name).string().not_null())
                    .col(ColumnDef::new(McpServers::Slug).string().not_null())
                    .col(ColumnDef::new(McpServers::Url).text().not_null())
                    .col(ColumnDef::new(McpServers::Transport).string().null())
                    .col(
                        ColumnDef::new(McpServers::Enabled)
                            .boolean()
                            .not_null()
                            .default(true),
                    )
                    .col(
                        ColumnDef::new(McpServers::AuthType)
                            .string()
                            .not_null()
                            .default("none"),
                    )
                    .col(
                        ColumnDef::new(McpServers::AuthStatus)
                            .string()
                            .not_null()
                            .default("connected"),
                    )
                    .col(ColumnDef::new(McpServers::ToolCache).json_binary().null())
                    .col(
                        ColumnDef::new(McpServers::LastCheckedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(ColumnDef::new(McpServers::LastError).text().null())
                    .col(
                        ColumnDef::new(McpServers::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(McpServers::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("mcp_servers_organization_id_fkey")
                            .from(McpServers::Table, McpServers::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("mcp_servers_created_by_id_fkey")
                            .from(McpServers::Table, McpServers::CreatedById)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("mcp_servers_org_slug_idx")
                    .table(McpServers::Table)
                    .col(McpServers::OrganizationId)
                    .col(McpServers::Slug)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(McpOauthTokens::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(McpOauthTokens::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(McpOauthTokens::ServerId).string().not_null())
                    .col(
                        ColumnDef::new(McpOauthTokens::OrganizationId)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(McpOauthTokens::AccessTokenCiphertext)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(McpOauthTokens::RefreshTokenCiphertext)
                            .text()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(McpOauthTokens::TokenType)
                            .string()
                            .not_null()
                            .default("Bearer"),
                    )
                    .col(ColumnDef::new(McpOauthTokens::Scope).text().null())
                    .col(
                        ColumnDef::new(McpOauthTokens::ExpiresAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(McpOauthTokens::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(McpOauthTokens::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("mcp_oauth_tokens_server_id_fkey")
                            .from(McpOauthTokens::Table, McpOauthTokens::ServerId)
                            .to(McpServers::Table, McpServers::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("mcp_oauth_tokens_organization_id_fkey")
                            .from(McpOauthTokens::Table, McpOauthTokens::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("mcp_oauth_tokens_server_idx")
                    .table(McpOauthTokens::Table)
                    .col(McpOauthTokens::ServerId)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(McpOauthStates::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(McpOauthStates::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(McpOauthStates::ServerId).string().not_null())
                    .col(
                        ColumnDef::new(McpOauthStates::OrganizationId)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(McpOauthStates::CreatedById)
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(McpOauthStates::State).string().not_null())
                    .col(
                        ColumnDef::new(McpOauthStates::CodeVerifier)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(McpOauthStates::AuthUrl).text().not_null())
                    .col(
                        ColumnDef::new(McpOauthStates::ExpiresAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(McpOauthStates::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("mcp_oauth_states_server_id_fkey")
                            .from(McpOauthStates::Table, McpOauthStates::ServerId)
                            .to(McpServers::Table, McpServers::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("mcp_oauth_states_state_idx")
                    .table(McpOauthStates::Table)
                    .col(McpOauthStates::State)
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
                    .table(McpOauthStates::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(McpOauthTokens::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(McpServers::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum McpServers {
    Table,
    Id,
    OrganizationId,
    CreatedById,
    Name,
    Slug,
    Url,
    Transport,
    Enabled,
    AuthType,
    AuthStatus,
    ToolCache,
    LastCheckedAt,
    LastError,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum McpOauthTokens {
    Table,
    Id,
    ServerId,
    OrganizationId,
    AccessTokenCiphertext,
    RefreshTokenCiphertext,
    TokenType,
    Scope,
    ExpiresAt,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum McpOauthStates {
    Table,
    Id,
    ServerId,
    OrganizationId,
    CreatedById,
    State,
    CodeVerifier,
    AuthUrl,
    ExpiresAt,
    CreatedAt,
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
