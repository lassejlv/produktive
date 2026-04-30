use crate::{
    auth::require_auth,
    digest::{trigger_for_user, TriggerOutcome},
    error::ApiError,
    state::AppState,
};
use axum::{extract::State, http::HeaderMap, routing::post, Json, Router};

pub fn routes() -> Router<AppState> {
    Router::new().route("/send-progress", post(send_progress))
}

async fn send_progress(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<TriggerOutcome>, ApiError> {
    if !state.config.enable_dev_triggers {
        return Err(ApiError::NotFound("Not found".into()));
    }
    let auth = require_auth(&headers, &state).await?;
    tracing::info!(user_id = %auth.user.id, "dev trigger: send-progress");
    let outcome = trigger_for_user(&state, &auth.user.id).await?;
    Ok(Json(outcome))
}
