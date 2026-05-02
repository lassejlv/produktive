use crate::{
    auth::require_auth,
    error::ApiError,
    permissions::{require_permission, PROJECTS_CREATE, PROJECTS_DELETE, PROJECTS_UPDATE},
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use chrono::{DateTime, FixedOffset, Utc};
use produktive_entity::{issue, member, project, user};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, ModelTrait, PaginatorTrait,
    QueryFilter, QueryOrder, QuerySelect, Set,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_projects).post(create_project))
        .route(
            "/{id}",
            get(get_project).patch(patch_project).delete(delete_project),
        )
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LeadResponse {
    id: String,
    name: String,
    email: String,
    image: Option<String>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct StatusBreakdown {
    backlog: u64,
    todo: u64,
    in_progress: u64,
    done: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectResponse {
    id: String,
    name: String,
    description: Option<String>,
    status: String,
    color: String,
    icon: Option<String>,
    lead_id: Option<String>,
    lead: Option<LeadResponse>,
    target_date: Option<String>,
    sort_order: i32,
    archived_at: Option<String>,
    created_at: String,
    updated_at: String,
    issue_count: u64,
    done_count: u64,
    status_breakdown: StatusBreakdown,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectListResponse {
    projects: Vec<ProjectResponse>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectEnvelope {
    project: ProjectResponse,
}

#[derive(Deserialize)]
struct ListQuery {
    include_archived: Option<bool>,
}

async fn list_projects(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ListQuery>,
) -> Result<Json<ProjectListResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;

    let mut select = project::Entity::find()
        .filter(project::Column::OrganizationId.eq(&auth.organization.id))
        .order_by_asc(project::Column::ArchivedAt)
        .order_by_asc(project::Column::SortOrder)
        .order_by_desc(project::Column::CreatedAt);

    if !query.include_archived.unwrap_or(false) {
        select = select.filter(project::Column::ArchivedAt.is_null());
    }

    let rows = select.all(&state.db).await?;
    let mut projects = Vec::with_capacity(rows.len());
    for row in rows {
        projects.push(project_response(&state, row).await?);
    }

    Ok(Json(ProjectListResponse { projects }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateProjectRequest {
    name: String,
    description: Option<String>,
    status: Option<String>,
    color: Option<String>,
    icon: Option<String>,
    lead_id: Option<String>,
    target_date: Option<String>,
}

async fn create_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateProjectRequest>,
) -> Result<(StatusCode, Json<ProjectEnvelope>), ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_permission(&state, &auth, PROJECTS_CREATE).await?;

    let name = payload.name.trim();
    if name.is_empty() {
        return Err(ApiError::BadRequest("Project name is required".to_owned()));
    }

    let lead_id = normalize_optional_string(payload.lead_id);
    if let Some(ref lead) = lead_id {
        validate_member(&state, &auth.organization.id, lead).await?;
    }

    let target_date = parse_optional_date(payload.target_date.as_deref())?;
    let now = Utc::now().fixed_offset();

    let next_order = project::Entity::find()
        .filter(project::Column::OrganizationId.eq(&auth.organization.id))
        .select_only()
        .column_as(project::Column::SortOrder.max(), "max_order")
        .into_tuple::<Option<i32>>()
        .one(&state.db)
        .await?
        .flatten()
        .unwrap_or(0)
        + 1;

    let row = project::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(auth.organization.id.clone()),
        name: Set(name.to_owned()),
        description: Set(non_empty(payload.description)),
        status: Set(normalize_status(payload.status.as_deref())),
        color: Set(normalize_color(payload.color.as_deref())),
        icon: Set(normalize_optional_string(payload.icon)),
        lead_id: Set(lead_id),
        target_date: Set(target_date),
        sort_order: Set(next_order),
        created_by_id: Set(Some(auth.user.id.clone())),
        archived_at: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(ProjectEnvelope {
            project: project_response(&state, row).await?,
        }),
    ))
}

async fn get_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<ProjectEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_permission(&state, &auth, PROJECTS_UPDATE).await?;
    let row = find_project(&state, &auth.organization.id, &id).await?;
    Ok(Json(ProjectEnvelope {
        project: project_response(&state, row).await?,
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PatchProjectRequest {
    name: Option<String>,
    description: Option<String>,
    status: Option<String>,
    color: Option<String>,
    icon: Option<String>,
    lead_id: Option<String>,
    target_date: Option<String>,
    archived: Option<bool>,
}

async fn patch_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<PatchProjectRequest>,
) -> Result<Json<ProjectEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let existing = find_project(&state, &auth.organization.id, &id).await?;
    let mut active = existing.into_active_model();

    if let Some(name) = payload.name {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(ApiError::BadRequest("Project name is required".to_owned()));
        }
        active.name = Set(trimmed.to_owned());
    }
    if let Some(description) = payload.description {
        active.description = Set(non_empty(Some(description)));
    }
    if let Some(status) = payload.status {
        active.status = Set(normalize_status(Some(status.as_str())));
    }
    if let Some(color) = payload.color {
        active.color = Set(normalize_color(Some(color.as_str())));
    }
    if let Some(icon) = payload.icon {
        active.icon = Set(normalize_optional_string(Some(icon)));
    }
    if let Some(lead_id) = payload.lead_id {
        let normalized = normalize_optional_string(Some(lead_id));
        if let Some(ref lead) = normalized {
            validate_member(&state, &auth.organization.id, lead).await?;
        }
        active.lead_id = Set(normalized);
    }
    if let Some(date) = payload.target_date {
        if date.trim().is_empty() {
            active.target_date = Set(None);
        } else {
            active.target_date = Set(parse_optional_date(Some(&date))?);
        }
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
    Ok(Json(ProjectEnvelope {
        project: project_response(&state, updated).await?,
    }))
}

async fn delete_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_permission(&state, &auth, PROJECTS_DELETE).await?;
    let row = find_project(&state, &auth.organization.id, &id).await?;
    row.delete(&state.db).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn find_project(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<project::Model, ApiError> {
    project::Entity::find_by_id(id)
        .filter(project::Column::OrganizationId.eq(organization_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Project not found".to_owned()))
}

async fn project_response(
    state: &AppState,
    row: project::Model,
) -> Result<ProjectResponse, ApiError> {
    let lead = match &row.lead_id {
        Some(id) => user::Entity::find_by_id(id)
            .one(&state.db)
            .await?
            .map(|user| LeadResponse {
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
            }),
        None => None,
    };

    let issue_count = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&row.organization_id))
        .filter(issue::Column::ProjectId.eq(&row.id))
        .count(&state.db)
        .await?;

    let done_count = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&row.organization_id))
        .filter(issue::Column::ProjectId.eq(&row.id))
        .filter(issue::Column::Status.eq("done"))
        .count(&state.db)
        .await?;

    let mut breakdown = StatusBreakdown::default();
    let issues = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&row.organization_id))
        .filter(issue::Column::ProjectId.eq(&row.id))
        .all(&state.db)
        .await?;
    for issue_row in issues {
        match issue_row.status.as_str() {
            "backlog" => breakdown.backlog += 1,
            "todo" => breakdown.todo += 1,
            "in-progress" => breakdown.in_progress += 1,
            "done" => breakdown.done += 1,
            _ => {}
        }
    }

    Ok(ProjectResponse {
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        color: row.color,
        icon: row.icon,
        lead_id: row.lead_id,
        lead,
        target_date: row.target_date.map(|d| d.to_rfc3339()),
        sort_order: row.sort_order,
        archived_at: row.archived_at.map(|d| d.to_rfc3339()),
        created_at: row.created_at.to_rfc3339(),
        updated_at: row.updated_at.to_rfc3339(),
        issue_count,
        done_count,
        status_breakdown: breakdown,
    })
}

async fn validate_member(
    state: &AppState,
    organization_id: &str,
    user_id: &str,
) -> Result<(), ApiError> {
    let exists = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(organization_id))
        .filter(member::Column::UserId.eq(user_id))
        .one(&state.db)
        .await?
        .is_some();
    if !exists {
        return Err(ApiError::BadRequest(
            "Lead must be a member of this workspace".to_owned(),
        ));
    }
    Ok(())
}

fn normalize_status(value: Option<&str>) -> String {
    match value.unwrap_or("planned").trim() {
        "planned" | "in-progress" | "completed" | "cancelled" => {
            value.unwrap_or("planned").trim().to_owned()
        }
        _ => "planned".to_owned(),
    }
}

fn normalize_color(value: Option<&str>) -> String {
    let allowed = [
        "blue", "green", "orange", "purple", "pink", "red", "yellow", "gray",
    ];
    let value = value.unwrap_or("blue").trim();
    if allowed.contains(&value) {
        value.to_owned()
    } else {
        "blue".to_owned()
    }
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value.and_then(|v| {
        let trimmed = v.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_owned())
        }
    })
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.and_then(|v| if v.trim().is_empty() { None } else { Some(v) })
}

fn parse_optional_date(value: Option<&str>) -> Result<Option<DateTime<FixedOffset>>, ApiError> {
    let Some(raw) = value else {
        return Ok(None);
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if let Ok(dt) = DateTime::parse_from_rfc3339(trimmed) {
        return Ok(Some(dt));
    }
    if let Ok(date) = chrono::NaiveDate::parse_from_str(trimmed, "%Y-%m-%d") {
        let dt = date.and_hms_opt(0, 0, 0).unwrap().and_utc().fixed_offset();
        return Ok(Some(dt));
    }
    Err(ApiError::BadRequest(
        "Invalid target date format".to_owned(),
    ))
}
