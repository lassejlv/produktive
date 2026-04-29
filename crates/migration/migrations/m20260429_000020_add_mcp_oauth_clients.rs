use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(McpOauthClients::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(McpOauthClients::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(McpOauthClients::ServerId)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(McpOauthClients::OrganizationId)
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(McpOauthClients::ClientId).text().not_null())
                    .col(
                        ColumnDef::new(McpOauthClients::ClientSecretCiphertext)
                            .text()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(McpOauthClients::TokenEndpointAuthMethod)
                            .string()
                            .not_null()
                            .default("none"),
                    )
                    .col(
                        ColumnDef::new(McpOauthClients::RegistrationAccessTokenCiphertext)
                            .text()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(McpOauthClients::RegistrationClientUri)
                            .text()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(McpOauthClients::ClientIdIssuedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(McpOauthClients::ClientSecretExpiresAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(McpOauthClients::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(McpOauthClients::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("mcp_oauth_clients_server_id_fkey")
                            .from(McpOauthClients::Table, McpOauthClients::ServerId)
                            .to(McpServers::Table, McpServers::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("mcp_oauth_clients_organization_id_fkey")
                            .from(McpOauthClients::Table, McpOauthClients::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("mcp_oauth_clients_server_idx")
                    .table(McpOauthClients::Table)
                    .col(McpOauthClients::ServerId)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(McpOauthStates::Table)
                    .add_column_if_not_exists(
                        ColumnDef::new(McpOauthStates::ClientId)
                            .text()
                            .not_null()
                            .default("produktive"),
                    )
                    .add_column_if_not_exists(
                        ColumnDef::new(McpOauthStates::Resource).text().null(),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(McpOauthStates::Table)
                    .drop_column(McpOauthStates::Resource)
                    .drop_column(McpOauthStates::ClientId)
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(McpOauthClients::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum McpOauthClients {
    Table,
    Id,
    ServerId,
    OrganizationId,
    ClientId,
    ClientSecretCiphertext,
    TokenEndpointAuthMethod,
    RegistrationAccessTokenCiphertext,
    RegistrationClientUri,
    ClientIdIssuedAt,
    ClientSecretExpiresAt,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum McpOauthStates {
    Table,
    ClientId,
    Resource,
}

#[derive(Copy, Clone, Iden)]
enum McpServers {
    Table,
    Id,
}

#[derive(Copy, Clone, Iden)]
enum Organizations {
    Table,
    Id,
}
