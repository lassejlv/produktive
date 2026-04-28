use crate::{auth::require_auth, error::ApiError, state::AppState};
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use chrono::Utc;
use produktive_entity::{issue_label, label};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, ModelTrait, PaginatorTrait,
    QueryFilter, QueryOrder, Set,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_labels).post(create_label))
        .route(
            "/{id}",
            get(get_label).patch(patch_label).delete(delete_label),
        )
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LabelResponse {
    id: String,
    name: String,
    description: Option<String>,
    color: String,
    archived_at: Option<String>,
    created_at: String,
    updated_at: String,
    issue_count: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LabelListResponse {
    labels: Vec<LabelResponse>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LabelEnvelope {
    label: LabelResponse,
}

#[derive(Deserialize)]
struct ListQuery {
    include_archived: Option<bool>,
}

async fn list_labels(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ListQuery>,
) -> Result<Json<LabelListResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;

    let mut select = label::Entity::find()
        .filter(label::Column::OrganizationId.eq(&auth.organization.id))
        .order_by_asc(label::Column::Name);
    if !query.include_archived.unwrap_or(false) {
        select = select.filter(label::Column::ArchivedAt.is_null());
    }
    let rows = select.all(&state.db).await?;

    let mut labels = Vec::with_capacity(rows.len());
    for row in rows {
        labels.push(label_response(&state, row).await?);
    }
    Ok(Json(LabelListResponse { labels }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateLabelRequest {
    name: String,
    description: Option<String>,
    color: Option<String>,
}

async fn create_label(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateLabelRequest>,
) -> Result<(StatusCode, Json<LabelEnvelope>), ApiError> {
    let auth = require_auth(&headers, &state).await?;

    let name = payload.name.trim();
    if name.is_empty() {
        return Err(ApiError::BadRequest("Label name is required".to_owned()));
    }
    if name.chars().count() > 48 {
        return Err(ApiError::BadRequest(
            "Label name must be 48 characters or fewer".to_owned(),
        ));
    }

    ensure_unique_name(&state, &auth.organization.id, name, None).await?;

    let now = Utc::now().fixed_offset();
    let row = label::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(auth.organization.id.clone()),
        name: Set(name.to_owned()),
        description: Set(non_empty(payload.description)),
        color: Set(normalize_color(payload.color.as_deref())),
        created_by_id: Set(Some(auth.user.id.clone())),
        archived_at: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(LabelEnvelope {
            label: label_response(&state, row).await?,
        }),
    ))
}

async fn get_label(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<LabelEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let row = find_label(&state, &auth.organization.id, &id).await?;
    Ok(Json(LabelEnvelope {
        label: label_response(&state, row).await?,
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PatchLabelRequest {
    name: Option<String>,
    description: Option<String>,
    color: Option<String>,
    archived: Option<bool>,
}

async fn patch_label(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<PatchLabelRequest>,
) -> Result<Json<LabelEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let existing = find_label(&state, &auth.organization.id, &id).await?;
    let existing_id = existing.id.clone();
    let mut active = existing.into_active_model();

    if let Some(name) = payload.name {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(ApiError::BadRequest("Label name is required".to_owned()));
        }
        if trimmed.chars().count() > 48 {
            return Err(ApiError::BadRequest(
                "Label name must be 48 characters or fewer".to_owned(),
            ));
        }
        ensure_unique_name(&state, &auth.organization.id, trimmed, Some(&existing_id))
            .await?;
        active.name = Set(trimmed.to_owned());
    }
    if let Some(description) = payload.description {
        active.description = Set(non_empty(Some(description)));
    }
    if let Some(color) = payload.color {
        active.color = Set(normalize_color(Some(color.as_str())));
    }
    if let Some(archived) = payload.archived {
        active.archived_at = Set(if archived {
            Some(Utc::now().fixed_offset())
        } else {
            None
        });
    }
    active.updated_at = Set(Utc::now().fixed_offset());

    let updated = active.update(&state.db).await?;
    Ok(Json(LabelEnvelope {
        label: label_response(&state, updated).await?,
    }))
}

async fn delete_label(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let row = find_label(&state, &auth.organization.id, &id).await?;
    row.delete(&state.db).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn find_label(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<label::Model, ApiError> {
    label::Entity::find_by_id(id)
        .filter(label::Column::OrganizationId.eq(organization_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Label not found".to_owned()))
}

async fn label_response(
    state: &AppState,
    row: label::Model,
) -> Result<LabelResponse, ApiError> {
    let issue_count = issue_label::Entity::find()
        .filter(issue_label::Column::LabelId.eq(&row.id))
        .count(&state.db)
        .await?;
    Ok(LabelResponse {
        id: row.id,
        name: row.name,
        description: row.description,
        color: row.color,
        archived_at: row.archived_at.map(|d| d.to_rfc3339()),
        created_at: row.created_at.to_rfc3339(),
        updated_at: row.updated_at.to_rfc3339(),
        issue_count,
    })
}

async fn ensure_unique_name(
    state: &AppState,
    organization_id: &str,
    name: &str,
    exclude_id: Option<&str>,
) -> Result<(), ApiError> {
    let lowered = name.to_lowercase();
    let mut select = label::Entity::find()
        .filter(label::Column::OrganizationId.eq(organization_id))
        .filter(label::Column::ArchivedAt.is_null());
    if let Some(id) = exclude_id {
        select = select.filter(label::Column::Id.ne(id));
    }
    let rows = select.all(&state.db).await?;
    if rows
        .iter()
        .any(|row| row.name.to_lowercase() == lowered)
    {
        return Err(ApiError::Conflict(
            "A label with this name already exists".to_owned(),
        ));
    }
    Ok(())
}

fn normalize_color(value: Option<&str>) -> String {
    let allowed = [
        "blue", "green", "orange", "purple", "pink", "red", "yellow", "gray",
    ];
    let value = value.unwrap_or("gray").trim();
    if allowed.contains(&value) {
        value.to_owned()
    } else {
        "gray".to_owned()
    }
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.and_then(|v| {
        if v.trim().is_empty() {
            None
        } else {
            Some(v)
        }
    })
}

pub async fn validate_labels(
    state: &AppState,
    organization_id: &str,
    label_ids: &[String],
) -> Result<(), ApiError> {
    if label_ids.is_empty() {
        return Ok(());
    }
    let rows = label::Entity::find()
        .filter(label::Column::OrganizationId.eq(organization_id))
        .filter(label::Column::Id.is_in(label_ids.iter().cloned()))
        .all(&state.db)
        .await?;
    if rows.len() != label_ids.len() {
        return Err(ApiError::BadRequest(
            "One or more labels are invalid".to_owned(),
        ));
    }
    if rows.iter().any(|row| row.archived_at.is_some()) {
        return Err(ApiError::BadRequest(
            "Cannot attach an archived label".to_owned(),
        ));
    }
    Ok(())
}

pub async fn replace_issue_labels(
    state: &AppState,
    issue_id: &str,
    label_ids: &[String],
) -> Result<(), ApiError> {
    issue_label::Entity::delete_many()
        .filter(issue_label::Column::IssueId.eq(issue_id))
        .exec(&state.db)
        .await?;
    if label_ids.is_empty() {
        return Ok(());
    }
    let now = Utc::now().fixed_offset();
    for label_id in label_ids {
        issue_label::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            issue_id: Set(issue_id.to_owned()),
            label_id: Set(label_id.clone()),
            created_at: Set(now),
        }
        .insert(&state.db)
        .await?;
    }
    Ok(())
}

pub async fn labels_for_issue(
    state: &AppState,
    issue_id: &str,
) -> Result<Vec<label::Model>, ApiError> {
    let joins = issue_label::Entity::find()
        .filter(issue_label::Column::IssueId.eq(issue_id))
        .all(&state.db)
        .await?;
    if joins.is_empty() {
        return Ok(Vec::new());
    }
    let ids: Vec<String> = joins.into_iter().map(|j| j.label_id).collect();
    Ok(label::Entity::find()
        .filter(label::Column::Id.is_in(ids))
        .order_by_asc(label::Column::Name)
        .all(&state.db)
        .await?)
}
