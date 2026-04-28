use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Invitations::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Invitations::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Invitations::OrganizationId)
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(Invitations::Email).string().not_null())
                    .col(
                        ColumnDef::new(Invitations::Token)
                            .string()
                            .not_null()
                            .unique_key(),
                    )
                    .col(
                        ColumnDef::new(Invitations::Role)
                            .string()
                            .not_null()
                            .default("member"),
                    )
                    .col(ColumnDef::new(Invitations::InvitedById).string().null())
                    .col(
                        ColumnDef::new(Invitations::ExpiresAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Invitations::AcceptedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(Invitations::RevokedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(Invitations::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("invitations_organization_id_fkey")
                            .from(Invitations::Table, Invitations::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("invitations_invited_by_id_fkey")
                            .from(Invitations::Table, Invitations::InvitedById)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("invitations_org_email_idx")
                    .table(Invitations::Table)
                    .col(Invitations::OrganizationId)
                    .col(Invitations::Email)
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
                    .table(Invitations::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum Invitations {
    Table,
    Id,
    OrganizationId,
    Email,
    Token,
    Role,
    InvitedById,
    ExpiresAt,
    AcceptedAt,
    RevokedAt,
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
