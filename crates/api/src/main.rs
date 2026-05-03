mod agent_tools;
mod ai_models;
mod auth;
mod config;
mod digest;
mod email;
mod error;
mod http;
mod integration_actions;
mod issue_helpers;
mod issue_history;
mod mcp;
mod permissions;
mod state;
mod storage;

use anyhow::Context;
use axum::{
    extract::Request,
    http::{
        header::{CACHE_CONTROL, CONTENT_TYPE},
        HeaderValue, StatusCode,
    },
    middleware::{self, Next},
    response::Response,
    Router,
};
use config::{Config, DatabaseConfig};
use http::{
    ai_mcp_routes, ai_routes, auth_routes, chat_routes, cors_layer, dev_routes, discord_routes,
    favorite_routes, github_routes, inbox_routes, invitation_routes, issue_routes,
    issue_status_routes, label_routes, mcp_key_routes, member_routes, oauth_metadata_routes,
    oauth_routes, onboarding_routes, org_invitation_routes, preferences_routes, project_routes,
    public_api_routes, realtime_routes, role_routes, slack_routes, spawn_github_auto_importer,
    tabs_routes, unsubscribe_routes, waitlist_routes,
};
use produktive_ai::AiClient;
use sea_orm::Database;
use sea_orm_migration::MigratorTrait;
use state::AppState;
use tokio::net::TcpListener;
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use unkey_rs::{Unkey, UnkeyConfig};

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
    config.warn_if_insecure_cookie_settings();
    let db = Database::connect(&config.database_url)
        .await
        .context("failed to connect to database")?;

    let ai = AiClient::new(&config.ai_api_key, &config.ai_base_url)
        .map_err(|e| anyhow::anyhow!("failed to build AI client: {e}"))?;
    let mut unkey_config = UnkeyConfig::new(config.unkey_root_key.clone());
    if let Some(base_url) = &config.unkey_base_url {
        unkey_config = unkey_config.base_url(base_url);
    }
    let unkey = Unkey::with_config(unkey_config)
        .map_err(|e| anyhow::anyhow!("failed to build Unkey client: {e}"))?;
    let state = AppState::new(db, config.clone(), ai, unkey);
    spawn_github_auto_importer(state.clone());
    digest::spawn_progress_digest_scheduler(state.clone());
    let asset_service = ServeDir::new(format!("{}/assets", config.web_dist_dir));
    let spa_service = ServeDir::new(&config.web_dist_dir).fallback(ServeFile::new(format!(
        "{}/index.html",
        config.web_dist_dir
    )));
    let app = Router::new()
        .merge(oauth_metadata_routes())
        .nest("/api/auth", auth_routes())
        .nest("/api/oauth", oauth_routes())
        .nest("/api/v1", public_api_routes())
        .nest("/api/ai", ai_routes())
        .nest("/api/ai/mcp", ai_mcp_routes())
        .nest("/api/issues", issue_routes())
        .nest("/api/issue-statuses", issue_status_routes())
        .nest("/api/waitlist", waitlist_routes())
        .nest("/api/chats", chat_routes())
        .nest("/api/discord", discord_routes())
        .nest("/api/favorites", favorite_routes())
        .nest("/api/github", github_routes())
        .nest("/api/slack", slack_routes())
        .nest("/api/inbox", inbox_routes())
        .nest("/api/invitations", invitation_routes())
        .nest("/api/organizations/me", org_invitation_routes())
        .nest("/api/labels", label_routes())
        .nest("/api/api-keys", mcp_key_routes())
        .nest("/api/mcp", mcp_key_routes())
        .nest("/api/me/onboarding", onboarding_routes())
        .nest("/api/me/preferences", preferences_routes())
        .nest("/api/me/tabs", tabs_routes())
        .nest("/api/members", member_routes())
        .nest("/api/roles", role_routes())
        .nest("/api/projects", project_routes())
        .nest("/api/realtime", realtime_routes())
        .nest("/api/unsubscribe", unsubscribe_routes())
        .nest("/api/dev", dev_routes())
        .nest_service("/assets", asset_service)
        .fallback_service(spa_service)
        .layer(middleware::from_fn(cache_control_headers))
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

async fn cache_control_headers(request: Request, next: Next) -> Response {
    let path = request.uri().path().to_owned();
    let mut response = next.run(request).await;
    let cache_control = if path.starts_with("/assets/") {
        if response.status() == StatusCode::OK {
            Some(HeaderValue::from_static(
                "public, max-age=31536000, immutable",
            ))
        } else {
            Some(HeaderValue::from_static(
                "no-cache, no-store, must-revalidate",
            ))
        }
    } else if response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.starts_with("text/html"))
    {
        Some(HeaderValue::from_static(
            "no-cache, no-store, must-revalidate",
        ))
    } else {
        None
    };

    if let Some(cache_control) = cache_control {
        response.headers_mut().insert(CACHE_CONTROL, cache_control);
    }

    response
}

async fn shutdown_signal() {
    if let Err(error) = tokio::signal::ctrl_c().await {
        tracing::error!(%error, "failed to listen for shutdown signal");
    }
}
