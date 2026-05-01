use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(McpApiKeys::Table)
                    .add_column(string_null(McpApiKeys::UnkeyKeyId))
                    .add_column(timestamp_null(McpApiKeys::UnkeyMigratedAt))
                    .add_column(timestamp_null(McpApiKeys::UnkeySyncedAt))
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("mcp_api_keys_unkey_key_id_key")
                    .table(McpApiKeys::Table)
                    .col(McpApiKeys::UnkeyKeyId)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_index(
                Index::drop()
                    .name("mcp_api_keys_unkey_key_id_key")
                    .table(McpApiKeys::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(McpApiKeys::Table)
                    .drop_column(McpApiKeys::UnkeySyncedAt)
                    .drop_column(McpApiKeys::UnkeyMigratedAt)
                    .drop_column(McpApiKeys::UnkeyKeyId)
                    .to_owned(),
            )
            .await
    }
}

fn string_null<T: Iden + 'static>(name: T) -> ColumnDef {
    ColumnDef::new(name).string().null().to_owned()
}

fn timestamp_null<T: Iden + 'static>(name: T) -> ColumnDef {
    ColumnDef::new(name)
        .timestamp_with_time_zone()
        .null()
        .to_owned()
}

#[derive(Copy, Clone, Iden)]
enum McpApiKeys {
    Table,
    UnkeyKeyId,
    UnkeyMigratedAt,
    UnkeySyncedAt,
}
