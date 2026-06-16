use sea_orm_migration::{prelude::*, schema::*};

use crate::m20260517_000001_create_users::Users;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(PasswordResetTokens::Table)
                    .if_not_exists()
                    .col(uuid(PasswordResetTokens::Id).primary_key())
                    .col(uuid(PasswordResetTokens::UserId))
                    .col(string_uniq(PasswordResetTokens::TokenHash))
                    .col(timestamp_with_time_zone(PasswordResetTokens::ExpiresAt))
                    .col(timestamp_with_time_zone_null(PasswordResetTokens::UsedAt))
                    .col(
                        timestamp_with_time_zone(PasswordResetTokens::CreatedAt)
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_password_reset_tokens_user")
                            .from(PasswordResetTokens::Table, PasswordResetTokens::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_password_reset_tokens_user")
                    .table(PasswordResetTokens::Table)
                    .col(PasswordResetTokens::UserId)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(PasswordResetTokens::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum PasswordResetTokens {
    Table,
    Id,
    UserId,
    TokenHash,
    ExpiresAt,
    UsedAt,
    CreatedAt,
}
