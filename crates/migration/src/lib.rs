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
#[path = "../migrations/m20260428_000012_create_notification_preferences.rs"]
mod m20260428_000012_create_notification_preferences;
#[path = "../migrations/m20260428_000013_create_invitations.rs"]
mod m20260428_000013_create_invitations;
#[path = "../migrations/m20260428_000014_create_projects.rs"]
mod m20260428_000014_create_projects;
#[path = "../migrations/m20260428_000015_add_issue_project.rs"]
mod m20260428_000015_add_issue_project;
#[path = "../migrations/m20260428_000016_create_labels.rs"]
mod m20260428_000016_create_labels;
#[path = "../migrations/m20260428_000017_create_issue_labels.rs"]
mod m20260428_000017_create_issue_labels;
#[path = "../migrations/m20260429_000018_create_mcp_servers.rs"]
mod m20260429_000018_create_mcp_servers;
#[path = "../migrations/m20260429_000019_add_mcp_oauth_token_url.rs"]
mod m20260429_000019_add_mcp_oauth_token_url;
#[path = "../migrations/m20260429_000020_add_mcp_oauth_clients.rs"]
mod m20260429_000020_add_mcp_oauth_clients;
#[path = "../migrations/m20260429_000021_create_organization_subscriptions.rs"]
mod m20260429_000021_create_organization_subscriptions;
#[path = "../migrations/m20260430_000022_create_mcp_api_keys.rs"]
mod m20260430_000022_create_mcp_api_keys;
#[path = "../migrations/m20260501_000023_add_user_onboarding.rs"]
mod m20260501_000023_add_user_onboarding;
#[path = "../migrations/m20260501_000024_create_github_integration.rs"]
mod m20260501_000024_create_github_integration;
#[path = "../migrations/m20260501_000025_create_github_repositories.rs"]
mod m20260501_000025_create_github_repositories;
#[path = "../migrations/m20260501_000026_add_progress_email_columns.rs"]
mod m20260501_000026_add_progress_email_columns;
#[path = "../migrations/m20260501_000027_add_user_tabs.rs"]
mod m20260501_000027_add_user_tabs;
#[path = "../migrations/m20260501_000028_add_github_import_locks.rs"]
mod m20260501_000028_add_github_import_locks;
#[path = "../migrations/m20260501_000029_add_unkey_api_key_columns.rs"]
mod m20260501_000029_add_unkey_api_key_columns;
#[path = "../migrations/m20260501_000030_create_produktive_oauth.rs"]
mod m20260501_000030_create_produktive_oauth;
#[path = "../migrations/m20260501_000031_create_billing_usage_events.rs"]
mod m20260501_000031_create_billing_usage_events;
#[path = "../migrations/m20260501_000032_add_subscription_period_start.rs"]
mod m20260501_000032_add_subscription_period_start;
#[path = "../migrations/m20260502_000033_create_discord_integration.rs"]
mod m20260502_000033_create_discord_integration;
#[path = "../migrations/m20260502_000034_create_discord_mention_issues.rs"]
mod m20260502_000034_create_discord_mention_issues;
#[path = "../migrations/m20260502_000035_create_organization_roles.rs"]
mod m20260502_000035_create_organization_roles;
#[path = "../migrations/m20260502_000036_add_organization_image.rs"]
mod m20260502_000036_add_organization_image;
#[path = "../migrations/m20260502_000037_create_issue_statuses.rs"]
mod m20260502_000037_create_issue_statuses;
#[path = "../migrations/m20260502_000038_add_sidebar_layout.rs"]
mod m20260502_000038_add_sidebar_layout;
#[path = "../migrations/m20260503_000039_create_chat_access.rs"]
mod m20260503_000039_create_chat_access;
#[path = "../migrations/m20260503_000040_create_slack_integration.rs"]
mod m20260503_000040_create_slack_integration;
#[path = "../migrations/m20260505_000041_create_platform_admin.rs"]
mod m20260505_000041_create_platform_admin;
#[path = "../migrations/m20260505_000042_create_notes.rs"]
mod m20260505_000042_create_notes;
#[path = "../migrations/m20260505_000043_add_note_folders_and_visibility.rs"]
mod m20260505_000043_add_note_folders_and_visibility;
#[path = "../migrations/m20260505_000044_add_note_versions.rs"]
mod m20260505_000044_add_note_versions;

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
            Box::new(m20260428_000012_create_notification_preferences::Migration),
            Box::new(m20260428_000013_create_invitations::Migration),
            Box::new(m20260428_000014_create_projects::Migration),
            Box::new(m20260428_000015_add_issue_project::Migration),
            Box::new(m20260428_000016_create_labels::Migration),
            Box::new(m20260428_000017_create_issue_labels::Migration),
            Box::new(m20260429_000018_create_mcp_servers::Migration),
            Box::new(m20260429_000019_add_mcp_oauth_token_url::Migration),
            Box::new(m20260429_000020_add_mcp_oauth_clients::Migration),
            Box::new(m20260429_000021_create_organization_subscriptions::Migration),
            Box::new(m20260430_000022_create_mcp_api_keys::Migration),
            Box::new(m20260501_000023_add_user_onboarding::Migration),
            Box::new(m20260501_000024_create_github_integration::Migration),
            Box::new(m20260501_000025_create_github_repositories::Migration),
            Box::new(m20260501_000026_add_progress_email_columns::Migration),
            Box::new(m20260501_000027_add_user_tabs::Migration),
            Box::new(m20260501_000028_add_github_import_locks::Migration),
            Box::new(m20260501_000029_add_unkey_api_key_columns::Migration),
            Box::new(m20260501_000030_create_produktive_oauth::Migration),
            Box::new(m20260501_000031_create_billing_usage_events::Migration),
            Box::new(m20260501_000032_add_subscription_period_start::Migration),
            Box::new(m20260502_000033_create_discord_integration::Migration),
            Box::new(m20260502_000034_create_discord_mention_issues::Migration),
            Box::new(m20260502_000035_create_organization_roles::Migration),
            Box::new(m20260502_000036_add_organization_image::Migration),
            Box::new(m20260502_000037_create_issue_statuses::Migration),
            Box::new(m20260502_000038_add_sidebar_layout::Migration),
            Box::new(m20260503_000039_create_chat_access::Migration),
            Box::new(m20260503_000040_create_slack_integration::Migration),
            Box::new(m20260505_000041_create_platform_admin::Migration),
            Box::new(m20260505_000042_create_notes::Migration),
            Box::new(m20260505_000043_add_note_folders_and_visibility::Migration),
            Box::new(m20260505_000044_add_note_versions::Migration),
        ]
    }
}
