pub use sea_orm_migration::prelude::*;

mod m20260627_000001_create_log_events_hypertable;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![Box::new(
            m20260627_000001_create_log_events_hypertable::Migration,
        )]
    }
}
