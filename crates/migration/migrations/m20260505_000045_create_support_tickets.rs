use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(SupportTickets::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(SupportTickets::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(SupportTickets::Number).string().not_null())
                    .col(ColumnDef::new(SupportTickets::Subject).text().not_null())
                    .col(ColumnDef::new(SupportTickets::Status).string().not_null())
                    .col(ColumnDef::new(SupportTickets::Priority).string().not_null())
                    .col(
                        ColumnDef::new(SupportTickets::CustomerEmail)
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(SupportTickets::CustomerName).string().null())
                    .col(
                        ColumnDef::new(SupportTickets::AssignedAdminId)
                            .string()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(SupportTickets::LastMessageAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(SupportTickets::ClosedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(SupportTickets::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(SupportTickets::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("support_tickets_assigned_admin_id_fkey")
                            .from(SupportTickets::Table, SupportTickets::AssignedAdminId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("support_tickets_number_key")
                    .table(SupportTickets::Table)
                    .col(SupportTickets::Number)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("support_tickets_status_last_idx")
                    .table(SupportTickets::Table)
                    .col(SupportTickets::Status)
                    .col((SupportTickets::LastMessageAt, IndexOrder::Desc))
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("support_tickets_customer_idx")
                    .table(SupportTickets::Table)
                    .col(SupportTickets::CustomerEmail)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(SupportMessages::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(SupportMessages::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(SupportMessages::TicketId)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SupportMessages::Direction)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SupportMessages::FromEmail)
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(SupportMessages::ToEmail).string().not_null())
                    .col(
                        ColumnDef::new(SupportMessages::Cc)
                            .json_binary()
                            .not_null()
                            .default(Expr::cust("'[]'::jsonb")),
                    )
                    .col(ColumnDef::new(SupportMessages::Subject).text().not_null())
                    .col(ColumnDef::new(SupportMessages::BodyText).text().null())
                    .col(ColumnDef::new(SupportMessages::BodyHtml).text().null())
                    .col(ColumnDef::new(SupportMessages::MessageId).string().null())
                    .col(ColumnDef::new(SupportMessages::InReplyTo).string().null())
                    .col(ColumnDef::new(SupportMessages::References).text().null())
                    .col(
                        ColumnDef::new(SupportMessages::RawObjectKey)
                            .string()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(SupportMessages::SentByAdminId)
                            .string()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(SupportMessages::DeliveryStatus)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SupportMessages::DeliveryProviderId)
                            .string()
                            .null(),
                    )
                    .col(ColumnDef::new(SupportMessages::DeliveryError).text().null())
                    .col(
                        ColumnDef::new(SupportMessages::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(SupportMessages::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("support_messages_ticket_id_fkey")
                            .from(SupportMessages::Table, SupportMessages::TicketId)
                            .to(SupportTickets::Table, SupportTickets::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("support_messages_sent_by_admin_id_fkey")
                            .from(SupportMessages::Table, SupportMessages::SentByAdminId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("support_messages_ticket_created_idx")
                    .table(SupportMessages::Table)
                    .col(SupportMessages::TicketId)
                    .col(SupportMessages::CreatedAt)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("support_messages_message_id_idx")
                    .table(SupportMessages::Table)
                    .col(SupportMessages::MessageId)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(SupportTicketEvents::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(SupportTicketEvents::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(SupportTicketEvents::TicketId)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SupportTicketEvents::ActorAdminId)
                            .string()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(SupportTicketEvents::EventType)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SupportTicketEvents::Metadata)
                            .json_binary()
                            .not_null()
                            .default(Expr::cust("'{}'::jsonb")),
                    )
                    .col(
                        ColumnDef::new(SupportTicketEvents::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("support_ticket_events_ticket_id_fkey")
                            .from(SupportTicketEvents::Table, SupportTicketEvents::TicketId)
                            .to(SupportTickets::Table, SupportTickets::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("support_ticket_events_actor_admin_id_fkey")
                            .from(
                                SupportTicketEvents::Table,
                                SupportTicketEvents::ActorAdminId,
                            )
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("support_ticket_events_ticket_created_idx")
                    .table(SupportTicketEvents::Table)
                    .col(SupportTicketEvents::TicketId)
                    .col(SupportTicketEvents::CreatedAt)
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
                    .table(SupportTicketEvents::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(SupportMessages::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(SupportTickets::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        Ok(())
    }
}

#[derive(Copy, Clone, Iden)]
enum SupportTickets {
    Table,
    Id,
    Number,
    Subject,
    Status,
    Priority,
    CustomerEmail,
    CustomerName,
    AssignedAdminId,
    LastMessageAt,
    ClosedAt,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum SupportMessages {
    Table,
    Id,
    TicketId,
    Direction,
    FromEmail,
    ToEmail,
    Cc,
    Subject,
    BodyText,
    BodyHtml,
    MessageId,
    InReplyTo,
    References,
    RawObjectKey,
    SentByAdminId,
    DeliveryStatus,
    DeliveryProviderId,
    DeliveryError,
    CreatedAt,
    UpdatedAt,
}

#[derive(Copy, Clone, Iden)]
enum SupportTicketEvents {
    Table,
    Id,
    TicketId,
    ActorAdminId,
    EventType,
    Metadata,
    CreatedAt,
}

#[derive(Copy, Clone, Iden)]
enum Users {
    Table,
    Id,
}
