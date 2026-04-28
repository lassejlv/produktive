use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Labels::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Labels::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Labels::OrganizationId)
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(Labels::Name).string().not_null())
                    .col(ColumnDef::new(Labels::Description).text().null())
                    .col(
                        ColumnDef::new(Labels::Color)
                            .string()
                            .not_null()
                            .default("gray"),
                    )
                    .col(ColumnDef::new(Labels::CreatedById).string().null())
                    .col(
                        ColumnDef::new(Labels::ArchivedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(Labels::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(Labels::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("labels_organization_id_fkey")
                            .from(Labels::Table, Labels::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("labels_created_by_id_fkey")
                            .from(Labels::Table, Labels::CreatedById)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("labels_org_archived_idx")
                    .table(Labels::Table)
                    .col(Labels::OrganizationId)
                    .col(Labels::ArchivedAt)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Labels::Table).if_exists().to_owned())
            .await
    }
}

#[derive(Copy, Clone, Iden)]
enum Labels {
    Table,
    Id,
    OrganizationId,
    Name,
    Description,
    Color,
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
