use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::ConnectionTrait;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(ChatAccess::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(ChatAccess::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(ChatAccess::ChatId).string().not_null())
                    .col(ColumnDef::new(ChatAccess::UserId).string().not_null())
                    .col(ColumnDef::new(ChatAccess::GrantedById).string().null())
                    .col(
                        ColumnDef::new(ChatAccess::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("chat_access_chat_id_fkey")
                            .from(ChatAccess::Table, ChatAccess::ChatId)
                            .to(Chats::Table, Chats::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("chat_access_user_id_fkey")
                            .from(ChatAccess::Table, ChatAccess::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("chat_access_granted_by_id_fkey")
                            .from(ChatAccess::Table, ChatAccess::GrantedById)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("chat_access_chat_user_key")
                    .table(ChatAccess::Table)
                    .col(ChatAccess::ChatId)
                    .col(ChatAccess::UserId)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("chat_access_user_chat_idx")
                    .table(ChatAccess::Table)
                    .col(ChatAccess::UserId)
                    .col(ChatAccess::ChatId)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        // Backfill: every existing chat is granted to every current member of its
        // org, so prod chats keep their current visibility. New chats created
        // after this migration will only have access rows for their creator.
        // gen_random_uuid() requires Postgres 13+ (or pgcrypto on older versions).
        manager
            .get_connection()
            .execute_unprepared(
                r#"
                INSERT INTO chat_access (id, chat_id, user_id, granted_by_id, created_at)
                SELECT
                    gen_random_uuid()::text,
                    c.id,
                    m.user_id,
                    c.created_by_id,
                    now()
                FROM chats c
                JOIN members m ON m.organization_id = c.organization_id
                ON CONFLICT (chat_id, user_id) DO NOTHING
                "#,
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(ChatAccess::Table).if_exists().to_owned())
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum ChatAccess {
    Table,
    Id,
    ChatId,
    UserId,
    GrantedById,
    CreatedAt,
}

#[derive(Copy, Clone, Iden)]
enum Chats {
    Table,
    Id,
}

#[derive(Copy, Clone, Iden)]
enum Users {
    Table,
    Id,
}
