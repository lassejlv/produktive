use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Projects::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Projects::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Projects::OrganizationId)
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(Projects::Name).string().not_null())
                    .col(ColumnDef::new(Projects::Description).text().null())
                    .col(
                        ColumnDef::new(Projects::Status)
                            .string()
                            .not_null()
                            .default("planned"),
                    )
                    .col(
                        ColumnDef::new(Projects::Color)
                            .string()
                            .not_null()
                            .default("blue"),
                    )
                    .col(ColumnDef::new(Projects::Icon).string().null())
                    .col(ColumnDef::new(Projects::LeadId).string().null())
                    .col(
                        ColumnDef::new(Projects::TargetDate)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(Projects::SortOrder)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(ColumnDef::new(Projects::CreatedById).string().null())
                    .col(
                        ColumnDef::new(Projects::ArchivedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(Projects::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(Projects::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("projects_organization_id_fkey")
                            .from(Projects::Table, Projects::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("projects_lead_id_fkey")
                            .from(Projects::Table, Projects::LeadId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("projects_created_by_id_fkey")
                            .from(Projects::Table, Projects::CreatedById)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("projects_org_archived_idx")
                    .table(Projects::Table)
                    .col(Projects::OrganizationId)
                    .col(Projects::ArchivedAt)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("projects_org_sort_idx")
                    .table(Projects::Table)
                    .col(Projects::OrganizationId)
                    .col(Projects::SortOrder)
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
                    .table(Projects::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum Projects {
    Table,
    Id,
    OrganizationId,
    Name,
    Description,
    Status,
    Color,
    Icon,
    LeadId,
    TargetDate,
    SortOrder,
    CreatedById,
    ArchivedAt,
    CreatedAt,
    UpdatedAt,
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
