use crate::{auth::require_auth, error::ApiError, state::AppState};
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use chrono::Utc;
use produktive_entity::{issue, member, user};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, ModelTrait, QueryFilter,
    QueryOrder, Set,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_issues).post(create_issue))
        .route(
            "/{id}",
            get(get_issue).patch(update_issue).delete(delete_issue),
        )
}

#[derive(Deserialize)]
struct ListIssuesQuery {
    status: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateIssueRequest {
    title: String,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    assigned_to_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateIssueRequest {
    title: Option<String>,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    assigned_to_id: Option<String>,
}

#[derive(Serialize)]
struct IssuesResponse {
    issues: Vec<IssueResponse>,
}

#[derive(Serialize)]
struct IssueEnvelope {
    issue: IssueResponse,
}

#[derive(Serialize)]
struct OkResponse {
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
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UserResponse {
    id: String,
    name: String,
    email: String,
    image: Option<String>,
}

async fn list_issues(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ListIssuesQuery>,
) -> Result<Json<IssuesResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let mut select = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(auth.organization.id))
        .order_by_desc(issue::Column::CreatedAt);

    if let Some(status) = query
        .status
        .and_then(|value| non_empty_optional(value).ok().flatten())
    {
        select = select.filter(issue::Column::Status.eq(status));
    }

    let issues = select.all(&state.db).await?;
    let mut response = Vec::with_capacity(issues.len());
    for issue in issues {
        response.push(issue_response(&state, issue).await?);
    }

    Ok(Json(IssuesResponse { issues: response }))
}

async fn create_issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateIssueRequest>,
) -> Result<(StatusCode, Json<IssueEnvelope>), ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let assigned_to_id = normalize_assignee(payload.assigned_to_id)?;
    validate_assignee(&state, &auth.organization.id, assigned_to_id.as_deref()).await?;
    let now = Utc::now().fixed_offset();

    let issue = issue::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(auth.organization.id),
        title: Set(required_string(payload.title, "Title")?),
        description: Set(non_empty_optional(payload.description.unwrap_or_default())?),
        status: Set(optional_string(payload.status, "backlog")?),
        priority: Set(optional_string(payload.priority, "medium")?),
        created_by_id: Set(Some(auth.user.id)),
        assigned_to_id: Set(assigned_to_id),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(IssueEnvelope {
            issue: issue_response(&state, issue).await?,
        }),
    ))
}

async fn get_issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<IssueEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let issue = find_issue(&state, &auth.organization.id, &id).await?;

    Ok(Json(IssueEnvelope {
        issue: issue_response(&state, issue).await?,
    }))
}

async fn update_issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<UpdateIssueRequest>,
) -> Result<Json<IssueEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let issue = find_issue(&state, &auth.organization.id, &id).await?;
    let assigned_to_id = match payload.assigned_to_id {
        Some(value) => Some(normalize_assignee(Some(value))?),
        None => None,
    };

    if let Some(value) = assigned_to_id.as_ref().and_then(|value| value.as_deref()) {
        validate_assignee(&state, &auth.organization.id, Some(value)).await?;
    }

    let mut issue = issue.into_active_model();
    if let Some(title) = payload.title {
        issue.title = Set(required_string(title, "Title")?);
    }
    if let Some(description) = payload.description {
        issue.description = Set(non_empty_optional(description)?);
    }
    if let Some(status) = payload.status {
        issue.status = Set(required_string(status, "Status")?);
    }
    if let Some(priority) = payload.priority {
        issue.priority = Set(required_string(priority, "Priority")?);
    }
    if let Some(value) = assigned_to_id {
        issue.assigned_to_id = Set(value);
    }
    issue.updated_at = Set(Utc::now().fixed_offset());

    let issue = issue.update(&state.db).await?;
    Ok(Json(IssueEnvelope {
        issue: issue_response(&state, issue).await?,
    }))
}

async fn delete_issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<OkResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let issue = find_issue(&state, &auth.organization.id, &id).await?;
    issue.delete(&state.db).await?;

    Ok(Json(OkResponse { ok: true }))
}

async fn find_issue(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<issue::Model, ApiError> {
    issue::Entity::find()
        .filter(issue::Column::Id.eq(id))
        .filter(issue::Column::OrganizationId.eq(organization_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Issue not found".to_owned()))
}

async fn issue_response(state: &AppState, issue: issue::Model) -> Result<IssueResponse, ApiError> {
    let created_by = match &issue.created_by_id {
        Some(id) => find_user_response(state, id).await?,
        None => None,
    };
    let assigned_to = match &issue.assigned_to_id {
        Some(id) => find_user_response(state, id).await?,
        None => None,
    };

    Ok(IssueResponse {
        id: issue.id,
        title: issue.title,
        description: issue.description,
        status: issue.status,
        priority: issue.priority,
        created_at: issue.created_at.to_rfc3339(),
        updated_at: issue.updated_at.to_rfc3339(),
        created_by,
        assigned_to,
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

async fn validate_assignee(
    state: &AppState,
    organization_id: &str,
    assigned_to_id: Option<&str>,
) -> Result<(), ApiError> {
    let Some(assigned_to_id) = assigned_to_id else {
        return Ok(());
    };

    let member = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(organization_id))
        .filter(member::Column::UserId.eq(assigned_to_id))
        .one(&state.db)
        .await?;

    if member.is_none() {
        return Err(ApiError::BadRequest(
            "Assignee is not a member of this organization".to_owned(),
        ));
    }

    Ok(())
}

fn required_string(value: String, label: &str) -> Result<String, ApiError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(ApiError::BadRequest(format!("{label} is required")));
    }
    Ok(value.to_owned())
}

fn optional_string(value: Option<String>, default: &str) -> Result<String, ApiError> {
    match value {
        Some(value) => required_string(value, default),
        None => Ok(default.to_owned()),
    }
}

fn non_empty_optional(value: String) -> Result<Option<String>, ApiError> {
    let value = value.trim();
    Ok((!value.is_empty()).then(|| value.to_owned()))
}

fn normalize_assignee(value: Option<String>) -> Result<Option<String>, ApiError> {
    match value {
        Some(value) => non_empty_optional(value),
        None => Ok(None),
    }
}
