use crate::{auth::validate_email, error::ApiError, state::AppState};
use axum::{extract::State, routing::post, Json, Router};
use chrono::Utc;
use produktive_entity::waitlist;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new().route("/", post(join_waitlist))
}

#[derive(Deserialize)]
struct JoinWaitlistRequest {
    email: String,
}

#[derive(Serialize)]
struct OkResponse {
    ok: bool,
}

async fn join_waitlist(
    State(state): State<AppState>,
    Json(payload): Json<JoinWaitlistRequest>,
) -> Result<Json<OkResponse>, ApiError> {
    let email = validate_email(&payload.email)?;

    let existing = waitlist::Entity::find()
        .filter(waitlist::Column::Email.eq(&email))
        .one(&state.db)
        .await?;

    if existing.is_none() {
        waitlist::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            email: Set(email),
            created_at: Set(Utc::now().fixed_offset()),
        }
        .insert(&state.db)
        .await?;
    }

    Ok(Json(OkResponse { ok: true }))
}
