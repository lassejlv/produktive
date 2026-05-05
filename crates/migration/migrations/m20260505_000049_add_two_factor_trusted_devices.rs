use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(UserTwoFactorTrustedDevices::Table)
                    .if_not_exists()
                    .col(text_pk(UserTwoFactorTrustedDevices::Id))
                    .col(text(UserTwoFactorTrustedDevices::UserId))
                    .col(text(UserTwoFactorTrustedDevices::TokenHash))
                    .col(timestamp(UserTwoFactorTrustedDevices::ExpiresAt))
                    .col(timestamp_null(UserTwoFactorTrustedDevices::LastUsedAt))
                    .col(timestamp(UserTwoFactorTrustedDevices::CreatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("user_two_factor_trusted_devices_user_id_fkey")
                            .from(
                                UserTwoFactorTrustedDevices::Table,
                                UserTwoFactorTrustedDevices::UserId,
                            )
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("user_two_factor_trusted_devices_token_hash_key")
                    .table(UserTwoFactorTrustedDevices::Table)
                    .col(UserTwoFactorTrustedDevices::TokenHash)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("user_two_factor_trusted_devices_user_expires_idx")
                    .table(UserTwoFactorTrustedDevices::Table)
                    .col(UserTwoFactorTrustedDevices::UserId)
                    .col(UserTwoFactorTrustedDevices::ExpiresAt)
                    .if_not_exists()
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(UserTwoFactorTrustedDevices::Table)
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

#[derive(Copy, Clone, Iden)]
enum Users {
    Table,
    Id,
}

#[derive(Copy, Clone, Iden)]
enum UserTwoFactorTrustedDevices {
    Table,
    Id,
    UserId,
    TokenHash,
    ExpiresAt,
    LastUsedAt,
    CreatedAt,
}
