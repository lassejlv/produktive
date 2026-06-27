pub use sea_orm_migration::prelude::*;

pub mod m20260517_000001_create_users;
pub mod m20260517_000002_create_sessions;
pub mod m20260517_000003_create_workspaces;
pub mod m20260517_000004_create_monitors;
mod m20260517_000005_create_checks_hypertable;
mod m20260519_000006_add_monitor_canvas;
mod m20260519_000007_add_workspace_status_page;
mod m20260522_000008_add_monitor_dsl;
mod m20260522_000009_drop_monitor_dsl_ast;
mod m20260523_000010_add_app_slugs;
mod m20260523_000011_create_incidents;
mod m20260523_000012_create_notifications;
mod m20260523_000013_add_status_page_config;
mod m20260525_000014_create_custom_domains;
mod m20260525_000015_add_custom_domain_verification;
mod m20260601_000016_multi_region_workers;
mod m20260601_000017_rename_local_region_to_eu_west;
mod m20260601_000018_add_user_admin_flag;
mod m20260614_000019_create_polar_billing_state;
mod m20260614_000020_manual_incidents;
mod m20260615_000021_add_github_login;
mod m20260615_000022_create_log_projects;
mod m20260616_000023_create_log_access_requests;
mod m20260616_000024_add_usage_reset;
mod m20260616_000025_create_password_reset_tokens;
mod m20260619_000026_add_legal_terms_acceptance;
mod m20260621_000027_create_deployments;
mod m20260621_000028_create_deploy_log_lines;
mod m20260621_000029_create_deploy_service_domains;
mod m20260621_000030_add_deploy_retention_indexes;
mod m20260621_000031_add_deploy_service_management;
mod m20260625_000032_add_cloudflare_custom_hostname;
mod m20260625_000033_add_deploy_service_canvas;
mod m20260625_000034_add_deploy_usage_marker;
mod m20260625_000035_add_volume_provisioned_at;
mod m20260626_000036_create_deploy_sandboxes;
mod m20260626_000037_create_deploy_sandbox_api_tokens;
mod m20260626_000038_create_object_storage_buckets;
mod m20260627_000039_add_deployment_config_snapshot;
mod m20260627_000040_link_deploy_services_to_log_projects;
mod m20260627_000041_add_deploy_service_machine_count;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260517_000001_create_users::Migration),
            Box::new(m20260517_000002_create_sessions::Migration),
            Box::new(m20260517_000003_create_workspaces::Migration),
            Box::new(m20260517_000004_create_monitors::Migration),
            Box::new(m20260517_000005_create_checks_hypertable::Migration),
            Box::new(m20260519_000006_add_monitor_canvas::Migration),
            Box::new(m20260519_000007_add_workspace_status_page::Migration),
            Box::new(m20260522_000008_add_monitor_dsl::Migration),
            Box::new(m20260522_000009_drop_monitor_dsl_ast::Migration),
            Box::new(m20260523_000010_add_app_slugs::Migration),
            Box::new(m20260523_000011_create_incidents::Migration),
            Box::new(m20260523_000012_create_notifications::Migration),
            Box::new(m20260523_000013_add_status_page_config::Migration),
            Box::new(m20260525_000014_create_custom_domains::Migration),
            Box::new(m20260525_000015_add_custom_domain_verification::Migration),
            Box::new(m20260601_000016_multi_region_workers::Migration),
            Box::new(m20260601_000017_rename_local_region_to_eu_west::Migration),
            Box::new(m20260601_000018_add_user_admin_flag::Migration),
            Box::new(m20260614_000019_create_polar_billing_state::Migration),
            Box::new(m20260614_000020_manual_incidents::Migration),
            Box::new(m20260615_000021_add_github_login::Migration),
            Box::new(m20260615_000022_create_log_projects::Migration),
            Box::new(m20260616_000023_create_log_access_requests::Migration),
            Box::new(m20260616_000024_add_usage_reset::Migration),
            Box::new(m20260616_000025_create_password_reset_tokens::Migration),
            Box::new(m20260619_000026_add_legal_terms_acceptance::Migration),
            Box::new(m20260621_000027_create_deployments::Migration),
            Box::new(m20260621_000028_create_deploy_log_lines::Migration),
            Box::new(m20260621_000029_create_deploy_service_domains::Migration),
            Box::new(m20260621_000030_add_deploy_retention_indexes::Migration),
            Box::new(m20260621_000031_add_deploy_service_management::Migration),
            Box::new(m20260625_000032_add_cloudflare_custom_hostname::Migration),
            Box::new(m20260625_000033_add_deploy_service_canvas::Migration),
            Box::new(m20260625_000034_add_deploy_usage_marker::Migration),
            Box::new(m20260625_000035_add_volume_provisioned_at::Migration),
            Box::new(m20260626_000036_create_deploy_sandboxes::Migration),
            Box::new(m20260626_000037_create_deploy_sandbox_api_tokens::Migration),
            Box::new(m20260626_000038_create_object_storage_buckets::Migration),
            Box::new(m20260627_000039_add_deployment_config_snapshot::Migration),
            Box::new(m20260627_000040_link_deploy_services_to_log_projects::Migration),
            Box::new(m20260627_000041_add_deploy_service_machine_count::Migration),
        ]
    }
}
