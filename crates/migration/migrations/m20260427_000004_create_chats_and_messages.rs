use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Chats::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Chats::Id).string().not_null().primary_key())
                    .col(ColumnDef::new(Chats::OrganizationId).string().not_null())
                    .col(ColumnDef::new(Chats::CreatedById).string().null())
                    .col(ColumnDef::new(Chats::Title).string().not_null())
                    .col(
                        ColumnDef::new(Chats::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(Chats::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("chats_organization_id_fkey")
                            .from(Chats::Table, Chats::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("chats_created_by_id_fkey")
                            .from(Chats::Table, Chats::CreatedById)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("chats_organization_id_idx")
                    .table(Chats::Table)
                    .col(Chats::OrganizationId)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("chats_org_updated_idx")
                    .table(Chats::Table)
                    .col(Chats::OrganizationId)
                    .col((Chats::UpdatedAt, IndexOrder::Desc))
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(ChatMessages::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(ChatMessages::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(ChatMessages::ChatId).string().not_null())
                    .col(ColumnDef::new(ChatMessages::Role).string().not_null())
                    .col(ColumnDef::new(ChatMessages::Content).text().not_null())
                    .col(ColumnDef::new(ChatMessages::ToolCalls).json_binary().null())
                    .col(ColumnDef::new(ChatMessages::ToolCallId).string().null())
                    .col(
                        ColumnDef::new(ChatMessages::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("chat_messages_chat_id_fkey")
                            .from(ChatMessages::Table, ChatMessages::ChatId)
                            .to(Chats::Table, Chats::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("chat_messages_chat_id_idx")
                    .table(ChatMessages::Table)
                    .col(ChatMessages::ChatId)
                    .col(ChatMessages::CreatedAt)
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
                    .table(ChatMessages::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(Table::drop().table(Chats::Table).if_exists().to_owned())
            .await?;
        Ok(())
    }
}

#[derive(Copy, Clone, Iden)]
enum Chats {
    Table,
    Id,
    OrganizationId,
    CreatedById,
    Title,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum ChatMessages {
    Table,
    Id,
    ChatId,
    Role,
    Content,
    ToolCalls,
    ToolCallId,
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
