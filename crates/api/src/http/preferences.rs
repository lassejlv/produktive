use crate::{auth::require_auth, error::ApiError, state::AppState};
use axum::{extract::State, http::HeaderMap, routing::get, Json, Router};
use chrono::Utc;
use produktive_entity::notification_preference;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new().route("/", get(get_preferences).patch(patch_preferences))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreferencesResponse {
    pub email_paused: bool,
    pub email_assignments: bool,
    pub email_comments: bool,
}

impl From<notification_preference::Model> for PreferencesResponse {
    fn from(model: notification_preference::Model) -> Self {
        Self {
            email_paused: model.email_paused,
            email_assignments: model.email_assignments,
            email_comments: model.email_comments,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreferencesPatch {
    pub email_paused: Option<bool>,
    pub email_assignments: Option<bool>,
    pub email_comments: Option<bool>,
}

pub async fn for_user(
    state: &AppState,
    user_id: &str,
) -> Result<notification_preference::Model, ApiError> {
    if let Some(existing) = notification_preference::Entity::find()
        .filter(notification_preference::Column::UserId.eq(user_id))
        .one(&state.db)
        .await?
    {
        return Ok(existing);
    }

    let now = Utc::now().fixed_offset();
    let created = notification_preference::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        user_id: Set(user_id.to_owned()),
        email_paused: Set(false),
        email_assignments: Set(true),
        email_comments: Set(true),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    Ok(created)
}

async fn get_preferences(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<PreferencesResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let prefs = for_user(&state, &auth.user.id).await?;
    Ok(Json(prefs.into()))
}

async fn patch_preferences(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<PreferencesPatch>,
) -> Result<Json<PreferencesResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let existing = for_user(&state, &auth.user.id).await?;
    let mut active = existing.into_active_model();
    if let Some(value) = payload.email_paused {
        active.email_paused = Set(value);
    }
    if let Some(value) = payload.email_assignments {
        active.email_assignments = Set(value);
    }
    if let Some(value) = payload.email_comments {
        active.email_comments = Set(value);
    }
    active.updated_at = Set(Utc::now().fixed_offset());
    let updated = active.update(&state.db).await?;
    Ok(Json(updated.into()))
}
