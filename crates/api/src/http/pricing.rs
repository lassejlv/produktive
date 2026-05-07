use crate::state::AppState;
use axum::{
    http::header::{CACHE_CONTROL, CONTENT_TYPE},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde_json::Value;
use std::sync::LazyLock;

static PRICING: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../pricing.json"
    )))
    .expect("pricing.json must contain valid JSON")
});

pub fn routes() -> Router<AppState> {
    Router::new().route("/", get(get_pricing))
}

async fn get_pricing() -> impl IntoResponse {
    (
        [
            (CONTENT_TYPE, "application/json"),
            (CACHE_CONTROL, "public, max-age=300"),
        ],
        Json(&*PRICING),
    )
}
