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
                        ColumnDef::new(Users::EmailVerified)
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
                    .table(AuthTokens::Table)
                    .if_not_exists()
                    .col(text_pk(AuthTokens::Id))
                    .col(text(AuthTokens::UserId))
                    .col(text(AuthTokens::TokenHash))
                    .col(text(AuthTokens::Purpose))
                    .col(timestamp(AuthTokens::ExpiresAt))
                    .col(timestamp_null(AuthTokens::UsedAt))
                    .col(timestamp(AuthTokens::CreatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("auth_tokens_user_id_fkey")
                            .from(AuthTokens::Table, AuthTokens::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("auth_tokens_token_hash_key")
                    .table(AuthTokens::Table)
                    .col(AuthTokens::TokenHash)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        create_index(
            manager,
            "auth_tokens_user_id_idx",
            AuthTokens::Table,
            AuthTokens::UserId,
        )
        .await?;
        create_index(
            manager,
            "auth_tokens_purpose_idx",
            AuthTokens::Table,
            AuthTokens::Purpose,
        )
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(AuthTokens::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Users::Table)
                    .drop_column(Users::EmailVerified)
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
enum Users {
    Table,
    Id,
    EmailVerified,
}

#[derive(Copy, Clone, Iden)]
enum AuthTokens {
    Table,
    Id,
    UserId,
    TokenHash,
    Purpose,
    ExpiresAt,
    UsedAt,
    CreatedAt,
}
