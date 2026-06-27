use std::time::Duration;

use anyhow::Context;
use sea_orm::{ConnectOptions, Database, DatabaseConnection};

use crate::{config::Config, logstore::LogStore};

/// Connect to the log events TimescaleDB and wrap it in a [`LogStore`].
pub async fn build_log_store(config: &Config) -> Option<LogStore> {
    let Some(url) = config.log_database_pooled_url.as_ref() else {
        tracing::warn!("LOG_DATABASE_URL not set; log storage is disabled");
        return None;
    };

    let mut opt = ConnectOptions::new(url.clone());
    opt.max_connections(10)
        .min_connections(1)
        .connect_timeout(Duration::from_secs(8))
        .acquire_timeout(Duration::from_secs(8))
        .idle_timeout(Duration::from_secs(60))
        .sqlx_logging(false);

    match Database::connect(opt).await {
        Ok(db) => {
            tracing::info!("TimescaleDB log storage initialized");
            Some(LogStore::new(db))
        }
        Err(e) => {
            tracing::error!(error = %e, "failed to connect log database; log storage disabled");
            None
        }
    }
}

/// Direct connection for log DB migrations (non-pooled).
pub async fn connect_log_migration_db(config: &Config) -> anyhow::Result<DatabaseConnection> {
    let url = config
        .log_database_url
        .as_ref()
        .context("LOG_DATABASE_URL not set")?;
    Database::connect(url).await.map_err(Into::into)
}
