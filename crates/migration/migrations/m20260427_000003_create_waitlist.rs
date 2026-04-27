use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Waitlist::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Waitlist::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Waitlist::Email).string().not_null())
                    .col(
                        ColumnDef::new(Waitlist::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("waitlist_email_key")
                    .table(Waitlist::Table)
                    .col(Waitlist::Email)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Waitlist::Table).if_exists().to_owned())
            .await?;

        Ok(())
    }
}

#[derive(Copy, Clone, Iden)]
enum Waitlist {
    Table,
    Id,
    Email,
    CreatedAt,
}
