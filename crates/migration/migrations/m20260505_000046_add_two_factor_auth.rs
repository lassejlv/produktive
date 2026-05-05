use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Users::Table)
                    .add_column(
                        ColumnDef::new(Users::TwoFactorEnabled)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(UserTwoFactors::Table)
                    .if_not_exists()
                    .col(text_pk(UserTwoFactors::Id))
                    .col(text(UserTwoFactors::UserId))
                    .col(text_null(UserTwoFactors::SecretCiphertext))
                    .col(text_null(UserTwoFactors::PendingSecretCiphertext))
                    .col(timestamp_null(UserTwoFactors::EnabledAt))
                    .col(timestamp_null(UserTwoFactors::SetupStartedAt))
                    .col(timestamp(UserTwoFactors::CreatedAt))
                    .col(timestamp(UserTwoFactors::UpdatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("user_two_factors_user_id_fkey")
                            .from(UserTwoFactors::Table, UserTwoFactors::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("user_two_factors_user_id_key")
                    .table(UserTwoFactors::Table)
                    .col(UserTwoFactors::UserId)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(UserTwoFactorBackupCodes::Table)
                    .if_not_exists()
                    .col(text_pk(UserTwoFactorBackupCodes::Id))
                    .col(text(UserTwoFactorBackupCodes::UserId))
                    .col(text(UserTwoFactorBackupCodes::CodeHash))
                    .col(timestamp_null(UserTwoFactorBackupCodes::UsedAt))
                    .col(timestamp(UserTwoFactorBackupCodes::CreatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("user_two_factor_backup_codes_user_id_fkey")
                            .from(
                                UserTwoFactorBackupCodes::Table,
                                UserTwoFactorBackupCodes::UserId,
                            )
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        create_index(
            manager,
            "user_two_factor_backup_codes_user_id_idx",
            UserTwoFactorBackupCodes::Table,
            UserTwoFactorBackupCodes::UserId,
        )
        .await?;
        manager
            .create_index(
                Index::create()
                    .name("user_two_factor_backup_codes_code_hash_key")
                    .table(UserTwoFactorBackupCodes::Table)
                    .col(UserTwoFactorBackupCodes::CodeHash)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(TwoFactorChallenges::Table)
                    .if_not_exists()
                    .col(text_pk(TwoFactorChallenges::Id))
                    .col(text(TwoFactorChallenges::UserId))
                    .col(text(TwoFactorChallenges::ActiveOrganizationId))
                    .col(text(TwoFactorChallenges::TokenHash))
                    .col(timestamp(TwoFactorChallenges::ExpiresAt))
                    .col(timestamp_null(TwoFactorChallenges::UsedAt))
                    .col(integer_default(TwoFactorChallenges::Attempts, 0))
                    .col(timestamp(TwoFactorChallenges::CreatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("two_factor_challenges_user_id_fkey")
                            .from(TwoFactorChallenges::Table, TwoFactorChallenges::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("two_factor_challenges_active_organization_id_fkey")
                            .from(
                                TwoFactorChallenges::Table,
                                TwoFactorChallenges::ActiveOrganizationId,
                            )
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("two_factor_challenges_token_hash_key")
                    .table(TwoFactorChallenges::Table)
                    .col(TwoFactorChallenges::TokenHash)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;
        create_index(
            manager,
            "two_factor_challenges_user_id_idx",
            TwoFactorChallenges::Table,
            TwoFactorChallenges::UserId,
        )
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(TwoFactorChallenges::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(UserTwoFactorBackupCodes::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(UserTwoFactors::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Users::Table)
                    .drop_column(Users::TwoFactorEnabled)
                    .to_owned(),
            )
            .await?;

        Ok(())
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

fn text_null<T: Iden + 'static>(name: T) -> ColumnDef {
    ColumnDef::new(name).string().null().to_owned()
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

fn integer_default<T: Iden + 'static>(name: T, default: i32) -> ColumnDef {
    ColumnDef::new(name)
        .integer()
        .not_null()
        .default(default)
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
enum Users {
    Table,
    Id,
    TwoFactorEnabled,
}

#[derive(Copy, Clone, Iden)]
enum Organizations {
    Table,
    Id,
}

#[derive(Copy, Clone, Iden)]
enum UserTwoFactors {
    Table,
    Id,
    UserId,
    SecretCiphertext,
    PendingSecretCiphertext,
    EnabledAt,
    SetupStartedAt,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum UserTwoFactorBackupCodes {
    Table,
    Id,
    UserId,
    CodeHash,
    UsedAt,
    CreatedAt,
}

#[derive(Copy, Clone, Iden)]
enum TwoFactorChallenges {
    Table,
    Id,
    UserId,
    ActiveOrganizationId,
    TokenHash,
    ExpiresAt,
    UsedAt,
    Attempts,
    CreatedAt,
}
