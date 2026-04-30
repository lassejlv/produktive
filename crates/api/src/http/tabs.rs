use crate::{auth::require_auth, error::ApiError, state::AppState};
use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::{delete, get},
    Json, Router,
};
use chrono::Utc;
use produktive_entity::user_tab;
use sea_orm::{
    sea_query::OnConflict, ColumnTrait, Condition, EntityTrait, PaginatorTrait,
    QueryFilter, QueryOrder, QuerySelect, Set,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const MAX_TABS_PER_ORG: usize = 12;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_tabs).post(open_tab).delete(close_all_tabs))
        .route("/{id}", delete(close_tab))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabResponse {
    pub id: String,
    pub tab_type: String,
    pub target_id: String,
    pub title: String,
    pub opened_at: String,
}

impl From<user_tab::Model> for TabResponse {
    fn from(model: user_tab::Model) -> Self {
        Self {
            id: model.id,
            tab_type: model.tab_type,
            target_id: model.target_id,
            title: model.title,
            opened_at: model.opened_at.to_rfc3339(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenTabBody {
    pub tab_type: String,
    pub target_id: String,
    pub title: String,
}

async fn list_tabs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<TabResponse>>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let rows = user_tab::Entity::find()
        .filter(user_tab::Column::UserId.eq(&auth.user.id))
        .filter(user_tab::Column::OrganizationId.eq(&auth.organization.id))
        .order_by_asc(user_tab::Column::OpenedAt)
        .all(&state.db)
        .await?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

async fn open_tab(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<OpenTabBody>,
) -> Result<Json<TabResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;

    let tab_type = payload.tab_type.trim().to_owned();
    let target_id = payload.target_id.trim().to_owned();
    let title = payload.title.trim().to_owned();
    if tab_type.is_empty() || target_id.is_empty() || title.is_empty() {
        return Err(ApiError::BadRequest(
            "tabType, targetId, and title are required".into(),
        ));
    }
    if !matches!(tab_type.as_str(), "issue" | "project" | "chat") {
        return Err(ApiError::BadRequest(
            "tabType must be one of issue, project, chat".into(),
        ));
    }

    let now = Utc::now().fixed_offset();

    let on_conflict = OnConflict::columns([
        user_tab::Column::UserId,
        user_tab::Column::OrganizationId,
        user_tab::Column::TabType,
        user_tab::Column::TargetId,
    ])
    .update_columns([user_tab::Column::Title, user_tab::Column::OpenedAt])
    .to_owned();

    user_tab::Entity::insert(user_tab::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        user_id: Set(auth.user.id.clone()),
        organization_id: Set(auth.organization.id.clone()),
        tab_type: Set(tab_type.clone()),
        target_id: Set(target_id.clone()),
        title: Set(title.clone()),
        opened_at: Set(now),
    })
    .on_conflict(on_conflict)
    .exec(&state.db)
    .await?;

    let model = user_tab::Entity::find()
        .filter(user_tab::Column::UserId.eq(&auth.user.id))
        .filter(user_tab::Column::OrganizationId.eq(&auth.organization.id))
        .filter(user_tab::Column::TabType.eq(&tab_type))
        .filter(user_tab::Column::TargetId.eq(&target_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("tab vanished after upsert")))?;

    evict_overflow(&state, &auth.user.id, &auth.organization.id).await?;

    Ok(Json(model.into()))
}

async fn close_tab(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<()>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    user_tab::Entity::delete_many()
        .filter(user_tab::Column::Id.eq(&id))
        .filter(user_tab::Column::UserId.eq(&auth.user.id))
        .filter(user_tab::Column::OrganizationId.eq(&auth.organization.id))
        .exec(&state.db)
        .await?;
    Ok(Json(()))
}

async fn close_all_tabs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<()>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    user_tab::Entity::delete_many()
        .filter(user_tab::Column::UserId.eq(&auth.user.id))
        .filter(user_tab::Column::OrganizationId.eq(&auth.organization.id))
        .exec(&state.db)
        .await?;
    Ok(Json(()))
}

async fn evict_overflow(
    state: &AppState,
    user_id: &str,
    organization_id: &str,
) -> Result<(), ApiError> {
    let count = user_tab::Entity::find()
        .filter(user_tab::Column::UserId.eq(user_id))
        .filter(user_tab::Column::OrganizationId.eq(organization_id))
        .count(&state.db)
        .await?;
    if (count as usize) <= MAX_TABS_PER_ORG {
        return Ok(());
    }
    let overflow = (count as usize) - MAX_TABS_PER_ORG;
    let oldest = user_tab::Entity::find()
        .filter(user_tab::Column::UserId.eq(user_id))
        .filter(user_tab::Column::OrganizationId.eq(organization_id))
        .order_by_asc(user_tab::Column::OpenedAt)
        .limit(overflow as u64)
        .all(&state.db)
        .await?;
    if oldest.is_empty() {
        return Ok(());
    }
    let ids: Vec<String> = oldest.into_iter().map(|t| t.id).collect();
    user_tab::Entity::delete_many()
        .filter(
            Condition::all()
                .add(user_tab::Column::UserId.eq(user_id))
                .add(user_tab::Column::OrganizationId.eq(organization_id))
                .add(user_tab::Column::Id.is_in(ids)),
        )
        .exec(&state.db)
        .await?;
    Ok(())
}
