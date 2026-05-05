use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Notes::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Notes::Id).string().not_null().primary_key())
                    .col(ColumnDef::new(Notes::OrganizationId).string().not_null())
                    .col(ColumnDef::new(Notes::Title).string().not_null())
                    .col(ColumnDef::new(Notes::BodyMarkdown).text().not_null())
                    .col(ColumnDef::new(Notes::CreatedById).string().null())
                    .col(ColumnDef::new(Notes::UpdatedById).string().null())
                    .col(
                        ColumnDef::new(Notes::ArchivedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(Notes::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(Notes::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("notes_organization_id_fkey")
                            .from(Notes::Table, Notes::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("notes_created_by_id_fkey")
                            .from(Notes::Table, Notes::CreatedById)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("notes_updated_by_id_fkey")
                            .from(Notes::Table, Notes::UpdatedById)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("notes_org_updated_idx")
                    .table(Notes::Table)
                    .col(Notes::OrganizationId)
                    .col(Notes::ArchivedAt)
                    .col((Notes::UpdatedAt, IndexOrder::Desc))
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(NoteMentions::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(NoteMentions::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(NoteMentions::NoteId).string().not_null())
                    .col(ColumnDef::new(NoteMentions::TargetType).string().not_null())
                    .col(ColumnDef::new(NoteMentions::TargetId).string().not_null())
                    .col(
                        ColumnDef::new(NoteMentions::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("note_mentions_note_id_fkey")
                            .from(NoteMentions::Table, NoteMentions::NoteId)
                            .to(Notes::Table, Notes::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("note_mentions_note_target_key")
                    .table(NoteMentions::Table)
                    .col(NoteMentions::NoteId)
                    .col(NoteMentions::TargetType)
                    .col(NoteMentions::TargetId)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("note_mentions_target_idx")
                    .table(NoteMentions::Table)
                    .col(NoteMentions::TargetType)
                    .col(NoteMentions::TargetId)
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
                    .table(NoteMentions::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(Table::drop().table(Notes::Table).if_exists().to_owned())
            .await?;
        Ok(())
    }
}

#[derive(Copy, Clone, Iden)]
enum Notes {
    Table,
    Id,
    OrganizationId,
    Title,
    BodyMarkdown,
    CreatedById,
    UpdatedById,
    ArchivedAt,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum NoteMentions {
    Table,
    Id,
    NoteId,
    TargetType,
    TargetId,
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
