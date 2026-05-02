use crate::config::Config;
use produktive_ai::AiClient;
use sea_orm::DatabaseConnection;
use unkey_rs::Unkey;

#[derive(Clone)]
pub struct AppState {
    pub db: DatabaseConnection,
    pub config: Config,
    pub ai: AiClient,
    pub unkey: Unkey,
}

impl AppState {
    pub fn new(db: DatabaseConnection, config: Config, ai: AiClient, unkey: Unkey) -> Self {
        Self {
            db,
            config,
            ai,
            unkey,
        }
    }
}
