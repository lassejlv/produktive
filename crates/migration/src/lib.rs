pub use sea_orm_migration::prelude::*;

#[path = "../migrations/m20260427_000001_create_app_schema.rs"]
mod m20260427_000001_create_app_schema;
#[path = "../migrations/m20260427_000002_add_email_auth_flows.rs"]
mod m20260427_000002_add_email_auth_flows;
#[path = "../migrations/m20260427_000003_create_waitlist.rs"]
mod m20260427_000003_create_waitlist;
#[path = "../migrations/m20260427_000004_create_chats_and_messages.rs"]
mod m20260427_000004_create_chats_and_messages;
#[path = "../migrations/m20260428_000005_add_issue_attachments.rs"]
mod m20260428_000005_add_issue_attachments;
#[path = "../migrations/m20260428_000006_create_issue_events.rs"]
mod m20260428_000006_create_issue_events;
#[path = "../migrations/m20260428_000007_create_favorites.rs"]
mod m20260428_000007_create_favorites;
#[path = "../migrations/m20260428_000008_create_issue_comments.rs"]
mod m20260428_000008_create_issue_comments;
#[path = "../migrations/m20260428_000009_create_issue_subscribers.rs"]
mod m20260428_000009_create_issue_subscribers;
#[path = "../migrations/m20260428_000010_add_issue_parent.rs"]
mod m20260428_000010_add_issue_parent;
#[path = "../migrations/m20260428_000011_create_notifications.rs"]
mod m20260428_000011_create_notifications;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260427_000001_create_app_schema::Migration),
            Box::new(m20260427_000002_add_email_auth_flows::Migration),
            Box::new(m20260427_000003_create_waitlist::Migration),
            Box::new(m20260427_000004_create_chats_and_messages::Migration),
            Box::new(m20260428_000005_add_issue_attachments::Migration),
            Box::new(m20260428_000006_create_issue_events::Migration),
            Box::new(m20260428_000007_create_favorites::Migration),
            Box::new(m20260428_000008_create_issue_comments::Migration),
            Box::new(m20260428_000009_create_issue_subscribers::Migration),
            Box::new(m20260428_000010_add_issue_parent::Migration),
            Box::new(m20260428_000011_create_notifications::Migration),
        ]
    }
}
