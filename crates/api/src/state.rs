use std::{future::Future, sync::Arc, time::Duration};

use anyhow::{anyhow, Context};
use redis::aio::ConnectionManager;
use reqwest::Client;
use sea_orm::DatabaseConnection;
use tokio::sync::Semaphore;

use email::EmailClient;
use polar::Polar;

use crate::{
    billing::Billing, config::Config, logstore::NarrowLogs,
    status_summary_cache::StatusSummaryCache,
};

const REDIS_CONNECT_TIMEOUT: Duration = Duration::from_secs(3);

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
    pub status_summary_cache: StatusSummaryCache,
    /// NarrowDB-backed log storage. `None` disables every log-storage handler
    /// (they return a 503), keeping the no-logs deployment path working.
    pub narrow: Option<Arc<NarrowLogs>>,
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
            match redis_connect_with_timeout(client.get_connection_manager()).await {
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
        let narrow = build_narrow(&config);
        Ok(Self {
            db,
            config,
            http,
            redis,
            email,
            check_semaphore,
            billing,
            status_summary_cache: StatusSummaryCache::default(),
            narrow,
        })
    }
}

/// Build the NarrowDB log store. Log storage is optional: it is only enabled
/// when both `NARROWDB_URL` and `NARROWDB_TOKEN` are present. A failure to
/// construct the client disables logs rather than failing startup.
fn build_narrow(config: &Config) -> Option<Arc<NarrowLogs>> {
    let (url, token) = match (config.narrowdb_url.as_ref(), config.narrowdb_token.as_ref()) {
        (Some(url), Some(token)) => (url, token),
        _ => {
            tracing::warn!("NARROWDB_URL/NARROWDB_TOKEN not set; log storage is disabled");
            return None;
        }
    };
    match NarrowLogs::new(url, token) {
        Ok(narrow) => {
            tracing::info!("NarrowDB log storage initialized");
            Some(Arc::new(narrow))
        }
        Err(e) => {
            tracing::error!(error = %e, "failed to initialize NarrowDB client; log storage disabled");
            None
        }
    }
}

async fn redis_connect_with_timeout<F>(future: F) -> anyhow::Result<ConnectionManager>
where
    F: Future<Output = redis::RedisResult<ConnectionManager>>,
{
    tokio::time::timeout(REDIS_CONNECT_TIMEOUT, future)
        .await
        .map_err(|_| {
            anyhow!(
                "redis connection timed out after {:?}",
                REDIS_CONNECT_TIMEOUT
            )
        })?
        .context("connect redis")
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
