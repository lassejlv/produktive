pub use sea_orm_migration::prelude::*;

#[path = "../migrations/m20260427_000001_create_app_schema.rs"]
mod m20260427_000001_create_app_schema;
#[path = "../migrations/m20260427_000002_add_email_auth_flows.rs"]
mod m20260427_000002_add_email_auth_flows;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260427_000001_create_app_schema::Migration),
            Box::new(m20260427_000002_add_email_auth_flows::Migration),
        ]
    }
}
