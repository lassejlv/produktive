use crate::{
    auth::require_auth,
    error::ApiError,
    issue_helpers::{
        non_empty_optional, normalize_assignee, optional_string, required_string, validate_assignee,
    },
    issue_history::{record_issue_event, string_change, IssueChange},
    state::AppState,
    storage,
};
use axum::{
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use produktive_entity::{issue, issue_comment, issue_event, user};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, ModelTrait, QueryFilter,
    QueryOrder, Set,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

const MAX_ATTACHMENT_BYTES: usize = 10 * 1024 * 1024;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_issues).post(create_issue))
        .route(
            "/{id}",
            get(get_issue).patch(update_issue).delete(delete_issue),
        )
        .route("/{id}/history", get(get_issue_history))
        .route("/{id}/comments", get(list_comments).post(create_comment))
        .route(
            "/{id}/attachments",
            post(upload_attachment)
                .layer(DefaultBodyLimit::max(MAX_ATTACHMENT_BYTES + 1024 * 1024)),
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateCommentRequest {
    body: String,
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
struct IssueHistoryResponse {
    events: Vec<IssueEventResponse>,
}

#[derive(Serialize)]
struct IssueCommentsResponse {
    comments: Vec<IssueCommentResponse>,
}

#[derive(Serialize)]
struct IssueCommentEnvelope {
    comment: IssueCommentResponse,
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
    attachments: Vec<AttachmentResponse>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AttachmentResponse {
    id: String,
    name: String,
    content_type: String,
    size: usize,
    key: String,
    url: String,
    created_at: String,
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
struct IssueEventResponse {
    id: String,
    action: String,
    changes: Vec<IssueChange>,
    created_at: String,
    actor: Option<UserResponse>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IssueCommentResponse {
    id: String,
    body: String,
    created_at: String,
    updated_at: String,
    author: Option<UserResponse>,
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

    let actor_id = auth.user.id.clone();
    let organization_id = auth.organization.id;
    let issue = issue::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization_id.clone()),
        title: Set(required_string(payload.title, "Title")?),
        description: Set(non_empty_optional(payload.description.unwrap_or_default())?),
        status: Set(optional_string(payload.status, "backlog")?),
        priority: Set(optional_string(payload.priority, "medium")?),
        created_by_id: Set(Some(actor_id.clone())),
        assigned_to_id: Set(assigned_to_id.clone()),
        attachments: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    record_issue_event(
        &state,
        &organization_id,
        &issue.id,
        Some(&actor_id),
        "created",
        vec![
            IssueChange {
                field: "title".to_owned(),
                before: Value::Null,
                after: json!(issue.title),
            },
            IssueChange {
                field: "description".to_owned(),
                before: Value::Null,
                after: issue
                    .description
                    .as_ref()
                    .map(|value| json!(value))
                    .unwrap_or(Value::Null),
            },
            IssueChange {
                field: "status".to_owned(),
                before: Value::Null,
                after: json!(issue.status),
            },
            IssueChange {
                field: "priority".to_owned(),
                before: Value::Null,
                after: json!(issue.priority),
            },
            IssueChange {
                field: "assignedToId".to_owned(),
                before: Value::Null,
                after: assigned_to_id.map(Value::String).unwrap_or(Value::Null),
            },
        ],
    )
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

    let before = issue.clone();
    let mut changes = Vec::new();
    let mut issue = issue.into_active_model();
    if let Some(title) = payload.title {
        let next = required_string(title, "Title")?;
        if let Some(change) = string_change("title", Some(&before.title), Some(&next)) {
            changes.push(change);
        }
        issue.title = Set(next);
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
        issue.description = Set(next);
    }
    if let Some(status) = payload.status {
        let next = required_string(status, "Status")?;
        if let Some(change) = string_change("status", Some(&before.status), Some(&next)) {
            changes.push(change);
        }
        issue.status = Set(next);
    }
    if let Some(priority) = payload.priority {
        let next = required_string(priority, "Priority")?;
        if let Some(change) = string_change("priority", Some(&before.priority), Some(&next)) {
            changes.push(change);
        }
        issue.priority = Set(next);
    }
    if let Some(value) = assigned_to_id {
        if let Some(change) = string_change(
            "assignedToId",
            before.assigned_to_id.as_deref(),
            value.as_deref(),
        ) {
            changes.push(change);
        }
        issue.assigned_to_id = Set(value);
    }
    issue.updated_at = Set(Utc::now().fixed_offset());

    let issue = issue.update(&state.db).await?;
    if !changes.is_empty() {
        record_issue_event(
            &state,
            &auth.organization.id,
            &issue.id,
            Some(&auth.user.id),
            "updated",
            changes,
        )
        .await?;
    }
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

async fn get_issue_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<IssueHistoryResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    find_issue(&state, &auth.organization.id, &id).await?;

    let events = issue_event::Entity::find()
        .filter(issue_event::Column::OrganizationId.eq(&auth.organization.id))
        .filter(issue_event::Column::IssueId.eq(&id))
        .order_by_desc(issue_event::Column::CreatedAt)
        .all(&state.db)
        .await?;

    let mut response = Vec::with_capacity(events.len());
    for event in events {
        response.push(issue_event_response(&state, event).await?);
    }

    Ok(Json(IssueHistoryResponse { events: response }))
}

async fn list_comments(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<IssueCommentsResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    find_issue(&state, &auth.organization.id, &id).await?;

    let comments = issue_comment::Entity::find()
        .filter(issue_comment::Column::OrganizationId.eq(&auth.organization.id))
        .filter(issue_comment::Column::IssueId.eq(&id))
        .order_by_asc(issue_comment::Column::CreatedAt)
        .all(&state.db)
        .await?;

    let mut response = Vec::with_capacity(comments.len());
    for comment in comments {
        response.push(issue_comment_response(&state, comment).await?);
    }

    Ok(Json(IssueCommentsResponse { comments: response }))
}

async fn create_comment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<CreateCommentRequest>,
) -> Result<(StatusCode, Json<IssueCommentEnvelope>), ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let issue = find_issue(&state, &auth.organization.id, &id).await?;
    let body = required_string(payload.body, "Comment")?;
    let now = Utc::now().fixed_offset();

    let comment = issue_comment::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(auth.organization.id.clone()),
        issue_id: Set(issue.id.clone()),
        author_id: Set(Some(auth.user.id.clone())),
        body: Set(body),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    let mut active = issue.into_active_model();
    active.updated_at = Set(Utc::now().fixed_offset());
    active.update(&state.db).await?;

    Ok((
        StatusCode::CREATED,
        Json(IssueCommentEnvelope {
            comment: issue_comment_response(&state, comment).await?,
        }),
    ))
}

async fn upload_attachment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    mut multipart: Multipart,
) -> Result<Json<IssueEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let issue = find_issue(&state, &auth.organization.id, &id).await?;
    let storage_config = state
        .config
        .storage
        .as_ref()
        .ok_or_else(|| ApiError::BadRequest("File storage is not configured".to_owned()))?;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::BadRequest("Invalid multipart upload".to_owned()))?
    {
        if field.name() != Some("file") {
            continue;
        }

        let filename = field.file_name().unwrap_or("attachment").to_owned();
        let content_type = field
            .content_type()
            .unwrap_or("application/octet-stream")
            .to_owned();
        let bytes = field
            .bytes()
            .await
            .map_err(|_| ApiError::BadRequest("Invalid uploaded file".to_owned()))?;

        if bytes.is_empty() {
            return Err(ApiError::BadRequest("Uploaded file is empty".to_owned()));
        }

        if bytes.len() > MAX_ATTACHMENT_BYTES {
            return Err(ApiError::BadRequest(format!(
                "Attachments must be {} MB or smaller",
                MAX_ATTACHMENT_BYTES / 1024 / 1024
            )));
        }

        let key = storage::safe_issue_object_key(&auth.organization.id, &issue.id, &filename);
        let stored =
            storage::put_object(storage_config, &key, &content_type, bytes.to_vec()).await?;
        let before_attachments = issue_attachments(&issue.attachments);
        let mut attachments = before_attachments.clone();
        attachments.push(AttachmentResponse {
            id: Uuid::new_v4().to_string(),
            name: filename,
            content_type,
            size: bytes.len(),
            key: stored.key,
            url: stored.url,
            created_at: Utc::now().to_rfc3339(),
        });

        let mut active = issue.into_active_model();
        active.attachments = Set(Some(serde_json::to_value(&attachments).map_err(
            |error| {
                ApiError::Internal(anyhow::anyhow!(
                    "failed to serialize issue attachments: {error}"
                ))
            },
        )?));
        active.updated_at = Set(Utc::now().fixed_offset());
        let issue = active.update(&state.db).await?;
        if let Some(attachment) = attachments.last() {
            record_issue_event(
                &state,
                &auth.organization.id,
                &issue.id,
                Some(&auth.user.id),
                "attachment_added",
                vec![IssueChange {
                    field: "attachments".to_owned(),
                    before: json!(before_attachments.len()),
                    after: serde_json::to_value(attachment).map_err(|error| {
                        ApiError::Internal(anyhow::anyhow!(
                            "failed to serialize attachment history: {error}"
                        ))
                    })?,
                }],
            )
            .await?;
        }

        return Ok(Json(IssueEnvelope {
            issue: issue_response(&state, issue).await?,
        }));
    }

    Err(ApiError::BadRequest("No file was uploaded".to_owned()))
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
        attachments: issue_attachments(&issue.attachments),
    })
}

fn issue_attachments(value: &Option<Value>) -> Vec<AttachmentResponse> {
    value
        .as_ref()
        .and_then(|value| serde_json::from_value(value.clone()).ok())
        .unwrap_or_default()
}

async fn issue_event_response(
    state: &AppState,
    event: issue_event::Model,
) -> Result<IssueEventResponse, ApiError> {
    let actor = match &event.actor_id {
        Some(id) => find_user_response(state, id).await?,
        None => None,
    };
    let changes = serde_json::from_value::<Vec<IssueChange>>(event.changes).unwrap_or_default();

    Ok(IssueEventResponse {
        id: event.id,
        action: event.action,
        changes,
        created_at: event.created_at.to_rfc3339(),
        actor,
    })
}

async fn issue_comment_response(
    state: &AppState,
    comment: issue_comment::Model,
) -> Result<IssueCommentResponse, ApiError> {
    let author = match &comment.author_id {
        Some(id) => find_user_response(state, id).await?,
        None => None,
    };

    Ok(IssueCommentResponse {
        id: comment.id,
        body: comment.body,
        created_at: comment.created_at.to_rfc3339(),
        updated_at: comment.updated_at.to_rfc3339(),
        author,
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
