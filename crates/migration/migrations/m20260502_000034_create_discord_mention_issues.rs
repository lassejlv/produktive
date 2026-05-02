use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(DiscordMentionIssues::Table)
                    .if_not_exists()
                    .col(text_pk(DiscordMentionIssues::Id))
                    .col(text(DiscordMentionIssues::GuildId))
                    .col(text(DiscordMentionIssues::ChannelId))
                    .col(text(DiscordMentionIssues::MessageId))
                    .col(text_null(DiscordMentionIssues::IssueId))
                    .col(timestamp(DiscordMentionIssues::CreatedAt))
                    .col(timestamp(DiscordMentionIssues::UpdatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .name("discord_mention_issues_issue_id_fkey")
                            .from(DiscordMentionIssues::Table, DiscordMentionIssues::IssueId)
                            .to(Issues::Table, Issues::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("discord_mention_issues_message_key")
                    .table(DiscordMentionIssues::Table)
                    .col(DiscordMentionIssues::GuildId)
                    .col(DiscordMentionIssues::MessageId)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(DiscordMentionIssues::Table)
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
        .to_owned()
}

#[derive(DeriveIden)]
enum DiscordMentionIssues {
    Table,
    Id,
    GuildId,
    ChannelId,
    MessageId,
    IssueId,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum Issues {
    Table,
    Id,
}
