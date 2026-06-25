mod auth;
mod billing;
mod config;
mod custom_domain_sweep;
mod error;
mod http;
mod logstore;
mod middleware;
mod notification_webhook;
mod openapi;
mod rate_limit;
mod regions;
mod scheduler;
mod slug;
mod state;
mod status_summary_cache;
mod target;

use anyhow::Result;
use axum::{http::HeaderValue, routing::get, Router};
use migration::{Migrator, MigratorTrait};
use sea_orm::{ConnectOptions, Database};
use std::net::SocketAddr;
use std::time::Duration;
use tower_http::{
    catch_panic::CatchPanicLayer,
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter, Layer};

use crate::{config::Config, state::AppState};

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();
    init_tracing();

    let config = Config::from_env()?;

    tracing::info!("running migrations");
    let migration_db = Database::connect(&config.database_url).await?;
    Migrator::up(&migration_db, None).await?;
    migration_db.close().await?;

    let mut opt = ConnectOptions::new(config.database_pooled_url.clone());
    opt.max_connections(20)
        .min_connections(2)
        .connect_timeout(Duration::from_secs(8))
        .acquire_timeout(Duration::from_secs(8))
        .idle_timeout(Duration::from_secs(60))
        .sqlx_logging(false);
    let db = Database::connect(opt).await?;

    let state = AppState::new(db, config.clone()).await?;

    scheduler::spawn(state.clone());
    auth::session_cleanup::spawn(state.clone());
    billing::sweep::spawn(state.clone());
    custom_domain_sweep::spawn(state.clone());

    let ws_scoped = Router::new()
        .merge(http::workspaces::scoped_routes())
        .nest("/members", http::members::routes())
        .nest("/invites", http::invites::owner_routes())
        .nest("/incidents", http::incidents::routes())
        .nest("/monitors", http::monitors::routes())
        .nest("/notifications", http::notifications::routes())
        .nest("/logs", http::logs::workspace_routes(state.clone()))
        .nest("/custom-domains", http::custom_domains::routes())
        .nest("/deployments", http::deployments::routes(state.clone()))
        .nest("/billing", http::billing::routes())
        .nest("/regions", http::regions::routes())
        .merge(http::checks::routes())
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            middleware::workspace_guard,
        ));

    let api = Router::new()
        .route("/health", get(http::health::health))
        .merge(openapi::routes())
        .nest("/auth", auth::routes::routes())
        .nest("/admin", http::admin::routes())
        .nest("/workspaces", http::workspaces::top_routes())
        .nest("/workspaces/{wid}", ws_scoped)
        .nest("/invites", http::invites::lookup_routes())
        .nest(
            "/public/custom-domains",
            http::custom_domains::public_routes(),
        )
        .nest("/public", http::public_status::routes())
        .nest("/pricing", http::pricing::routes())
        .nest("/logs", http::logs::ingest_routes())
        .nest("/webhooks", http::webhooks::routes())
        .nest("/internal/workers", http::internal_workers::routes());

    let spa_state = state.clone();
    let mut app = Router::new()
        .nest("/api", api)
        .merge(http::public_status::page_routes())
        .layer(TraceLayer::new_for_http())
        .layer(CatchPanicLayer::new())
        .layer(cors_layer(&config)?)
        .with_state(state);

    if let Some(dir) = config.web_dist_dir.as_ref() {
        let index = dir.join("index.html");
        let serve_dir = ServeDir::new(dir).fallback(ServeFile::new(&index));
        tracing::info!(path = %dir.display(), "serving web frontend");
        // Public status-page HTML goes through per-workspace <title>/OG meta
        // injection; everything else falls through to the static dist dir.
        match std::fs::read_to_string(&index) {
            Ok(html) => {
                app = app.merge(http::spa_meta::routes(html).with_state(spa_state));
            }
            Err(err) => {
                tracing::warn!(%err, "could not read index.html; status-page meta injection disabled");
            }
        }
        app = app.fallback_service(serve_dir);
    } else {
        tracing::info!("WEB_DIST_DIR not set or index.html missing; static frontend disabled");
    }

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "produktive listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

fn cors_layer(config: &Config) -> Result<CorsLayer> {
    if config.cors_allowed_origins.is_empty() {
        tracing::warn!("CORS_ALLOWED_ORIGINS not set; cross-origin browser requests are disabled");
        return Ok(CorsLayer::new());
    }

    let origins = config
        .cors_allowed_origins
        .iter()
        .map(|origin| origin.parse::<HeaderValue>())
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::PATCH,
            axum::http::Method::DELETE,
            axum::http::Method::OPTIONS,
        ])
        .allow_headers([
            axum::http::header::AUTHORIZATION,
            axum::http::header::CONTENT_TYPE,
        ]))
}

fn init_tracing() {
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("produktive_api=info,tower_http=info,sea_orm=warn"));

    tracing_subscriber::registry()
        .with(fmt::layer().compact().with_filter(env_filter))
        .init();
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let term = async {
        use tokio::signal::unix::{signal, SignalKind};
        if let Ok(mut sig) = signal(SignalKind::terminate()) {
            sig.recv().await;
        } else {
            std::future::pending::<()>().await;
        }
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = term => {},
    }
    tracing::info!("shutdown signal received");
}
