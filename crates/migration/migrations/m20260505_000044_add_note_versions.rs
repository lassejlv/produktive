use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Notes::Table)
                    .add_column_if_not_exists(
                        ColumnDef::new(Notes::CurrentObjectKey).string().null(),
                    )
                    .add_column_if_not_exists(
                        ColumnDef::new(Notes::CurrentVersionId).string().null(),
                    )
                    .add_column_if_not_exists(ColumnDef::new(Notes::BodySha256).string().null())
                    .add_column_if_not_exists(ColumnDef::new(Notes::BodySnippet).text().null())
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(NoteVersions::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(NoteVersions::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(NoteVersions::NoteId).string().not_null())
                    .col(ColumnDef::new(NoteVersions::ObjectKey).string().not_null())
                    .col(ColumnDef::new(NoteVersions::BodySha256).string().not_null())
                    .col(
                        ColumnDef::new(NoteVersions::ParentVersionId)
                            .string()
                            .null(),
                    )
                    .col(ColumnDef::new(NoteVersions::CommitMessage).text().null())
                    .col(ColumnDef::new(NoteVersions::CreatedById).string().null())
                    .col(
                        ColumnDef::new(NoteVersions::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("note_versions_note_id_fkey")
                            .from(NoteVersions::Table, NoteVersions::NoteId)
                            .to(Notes::Table, Notes::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("note_versions_created_by_id_fkey")
                            .from(NoteVersions::Table, NoteVersions::CreatedById)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("note_versions_note_created_idx")
                    .table(NoteVersions::Table)
                    .col(NoteVersions::NoteId)
                    .col((NoteVersions::CreatedAt, IndexOrder::Desc))
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("notes_current_version_idx")
                    .table(Notes::Table)
                    .col(Notes::CurrentVersionId)
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
                    .name("notes_current_version_idx")
                    .table(Notes::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(NoteVersions::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Notes::Table)
                    .drop_column(Notes::BodySnippet)
                    .drop_column(Notes::BodySha256)
                    .drop_column(Notes::CurrentVersionId)
                    .drop_column(Notes::CurrentObjectKey)
                    .to_owned(),
            )
            .await?;
        Ok(())
    }
}

#[derive(Copy, Clone, Iden)]
enum Notes {
    Table,
    Id,
    CurrentObjectKey,
    CurrentVersionId,
    BodySha256,
    BodySnippet,
}

#[derive(Copy, Clone, Iden)]
enum NoteVersions {
    Table,
    Id,
    NoteId,
    ObjectKey,
    BodySha256,
    ParentVersionId,
    CommitMessage,
    CreatedById,
    CreatedAt,
}

#[derive(Copy, Clone, Iden)]
enum Users {
    Table,
    Id,
}
