use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Notifications::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Notifications::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Notifications::OrganizationId)
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(Notifications::UserId).string().not_null())
                    .col(ColumnDef::new(Notifications::Kind).string().not_null())
                    .col(
                        ColumnDef::new(Notifications::TargetType)
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(Notifications::TargetId).string().not_null())
                    .col(ColumnDef::new(Notifications::ActorId).string().null())
                    .col(ColumnDef::new(Notifications::Title).text().not_null())
                    .col(ColumnDef::new(Notifications::Snippet).text().null())
                    .col(
                        ColumnDef::new(Notifications::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(Notifications::ReadAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("notifications_organization_id_fkey")
                            .from(Notifications::Table, Notifications::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("notifications_user_id_fkey")
                            .from(Notifications::Table, Notifications::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("notifications_actor_id_fkey")
                            .from(Notifications::Table, Notifications::ActorId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("notifications_user_created_idx")
                    .table(Notifications::Table)
                    .col(Notifications::UserId)
                    .col((Notifications::CreatedAt, IndexOrder::Desc))
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
                    .table(Notifications::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum Notifications {
    Table,
    Id,
    OrganizationId,
    UserId,
    Kind,
    TargetType,
    TargetId,
    ActorId,
    Title,
    Snippet,
    CreatedAt,
    ReadAt,
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
