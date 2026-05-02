use crate::{
    auth::AuthContext,
    error::ApiError,
    issue_helpers::{
        non_empty_optional, normalize_assignee, optional_string, required_string, validate_assignee,
    },
    issue_history::{record_issue_event, string_change, IssueChange},
    state::AppState,
};
use chrono::Utc;
use produktive_ai::Tool;
use produktive_entity::{chat, chat_message, issue, member, user};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, PaginatorTrait, QueryFilter,
    QueryOrder, QuerySelect, Set,
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
        Tool {
            name: "list_chats".to_owned(),
            description: "List previous chats in the current workspace, most recently updated first. Use this to find a chat the user has referenced. Returns at most 30 chats.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Optional substring to filter chat titles (case-insensitive)."
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max number of chats to return (1-30). Defaults to 30."
                    }
                }
            }),
        },
        Tool {
            name: "get_chat".to_owned(),
            description: "Fetch the full message history of a previous chat in the current workspace. Use this after the user @-references a chat or after list_chats. Returns up to 200 of the most recent messages.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "The chat id." }
                },
                "required": ["id"]
            }),
        },
        Tool {
            name: "ask_user".to_owned(),
            description: "Ask the user a clarifying question when you genuinely need more information to proceed. After calling this tool, STOP — do not call other tools and do not generate any further text. The user will respond and you'll continue on the next turn.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "The question to ask the user. Be concise and specific."
                    },
                    "options": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Optional list of suggested answers the user can pick from. Omit for free-form text answers."
                    }
                },
                "required": ["question"]
            }),
        },
    ]
}

pub fn is_terminal_tool(name: &str) -> bool {
    name == "ask_user"
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
        "list_chats" => list_chats(parsed_args, state, auth).await,
        "get_chat" => get_chat(parsed_args, state, auth).await,
        "ask_user" => ask_user(parsed_args).await,
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

    if let Some(status) = args
        .status
        .and_then(|v| non_empty_optional(v).ok().flatten())
    {
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

async fn create_issue(
    args: Value,
    state: &AppState,
    auth: &AuthContext,
) -> Result<Value, ApiError> {
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
        parent_id: Set(None),
        project_id: Set(None),
        attachments: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    let changes = vec![
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
            after: issue
                .assigned_to_id
                .as_ref()
                .map(|value| json!(value))
                .unwrap_or(Value::Null),
        },
    ];

    record_issue_event(
        state,
        &auth.organization.id,
        &issue.id,
        Some(&auth.user.id),
        "created",
        changes.clone(),
    )
    .await?;

    Ok(json!({ "issue": issue_full(state, &issue).await?, "changes": changes }))
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

async fn update_issue(
    args: Value,
    state: &AppState,
    auth: &AuthContext,
) -> Result<Value, ApiError> {
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

    let before = issue.clone();
    let mut changes = Vec::new();
    let mut active = issue.into_active_model();
    if let Some(title) = args.title {
        let next = required_string(title, "Title")?;
        if let Some(change) = string_change("title", Some(&before.title), Some(&next)) {
            changes.push(change);
        }
        active.title = Set(next);
    }
    if let Some(description) = args.description {
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
    if let Some(status) = args.status {
        let next = required_string(status, "Status")?;
        if let Some(change) = string_change("status", Some(&before.status), Some(&next)) {
            changes.push(change);
        }
        active.status = Set(next);
    }
    if let Some(priority) = args.priority {
        let next = required_string(priority, "Priority")?;
        if let Some(change) = string_change("priority", Some(&before.priority), Some(&next)) {
            changes.push(change);
        }
        active.priority = Set(next);
    }
    if let Some(value) = assigned_to_id {
        if let Some(change) = string_change(
            "assignedToId",
            before.assigned_to_id.as_deref(),
            value.as_deref(),
        ) {
            changes.push(change);
        }
        active.assigned_to_id = Set(value);
    }
    active.updated_at = Set(Utc::now().fixed_offset());

    let updated = active.update(&state.db).await?;
    let response_changes = changes.clone();
    if !changes.is_empty() {
        record_issue_event(
            state,
            &auth.organization.id,
            &updated.id,
            Some(&auth.user.id),
            "updated",
            changes,
        )
        .await?;
    }
    Ok(json!({ "issue": issue_full(state, &updated).await?, "changes": response_changes }))
}

#[derive(Deserialize)]
struct AskUserArgs {
    question: String,
    #[serde(default)]
    options: Option<Vec<String>>,
}

async fn ask_user(args: Value) -> Result<Value, ApiError> {
    let args: AskUserArgs = serde_json::from_value(args)
        .map_err(|e| ApiError::BadRequest(format!("Invalid arguments for ask_user: {e}")))?;
    let question = args.question.trim();
    if question.is_empty() {
        return Err(ApiError::BadRequest(
            "ask_user requires a non-empty question".to_owned(),
        ));
    }
    Ok(json!({
        "asked": true,
        "question": question,
        "options": args.options.unwrap_or_default(),
    }))
}

#[derive(Deserialize, Default)]
struct ListChatsArgs {
    #[serde(default)]
    query: Option<String>,
    #[serde(default)]
    limit: Option<u64>,
}

async fn list_chats(args: Value, state: &AppState, auth: &AuthContext) -> Result<Value, ApiError> {
    let args: ListChatsArgs = serde_json::from_value(args).unwrap_or_default();
    let limit = args.limit.unwrap_or(30).clamp(1, 30);

    let mut select = chat::Entity::find()
        .filter(chat::Column::OrganizationId.eq(&auth.organization.id))
        .order_by_desc(chat::Column::UpdatedAt)
        .limit(limit);

    if let Some(query) = args
        .query
        .and_then(|v| non_empty_optional(v).ok().flatten())
    {
        let pattern = format!("%{}%", query.to_lowercase());
        select = select.filter(chat::Column::Title.like(&pattern));
    }

    let chats = select.all(&state.db).await?;
    let mut response = Vec::with_capacity(chats.len());
    for chat in chats {
        let message_count = chat_message::Entity::find()
            .filter(chat_message::Column::ChatId.eq(&chat.id))
            .count(&state.db)
            .await?;
        response.push(json!({
            "id": chat.id,
            "title": chat.title,
            "message_count": message_count,
            "created_at": chat.created_at.to_rfc3339(),
            "updated_at": chat.updated_at.to_rfc3339(),
        }));
    }
    Ok(json!({ "chats": response }))
}

#[derive(Deserialize)]
struct GetChatArgs {
    id: String,
}

async fn get_chat(args: Value, state: &AppState, auth: &AuthContext) -> Result<Value, ApiError> {
    let args: GetChatArgs = serde_json::from_value(args)
        .map_err(|e| ApiError::BadRequest(format!("Invalid arguments for get_chat: {e}")))?;

    let chat = chat::Entity::find()
        .filter(chat::Column::Id.eq(&args.id))
        .filter(chat::Column::OrganizationId.eq(&auth.organization.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Chat {} not found", args.id)))?;

    let messages = chat_message::Entity::find()
        .filter(chat_message::Column::ChatId.eq(&chat.id))
        .order_by_asc(chat_message::Column::CreatedAt)
        .limit(200)
        .all(&state.db)
        .await?;

    let serialized: Vec<Value> = messages
        .into_iter()
        .map(|message| {
            json!({
                "role": message.role,
                "content": message.content,
                "tool_calls": message.tool_calls,
                "created_at": message.created_at.to_rfc3339(),
            })
        })
        .collect();

    Ok(json!({
        "chat": {
            "id": chat.id,
            "title": chat.title,
            "created_at": chat.created_at.to_rfc3339(),
            "updated_at": chat.updated_at.to_rfc3339(),
            "messages": serialized,
        }
    }))
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
        "attachments": issue.attachments.clone().unwrap_or_else(|| json!([])),
        "created_at": issue.created_at.to_rfc3339(),
        "updated_at": issue.updated_at.to_rfc3339(),
    }))
}
