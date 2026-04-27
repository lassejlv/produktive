use crate::{
    auth::AuthContext,
    error::ApiError,
    issue_helpers::{
        non_empty_optional, normalize_assignee, optional_string, required_string,
        validate_assignee,
    },
    state::AppState,
};
use chrono::Utc;
use produktive_ai::Tool;
use produktive_entity::{issue, member, user};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter, QueryOrder,
    QuerySelect, Set,
};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

pub fn registry() -> Vec<Tool> {
    vec![
        Tool {
            name: "list_issues".to_owned(),
            description: "List issues in the current workspace, optionally filtered by status, priority, or assignee. Returns at most 50 most recent issues.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "One of: backlog, todo, in-progress, done"
                    },
                    "priority": {
                        "type": "string",
                        "description": "One of: low, medium, high, urgent"
                    },
                    "assigned_to_id": {
                        "type": "string",
                        "description": "User id (from list_members) to filter by assignee"
                    }
                }
            }),
        },
        Tool {
            name: "get_issue".to_owned(),
            description: "Get a single issue by its id.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string" }
                },
                "required": ["id"]
            }),
        },
        Tool {
            name: "create_issue".to_owned(),
            description: "Create a new issue in the current workspace.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string" },
                    "description": { "type": "string" },
                    "status": { "type": "string", "description": "Defaults to 'backlog'. One of: backlog, todo, in-progress, done" },
                    "priority": { "type": "string", "description": "Defaults to 'medium'. One of: low, medium, high, urgent" },
                    "assigned_to_id": { "type": "string", "description": "User id from list_members" }
                },
                "required": ["title"]
            }),
        },
        Tool {
            name: "update_issue".to_owned(),
            description: "Update fields on an existing issue. Only provided fields are changed.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "title": { "type": "string" },
                    "description": { "type": "string" },
                    "status": { "type": "string" },
                    "priority": { "type": "string" },
                    "assigned_to_id": { "type": "string", "description": "Pass empty string to unassign" }
                },
                "required": ["id"]
            }),
        },
        Tool {
            name: "list_members".to_owned(),
            description: "List members of the current workspace. Use this to resolve names to user ids before assigning.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {}
            }),
        },
    ]
}

/// Dispatch a tool call. Returns either the structured success value, or
/// `{"error": "..."}` for validation/business errors so the model can self-correct.
/// Real DB/system errors bubble up as `ApiError::Internal`.
pub async fn dispatch(
    name: &str,
    args_json: &str,
    state: &AppState,
    auth: &AuthContext,
) -> Result<Value, ApiError> {
    let parsed_args: Value = match serde_json::from_str(args_json) {
        Ok(v) => v,
        Err(error) => {
            return Ok(json!({
                "error": format!("Invalid JSON arguments: {error}")
            }))
        }
    };

    let result = match name {
        "list_issues" => list_issues(parsed_args, state, auth).await,
        "get_issue" => get_issue(parsed_args, state, auth).await,
        "create_issue" => create_issue(parsed_args, state, auth).await,
        "update_issue" => update_issue(parsed_args, state, auth).await,
        "list_members" => list_members(state, auth).await,
        other => return Ok(json!({ "error": format!("Unknown tool: {other}") })),
    };

    match result {
        Ok(value) => Ok(value),
        Err(ApiError::BadRequest(msg)) | Err(ApiError::NotFound(msg)) => {
            Ok(json!({ "error": msg }))
        }
        Err(other) => Err(other),
    }
}

#[derive(Deserialize, Default)]
struct ListIssuesArgs {
    status: Option<String>,
    priority: Option<String>,
    assigned_to_id: Option<String>,
}

async fn list_issues(args: Value, state: &AppState, auth: &AuthContext) -> Result<Value, ApiError> {
    let args: ListIssuesArgs = serde_json::from_value(args).unwrap_or_default();

    let mut select = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&auth.organization.id))
        .order_by_desc(issue::Column::CreatedAt)
        .limit(50);

    if let Some(status) = args.status.and_then(|v| non_empty_optional(v).ok().flatten()) {
        select = select.filter(issue::Column::Status.eq(status));
    }
    if let Some(priority) = args
        .priority
        .and_then(|v| non_empty_optional(v).ok().flatten())
    {
        select = select.filter(issue::Column::Priority.eq(priority));
    }
    if let Some(assignee) = args
        .assigned_to_id
        .and_then(|v| non_empty_optional(v).ok().flatten())
    {
        select = select.filter(issue::Column::AssignedToId.eq(assignee));
    }

    let issues = select.all(&state.db).await?;
    let mut response = Vec::with_capacity(issues.len());
    for issue in issues {
        response.push(issue_brief(state, &issue).await?);
    }
    Ok(json!({ "issues": response }))
}

#[derive(Deserialize)]
struct GetIssueArgs {
    id: String,
}

async fn get_issue(args: Value, state: &AppState, auth: &AuthContext) -> Result<Value, ApiError> {
    let args: GetIssueArgs = serde_json::from_value(args)
        .map_err(|e| ApiError::BadRequest(format!("Invalid arguments for get_issue: {e}")))?;

    let issue = find_issue(state, &auth.organization.id, &args.id).await?;
    Ok(json!({ "issue": issue_full(state, &issue).await? }))
}

#[derive(Deserialize)]
struct CreateIssueArgs {
    title: String,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    assigned_to_id: Option<String>,
}

async fn create_issue(args: Value, state: &AppState, auth: &AuthContext) -> Result<Value, ApiError> {
    let args: CreateIssueArgs = serde_json::from_value(args)
        .map_err(|e| ApiError::BadRequest(format!("Invalid arguments for create_issue: {e}")))?;

    let assigned_to_id = normalize_assignee(args.assigned_to_id)?;
    validate_assignee(state, &auth.organization.id, assigned_to_id.as_deref()).await?;
    let now = Utc::now().fixed_offset();

    let issue = issue::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(auth.organization.id.clone()),
        title: Set(required_string(args.title, "Title")?),
        description: Set(non_empty_optional(args.description.unwrap_or_default())?),
        status: Set(optional_string(args.status, "backlog")?),
        priority: Set(optional_string(args.priority, "medium")?),
        created_by_id: Set(Some(auth.user.id.clone())),
        assigned_to_id: Set(assigned_to_id),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    Ok(json!({ "issue": issue_full(state, &issue).await? }))
}

#[derive(Deserialize)]
struct UpdateIssueArgs {
    id: String,
    title: Option<String>,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    assigned_to_id: Option<String>,
}

async fn update_issue(args: Value, state: &AppState, auth: &AuthContext) -> Result<Value, ApiError> {
    let args: UpdateIssueArgs = serde_json::from_value(args)
        .map_err(|e| ApiError::BadRequest(format!("Invalid arguments for update_issue: {e}")))?;

    let issue = find_issue(state, &auth.organization.id, &args.id).await?;
    let assigned_to_id = match args.assigned_to_id {
        Some(value) => Some(normalize_assignee(Some(value))?),
        None => None,
    };
    if let Some(value) = assigned_to_id.as_ref().and_then(|value| value.as_deref()) {
        validate_assignee(state, &auth.organization.id, Some(value)).await?;
    }

    let mut active = issue.into_active_model();
    if let Some(title) = args.title {
        active.title = Set(required_string(title, "Title")?);
    }
    if let Some(description) = args.description {
        active.description = Set(non_empty_optional(description)?);
    }
    if let Some(status) = args.status {
        active.status = Set(required_string(status, "Status")?);
    }
    if let Some(priority) = args.priority {
        active.priority = Set(required_string(priority, "Priority")?);
    }
    if let Some(value) = assigned_to_id {
        active.assigned_to_id = Set(value);
    }
    active.updated_at = Set(Utc::now().fixed_offset());

    let updated = active.update(&state.db).await?;
    Ok(json!({ "issue": issue_full(state, &updated).await? }))
}

async fn list_members(state: &AppState, auth: &AuthContext) -> Result<Value, ApiError> {
    let members = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(&auth.organization.id))
        .all(&state.db)
        .await?;

    let mut out = Vec::with_capacity(members.len());
    for m in members {
        if let Some(user) = user::Entity::find_by_id(&m.user_id).one(&state.db).await? {
            out.push(json!({
                "id": user.id,
                "name": user.name,
                "email": user.email,
            }));
        }
    }

    Ok(json!({ "members": out }))
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
        .ok_or_else(|| ApiError::NotFound(format!("Issue {id} not found")))
}

async fn issue_brief(state: &AppState, issue: &issue::Model) -> Result<Value, ApiError> {
    let assigned_to = match &issue.assigned_to_id {
        Some(id) => user::Entity::find_by_id(id)
            .one(&state.db)
            .await?
            .map(|u| json!({ "id": u.id, "name": u.name })),
        None => None,
    };
    Ok(json!({
        "id": issue.id,
        "title": issue.title,
        "status": issue.status,
        "priority": issue.priority,
        "assigned_to": assigned_to,
    }))
}

async fn issue_full(state: &AppState, issue: &issue::Model) -> Result<Value, ApiError> {
    let assigned_to = match &issue.assigned_to_id {
        Some(id) => user::Entity::find_by_id(id)
            .one(&state.db)
            .await?
            .map(|u| json!({ "id": u.id, "name": u.name, "email": u.email })),
        None => None,
    };
    Ok(json!({
        "id": issue.id,
        "title": issue.title,
        "description": issue.description,
        "status": issue.status,
        "priority": issue.priority,
        "assigned_to": assigned_to,
        "created_at": issue.created_at.to_rfc3339(),
        "updated_at": issue.updated_at.to_rfc3339(),
    }))
}
