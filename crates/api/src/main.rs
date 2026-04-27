mod auth;
mod config;
mod email;
mod error;
mod http;
mod state;

use anyhow::Context;
use axum::Router;
use config::{Config, DatabaseConfig};
use http::{auth_routes, cors_layer, issue_routes, waitlist_routes};
use sea_orm::Database;
use sea_orm_migration::MigratorTrait;
use state::AppState;
use tokio::net::TcpListener;
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "produktive_api=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let database = DatabaseConfig::from_env()?;
    let migration_db = Database::connect(&database.database_direct_url)
        .await
        .context("failed to connect to migration database")?;

    produktive_migration::Migrator::up(&migration_db, None)
        .await
        .context("failed to run migrations")?;
    drop(migration_db);

    let config = Config::from_env()?;
    let db = Database::connect(&config.database_url)
        .await
        .context("failed to connect to database")?;

    let state = AppState::new(db, config.clone());
    let spa_service = ServeDir::new(&config.web_dist_dir).fallback(ServeFile::new(format!(
        "{}/index.html",
        config.web_dist_dir
    )));
    let app = Router::new()
        .nest("/api/auth", auth_routes())
        .nest("/api/issues", issue_routes())
        .nest("/api/waitlist", waitlist_routes())
        .fallback_service(spa_service)
        .layer(TraceLayer::new_for_http())
        .layer(cors_layer(&config))
        .with_state(state);

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = TcpListener::bind(&addr)
        .await
        .with_context(|| format!("failed to bind {addr}"))?;

    tracing::info!("API listening on http://{addr}");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("server failed")?;

    Ok(())
}

async fn shutdown_signal() {
    if let Err(error) = tokio::signal::ctrl_c().await {
        tracing::error!(%error, "failed to listen for shutdown signal");
    }
}
