use std::{future::Future, sync::Arc, time::Duration};

use anyhow::{anyhow, Context};
use redis::aio::ConnectionManager;
use reqwest::Client;
use sea_orm::DatabaseConnection;
use tokio::sync::Semaphore;

use email::EmailClient;
use polar::Polar;
use produktive_cloudflare::Cloudflare;
use sprites::SpritesClient;
use tigris::{SharedTigrisClient, TigrisClient, TigrisConfig};

use crate::{
    billing::Billing, config::Config, logstore::LokiLogs, status_summary_cache::StatusSummaryCache,
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
    /// Cloudflare for SaaS (custom hostnames). `None` disables the integration;
    /// custom domains then rely on DNS verification only (the pre-Cloudflare path).
    pub cloudflare: Option<Cloudflare>,
    pub status_summary_cache: StatusSummaryCache,
    /// Loki-backed log storage. `None` disables every log-storage handler
    /// (they return a 503), keeping the no-logs deployment path working.
    pub loki: Option<Arc<LokiLogs>>,
    /// Sprites.dev client for sandbox VMs. `None` when sandboxes are disabled
    /// or no token is configured.
    pub sprites: Option<Arc<SpritesClient>>,
    /// Tigris object storage client. `None` when object storage is disabled
    /// or platform credentials are missing.
    pub tigris: Option<SharedTigrisClient>,
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
        let cloudflare = build_cloudflare(&config);
        // Ensure the Cloudflare for SaaS fallback origin is configured. Idempotent
        // and best-effort: a failure only means the one-time origin wasn't
        // re-asserted, so log and carry on rather than failing startup.
        if let (Some(cf), Some(origin)) =
            (cloudflare.as_ref(), config.cf_fallback_origin.as_ref())
        {
            if let Err(e) = cf.set_fallback_origin(origin).await {
                tracing::warn!(error = %e, "failed to set Cloudflare fallback origin");
            }
        }
        let loki = build_loki(&config, http.clone());
        let sprites = build_sprites(&config).await;
        let tigris = build_tigris(&config, http.clone()).await;
        Ok(Self {
            db,
            config,
            http,
            redis,
            email,
            check_semaphore,
            billing,
            cloudflare,
            status_summary_cache: StatusSummaryCache::default(),
            loki,
            sprites,
            tigris,
        })
    }
}

/// Build the Loki log store, reusing the shared async HTTP client. Log storage
/// is optional: it is only enabled when `LOKI_URL` is set (`LOKI_TENANT` is
/// optional). A failure to construct the client disables logs rather than
/// failing startup.
fn build_loki(config: &Config, http: Client) -> Option<Arc<LokiLogs>> {
    let Some(url) = config.loki_url.as_ref() else {
        tracing::warn!("LOKI_URL not set; log storage is disabled");
        return None;
    };
    match LokiLogs::new(url, config.loki_tenant.clone(), http) {
        Ok(loki) => {
            tracing::info!("Loki log storage initialized");
            Some(Arc::new(loki))
        }
        Err(e) => {
            tracing::error!(error = %e, "failed to initialize Loki client; log storage disabled");
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

fn build_cloudflare(config: &Config) -> Option<Cloudflare> {
    let (Some(token), Some(zone)) = (config.cf_api_token.as_ref(), config.cf_zone_id.as_ref())
    else {
        tracing::warn!("CF_API_TOKEN/CF_ZONE_ID not set; Cloudflare custom hostnames disabled");
        return None;
    };
    let base_url = config
        .cf_base_url
        .clone()
        .unwrap_or_else(|| "https://api.cloudflare.com/client/v4".to_owned());
    match Cloudflare::new(token.clone(), zone.clone(), base_url) {
        Ok(client) => {
            tracing::info!("Cloudflare for SaaS initialized");
            Some(client)
        }
        Err(e) => {
            tracing::error!(error = %e, "failed to initialize Cloudflare client; custom hostnames disabled");
            None
        }
    }
}

/// Build the Sprites.dev client for sandbox VMs. Optional: disabled when
/// `SANDBOXES_ENABLED` is false or no token can be resolved.
async fn build_sprites(config: &Config) -> Option<Arc<SpritesClient>> {
    if !config.sandboxes_enabled {
        tracing::warn!("SANDBOXES_ENABLED=false; sandboxes are disabled");
        return None;
    }

    let token = if let Some(token) = config.sprites_token.clone() {
        token
    } else if let (Some(fly_token), Some(org)) =
        (config.fly_api_token.as_ref(), config.sprites_org.as_ref())
    {
        match SpritesClient::create_token_with_url(
            fly_token,
            org,
            None,
            &config.sprites_api_url,
        )
        .await
        {
            Ok(token) => token,
            Err(e) => {
                tracing::error!(error = %e, "failed to exchange Fly token for Sprites token; sandboxes disabled");
                return None;
            }
        }
    } else {
        tracing::warn!(
            "SPRITES_TOKEN not set and FLY_API_TOKEN/SPRITES_ORG unavailable; sandboxes disabled"
        );
        return None;
    };

    let client = if config.sprites_api_url == "https://api.sprites.dev" {
        SpritesClient::new(token)
    } else {
        SpritesClient::with_base_url(token, &config.sprites_api_url)
    };

    tracing::info!("Sprites sandboxes initialized");
    Some(Arc::new(client))
}

async fn build_tigris(config: &Config, http: Client) -> Option<SharedTigrisClient> {
    if !config.object_storage_enabled {
        tracing::warn!("OBJECT_STORAGE_ENABLED=false; object storage is disabled");
        return None;
    }
    let (Some(access_key_id), Some(secret_access_key)) = (
        config.tigris_access_key_id.as_ref(),
        config.tigris_secret_access_key.as_ref(),
    ) else {
        tracing::warn!(
            "TIGRIS_ACCESS_KEY_ID/TIGRIS_SECRET_ACCESS_KEY not set; object storage disabled"
        );
        return None;
    };
    let client = TigrisClient::new(
        TigrisConfig {
            access_key_id: access_key_id.clone(),
            secret_access_key: secret_access_key.clone(),
            s3_endpoint: config.tigris_s3_endpoint.clone(),
            iam_endpoint: config.tigris_iam_endpoint.clone(),
        },
        http,
    )
    .await;
    tracing::info!("Tigris object storage initialized");
    Some(Arc::new(client))
}
