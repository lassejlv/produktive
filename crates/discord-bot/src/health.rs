use anyhow::Context as _;
use axum::{routing::get, Json, Router};
use serde_json::{json, Value};
use tokio::net::TcpListener;

pub async fn serve_http(port: u16) -> anyhow::Result<()> {
    let app = Router::new().route("/status", get(status));
    let addr = format!("0.0.0.0:{port}");
    let listener = TcpListener::bind(&addr)
        .await
        .with_context(|| format!("failed to bind {addr}"))?;
    tracing::info!("Discord bot status server listening on http://{addr}");
    axum::serve(listener, app).await?;
    Ok(())
}

async fn status() -> Json<Value> {
    Json(json!({ "ok": true }))
}
