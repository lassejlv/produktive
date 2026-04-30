use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(McpApiKeys::Table)
                    .if_not_exists()
                    .col(text_pk(McpApiKeys::Id))
                    .col(text(McpApiKeys::UserId))
                    .col(text(McpApiKeys::TokenHash))
                    .col(text(McpApiKeys::TokenPrefix))
                    .col(text(McpApiKeys::Name))
                    .col(
                        ColumnDef::new(McpApiKeys::ActiveOrganizationId)
                            .string()
                            .null(),
                    )
                    .col(timestamp_null(McpApiKeys::LastUsedAt))
                    .col(timestamp_null(McpApiKeys::RevokedAt))
                    .col(timestamp_null(McpApiKeys::ExpiresAt))
                    .col(timestamp(McpApiKeys::CreatedAt))
                    .col(timestamp(McpApiKeys::UpdatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("mcp_api_keys_user_id_fkey")
                            .from(McpApiKeys::Table, McpApiKeys::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("mcp_api_keys_active_organization_id_fkey")
                            .from(McpApiKeys::Table, McpApiKeys::ActiveOrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("mcp_api_keys_token_hash_key")
                    .table(McpApiKeys::Table)
                    .col(McpApiKeys::TokenHash)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        create_index(
            manager,
            "mcp_api_keys_user_id_idx",
            McpApiKeys::Table,
            McpApiKeys::UserId,
        )
        .await?;
        create_index(
            manager,
            "mcp_api_keys_token_prefix_idx",
            McpApiKeys::Table,
            McpApiKeys::TokenPrefix,
        )
        .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(McpApiKeys::Table)
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
        .default(Expr::current_timestamp())
        .to_owned()
}

fn timestamp_null<T: Iden + 'static>(name: T) -> ColumnDef {
    ColumnDef::new(name)
        .timestamp_with_time_zone()
        .null()
        .to_owned()
}

async fn create_index<T, C>(
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

#[derive(Copy, Clone, Iden)]
enum McpApiKeys {
    Table,
    Id,
    UserId,
    TokenHash,
    TokenPrefix,
    Name,
    ActiveOrganizationId,
    LastUsedAt,
    RevokedAt,
    ExpiresAt,
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
