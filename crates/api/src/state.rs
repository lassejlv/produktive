use crate::config::Config;
use produktive_ai::AiClient;
use sea_orm::DatabaseConnection;

#[derive(Clone)]
pub struct AppState {
    pub db: DatabaseConnection,
    pub config: Config,
    pub ai: AiClient,
}

impl AppState {
    pub fn new(db: DatabaseConnection, config: Config, ai: AiClient) -> Self {
        Self { db, config, ai }
    }
}
