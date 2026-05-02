use crate::{
    auth::require_api_key,
    error::ApiError,
    http::issue_statuses::{
        self, validate_issue_status, CATEGORY_ACTIVE, CATEGORY_BACKLOG, CATEGORY_CANCELED,
        CATEGORY_DONE,
    },
    issue_helpers::{non_empty_optional, normalize_assignee, required_string, validate_assignee},
    issue_history::{record_issue_event, string_change, IssueChange},
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use chrono::{DateTime, FixedOffset, Utc};
use produktive_entity::{issue, issue_label, label, member, project, user};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, ModelTrait, PaginatorTrait,
    QueryFilter, QueryOrder, QuerySelect, Set,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/issues", get(list_issues).post(create_issue))
        .route(
            "/issues/{id}",
            get(get_issue).patch(update_issue).delete(delete_issue),
        )
        .route("/labels", get(list_labels).post(create_label))
        .route(
            "/labels/{id}",
            get(get_label).patch(update_label).delete(delete_label),
        )
        .route("/projects", get(list_projects).post(create_project))
        .route(
            "/projects/{id}",
            get(get_project)
                .patch(update_project)
                .delete(delete_project),
        )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListIssuesQuery {
    status: Option<String>,
    priority: Option<String>,
    assigned_to_id: Option<String>,
    project_id: Option<String>,
    label_id: Option<String>,
    label_ids: Option<String>,
    limit: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListArchivedQuery {
    include_archived: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateIssueRequest {
    title: String,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    assigned_to_id: Option<String>,
    parent_id: Option<String>,
    project_id: Option<String>,
    label_ids: Option<Vec<String>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateIssueRequest {
    title: Option<String>,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    assigned_to_id: Option<String>,
    parent_id: Option<String>,
    project_id: Option<String>,
    label_ids: Option<Vec<String>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateLabelRequest {
    name: String,
    description: Option<String>,
    color: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateLabelRequest {
    name: Option<String>,
    description: Option<String>,
    color: Option<String>,
    archived: Option<bool>,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProjectRequest {
    name: Option<String>,
    description: Option<String>,
    status: Option<String>,
    color: Option<String>,
    icon: Option<String>,
    lead_id: Option<String>,
    target_date: Option<String>,
    archived: Option<bool>,
}

#[derive(Serialize)]
struct IssuesEnvelope {
    issues: Vec<IssueResponse>,
}

#[derive(Serialize)]
struct IssueEnvelope {
    issue: IssueResponse,
}

#[derive(Serialize)]
struct LabelsEnvelope {
    labels: Vec<LabelResponse>,
}

#[derive(Serialize)]
struct LabelEnvelope {
    label: LabelResponse,
}

#[derive(Serialize)]
struct ProjectsEnvelope {
    projects: Vec<ProjectResponse>,
}

#[derive(Serialize)]
struct ProjectEnvelope {
    project: ProjectResponse,
}

#[derive(Serialize)]
struct OkEnvelope {
    ok: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IssueResponse {
    id: String,
    title: String,
    description: Option<String>,
    status: String,
    priority: String,
    created_at: String,
    updated_at: String,
    created_by: Option<UserResponse>,
    assigned_to: Option<UserResponse>,
    parent_id: Option<String>,
    project_id: Option<String>,
    project: Option<ProjectSummary>,
    labels: Vec<LabelSummary>,
    attachments: Vec<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSummary {
    id: String,
    name: String,
    color: String,
    icon: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LabelSummary {
    id: String,
    name: String,
    color: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UserResponse {
    id: String,
    name: String,
    email: String,
    image: Option<String>,
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
struct ProjectResponse {
    id: String,
    name: String,
    description: Option<String>,
    status: String,
    color: String,
    icon: Option<String>,
    lead_id: Option<String>,
    lead: Option<UserResponse>,
    target_date: Option<String>,
    sort_order: i32,
    archived_at: Option<String>,
    created_at: String,
    updated_at: String,
    issue_count: u64,
    done_count: u64,
    status_breakdown: StatusBreakdown,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusBreakdown {
    backlog: u64,
    todo: u64,
    in_progress: u64,
    done: u64,
}

async fn list_issues(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ListIssuesQuery>,
) -> Result<Json<IssuesEnvelope>, ApiError> {
    let auth = require_api_key(&headers, &state).await?;
    let organization_id = auth.organization.id;
    let mut select = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&organization_id))
        .order_by_desc(issue::Column::CreatedAt)
        .limit(query.limit.unwrap_or(50).clamp(1, 100));

    if let Some(status) = non_empty(query.status) {
        select = select.filter(issue::Column::Status.eq(status));
    }
    if let Some(priority) = non_empty(query.priority) {
        select = select.filter(issue::Column::Priority.eq(priority));
    }
    if let Some(assigned_to_id) = non_empty(query.assigned_to_id) {
        select = select.filter(issue::Column::AssignedToId.eq(assigned_to_id));
    }
    if let Some(project_id) = non_empty(query.project_id) {
        select = select.filter(issue::Column::ProjectId.eq(project_id));
    }

    let mut label_ids = comma_ids(query.label_ids);
    if let Some(label_id) = query.label_id {
        label_ids.push(label_id);
    }
    let label_ids = normalize_ids(label_ids);
    if !label_ids.is_empty() {
        crate::http::labels::validate_labels(&state, &organization_id, &label_ids).await?;
        let joins = issue_label::Entity::find()
            .filter(issue_label::Column::LabelId.is_in(label_ids))
            .all(&state.db)
            .await?;
        let issue_ids = normalize_ids(joins.into_iter().map(|join| join.issue_id).collect());
        if issue_ids.is_empty() {
            return Ok(Json(IssuesEnvelope { issues: Vec::new() }));
        }
        select = select.filter(issue::Column::Id.is_in(issue_ids));
    }

    let rows = select.all(&state.db).await?;
    let mut issues = Vec::with_capacity(rows.len());
    for row in rows {
        issues.push(issue_response(&state, row).await?);
    }

    Ok(Json(IssuesEnvelope { issues }))
}

async fn create_issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateIssueRequest>,
) -> Result<(StatusCode, Json<IssueEnvelope>), ApiError> {
    let auth = require_api_key(&headers, &state).await?;
    let organization_id = auth.organization.id;
    let actor_id = auth.user.id;
    let assigned_to_id = normalize_assignee(payload.assigned_to_id)?;
    validate_assignee(&state, &organization_id, assigned_to_id.as_deref()).await?;

    let parent_id = normalize_optional_string(payload.parent_id);
    if let Some(parent_id) = parent_id.as_deref() {
        find_issue(&state, &organization_id, parent_id).await?;
    }

    let project_id = normalize_optional_string(payload.project_id);
    if let Some(project_id) = project_id.as_deref() {
        crate::http::projects::find_project(&state, &organization_id, project_id).await?;
    }

    let label_ids = normalize_ids(payload.label_ids.unwrap_or_default());
    crate::http::labels::validate_labels(&state, &organization_id, &label_ids).await?;

    let status = validate_issue_status(
        &state,
        &organization_id,
        &non_empty(payload.status).unwrap_or_else(|| "backlog".to_owned()),
    )
    .await?;
    let now = Utc::now().fixed_offset();
    let row = issue::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization_id.clone()),
        title: Set(required_string(payload.title, "Title")?),
        description: Set(non_empty_optional(payload.description.unwrap_or_default())?),
        status: Set(status),
        priority: Set(non_empty(payload.priority).unwrap_or_else(|| "medium".to_owned())),
        created_by_id: Set(Some(actor_id.clone())),
        assigned_to_id: Set(assigned_to_id.clone()),
        parent_id: Set(parent_id),
        project_id: Set(project_id),
        attachments: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;
    crate::http::labels::replace_issue_labels(&state, &row.id, &label_ids).await?;

    record_issue_event(
        &state,
        &organization_id,
        &row.id,
        Some(&actor_id),
        "created",
        vec![
            IssueChange {
                field: "title".to_owned(),
                before: Value::Null,
                after: json!(row.title),
            },
            IssueChange {
                field: "status".to_owned(),
                before: Value::Null,
                after: json!(row.status),
            },
            IssueChange {
                field: "priority".to_owned(),
                before: Value::Null,
                after: json!(row.priority),
            },
            IssueChange {
                field: "assignedToId".to_owned(),
                before: Value::Null,
                after: assigned_to_id.map(Value::String).unwrap_or(Value::Null),
            },
            IssueChange {
                field: "labelIds".to_owned(),
                before: Value::Null,
                after: json!(label_ids),
            },
        ],
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(IssueEnvelope {
            issue: issue_response(&state, row).await?,
        }),
    ))
}

async fn get_issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<IssueEnvelope>, ApiError> {
    let auth = require_api_key(&headers, &state).await?;
    let row = find_issue(&state, &auth.organization.id, &id).await?;
    Ok(Json(IssueEnvelope {
        issue: issue_response(&state, row).await?,
    }))
}

async fn update_issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<UpdateIssueRequest>,
) -> Result<Json<IssueEnvelope>, ApiError> {
    let auth = require_api_key(&headers, &state).await?;
    let organization_id = auth.organization.id;
    let before = find_issue(&state, &organization_id, &id).await?;
    let mut active = before.clone().into_active_model();
    let mut changes = Vec::new();

    if let Some(title) = payload.title {
        let next = required_string(title, "Title")?;
        if let Some(change) = string_change("title", Some(&before.title), Some(&next)) {
            changes.push(change);
        }
        active.title = Set(next);
    }
    if let Some(description) = payload.description {
        let next = non_empty_optional(description)?;
        if let Some(change) = string_change(
            "description",
            before.description.as_deref(),
            next.as_deref(),
        ) {
            changes.push(change);
        }
        active.description = Set(next);
    }
    if let Some(status) = payload.status {
        let next = validate_issue_status(
            &state,
            &organization_id,
            &required_string(status, "Status")?,
        )
        .await?;
        if let Some(change) = string_change("status", Some(&before.status), Some(&next)) {
            changes.push(change);
        }
        active.status = Set(next);
    }
    if let Some(priority) = payload.priority {
        let next = required_string(priority, "Priority")?;
        if let Some(change) = string_change("priority", Some(&before.priority), Some(&next)) {
            changes.push(change);
        }
        active.priority = Set(next);
    }
    if let Some(raw_assignee) = payload.assigned_to_id {
        let next = normalize_assignee(Some(raw_assignee))?;
        validate_assignee(&state, &organization_id, next.as_deref()).await?;
        if let Some(change) = string_change(
            "assignedToId",
            before.assigned_to_id.as_deref(),
            next.as_deref(),
        ) {
            changes.push(change);
        }
        active.assigned_to_id = Set(next);
    }
    if let Some(raw_parent) = payload.parent_id {
        let next = normalize_optional_string(Some(raw_parent));
        if let Some(parent_id) = next.as_deref() {
            find_issue(&state, &organization_id, parent_id).await?;
        }
        if let Some(change) =
            string_change("parentId", before.parent_id.as_deref(), next.as_deref())
        {
            changes.push(change);
        }
        active.parent_id = Set(next);
    }
    if let Some(raw_project) = payload.project_id {
        let next = normalize_optional_string(Some(raw_project));
        if let Some(project_id) = next.as_deref() {
            crate::http::projects::find_project(&state, &organization_id, project_id).await?;
        }
        if let Some(change) =
            string_change("projectId", before.project_id.as_deref(), next.as_deref())
        {
            changes.push(change);
        }
        active.project_id = Set(next);
    }
    if let Some(label_ids) = payload.label_ids {
        let label_ids = normalize_ids(label_ids);
        crate::http::labels::validate_labels(&state, &organization_id, &label_ids).await?;
        let before_label_ids = crate::http::labels::labels_for_issue(&state, &before.id)
            .await?
            .into_iter()
            .map(|label| label.id)
            .collect::<Vec<_>>();
        if before_label_ids != label_ids {
            changes.push(IssueChange {
                field: "labelIds".to_owned(),
                before: json!(before_label_ids),
                after: json!(label_ids),
            });
            crate::http::labels::replace_issue_labels(&state, &before.id, &label_ids).await?;
        }
    }

    active.updated_at = Set(Utc::now().fixed_offset());
    let updated = active.update(&state.db).await?;
    if !changes.is_empty() {
        record_issue_event(
            &state,
            &organization_id,
            &updated.id,
            Some(&auth.user.id),
            "updated",
            changes,
        )
        .await?;
    }

    Ok(Json(IssueEnvelope {
        issue: issue_response(&state, updated).await?,
    }))
}

async fn delete_issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<OkEnvelope>, ApiError> {
    let auth = require_api_key(&headers, &state).await?;
    let row = find_issue(&state, &auth.organization.id, &id).await?;
    row.delete(&state.db).await?;
    Ok(Json(OkEnvelope { ok: true }))
}

async fn list_labels(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ListArchivedQuery>,
) -> Result<Json<LabelsEnvelope>, ApiError> {
    let auth = require_api_key(&headers, &state).await?;
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
    Ok(Json(LabelsEnvelope { labels }))
}

async fn create_label(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateLabelRequest>,
) -> Result<(StatusCode, Json<LabelEnvelope>), ApiError> {
    let auth = require_api_key(&headers, &state).await?;
    let organization_id = auth.organization.id;
    let name = required_string(payload.name, "Label name")?;
    if name.chars().count() > 48 {
        return Err(ApiError::BadRequest(
            "Label name must be 48 characters or fewer".to_owned(),
        ));
    }
    ensure_unique_label_name(&state, &organization_id, &name, None).await?;

    let now = Utc::now().fixed_offset();
    let row = label::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization_id),
        name: Set(name),
        description: Set(non_empty(payload.description)),
        color: Set(normalize_color(payload.color.as_deref(), "gray")),
        created_by_id: Set(Some(auth.user.id)),
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
    let auth = require_api_key(&headers, &state).await?;
    let row = crate::http::labels::find_label(&state, &auth.organization.id, &id).await?;
    Ok(Json(LabelEnvelope {
        label: label_response(&state, row).await?,
    }))
}

async fn update_label(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<UpdateLabelRequest>,
) -> Result<Json<LabelEnvelope>, ApiError> {
    let auth = require_api_key(&headers, &state).await?;
    let organization_id = auth.organization.id;
    let existing = crate::http::labels::find_label(&state, &organization_id, &id).await?;
    let existing_id = existing.id.clone();
    let mut active = existing.into_active_model();

    if let Some(name) = payload.name {
        let name = required_string(name, "Label name")?;
        if name.chars().count() > 48 {
            return Err(ApiError::BadRequest(
                "Label name must be 48 characters or fewer".to_owned(),
            ));
        }
        ensure_unique_label_name(&state, &organization_id, &name, Some(&existing_id)).await?;
        active.name = Set(name);
    }
    if let Some(description) = payload.description {
        active.description = Set(non_empty(Some(description)));
    }
    if let Some(color) = payload.color {
        active.color = Set(normalize_color(Some(&color), "gray"));
    }
    if let Some(archived) = payload.archived {
        active.archived_at = Set(archived.then(|| Utc::now().fixed_offset()));
    }
    active.updated_at = Set(Utc::now().fixed_offset());

    let row = active.update(&state.db).await?;
    Ok(Json(LabelEnvelope {
        label: label_response(&state, row).await?,
    }))
}

async fn delete_label(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let auth = require_api_key(&headers, &state).await?;
    let row = crate::http::labels::find_label(&state, &auth.organization.id, &id).await?;
    row.delete(&state.db).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_projects(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ListArchivedQuery>,
) -> Result<Json<ProjectsEnvelope>, ApiError> {
    let auth = require_api_key(&headers, &state).await?;
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
    Ok(Json(ProjectsEnvelope { projects }))
}

async fn create_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateProjectRequest>,
) -> Result<(StatusCode, Json<ProjectEnvelope>), ApiError> {
    let auth = require_api_key(&headers, &state).await?;
    let organization_id = auth.organization.id;
    let lead_id = normalize_optional_string(payload.lead_id);
    if let Some(lead_id) = lead_id.as_deref() {
        validate_member(&state, &organization_id, lead_id).await?;
    }
    let target_date = parse_optional_date(payload.target_date.as_deref())?;
    let next_order = next_project_order(&state, &organization_id).await?;
    let now = Utc::now().fixed_offset();
    let row = project::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization_id),
        name: Set(required_string(payload.name, "Project name")?),
        description: Set(non_empty(payload.description)),
        status: Set(normalize_project_status(payload.status.as_deref())),
        color: Set(normalize_color(payload.color.as_deref(), "blue")),
        icon: Set(normalize_optional_string(payload.icon)),
        lead_id: Set(lead_id),
        target_date: Set(target_date),
        sort_order: Set(next_order),
        created_by_id: Set(Some(auth.user.id)),
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
    let auth = require_api_key(&headers, &state).await?;
    let row = crate::http::projects::find_project(&state, &auth.organization.id, &id).await?;
    Ok(Json(ProjectEnvelope {
        project: project_response(&state, row).await?,
    }))
}

async fn update_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<UpdateProjectRequest>,
) -> Result<Json<ProjectEnvelope>, ApiError> {
    let auth = require_api_key(&headers, &state).await?;
    let organization_id = auth.organization.id;
    let existing = crate::http::projects::find_project(&state, &organization_id, &id).await?;
    let mut active = existing.into_active_model();

    if let Some(name) = payload.name {
        active.name = Set(required_string(name, "Project name")?);
    }
    if let Some(description) = payload.description {
        active.description = Set(non_empty(Some(description)));
    }
    if let Some(status) = payload.status {
        active.status = Set(normalize_project_status(Some(&status)));
    }
    if let Some(color) = payload.color {
        active.color = Set(normalize_color(Some(&color), "blue"));
    }
    if let Some(icon) = payload.icon {
        active.icon = Set(normalize_optional_string(Some(icon)));
    }
    if let Some(lead_id) = payload.lead_id {
        let lead_id = normalize_optional_string(Some(lead_id));
        if let Some(lead_id) = lead_id.as_deref() {
            validate_member(&state, &organization_id, lead_id).await?;
        }
        active.lead_id = Set(lead_id);
    }
    if let Some(target_date) = payload.target_date {
        active.target_date = Set(parse_optional_date(Some(&target_date))?);
    }
    if let Some(archived) = payload.archived {
        active.archived_at = Set(archived.then(|| Utc::now().fixed_offset()));
    }
    active.updated_at = Set(Utc::now().fixed_offset());

    let row = active.update(&state.db).await?;
    Ok(Json(ProjectEnvelope {
        project: project_response(&state, row).await?,
    }))
}

async fn delete_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let auth = require_api_key(&headers, &state).await?;
    let row = crate::http::projects::find_project(&state, &auth.organization.id, &id).await?;
    row.delete(&state.db).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn find_issue(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<issue::Model, ApiError> {
    issue::Entity::find_by_id(id)
        .filter(issue::Column::OrganizationId.eq(organization_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Issue not found".to_owned()))
}

async fn issue_response(state: &AppState, row: issue::Model) -> Result<IssueResponse, ApiError> {
    let created_by = match &row.created_by_id {
        Some(id) => find_user_response(state, id).await?,
        None => None,
    };
    let assigned_to = match &row.assigned_to_id {
        Some(id) => find_user_response(state, id).await?,
        None => None,
    };
    let project = match &row.project_id {
        Some(id) => project::Entity::find_by_id(id)
            .one(&state.db)
            .await?
            .map(|project| ProjectSummary {
                id: project.id,
                name: project.name,
                color: project.color,
                icon: project.icon,
            }),
        None => None,
    };
    let labels = crate::http::labels::labels_for_issue(state, &row.id)
        .await?
        .into_iter()
        .map(|label| LabelSummary {
            id: label.id,
            name: label.name,
            color: label.color,
        })
        .collect();

    Ok(IssueResponse {
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        priority: row.priority,
        created_at: row.created_at.to_rfc3339(),
        updated_at: row.updated_at.to_rfc3339(),
        created_by,
        assigned_to,
        parent_id: row.parent_id,
        project_id: row.project_id,
        project,
        labels,
        attachments: row
            .attachments
            .and_then(|value| serde_json::from_value(value).ok())
            .unwrap_or_default(),
    })
}

async fn label_response(state: &AppState, row: label::Model) -> Result<LabelResponse, ApiError> {
    let issue_count = issue_label::Entity::find()
        .filter(issue_label::Column::LabelId.eq(&row.id))
        .count(&state.db)
        .await?;
    Ok(LabelResponse {
        id: row.id,
        name: row.name,
        description: row.description,
        color: row.color,
        archived_at: row.archived_at.map(|value| value.to_rfc3339()),
        created_at: row.created_at.to_rfc3339(),
        updated_at: row.updated_at.to_rfc3339(),
        issue_count,
    })
}

async fn project_response(
    state: &AppState,
    row: project::Model,
) -> Result<ProjectResponse, ApiError> {
    let lead = match &row.lead_id {
        Some(id) => find_user_response(state, id).await?,
        None => None,
    };
    let issue_count = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&row.organization_id))
        .filter(issue::Column::ProjectId.eq(&row.id))
        .count(&state.db)
        .await?;
    let statuses = issue_statuses::list_issue_statuses(state, &row.organization_id, false).await?;
    let mut status_breakdown = StatusBreakdown::default();
    let mut done_count = 0_u64;
    let project_issues = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&row.organization_id))
        .filter(issue::Column::ProjectId.eq(&row.id))
        .all(&state.db)
        .await?;
    for issue in project_issues {
        let category = statuses
            .iter()
            .find(|status| status.key == issue.status)
            .map(|status| status.category.as_str())
            .unwrap_or(CATEGORY_ACTIVE);
        match category {
            CATEGORY_BACKLOG => status_breakdown.backlog += 1,
            CATEGORY_ACTIVE => status_breakdown.todo += 1,
            CATEGORY_DONE => {
                status_breakdown.done += 1;
                done_count += 1;
            }
            CATEGORY_CANCELED => {}
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
        target_date: row.target_date.map(|value| value.to_rfc3339()),
        sort_order: row.sort_order,
        archived_at: row.archived_at.map(|value| value.to_rfc3339()),
        created_at: row.created_at.to_rfc3339(),
        updated_at: row.updated_at.to_rfc3339(),
        issue_count,
        done_count,
        status_breakdown,
    })
}

async fn find_user_response(state: &AppState, id: &str) -> Result<Option<UserResponse>, ApiError> {
    Ok(user::Entity::find_by_id(id)
        .one(&state.db)
        .await?
        .map(|user| UserResponse {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
        }))
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
    if exists {
        return Ok(());
    }
    Err(ApiError::BadRequest(
        "User must be a member of this workspace".to_owned(),
    ))
}

async fn ensure_unique_label_name(
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
    if rows.iter().any(|row| row.name.to_lowercase() == lowered) {
        return Err(ApiError::Conflict(
            "A label with this name already exists".to_owned(),
        ));
    }
    Ok(())
}

async fn next_project_order(state: &AppState, organization_id: &str) -> Result<i32, ApiError> {
    Ok(project::Entity::find()
        .filter(project::Column::OrganizationId.eq(organization_id))
        .select_only()
        .column_as(project::Column::SortOrder.max(), "max_order")
        .into_tuple::<Option<i32>>()
        .one(&state.db)
        .await?
        .flatten()
        .unwrap_or(0)
        + 1)
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_owned())
    })
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    non_empty(value)
}

fn normalize_ids(values: Vec<String>) -> Vec<String> {
    let mut ids = Vec::new();
    for value in values {
        let trimmed = value.trim();
        if !trimmed.is_empty() && !ids.iter().any(|id: &String| id == trimmed) {
            ids.push(trimmed.to_owned());
        }
    }
    ids
}

fn comma_ids(value: Option<String>) -> Vec<String> {
    value
        .unwrap_or_default()
        .split(',')
        .map(ToOwned::to_owned)
        .collect()
}

fn normalize_color(value: Option<&str>, default: &str) -> String {
    let allowed = [
        "blue", "green", "orange", "purple", "pink", "red", "yellow", "gray",
    ];
    let value = value.unwrap_or(default).trim();
    if allowed.contains(&value) {
        value.to_owned()
    } else {
        default.to_owned()
    }
}

fn normalize_project_status(value: Option<&str>) -> String {
    match value.unwrap_or("planned").trim() {
        "planned" | "in-progress" | "completed" | "cancelled" => {
            value.unwrap_or("planned").trim().to_owned()
        }
        _ => "planned".to_owned(),
    }
}

fn parse_optional_date(value: Option<&str>) -> Result<Option<DateTime<FixedOffset>>, ApiError> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if let Ok(date) = DateTime::parse_from_rfc3339(value) {
        return Ok(Some(date));
    }
    if let Ok(date) = chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d") {
        return Ok(Some(
            date.and_hms_opt(0, 0, 0).unwrap().and_utc().fixed_offset(),
        ));
    }
    Err(ApiError::BadRequest(
        "Invalid target date format".to_owned(),
    ))
}
