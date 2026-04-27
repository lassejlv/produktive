use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Users::Table)
                    .if_not_exists()
                    .col(text_pk(Users::Id))
                    .col(text(Users::Name))
                    .col(text(Users::Email))
                    .col(text(Users::PasswordHash))
                    .col(text_null(Users::Image))
                    .col(timestamp(Users::CreatedAt))
                    .col(timestamp(Users::UpdatedAt))
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("users_email_key")
                    .table(Users::Table)
                    .col(Users::Email)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Organizations::Table)
                    .if_not_exists()
                    .col(text_pk(Organizations::Id))
                    .col(text(Organizations::Name))
                    .col(text(Organizations::Slug))
                    .col(timestamp(Organizations::CreatedAt))
                    .col(timestamp(Organizations::UpdatedAt))
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("organizations_slug_key")
                    .table(Organizations::Table)
                    .col(Organizations::Slug)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Members::Table)
                    .if_not_exists()
                    .col(text_pk(Members::Id))
                    .col(text(Members::OrganizationId))
                    .col(text(Members::UserId))
                    .col(string_default(Members::Role, "member"))
                    .col(timestamp(Members::CreatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("members_organization_id_fkey")
                            .from(Members::Table, Members::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("members_user_id_fkey")
                            .from(Members::Table, Members::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        create_index(
            manager,
            "members_organization_id_idx",
            Members::Table,
            Members::OrganizationId,
        )
        .await?;
        create_index(
            manager,
            "members_user_id_idx",
            Members::Table,
            Members::UserId,
        )
        .await?;
        manager
            .create_index(
                Index::create()
                    .name("members_organization_user_key")
                    .table(Members::Table)
                    .col(Members::OrganizationId)
                    .col(Members::UserId)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Sessions::Table)
                    .if_not_exists()
                    .col(text_pk(Sessions::Id))
                    .col(text(Sessions::UserId))
                    .col(text(Sessions::ActiveOrganizationId))
                    .col(timestamp(Sessions::ExpiresAt))
                    .col(timestamp_null(Sessions::RevokedAt))
                    .col(timestamp(Sessions::CreatedAt))
                    .col(timestamp(Sessions::UpdatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("sessions_user_id_fkey")
                            .from(Sessions::Table, Sessions::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("sessions_active_organization_id_fkey")
                            .from(Sessions::Table, Sessions::ActiveOrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        create_index(
            manager,
            "sessions_user_id_idx",
            Sessions::Table,
            Sessions::UserId,
        )
        .await?;

        manager
            .create_table(
                Table::create()
                    .table(Issues::Table)
                    .if_not_exists()
                    .col(text_pk(Issues::Id))
                    .col(text(Issues::OrganizationId))
                    .col(text(Issues::Title))
                    .col(text_null(Issues::Description))
                    .col(string_default(Issues::Status, "backlog"))
                    .col(string_default(Issues::Priority, "medium"))
                    .col(text_null(Issues::CreatedById))
                    .col(text_null(Issues::AssignedToId))
                    .col(timestamp(Issues::CreatedAt))
                    .col(timestamp(Issues::UpdatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("issues_organization_id_fkey")
                            .from(Issues::Table, Issues::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("issues_created_by_id_fkey")
                            .from(Issues::Table, Issues::CreatedById)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("issues_assigned_to_id_fkey")
                            .from(Issues::Table, Issues::AssignedToId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        create_index(
            manager,
            "issues_organization_id_idx",
            Issues::Table,
            Issues::OrganizationId,
        )
        .await?;
        create_index(
            manager,
            "issues_created_by_id_idx",
            Issues::Table,
            Issues::CreatedById,
        )
        .await?;
        create_index(
            manager,
            "issues_assigned_to_id_idx",
            Issues::Table,
            Issues::AssignedToId,
        )
        .await?;
        create_index(manager, "issues_status_idx", Issues::Table, Issues::Status).await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Issues::Table).if_exists().to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Sessions::Table).if_exists().to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Members::Table).if_exists().to_owned())
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(Organizations::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(Table::drop().table(Users::Table).if_exists().to_owned())
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

fn string_default<T: Iden + 'static>(name: T, value: &str) -> ColumnDef {
    ColumnDef::new(name)
        .string()
        .not_null()
        .default(value)
        .to_owned()
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
    Name,
    Email,
    PasswordHash,
    Image,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum Organizations {
    Table,
    Id,
    Name,
    Slug,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum Members {
    Table,
    Id,
    OrganizationId,
    UserId,
    Role,
    CreatedAt,
}

#[derive(Copy, Clone, Iden)]
enum Sessions {
    Table,
    Id,
    UserId,
    ActiveOrganizationId,
    ExpiresAt,
    RevokedAt,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum Issues {
    Table,
    Id,
    OrganizationId,
    Title,
    Description,
    Status,
    Priority,
    CreatedById,
    AssignedToId,
    CreatedAt,
    UpdatedAt,
}
