use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(SecurityEvents::Table)
                    .if_not_exists()
                    .col(text_pk(SecurityEvents::Id))
                    .col(text_null(SecurityEvents::OrganizationId))
                    .col(text_null(SecurityEvents::ActorUserId))
                    .col(text_null(SecurityEvents::TargetUserId))
                    .col(text(SecurityEvents::EventType))
                    .col(text_null(SecurityEvents::IpAddress))
                    .col(text_null(SecurityEvents::UserAgent))
                    .col(json(SecurityEvents::Metadata))
                    .col(timestamp(SecurityEvents::CreatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("security_events_organization_id_fkey")
                            .from(SecurityEvents::Table, SecurityEvents::OrganizationId)
                            .to(Organizations::Table, Organizations::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("security_events_actor_user_id_fkey")
                            .from(SecurityEvents::Table, SecurityEvents::ActorUserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("security_events_target_user_id_fkey")
                            .from(SecurityEvents::Table, SecurityEvents::TargetUserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        create_index(
            manager,
            "security_events_organization_created_at_idx",
            SecurityEvents::Table,
            [SecurityEvents::OrganizationId, SecurityEvents::CreatedAt],
        )
        .await?;
        create_index(
            manager,
            "security_events_actor_created_at_idx",
            SecurityEvents::Table,
            [SecurityEvents::ActorUserId, SecurityEvents::CreatedAt],
        )
        .await?;
        create_index(
            manager,
            "security_events_type_idx",
            SecurityEvents::Table,
            [SecurityEvents::EventType],
        )
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(SecurityEvents::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await
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

fn json<T: Iden + 'static>(name: T) -> ColumnDef {
    ColumnDef::new(name)
        .json_binary()
        .not_null()
        .default(Expr::cust("'{}'::jsonb"))
        .to_owned()
}

async fn create_index<T, C, I>(
    manager: &SchemaManager<'_>,
    name: &str,
    table: T,
    columns: I,
) -> Result<(), DbErr>
where
    T: Iden + Copy + 'static,
    C: Iden + Copy + 'static,
    I: IntoIterator<Item = C>,
{
    let mut index = Index::create();
    index.name(name).table(table).if_not_exists();
    for column in columns {
        index.col(column);
    }
    manager.create_index(index.to_owned()).await
}

#[derive(Copy, Clone, Iden)]
enum Users {
    Table,
    Id,
}

#[derive(Copy, Clone, Iden)]
enum Organizations {
    Table,
    Id,
}

#[derive(Copy, Clone, Iden)]
enum SecurityEvents {
    Table,
    Id,
    OrganizationId,
    ActorUserId,
    TargetUserId,
    EventType,
    IpAddress,
    UserAgent,
    Metadata,
    CreatedAt,
}
