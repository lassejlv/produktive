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
                    .add_column(timestamp_null(Users::SuspendedAt))
                    .add_column(text_null(Users::SuspendedById))
                    .add_column(text_null(Users::SuspensionReason))
                    .add_column(text_null(Users::SuspensionNote))
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Organizations::Table)
                    .add_column(timestamp_null(Organizations::SuspendedAt))
                    .add_column(text_null(Organizations::SuspendedById))
                    .add_column(text_null(Organizations::SuspensionReason))
                    .add_column(text_null(Organizations::SuspensionNote))
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(PlatformAdmins::Table)
                    .if_not_exists()
                    .col(text_pk(PlatformAdmins::Id))
                    .col(text(PlatformAdmins::UserId))
                    .col(text(PlatformAdmins::Role))
                    .col(text_null(PlatformAdmins::CreatedById))
                    .col(timestamp(PlatformAdmins::CreatedAt))
                    .col(timestamp(PlatformAdmins::UpdatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("platform_admins_user_id_fkey")
                            .from(PlatformAdmins::Table, PlatformAdmins::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("platform_admins_created_by_id_fkey")
                            .from(PlatformAdmins::Table, PlatformAdmins::CreatedById)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("platform_admins_user_id_key")
                    .table(PlatformAdmins::Table)
                    .col(PlatformAdmins::UserId)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(AdminAuditEvents::Table)
                    .if_not_exists()
                    .col(text_pk(AdminAuditEvents::Id))
                    .col(text(AdminAuditEvents::ActorUserId))
                    .col(text(AdminAuditEvents::Action))
                    .col(text(AdminAuditEvents::TargetType))
                    .col(text(AdminAuditEvents::TargetId))
                    .col(text_null(AdminAuditEvents::Reason))
                    .col(json(AdminAuditEvents::Metadata))
                    .col(timestamp(AdminAuditEvents::CreatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("admin_audit_events_actor_user_id_fkey")
                            .from(AdminAuditEvents::Table, AdminAuditEvents::ActorUserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        create_index(
            manager,
            "admin_audit_events_target_idx",
            AdminAuditEvents::Table,
            AdminAuditEvents::TargetId,
        )
        .await?;
        create_index(
            manager,
            "admin_audit_events_actor_idx",
            AdminAuditEvents::Table,
            AdminAuditEvents::ActorUserId,
        )
        .await?;
        create_index(
            manager,
            "admin_audit_events_created_at_idx",
            AdminAuditEvents::Table,
            AdminAuditEvents::CreatedAt,
        )
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(AdminAuditEvents::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(PlatformAdmins::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Organizations::Table)
                    .drop_column(Organizations::SuspensionNote)
                    .drop_column(Organizations::SuspensionReason)
                    .drop_column(Organizations::SuspendedById)
                    .drop_column(Organizations::SuspendedAt)
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Users::Table)
                    .drop_column(Users::SuspensionNote)
                    .drop_column(Users::SuspensionReason)
                    .drop_column(Users::SuspendedById)
                    .drop_column(Users::SuspendedAt)
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

fn json<T: Iden + 'static>(name: T) -> ColumnDef {
    ColumnDef::new(name)
        .json_binary()
        .not_null()
        .default(Expr::cust("'{}'::jsonb"))
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
    SuspendedAt,
    SuspendedById,
    SuspensionReason,
    SuspensionNote,
}

#[derive(Copy, Clone, Iden)]
enum Organizations {
    Table,
    SuspendedAt,
    SuspendedById,
    SuspensionReason,
    SuspensionNote,
}

#[derive(Copy, Clone, Iden)]
enum PlatformAdmins {
    Table,
    Id,
    UserId,
    Role,
    CreatedById,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum AdminAuditEvents {
    Table,
    Id,
    ActorUserId,
    Action,
    TargetType,
    TargetId,
    Reason,
    Metadata,
    CreatedAt,
}
