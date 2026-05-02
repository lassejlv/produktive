use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(OrganizationRoles::Table)
                    .if_not_exists()
                    .col(text_pk(OrganizationRoles::Id))
                    .col(text(OrganizationRoles::OrganizationId))
                    .col(text(OrganizationRoles::Key))
                    .col(text(OrganizationRoles::Name))
                    .col(text_null(OrganizationRoles::Description))
                    .col(json(OrganizationRoles::Permissions))
                    .col(boolean_default(OrganizationRoles::IsSystem, false))
                    .col(timestamp_null(OrganizationRoles::ArchivedAt))
                    .col(timestamp(OrganizationRoles::CreatedAt))
                    .col(timestamp(OrganizationRoles::UpdatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("organization_roles_organization_id_fkey")
                            .from(OrganizationRoles::Table, OrganizationRoles::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("organization_roles_org_key")
                    .table(OrganizationRoles::Table)
                    .col(OrganizationRoles::OrganizationId)
                    .col(OrganizationRoles::Key)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("organization_roles_organization_id_idx")
                    .table(OrganizationRoles::Table)
                    .col(OrganizationRoles::OrganizationId)
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
                    .table(OrganizationRoles::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum OrganizationRoles {
    Table,
    Id,
    OrganizationId,
    Key,
    Name,
    Description,
    Permissions,
    IsSystem,
    ArchivedAt,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum Organizations {
    Table,
    Id,
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

fn json<T: Iden + 'static>(name: T) -> ColumnDef {
    ColumnDef::new(name).json_binary().not_null().to_owned()
}

fn boolean_default<T: Iden + 'static>(name: T, default: bool) -> ColumnDef {
    ColumnDef::new(name)
        .boolean()
        .not_null()
        .default(default)
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
