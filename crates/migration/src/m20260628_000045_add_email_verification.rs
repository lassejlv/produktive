use sea_orm_migration::{prelude::*, schema::*};

use crate::m20260517_000001_create_users::Users;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Users::Table)
                    .add_column_if_not_exists(timestamp_with_time_zone_null(Users::EmailVerifiedAt))
                    .to_owned(),
            )
            .await?;

        // Grandfather every existing account: they predate verification and are
        // already active, so mark them verified (as of when they signed up)
        // rather than locking them out behind the new gate.
        let db = manager.get_connection();
        db.execute_unprepared(
            "UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL",
        )
        .await?;

        manager
            .create_table(
                Table::create()
                    .table(EmailVerificationTokens::Table)
                    .if_not_exists()
                    .col(uuid(EmailVerificationTokens::Id).primary_key())
                    .col(uuid(EmailVerificationTokens::UserId))
                    .col(string_uniq(EmailVerificationTokens::TokenHash))
                    .col(timestamp_with_time_zone(EmailVerificationTokens::ExpiresAt))
                    .col(timestamp_with_time_zone_null(
                        EmailVerificationTokens::UsedAt,
                    ))
                    .col(
                        timestamp_with_time_zone(EmailVerificationTokens::CreatedAt)
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_email_verification_tokens_user")
                            .from(
                                EmailVerificationTokens::Table,
                                EmailVerificationTokens::UserId,
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
                    .name("idx_email_verification_tokens_user")
                    .table(EmailVerificationTokens::Table)
                    .col(EmailVerificationTokens::UserId)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(EmailVerificationTokens::Table)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Users::Table)
                    .drop_column(Users::EmailVerifiedAt)
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum EmailVerificationTokens {
    Table,
    Id,
    UserId,
    TokenHash,
    ExpiresAt,
    UsedAt,
    CreatedAt,
}
