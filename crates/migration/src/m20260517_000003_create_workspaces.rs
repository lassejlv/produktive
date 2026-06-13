use sea_orm_migration::sea_orm::{ConnectionTrait, Statement};
use sea_orm_migration::{prelude::*, schema::*};

use crate::m20260517_000001_create_users::Users;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // workspaces
        manager
            .create_table(
                Table::create()
                    .table(Workspaces::Table)
                    .if_not_exists()
                    .col(uuid(Workspaces::Id).primary_key())
                    .col(string(Workspaces::Name))
                    .col(boolean(Workspaces::IsPersonal).default(false))
                    .col(uuid(Workspaces::OwnerId))
                    .col(
                        timestamp_with_time_zone(Workspaces::CreatedAt)
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        timestamp_with_time_zone(Workspaces::UpdatedAt)
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_workspaces_owner")
                            .from(Workspaces::Table, Workspaces::OwnerId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // workspace_members
        manager
            .create_table(
                Table::create()
                    .table(WorkspaceMembers::Table)
                    .if_not_exists()
                    .col(uuid(WorkspaceMembers::Id).primary_key())
                    .col(uuid(WorkspaceMembers::WorkspaceId))
                    .col(uuid(WorkspaceMembers::UserId))
                    .col(small_integer(WorkspaceMembers::Role).default(1))
                    .col(
                        timestamp_with_time_zone(WorkspaceMembers::CreatedAt)
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_ws_members_workspace")
                            .from(WorkspaceMembers::Table, WorkspaceMembers::WorkspaceId)
                            .to(Workspaces::Table, Workspaces::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_ws_members_user")
                            .from(WorkspaceMembers::Table, WorkspaceMembers::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("uniq_ws_member")
                    .table(WorkspaceMembers::Table)
                    .col(WorkspaceMembers::WorkspaceId)
                    .col(WorkspaceMembers::UserId)
                    .unique()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_ws_members_user")
                    .table(WorkspaceMembers::Table)
                    .col(WorkspaceMembers::UserId)
                    .to_owned(),
            )
            .await?;

        // workspace_invites
        manager
            .create_table(
                Table::create()
                    .table(WorkspaceInvites::Table)
                    .if_not_exists()
                    .col(uuid(WorkspaceInvites::Id).primary_key())
                    .col(uuid(WorkspaceInvites::WorkspaceId))
                    .col(string(WorkspaceInvites::Email))
                    .col(small_integer(WorkspaceInvites::Role).default(1))
                    .col(string_uniq(WorkspaceInvites::TokenHash))
                    .col(uuid(WorkspaceInvites::InvitedBy))
                    .col(timestamp_with_time_zone(WorkspaceInvites::ExpiresAt))
                    .col(timestamp_with_time_zone_null(WorkspaceInvites::AcceptedAt))
                    .col(
                        timestamp_with_time_zone(WorkspaceInvites::CreatedAt)
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_ws_invites_workspace")
                            .from(WorkspaceInvites::Table, WorkspaceInvites::WorkspaceId)
                            .to(Workspaces::Table, Workspaces::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_ws_invites_inviter")
                            .from(WorkspaceInvites::Table, WorkspaceInvites::InvitedBy)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_ws_invites_workspace")
                    .table(WorkspaceInvites::Table)
                    .col(WorkspaceInvites::WorkspaceId)
                    .to_owned(),
            )
            .await?;

        // Partial indices (raw SQL — sea-query 0.32 lacks ergonomic WHERE on Index builder)
        let db = manager.get_connection();
        let backend = db.get_database_backend();
        db.execute(Statement::from_string(
            backend,
            "CREATE UNIQUE INDEX uniq_personal_workspace_per_user ON workspaces (owner_id) WHERE is_personal;".to_owned(),
        ))
        .await?;
        db.execute(Statement::from_string(
            backend,
            "CREATE INDEX idx_ws_invites_pending_email ON workspace_invites (email) WHERE accepted_at IS NULL;".to_owned(),
        ))
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(WorkspaceInvites::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(WorkspaceMembers::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Workspaces::Table).to_owned())
            .await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
pub enum Workspaces {
    Table,
    Id,
    Name,
    IsPersonal,
    OwnerId,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum WorkspaceMembers {
    Table,
    Id,
    WorkspaceId,
    UserId,
    Role,
    CreatedAt,
}

#[derive(DeriveIden)]
enum WorkspaceInvites {
    Table,
    Id,
    WorkspaceId,
    Email,
    Role,
    TokenHash,
    InvitedBy,
    ExpiresAt,
    AcceptedAt,
    CreatedAt,
}
