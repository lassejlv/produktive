use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Favorites::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Favorites::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Favorites::UserId).string().not_null())
                    .col(
                        ColumnDef::new(Favorites::OrganizationId)
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(Favorites::TargetType).string().not_null())
                    .col(ColumnDef::new(Favorites::TargetId).string().not_null())
                    .col(
                        ColumnDef::new(Favorites::Position)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(Favorites::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("favorites_user_id_fkey")
                            .from(Favorites::Table, Favorites::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("favorites_organization_id_fkey")
                            .from(Favorites::Table, Favorites::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("favorites_user_target_key")
                    .table(Favorites::Table)
                    .col(Favorites::UserId)
                    .col(Favorites::TargetType)
                    .col(Favorites::TargetId)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("favorites_user_org_position_idx")
                    .table(Favorites::Table)
                    .col(Favorites::UserId)
                    .col(Favorites::OrganizationId)
                    .col(Favorites::Position)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Favorites::Table).if_exists().to_owned())
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum Favorites {
    Table,
    Id,
    UserId,
    OrganizationId,
    TargetType,
    TargetId,
    Position,
    CreatedAt,
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
