use crate::config::Config;
use autumn_rs::Autumn;
use produktive_ai::AiClient;
use sea_orm::DatabaseConnection;

#[derive(Clone)]
pub struct AppState {
    pub db: DatabaseConnection,
    pub config: Config,
    pub ai: AiClient,
    pub autumn: Autumn,
}

impl AppState {
    pub fn new(db: DatabaseConnection, config: Config, ai: AiClient, autumn: Autumn) -> Self {
        Self {
            db,
            config,
            ai,
            autumn,
        }
    }
}
