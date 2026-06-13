use std::{sync::Arc, time::Duration};

use redis::aio::ConnectionManager;
use reqwest::Client;
use sea_orm::DatabaseConnection;
use tokio::sync::Semaphore;

use autumn::Autumn;

use crate::config::Config;

#[derive(Clone)]
pub enum RedisState {
    Disabled,
    Ready(ConnectionManager),
    Unavailable,
}

#[derive(Clone)]
pub struct AppState {
    pub db: DatabaseConnection,
    pub config: Config,
    pub http: Client,
    pub redis: RedisState,
    pub check_semaphore: Arc<Semaphore>,
    pub autumn: Option<Autumn>,
}

impl AppState {
    pub async fn new(db: DatabaseConnection, config: Config) -> anyhow::Result<Self> {
        let http = Client::builder()
            .user_agent("unstatus/0.1")
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(anyhow::Error::from)?;
        let redis = if let Some(url) = &config.redis_url {
            let client = redis::Client::open(url.as_str())?;
            match client.get_connection_manager().await {
                Ok(manager) => RedisState::Ready(manager),
                Err(e) => {
                    tracing::error!(error = ?e, "REDIS_URL configured but Redis is unavailable");
                    RedisState::Unavailable
                }
            }
        } else {
            tracing::warn!("REDIS_URL not set; auth rate limiting is disabled");
            RedisState::Disabled
        };
        let check_semaphore = Arc::new(Semaphore::new(config.scheduler_max_concurrent_checks));
        let autumn = build_autumn(&config)?;
        Ok(Self {
            db,
            config,
            http,
            redis,
            check_semaphore,
            autumn,
        })
    }
}

fn build_autumn(config: &Config) -> anyhow::Result<Option<Autumn>> {
    let Some(secret_key) = config.autumn_secret_key.as_ref() else {
        return Ok(None);
    };
    let mut builder = Autumn::builder().secret_key(secret_key.clone());
    if let Some(base_url) = config.autumn_base_url.as_ref() {
        builder = builder.base_url(base_url.clone());
    }
    if let Some(api_version) = config.autumn_api_version.as_ref() {
        builder = builder.api_version(api_version.clone());
    }
    match builder.build() {
        Ok(client) => {
            tracing::info!("Autumn billing client initialized");
            Ok(Some(client))
        }
        Err(e) => Err(anyhow::anyhow!(
            "failed to initialize Autumn billing client: {e}"
        )),
    }
}
