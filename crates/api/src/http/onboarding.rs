use crate::{
    auth::{require_auth, UserResponse},
    error::ApiError,
    state::AppState,
};
use axum::{extract::State, http::HeaderMap, routing::patch, Json, Router};
use chrono::Utc;
use produktive_entity::user;
use sea_orm::{ActiveModelTrait, IntoActiveModel, Set};
use serde::Deserialize;

pub fn routes() -> Router<AppState> {
    Router::new().route("/", patch(patch_onboarding))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingPatch {
    pub completed: Option<bool>,
    pub step: Option<String>,
}

async fn patch_onboarding(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<OnboardingPatch>,
) -> Result<Json<UserResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let now = Utc::now().fixed_offset();
    let mut active: user::ActiveModel = auth.user.clone().into_active_model();

    if let Some(completed) = payload.completed {
        active.onboarding_completed_at = Set(if completed { Some(now) } else { None });
    }
    if let Some(step) = payload.step {
        active.onboarding_step = Set(Some(step));
    }
    active.updated_at = Set(now);

    let updated = active.update(&state.db).await?;
    Ok(Json(updated.into()))
}
