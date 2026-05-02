use crate::{auth::require_auth, error::ApiError, state::AppState};
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use produktive_entity::{chat, chat_access, favorite, issue, project};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter, QueryOrder, Set,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const TARGET_CHAT: &str = "chat";
const TARGET_ISSUE: &str = "issue";
const TARGET_PROJECT: &str = "project";

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_favorites).post(add_favorite))
        .route(
            "/by/{target_type}/{target_id}",
            post(noop).delete(remove_favorite),
        )
        .route("/reorder", post(reorder_favorites))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FavoritesResponse {
    favorites: Vec<FavoriteItem>,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum FavoriteItem {
    #[serde(rename = "chat")]
    Chat {
        id: String,
        favorite_id: String,
        title: String,
        position: i32,
    },
    #[serde(rename = "issue")]
    Issue {
        id: String,
        favorite_id: String,
        title: String,
        status: String,
        priority: String,
        position: i32,
    },
    #[serde(rename = "project")]
    Project {
        id: String,
        favorite_id: String,
        title: String,
        color: String,
        icon: Option<String>,
        status: String,
        position: i32,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddFavoriteRequest {
    target_type: String,
    target_id: String,
}

#[derive(Serialize)]
struct FavoriteEnvelope {
    favorite: FavoriteRow,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FavoriteRow {
    id: String,
    target_type: String,
    target_id: String,
    position: i32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReorderRequest {
    favorite_ids: Vec<String>,
}

#[derive(Serialize)]
struct OkResponse {
    ok: bool,
}

async fn list_favorites(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<FavoritesResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;

    let rows = favorite::Entity::find()
        .filter(favorite::Column::UserId.eq(&auth.user.id))
        .filter(favorite::Column::OrganizationId.eq(&auth.organization.id))
        .order_by_asc(favorite::Column::Position)
        .order_by_asc(favorite::Column::CreatedAt)
        .all(&state.db)
        .await?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        match row.target_type.as_str() {
            TARGET_CHAT => {
                if let Some(chat) = chat::Entity::find_by_id(&row.target_id)
                    .filter(chat::Column::OrganizationId.eq(&auth.organization.id))
                    .one(&state.db)
                    .await?
                {
                    let has_access = chat_access::Entity::find()
                        .filter(chat_access::Column::ChatId.eq(&chat.id))
                        .filter(chat_access::Column::UserId.eq(&auth.user.id))
                        .one(&state.db)
                        .await?
                        .is_some();
                    if has_access {
                        out.push(FavoriteItem::Chat {
                            id: chat.id,
                            favorite_id: row.id,
                            title: chat.title,
                            position: row.position,
                        });
                    }
                }
            }
            TARGET_ISSUE => {
                if let Some(issue) = issue::Entity::find_by_id(&row.target_id)
                    .filter(issue::Column::OrganizationId.eq(&auth.organization.id))
                    .one(&state.db)
                    .await?
                {
                    out.push(FavoriteItem::Issue {
                        id: issue.id,
                        favorite_id: row.id,
                        title: issue.title,
                        status: issue.status,
                        priority: issue.priority,
                        position: row.position,
                    });
                }
            }
            TARGET_PROJECT => {
                if let Some(project) = project::Entity::find_by_id(&row.target_id)
                    .filter(project::Column::OrganizationId.eq(&auth.organization.id))
                    .one(&state.db)
                    .await?
                {
                    out.push(FavoriteItem::Project {
                        id: project.id,
                        favorite_id: row.id,
                        title: project.name,
                        color: project.color,
                        icon: project.icon,
                        status: project.status,
                        position: row.position,
                    });
                }
            }
            _ => {}
        }
    }

    Ok(Json(FavoritesResponse { favorites: out }))
}

async fn add_favorite(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<AddFavoriteRequest>,
) -> Result<(StatusCode, Json<FavoriteEnvelope>), ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let target_type = normalize_target_type(&payload.target_type)?;

    verify_target_exists(
        &state,
        &auth.organization.id,
        &auth.user.id,
        &target_type,
        &payload.target_id,
    )
    .await?;

    if let Some(existing) = favorite::Entity::find()
        .filter(favorite::Column::UserId.eq(&auth.user.id))
        .filter(favorite::Column::TargetType.eq(target_type.clone()))
        .filter(favorite::Column::TargetId.eq(&payload.target_id))
        .one(&state.db)
        .await?
    {
        return Ok((
            StatusCode::OK,
            Json(FavoriteEnvelope {
                favorite: FavoriteRow {
                    id: existing.id,
                    target_type: existing.target_type,
                    target_id: existing.target_id,
                    position: existing.position,
                },
            }),
        ));
    }

    let next_position = next_position(&state, &auth.user.id, &auth.organization.id).await?;

    let now = Utc::now().fixed_offset();
    let model = favorite::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        user_id: Set(auth.user.id.clone()),
        organization_id: Set(auth.organization.id.clone()),
        target_type: Set(target_type),
        target_id: Set(payload.target_id),
        position: Set(next_position),
        created_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(FavoriteEnvelope {
            favorite: FavoriteRow {
                id: model.id,
                target_type: model.target_type,
                target_id: model.target_id,
                position: model.position,
            },
        }),
    ))
}

async fn remove_favorite(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((target_type, target_id)): Path<(String, String)>,
) -> Result<Json<OkResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let target_type = normalize_target_type(&target_type)?;

    favorite::Entity::delete_many()
        .filter(favorite::Column::UserId.eq(&auth.user.id))
        .filter(favorite::Column::OrganizationId.eq(&auth.organization.id))
        .filter(favorite::Column::TargetType.eq(target_type))
        .filter(favorite::Column::TargetId.eq(target_id))
        .exec(&state.db)
        .await?;

    Ok(Json(OkResponse { ok: true }))
}

async fn reorder_favorites(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ReorderRequest>,
) -> Result<Json<OkResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;

    for (index, favorite_id) in payload.favorite_ids.iter().enumerate() {
        if let Some(row) = favorite::Entity::find_by_id(favorite_id)
            .filter(favorite::Column::UserId.eq(&auth.user.id))
            .filter(favorite::Column::OrganizationId.eq(&auth.organization.id))
            .one(&state.db)
            .await?
        {
            let mut active = row.into_active_model();
            active.position = Set(index as i32);
            active.update(&state.db).await?;
        }
    }

    Ok(Json(OkResponse { ok: true }))
}

async fn noop() -> Result<Json<OkResponse>, ApiError> {
    Err(ApiError::BadRequest(
        "Use DELETE to remove a favorite".to_owned(),
    ))
}

fn normalize_target_type(value: &str) -> Result<String, ApiError> {
    match value {
        TARGET_CHAT | TARGET_ISSUE | TARGET_PROJECT => Ok(value.to_owned()),
        other => Err(ApiError::BadRequest(format!(
            "Unsupported target type: {other}"
        ))),
    }
}

async fn verify_target_exists(
    state: &AppState,
    organization_id: &str,
    user_id: &str,
    target_type: &str,
    target_id: &str,
) -> Result<(), ApiError> {
    match target_type {
        TARGET_CHAT => {
            let chat = chat::Entity::find_by_id(target_id)
                .filter(chat::Column::OrganizationId.eq(organization_id))
                .one(&state.db)
                .await?
                .ok_or_else(|| ApiError::NotFound("Chat not found".to_owned()))?;
            let access = chat_access::Entity::find()
                .filter(chat_access::Column::ChatId.eq(&chat.id))
                .filter(chat_access::Column::UserId.eq(user_id))
                .one(&state.db)
                .await?;
            if access.is_none() {
                return Err(ApiError::NotFound("Chat not found".to_owned()));
            }
        }
        TARGET_ISSUE => {
            issue::Entity::find_by_id(target_id)
                .filter(issue::Column::OrganizationId.eq(organization_id))
                .one(&state.db)
                .await?
                .ok_or_else(|| ApiError::NotFound("Issue not found".to_owned()))?;
        }
        TARGET_PROJECT => {
            project::Entity::find_by_id(target_id)
                .filter(project::Column::OrganizationId.eq(organization_id))
                .one(&state.db)
                .await?
                .ok_or_else(|| ApiError::NotFound("Project not found".to_owned()))?;
        }
        _ => {
            return Err(ApiError::BadRequest(format!(
                "Unsupported target type: {target_type}"
            )));
        }
    }
    Ok(())
}

async fn next_position(
    state: &AppState,
    user_id: &str,
    organization_id: &str,
) -> Result<i32, ApiError> {
    let last = favorite::Entity::find()
        .filter(favorite::Column::UserId.eq(user_id))
        .filter(favorite::Column::OrganizationId.eq(organization_id))
        .order_by_desc(favorite::Column::Position)
        .one(&state.db)
        .await?;
    Ok(last.map(|row| row.position + 1).unwrap_or(0))
}
