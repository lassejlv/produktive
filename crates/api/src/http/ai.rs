use crate::{ai_models::AI_MODELS, auth::require_auth, error::ApiError, state::AppState};
use axum::{
    extract::State,
    http::HeaderMap,
    routing::get,
    Json, Router,
};
use serde::Serialize;

pub fn routes() -> Router<AppState> {
    Router::new().route("/models", get(list_models))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelEntry {
    id: &'static str,
    name: &'static str,
    is_default: bool,
    requires_pro: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelsResponse {
    models: Vec<ModelEntry>,
    default_id: String,
}

async fn list_models(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ModelsResponse>, ApiError> {
    require_auth(&headers, &state).await?;

    let default_id = state.config.ai_model.clone();
    let models = AI_MODELS
        .iter()
        .map(|model| {
            let is_default = model.id == default_id;
            ModelEntry {
                id: model.id,
                name: model.name,
                is_default,
                requires_pro: !is_default,
            }
        })
        .collect();

    Ok(Json(ModelsResponse {
        models,
        default_id,
    }))
}
