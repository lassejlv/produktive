use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(NoteFolders::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(NoteFolders::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(NoteFolders::OrganizationId)
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(NoteFolders::Name).string().not_null())
                    .col(
                        ColumnDef::new(NoteFolders::Visibility)
                            .string()
                            .not_null()
                            .default("workspace"),
                    )
                    .col(ColumnDef::new(NoteFolders::CreatedById).string().null())
                    .col(ColumnDef::new(NoteFolders::UpdatedById).string().null())
                    .col(
                        ColumnDef::new(NoteFolders::ArchivedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(NoteFolders::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(NoteFolders::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("note_folders_organization_id_fkey")
                            .from(NoteFolders::Table, NoteFolders::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("note_folders_created_by_id_fkey")
                            .from(NoteFolders::Table, NoteFolders::CreatedById)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("note_folders_updated_by_id_fkey")
                            .from(NoteFolders::Table, NoteFolders::UpdatedById)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Notes::Table)
                    .add_column_if_not_exists(ColumnDef::new(Notes::FolderId).string().null())
                    .add_column_if_not_exists(
                        ColumnDef::new(Notes::Visibility)
                            .string()
                            .not_null()
                            .default("workspace"),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("note_folders_org_updated_idx")
                    .table(NoteFolders::Table)
                    .col(NoteFolders::OrganizationId)
                    .col(NoteFolders::ArchivedAt)
                    .col((NoteFolders::UpdatedAt, IndexOrder::Desc))
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("notes_folder_idx")
                    .table(Notes::Table)
                    .col(Notes::FolderId)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_index(
                Index::drop()
                    .name("notes_folder_idx")
                    .table(Notes::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Notes::Table)
                    .drop_column(Notes::Visibility)
                    .drop_column(Notes::FolderId)
                    .to_owned(),
            )
            .await?;

        manager
            .drop_table(
                Table::drop()
                    .table(NoteFolders::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(Copy, Clone, Iden)]
enum NoteFolders {
    Table,
    Id,
    OrganizationId,
    Name,
    Visibility,
    CreatedById,
    UpdatedById,
    ArchivedAt,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum Notes {
    Table,
    FolderId,
    Visibility,
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
