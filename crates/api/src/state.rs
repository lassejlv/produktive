use crate::config::Config;
use sea_orm::DatabaseConnection;

#[derive(Clone)]
pub struct AppState {
    pub db: DatabaseConnection,
    pub config: Config,
}

impl AppState {
    pub fn new(db: DatabaseConnection, config: Config) -> Self {
        Self { db, config }
    }
}
