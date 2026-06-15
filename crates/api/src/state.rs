use std::{sync::Arc, time::Duration};

use redis::aio::ConnectionManager;
use reqwest::Client;
use sea_orm::DatabaseConnection;
use tokio::sync::Semaphore;

use email::EmailClient;
use polar::Polar;
use produktive_logging::{LogStore, LogStoreOptions};

use crate::{
    billing::Billing,
    config::Config,
    log_hot_cache::{LogHotCache, LogHotCacheOptions},
};

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
    pub email: EmailClient,
    pub check_semaphore: Arc<Semaphore>,
    pub billing: Option<Billing>,
    pub logs: LogStore,
    pub log_hot_cache: Option<LogHotCache>,
}

impl AppState {
    pub async fn new(db: DatabaseConnection, config: Config) -> anyhow::Result<Self> {
        let http = Client::builder()
            .user_agent("produktive/0.1")
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
        let email = build_email()?;
        let check_semaphore = Arc::new(Semaphore::new(config.scheduler_max_concurrent_checks));
        let billing = build_billing(&config).await;
        let log_hot_cache = build_log_hot_cache(&config).await;
        let logs = LogStore::new(LogStoreOptions {
            storage_uri: config.log_storage_uri.clone(),
            duckdb_path: config
                .log_duckdb_path
                .as_ref()
                .map(|path| path.display().to_string()),
            s3_region: config.log_s3_region.clone(),
            s3_endpoint: config.log_s3_endpoint.clone(),
            s3_access_key_id: config.log_s3_access_key_id.clone(),
            s3_secret_access_key: config.log_s3_secret_access_key.clone(),
        })?;
        Ok(Self {
            db,
            config,
            http,
            redis,
            email,
            check_semaphore,
            billing,
            logs,
            log_hot_cache,
        })
    }
}

fn build_email() -> anyhow::Result<EmailClient> {
    match email::EmailConfig::from_env()? {
        Some(config) => {
            let client = EmailClient::smtp(config)?;
            tracing::info!("SMTP email initialized");
            Ok(client)
        }
        None => {
            tracing::warn!("SMTP_HOST not set; transactional email is disabled");
            Ok(EmailClient::disabled())
        }
    }
}

/// Build the Polar billing integration. Billing is optional: a missing key,
/// an unreachable Polar, or an empty catalog all disable it gracefully rather
/// than failing startup.
async fn build_billing(config: &Config) -> Option<Billing> {
    let secret_key = config.polar_secret_key.as_ref()?;
    let mut builder = Polar::builder().secret_key(secret_key.clone());
    if let Some(base_url) = config.polar_base_url.as_ref() {
        builder = builder.base_url(base_url.clone());
    }
    let client = match builder.build() {
        Ok(client) => client,
        Err(e) => {
            tracing::error!(error = %e, "failed to initialize Polar client; billing disabled");
            return None;
        }
    };
    match Billing::load(client).await {
        Ok(Some(billing)) => {
            tracing::info!("Polar billing initialized");
            Some(billing)
        }
        Ok(None) => None,
        Err(e) => {
            tracing::error!(error = %e, "failed to load Polar catalog; billing disabled");
            None
        }
    }
}

async fn build_log_hot_cache(config: &Config) -> Option<LogHotCache> {
    let Some(url) = config.log_redis_url.as_ref() else {
        tracing::info!("LOG_REDIS_URL not set; log hot cache is disabled");
        return None;
    };
    match LogHotCache::connect(LogHotCacheOptions {
        url: url.clone(),
        ttl_seconds: config.log_redis_ttl_seconds,
        search_cache_ttl_seconds: config.log_search_cache_ttl_seconds,
        search_scan_limit: config.log_redis_search_scan_limit,
    })
    .await
    {
        Ok(cache) => {
            tracing::info!("log hot cache initialized");
            Some(cache)
        }
        Err(error) => {
            tracing::error!(error = ?error, "LOG_REDIS_URL configured but log hot cache is unavailable");
            None
        }
    }
}
