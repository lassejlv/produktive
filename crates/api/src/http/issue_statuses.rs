use crate::{
    auth::require_auth,
    error::ApiError,
    permissions::{require_permission, ISSUE_STATUSES_MANAGE},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use produktive_entity::{issue, issue_status};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, PaginatorTrait, QueryFilter,
    QueryOrder, Set,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const CATEGORY_BACKLOG: &str = "backlog";
pub const CATEGORY_ACTIVE: &str = "active";
pub const CATEGORY_DONE: &str = "done";
pub const CATEGORY_CANCELED: &str = "canceled";

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_statuses).post(create_status))
        .route("/reorder", post(reorder_statuses))
        .route(
            "/{id}",
            axum::routing::patch(update_status).delete(delete_status),
        )
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueStatusResponse {
    pub id: String,
    pub key: String,
    pub name: String,
    pub color: String,
    pub category: String,
    pub sort_order: i32,
    pub is_system: bool,
    pub archived: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusesEnvelope {
    statuses: Vec<IssueStatusResponse>,
}

pub fn default_statuses() -> Vec<IssueStatusResponse> {
    vec![
        status("backlog", "Backlog", "gray", CATEGORY_BACKLOG, 0, true),
        status("todo", "Todo", "blue", CATEGORY_ACTIVE, 10, true),
        status(
            "in-progress",
            "In Progress",
            "purple",
            CATEGORY_ACTIVE,
            20,
            true,
        ),
        status("done", "Done", "green", CATEGORY_DONE, 30, true),
        status("canceled", "Canceled", "red", CATEGORY_CANCELED, 40, true),
    ]
}

pub async fn list_issue_statuses(
    state: &AppState,
    organization_id: &str,
    include_archived: bool,
) -> Result<Vec<IssueStatusResponse>, ApiError> {
    let mut out = default_statuses();
    let mut query = issue_status::Entity::find()
        .filter(issue_status::Column::OrganizationId.eq(organization_id))
        .order_by_asc(issue_status::Column::SortOrder);
    if !include_archived {
        query = query.filter(issue_status::Column::ArchivedAt.is_null());
    }
    out.extend(query.all(&state.db).await?.into_iter().map(status_response));
    out.sort_by_key(|status| status.sort_order);
    Ok(out)
}

pub async fn validate_issue_status(
    state: &AppState,
    organization_id: &str,
    key: &str,
) -> Result<String, ApiError> {
    let key = key.trim();
    if key.is_empty() {
        return Err(ApiError::BadRequest("Status is required".to_owned()));
    }
    let exists = list_issue_statuses(state, organization_id, false)
        .await?
        .into_iter()
        .any(|status| status.key == key);
    if !exists {
        return Err(ApiError::BadRequest("Status does not exist".to_owned()));
    }
    Ok(key.to_owned())
}

async fn list_statuses(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<StatusesEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    Ok(Json(StatusesEnvelope {
        statuses: list_issue_statuses(&state, &auth.organization.id, false).await?,
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatusRequest {
    name: String,
    color: Option<String>,
    category: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusEnvelope {
    status: IssueStatusResponse,
}

async fn create_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<StatusRequest>,
) -> Result<(StatusCode, Json<StatusEnvelope>), ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_permission(&state, &auth, ISSUE_STATUSES_MANAGE).await?;

    let name = validate_name(&payload.name)?;
    let key = unique_status_key(&state, &auth.organization.id, &name).await?;
    let max_order = issue_status::Entity::find()
        .filter(issue_status::Column::OrganizationId.eq(&auth.organization.id))
        .order_by_desc(issue_status::Column::SortOrder)
        .one(&state.db)
        .await?
        .map(|status| status.sort_order)
        .unwrap_or(40);
    let now = Utc::now().fixed_offset();
    let row = issue_status::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(auth.organization.id.clone()),
        key: Set(key),
        name: Set(name),
        color: Set(clean_color(payload.color)),
        category: Set(validate_category(&payload.category)?),
        sort_order: Set(max_order + 10),
        is_system: Set(false),
        archived_at: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(StatusEnvelope {
            status: status_response(row),
        }),
    ))
}

async fn update_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<StatusRequest>,
) -> Result<Json<StatusEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_permission(&state, &auth, ISSUE_STATUSES_MANAGE).await?;
    let row = find_custom_status(&state, &auth.organization.id, &id).await?;
    let mut active = row.into_active_model();
    active.name = Set(validate_name(&payload.name)?);
    active.color = Set(clean_color(payload.color));
    active.category = Set(validate_category(&payload.category)?);
    active.updated_at = Set(Utc::now().fixed_offset());
    let updated = active.update(&state.db).await?;
    Ok(Json(StatusEnvelope {
        status: status_response(updated),
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteStatusRequest {
    replacement_status: Option<String>,
}

async fn delete_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<DeleteStatusRequest>,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_permission(&state, &auth, ISSUE_STATUSES_MANAGE).await?;
    let row = find_custom_status(&state, &auth.organization.id, &id).await?;
    let in_use = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&auth.organization.id))
        .filter(issue::Column::Status.eq(&row.key))
        .count(&state.db)
        .await?;
    if in_use > 0 {
        let replacement = payload
            .replacement_status
            .as_deref()
            .ok_or_else(|| ApiError::BadRequest("Replacement status is required".to_owned()))?;
        let replacement = validate_issue_status(&state, &auth.organization.id, replacement).await?;
        if replacement == row.key {
            return Err(ApiError::BadRequest(
                "Replacement status must be different".to_owned(),
            ));
        }
        let rows = issue::Entity::find()
            .filter(issue::Column::OrganizationId.eq(&auth.organization.id))
            .filter(issue::Column::Status.eq(&row.key))
            .all(&state.db)
            .await?;
        for issue in rows {
            let mut active = issue.into_active_model();
            active.status = Set(replacement.clone());
            active.updated_at = Set(Utc::now().fixed_offset());
            active.update(&state.db).await?;
        }
    }

    let now = Utc::now().fixed_offset();
    let mut active = row.into_active_model();
    active.archived_at = Set(Some(now));
    active.updated_at = Set(now);
    active.update(&state.db).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReorderRequest {
    statuses: Vec<ReorderItem>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReorderItem {
    id: String,
    sort_order: i32,
}

async fn reorder_statuses(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ReorderRequest>,
) -> Result<Json<StatusesEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_permission(&state, &auth, ISSUE_STATUSES_MANAGE).await?;
    let now = Utc::now().fixed_offset();
    for item in payload.statuses {
        if let Some(row) = issue_status::Entity::find()
            .filter(issue_status::Column::Id.eq(item.id))
            .filter(issue_status::Column::OrganizationId.eq(&auth.organization.id))
            .filter(issue_status::Column::ArchivedAt.is_null())
            .one(&state.db)
            .await?
        {
            let mut active = row.into_active_model();
            active.sort_order = Set(item.sort_order);
            active.updated_at = Set(now);
            active.update(&state.db).await?;
        }
    }
    list_statuses(State(state), headers).await
}

async fn find_custom_status(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<issue_status::Model, ApiError> {
    issue_status::Entity::find()
        .filter(issue_status::Column::Id.eq(id))
        .filter(issue_status::Column::OrganizationId.eq(organization_id))
        .filter(issue_status::Column::ArchivedAt.is_null())
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Status not found".to_owned()))
}

async fn unique_status_key(
    state: &AppState,
    organization_id: &str,
    name: &str,
) -> Result<String, ApiError> {
    let base = slugify(name);
    let mut candidate = base.clone();
    let mut suffix = 2;
    loop {
        let exists = list_issue_statuses(state, organization_id, true)
            .await?
            .into_iter()
            .any(|status| status.key == candidate);
        if !exists {
            return Ok(candidate);
        }
        candidate = format!("{base}-{suffix}");
        suffix += 1;
    }
}

fn status(
    key: &str,
    name: &str,
    color: &str,
    category: &str,
    sort_order: i32,
    is_system: bool,
) -> IssueStatusResponse {
    IssueStatusResponse {
        id: key.to_owned(),
        key: key.to_owned(),
        name: name.to_owned(),
        color: color.to_owned(),
        category: category.to_owned(),
        sort_order,
        is_system,
        archived: false,
    }
}

fn status_response(row: issue_status::Model) -> IssueStatusResponse {
    IssueStatusResponse {
        id: row.id,
        key: row.key,
        name: row.name,
        color: row.color,
        category: row.category,
        sort_order: row.sort_order,
        is_system: row.is_system,
        archived: row.archived_at.is_some(),
    }
}

fn validate_name(input: &str) -> Result<String, ApiError> {
    let name = input.trim();
    if name.is_empty() {
        return Err(ApiError::BadRequest("Status name is required".to_owned()));
    }
    if name.chars().count() > 40 {
        return Err(ApiError::BadRequest(
            "Status name must be 40 characters or fewer".to_owned(),
        ));
    }
    Ok(name.to_owned())
}

fn validate_category(input: &str) -> Result<String, ApiError> {
    let value = input.trim();
    if matches!(
        value,
        CATEGORY_BACKLOG | CATEGORY_ACTIVE | CATEGORY_DONE | CATEGORY_CANCELED
    ) {
        Ok(value.to_owned())
    } else {
        Err(ApiError::BadRequest("Invalid status category".to_owned()))
    }
}

fn clean_color(input: Option<String>) -> String {
    match input
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(value)
            if value
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '-') =>
        {
            value.chars().take(24).collect()
        }
        _ => "gray".to_owned(),
    }
}

fn slugify(input: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash && !out.is_empty() {
            out.push('-');
            last_dash = true;
        }
    }
    let slug = out.trim_matches('-').chars().take(48).collect::<String>();
    if slug.is_empty() {
        "custom-status".to_owned()
    } else {
        slug
    }
}
