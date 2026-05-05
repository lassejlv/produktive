use crate::{
    auth::AuthContext,
    error::ApiError,
    issue_helpers::{
        non_empty_optional, normalize_assignee, optional_string, required_string, validate_assignee,
    },
    issue_history::{record_issue_event, string_change, IssueChange},
    note_storage,
    state::AppState,
};
use chrono::Utc;
use produktive_ai::Tool;
use produktive_entity::{
    chat, chat_access, chat_message, issue, member, note, note_folder, note_mention, note_version,
    user,
};
use regex::Regex;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, Condition, ConnectionTrait, EntityTrait, IntoActiveModel,
    PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, Set, TransactionTrait,
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
            name: "list_notes".to_owned(),
            description: "List notes visible to the current user in the current workspace. Includes workspace notes and the current user's private notes. Returns at most 50 most recently updated notes.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Optional substring to search in note title/body."
                    },
                    "folder_id": {
                        "type": "string",
                        "description": "Optional folder id. Pass an empty string to list notes without a folder."
                    },
                    "visibility": {
                        "type": "string",
                        "description": "Optional visibility filter: workspace or private."
                    }
                }
            }),
        },
        Tool {
            name: "get_note".to_owned(),
            description: "Read a note visible to the current user by id, including its Markdown body.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string" }
                },
                "required": ["id"]
            }),
        },
        Tool {
            name: "create_note".to_owned(),
            description: "Create a workspace or private Markdown note in the current workspace.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string" },
                    "body_markdown": { "type": "string" },
                    "folder_id": { "type": "string", "description": "Optional note folder id." },
                    "visibility": { "type": "string", "description": "workspace or private. Defaults to workspace." }
                },
                "required": ["title"]
            }),
        },
        Tool {
            name: "update_note".to_owned(),
            description: "Update a note visible to the current user. Only provided fields are changed. Use this to let the agent edit notes directly when the user asks.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "title": { "type": "string" },
                    "body_markdown": { "type": "string" },
                    "folder_id": { "type": "string", "description": "Set folder id. Pass empty string to remove from folder." },
                    "visibility": { "type": "string", "description": "workspace or private." }
                },
                "required": ["id"]
            }),
        },
        Tool {
            name: "archive_note".to_owned(),
            description: "Archive a note visible to the current user. This is reversible in the database but hidden from normal note lists.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string" }
                },
                "required": ["id"]
            }),
        },
        Tool {
            name: "list_note_versions".to_owned(),
            description: "List committed versions for a note visible to the current user.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "The note id." }
                },
                "required": ["id"]
            }),
        },
        Tool {
            name: "commit_note".to_owned(),
            description: "Commit the current autosaved Markdown body of a visible note as an immutable version.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "The note id." },
                    "message": { "type": "string", "description": "Optional commit message." }
                },
                "required": ["id"]
            }),
        },
        Tool {
            name: "restore_note_version".to_owned(),
            description: "Restore a committed note version back into the note's current Markdown body.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "The note id." },
                    "version_id": { "type": "string", "description": "The note version id to restore." }
                },
                "required": ["id", "version_id"]
            }),
        },
        Tool {
            name: "list_note_folders".to_owned(),
            description: "List note folders visible to the current user in the current workspace.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {}
            }),
        },
        Tool {
            name: "create_note_folder".to_owned(),
            description: "Create a workspace or private folder for notes.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "name": { "type": "string" },
                    "visibility": { "type": "string", "description": "workspace or private. Defaults to workspace." }
                },
                "required": ["name"]
            }),
        },
        Tool {
            name: "update_note_folder".to_owned(),
            description: "Rename or change visibility for a visible note folder. Making a folder private also makes notes inside it private.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "name": { "type": "string" },
                    "visibility": { "type": "string", "description": "workspace or private." }
                },
                "required": ["id"]
            }),
        },
        Tool {
            name: "archive_note_folder".to_owned(),
            description: "Archive a visible note folder and move its notes back to no folder.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string" }
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
        "list_notes" => list_notes(parsed_args, state, auth).await,
        "get_note" => get_note(parsed_args, state, auth).await,
        "create_note" => create_note(parsed_args, state, auth).await,
        "update_note" => update_note(parsed_args, state, auth).await,
        "archive_note" => archive_note(parsed_args, state, auth).await,
        "list_note_versions" => list_note_versions(parsed_args, state, auth).await,
        "commit_note" => commit_note(parsed_args, state, auth).await,
        "restore_note_version" => restore_note_version(parsed_args, state, auth).await,
        "list_note_folders" => list_note_folders(state, auth).await,
        "create_note_folder" => create_note_folder(parsed_args, state, auth).await,
        "update_note_folder" => update_note_folder(parsed_args, state, auth).await,
        "archive_note_folder" => archive_note_folder(parsed_args, state, auth).await,
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

    let accessible_ids = accessible_chat_ids(state, auth).await?;
    if accessible_ids.is_empty() {
        return Ok(json!({ "chats": [] }));
    }

    let mut select = chat::Entity::find()
        .filter(chat::Column::OrganizationId.eq(&auth.organization.id))
        .filter(chat::Column::Id.is_in(accessible_ids))
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

async fn accessible_chat_ids(
    state: &AppState,
    auth: &AuthContext,
) -> Result<Vec<String>, ApiError> {
    let rows = chat_access::Entity::find()
        .filter(chat_access::Column::UserId.eq(&auth.user.id))
        .all(&state.db)
        .await?;
    Ok(rows.into_iter().map(|r| r.chat_id).collect())
}

#[derive(Deserialize)]
struct GetChatArgs {
    id: String,
}

async fn get_chat(args: Value, state: &AppState, auth: &AuthContext) -> Result<Value, ApiError> {
    let args: GetChatArgs = serde_json::from_value(args)
        .map_err(|e| ApiError::BadRequest(format!("Invalid arguments for get_chat: {e}")))?;

    let access = chat_access::Entity::find()
        .filter(chat_access::Column::ChatId.eq(&args.id))
        .filter(chat_access::Column::UserId.eq(&auth.user.id))
        .one(&state.db)
        .await?;
    if access.is_none() {
        return Err(ApiError::NotFound(format!("Chat {} not found", args.id)));
    }

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

#[derive(Deserialize, Default)]
struct ListNotesArgs {
    #[serde(default)]
    query: Option<String>,
    #[serde(default)]
    folder_id: Option<String>,
    #[serde(default)]
    visibility: Option<String>,
}

async fn list_notes(args: Value, state: &AppState, auth: &AuthContext) -> Result<Value, ApiError> {
    let args: ListNotesArgs = serde_json::from_value(args).unwrap_or_default();
    let mut select = note::Entity::find()
        .filter(note::Column::OrganizationId.eq(&auth.organization.id))
        .filter(note::Column::ArchivedAt.is_null())
        .filter(visible_note_condition(&auth.user.id))
        .order_by_desc(note::Column::UpdatedAt)
        .limit(50);

    if let Some(query) = args
        .query
        .and_then(|v| non_empty_optional(v).ok().flatten())
    {
        select = select.filter(
            Condition::any()
                .add(note::Column::Title.contains(&query))
                .add(note::Column::BodySnippet.contains(&query)),
        );
    }
    if let Some(folder_id) = args.folder_id {
        let folder_id = folder_id.trim();
        if folder_id.is_empty() {
            select = select.filter(note::Column::FolderId.is_null());
        } else {
            select = select.filter(note::Column::FolderId.eq(folder_id));
        }
    }
    if let Some(visibility) = args
        .visibility
        .and_then(|value| normalize_note_visibility(Some(&value)).ok())
    {
        select = select.filter(note::Column::Visibility.eq(visibility));
    }

    let notes = select.all(&state.db).await?;
    Ok(json!({
        "notes": notes.into_iter().map(note_brief).collect::<Vec<_>>()
    }))
}

#[derive(Deserialize)]
struct GetNoteArgs {
    id: String,
}

async fn get_note(args: Value, state: &AppState, auth: &AuthContext) -> Result<Value, ApiError> {
    let args: GetNoteArgs = serde_json::from_value(args)
        .map_err(|e| ApiError::BadRequest(format!("Invalid arguments for get_note: {e}")))?;
    let note = find_note(state, auth, &args.id).await?;
    Ok(json!({ "note": note_full(state, note).await? }))
}

#[derive(Deserialize)]
struct CreateNoteArgs {
    title: String,
    #[serde(default)]
    body_markdown: Option<String>,
    #[serde(default)]
    folder_id: Option<String>,
    #[serde(default)]
    visibility: Option<String>,
}

async fn create_note(args: Value, state: &AppState, auth: &AuthContext) -> Result<Value, ApiError> {
    let args: CreateNoteArgs = serde_json::from_value(args)
        .map_err(|e| ApiError::BadRequest(format!("Invalid arguments for create_note: {e}")))?;
    let folder = validate_note_folder(state, auth, args.folder_id.as_deref()).await?;
    let mut visibility = normalize_note_visibility(args.visibility.as_deref())?;
    if folder
        .as_ref()
        .is_some_and(|folder| folder.visibility == "private")
    {
        visibility = "private".to_owned();
    }
    let body = args.body_markdown.unwrap_or_default();
    let now = Utc::now().fixed_offset();
    let note_id = Uuid::new_v4().to_string();
    let version_id = Uuid::new_v4().to_string();
    let current_body =
        note_storage::write_current_body(state, &auth.organization.id, &note_id, &body).await?;
    let version_body = note_storage::write_version_body(
        state,
        &auth.organization.id,
        &note_id,
        &version_id,
        &body,
    )
    .await?;
    let txn = state.db.begin().await?;
    let model = note::ActiveModel {
        id: Set(note_id.clone()),
        organization_id: Set(auth.organization.id.clone()),
        folder_id: Set(folder.map(|folder| folder.id)),
        title: Set(normalize_note_title(&args.title)),
        body_markdown: Set(String::new()),
        current_object_key: Set(Some(current_body.object_key)),
        current_version_id: Set(Some(version_id.clone())),
        body_sha256: Set(Some(current_body.sha256)),
        body_snippet: Set(Some(current_body.snippet)),
        visibility: Set(visibility),
        created_by_id: Set(Some(auth.user.id.clone())),
        updated_by_id: Set(Some(auth.user.id.clone())),
        archived_at: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&txn)
    .await?;
    note_version::ActiveModel {
        id: Set(version_id),
        note_id: Set(note_id),
        object_key: Set(version_body.object_key),
        body_sha256: Set(version_body.sha256),
        parent_version_id: Set(None),
        commit_message: Set(Some("Initial version".to_owned())),
        created_by_id: Set(Some(auth.user.id.clone())),
        created_at: Set(now),
    }
    .insert(&txn)
    .await?;
    sync_note_mentions(&txn, &model.id, &body, now).await?;
    txn.commit().await?;
    Ok(json!({ "note": note_full(state, model).await? }))
}

#[derive(Deserialize)]
struct UpdateNoteArgs {
    id: String,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    body_markdown: Option<String>,
    #[serde(default)]
    folder_id: Option<String>,
    #[serde(default)]
    visibility: Option<String>,
}

async fn update_note(args: Value, state: &AppState, auth: &AuthContext) -> Result<Value, ApiError> {
    let args: UpdateNoteArgs = serde_json::from_value(args)
        .map_err(|e| ApiError::BadRequest(format!("Invalid arguments for update_note: {e}")))?;
    let existing = find_note(state, auth, &args.id).await?;
    let mut next_visibility = if let Some(visibility) = args.visibility.as_deref() {
        normalize_note_visibility(Some(visibility))?
    } else {
        existing.visibility.clone()
    };
    let mut next_folder_id = existing.folder_id.clone();
    if let Some(folder_id) = args.folder_id.as_deref() {
        let folder = validate_note_folder(state, auth, Some(folder_id)).await?;
        if folder
            .as_ref()
            .is_some_and(|folder| folder.visibility == "private")
        {
            next_visibility = "private".to_owned();
        }
        next_folder_id = folder.map(|folder| folder.id);
    } else if let Some(folder_id) = next_folder_id.as_deref() {
        let folder = find_note_folder(state, auth, folder_id).await?;
        if folder.visibility == "private" {
            next_visibility = "private".to_owned();
        }
    }

    let now = Utc::now().fixed_offset();
    let body_update = if let Some(body) = args.body_markdown {
        Some(
            note_storage::write_current_body(state, &auth.organization.id, &existing.id, &body)
                .await?,
        )
    } else {
        None
    };
    let mut active = existing.into_active_model();
    if let Some(title) = args.title {
        active.title = Set(normalize_note_title(&title));
    }
    if let Some(body_update) = body_update.as_ref() {
        active.body_markdown = Set(String::new());
        active.current_object_key = Set(Some(body_update.object_key.clone()));
        active.body_sha256 = Set(Some(body_update.sha256.clone()));
        active.body_snippet = Set(Some(body_update.snippet.clone()));
    }
    active.folder_id = Set(next_folder_id);
    active.visibility = Set(next_visibility);
    active.updated_by_id = Set(Some(auth.user.id.clone()));
    active.updated_at = Set(now);

    let txn = state.db.begin().await?;
    let updated = active.update(&txn).await?;
    if body_update.is_some() {
        let body = note_storage::read_current_body(state, &updated).await?;
        sync_note_mentions(&txn, &updated.id, &body, now).await?;
    }
    txn.commit().await?;
    Ok(json!({ "note": note_full(state, updated).await? }))
}

#[derive(Deserialize)]
struct ArchiveNoteArgs {
    id: String,
}

async fn archive_note(
    args: Value,
    state: &AppState,
    auth: &AuthContext,
) -> Result<Value, ApiError> {
    let args: ArchiveNoteArgs = serde_json::from_value(args)
        .map_err(|e| ApiError::BadRequest(format!("Invalid arguments for archive_note: {e}")))?;
    let existing = find_note(state, auth, &args.id).await?;
    let mut active = existing.into_active_model();
    active.archived_at = Set(Some(Utc::now().fixed_offset()));
    active.updated_by_id = Set(Some(auth.user.id.clone()));
    active.updated_at = Set(Utc::now().fixed_offset());
    let updated = active.update(&state.db).await?;
    Ok(json!({ "archived": true, "note": note_brief(updated) }))
}

#[derive(Deserialize)]
struct ListNoteVersionsArgs {
    id: String,
}

async fn list_note_versions(
    args: Value,
    state: &AppState,
    auth: &AuthContext,
) -> Result<Value, ApiError> {
    let args: ListNoteVersionsArgs = serde_json::from_value(args).map_err(|e| {
        ApiError::BadRequest(format!("Invalid arguments for list_note_versions: {e}"))
    })?;
    let note = find_note(state, auth, &args.id).await?;
    let versions = note_version::Entity::find()
        .filter(note_version::Column::NoteId.eq(&note.id))
        .order_by_desc(note_version::Column::CreatedAt)
        .all(&state.db)
        .await?;
    Ok(json!({
        "versions": versions.into_iter().map(note_version_brief).collect::<Vec<_>>()
    }))
}

#[derive(Deserialize)]
struct CommitNoteArgs {
    id: String,
    #[serde(default)]
    message: Option<String>,
}

async fn commit_note(args: Value, state: &AppState, auth: &AuthContext) -> Result<Value, ApiError> {
    let args: CommitNoteArgs = serde_json::from_value(args)
        .map_err(|e| ApiError::BadRequest(format!("Invalid arguments for commit_note: {e}")))?;
    let note = find_note(state, auth, &args.id).await?;
    let body = note_storage::read_current_body(state, &note).await?;
    let body_hash = note_storage::body_sha256(&body);
    if let Some(current_version_id) = note.current_version_id.as_deref() {
        if let Some(current_version) = note_version::Entity::find_by_id(current_version_id)
            .filter(note_version::Column::NoteId.eq(&note.id))
            .one(&state.db)
            .await?
        {
            if current_version.body_sha256 == body_hash {
                return Ok(
                    json!({ "version": note_version_brief(current_version), "created": false }),
                );
            }
        }
    }

    let now = Utc::now().fixed_offset();
    let version_id = Uuid::new_v4().to_string();
    let version_body = note_storage::write_version_body(
        state,
        &auth.organization.id,
        &note.id,
        &version_id,
        &body,
    )
    .await?;
    let commit_message = args
        .message
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(240).collect::<String>());

    let txn = state.db.begin().await?;
    let version = note_version::ActiveModel {
        id: Set(version_id.clone()),
        note_id: Set(note.id.clone()),
        object_key: Set(version_body.object_key),
        body_sha256: Set(version_body.sha256),
        parent_version_id: Set(note.current_version_id.clone()),
        commit_message: Set(commit_message),
        created_by_id: Set(Some(auth.user.id.clone())),
        created_at: Set(now),
    }
    .insert(&txn)
    .await?;
    let mut active = note.into_active_model();
    active.current_version_id = Set(Some(version_id));
    active.body_sha256 = Set(Some(body_hash));
    active.body_snippet = Set(Some(note_storage::body_snippet(&body)));
    active.updated_by_id = Set(Some(auth.user.id.clone()));
    active.updated_at = Set(now);
    active.update(&txn).await?;
    txn.commit().await?;

    Ok(json!({ "version": note_version_brief(version), "created": true }))
}

#[derive(Deserialize)]
struct RestoreNoteVersionArgs {
    id: String,
    version_id: String,
}

async fn restore_note_version(
    args: Value,
    state: &AppState,
    auth: &AuthContext,
) -> Result<Value, ApiError> {
    let args: RestoreNoteVersionArgs = serde_json::from_value(args).map_err(|e| {
        ApiError::BadRequest(format!("Invalid arguments for restore_note_version: {e}"))
    })?;
    let note = find_note(state, auth, &args.id).await?;
    let version = note_version::Entity::find_by_id(&args.version_id)
        .filter(note_version::Column::NoteId.eq(&note.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Note version {} not found", args.version_id)))?;
    let body = note_storage::read_body_key(state, &version.object_key).await?;
    let current_body =
        note_storage::write_current_body(state, &auth.organization.id, &note.id, &body).await?;
    let now = Utc::now().fixed_offset();

    let txn = state.db.begin().await?;
    let mut active = note.into_active_model();
    active.current_object_key = Set(Some(current_body.object_key));
    active.current_version_id = Set(Some(version.id));
    active.body_sha256 = Set(Some(current_body.sha256));
    active.body_snippet = Set(Some(current_body.snippet));
    active.body_markdown = Set(String::new());
    active.updated_by_id = Set(Some(auth.user.id.clone()));
    active.updated_at = Set(now);
    let updated = active.update(&txn).await?;
    sync_note_mentions(&txn, &updated.id, &body, now).await?;
    txn.commit().await?;

    Ok(json!({ "restored": true, "note": note_full(state, updated).await? }))
}

async fn list_note_folders(state: &AppState, auth: &AuthContext) -> Result<Value, ApiError> {
    let folders = note_folder::Entity::find()
        .filter(note_folder::Column::OrganizationId.eq(&auth.organization.id))
        .filter(note_folder::Column::ArchivedAt.is_null())
        .filter(visible_folder_condition(&auth.user.id))
        .order_by_asc(note_folder::Column::Name)
        .all(&state.db)
        .await?;
    Ok(json!({
        "folders": folders.into_iter().map(folder_brief).collect::<Vec<_>>()
    }))
}

#[derive(Deserialize)]
struct CreateNoteFolderArgs {
    name: String,
    #[serde(default)]
    visibility: Option<String>,
}

async fn create_note_folder(
    args: Value,
    state: &AppState,
    auth: &AuthContext,
) -> Result<Value, ApiError> {
    let args: CreateNoteFolderArgs = serde_json::from_value(args).map_err(|e| {
        ApiError::BadRequest(format!("Invalid arguments for create_note_folder: {e}"))
    })?;
    let now = Utc::now().fixed_offset();
    let folder = note_folder::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(auth.organization.id.clone()),
        name: Set(normalize_folder_name(&args.name)?),
        visibility: Set(normalize_note_visibility(args.visibility.as_deref())?),
        created_by_id: Set(Some(auth.user.id.clone())),
        updated_by_id: Set(Some(auth.user.id.clone())),
        archived_at: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;
    Ok(json!({ "folder": folder_brief(folder) }))
}

#[derive(Deserialize)]
struct UpdateNoteFolderArgs {
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    visibility: Option<String>,
}

async fn update_note_folder(
    args: Value,
    state: &AppState,
    auth: &AuthContext,
) -> Result<Value, ApiError> {
    let args: UpdateNoteFolderArgs = serde_json::from_value(args).map_err(|e| {
        ApiError::BadRequest(format!("Invalid arguments for update_note_folder: {e}"))
    })?;
    let folder = find_note_folder(state, auth, &args.id).await?;
    let mut make_notes_private = false;
    let now = Utc::now().fixed_offset();
    let mut active = folder.into_active_model();
    if let Some(name) = args.name.as_deref() {
        active.name = Set(normalize_folder_name(name)?);
    }
    if let Some(visibility) = args.visibility.as_deref() {
        let visibility = normalize_note_visibility(Some(visibility))?;
        make_notes_private = visibility == "private";
        active.visibility = Set(visibility);
    }
    active.updated_by_id = Set(Some(auth.user.id.clone()));
    active.updated_at = Set(now);

    let txn = state.db.begin().await?;
    let updated = active.update(&txn).await?;
    if make_notes_private {
        note::Entity::update_many()
            .filter(note::Column::FolderId.eq(&args.id))
            .col_expr(
                note::Column::Visibility,
                sea_orm::sea_query::Expr::value("private"),
            )
            .exec(&txn)
            .await?;
    }
    txn.commit().await?;
    Ok(json!({ "folder": folder_brief(updated) }))
}

#[derive(Deserialize)]
struct ArchiveNoteFolderArgs {
    id: String,
}

async fn archive_note_folder(
    args: Value,
    state: &AppState,
    auth: &AuthContext,
) -> Result<Value, ApiError> {
    let args: ArchiveNoteFolderArgs = serde_json::from_value(args).map_err(|e| {
        ApiError::BadRequest(format!("Invalid arguments for archive_note_folder: {e}"))
    })?;
    let folder = find_note_folder(state, auth, &args.id).await?;
    let now = Utc::now().fixed_offset();
    let txn = state.db.begin().await?;
    let mut active = folder.into_active_model();
    active.archived_at = Set(Some(now));
    active.updated_by_id = Set(Some(auth.user.id.clone()));
    active.updated_at = Set(now);
    active.update(&txn).await?;
    note::Entity::update_many()
        .filter(note::Column::FolderId.eq(&args.id))
        .col_expr(
            note::Column::FolderId,
            sea_orm::sea_query::Expr::value(Option::<String>::None),
        )
        .exec(&txn)
        .await?;
    txn.commit().await?;
    Ok(json!({ "archived": true, "folder_id": args.id }))
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

fn visible_note_condition(user_id: &str) -> Condition {
    Condition::any()
        .add(note::Column::Visibility.eq("workspace"))
        .add(
            Condition::all()
                .add(note::Column::Visibility.eq("private"))
                .add(note::Column::CreatedById.eq(user_id)),
        )
}

fn visible_folder_condition(user_id: &str) -> Condition {
    Condition::any()
        .add(note_folder::Column::Visibility.eq("workspace"))
        .add(
            Condition::all()
                .add(note_folder::Column::Visibility.eq("private"))
                .add(note_folder::Column::CreatedById.eq(user_id)),
        )
}

async fn find_note(
    state: &AppState,
    auth: &AuthContext,
    id: &str,
) -> Result<note::Model, ApiError> {
    note::Entity::find()
        .filter(note::Column::Id.eq(id))
        .filter(note::Column::OrganizationId.eq(&auth.organization.id))
        .filter(note::Column::ArchivedAt.is_null())
        .filter(visible_note_condition(&auth.user.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Note {id} not found")))
}

async fn find_note_folder(
    state: &AppState,
    auth: &AuthContext,
    id: &str,
) -> Result<note_folder::Model, ApiError> {
    note_folder::Entity::find()
        .filter(note_folder::Column::Id.eq(id))
        .filter(note_folder::Column::OrganizationId.eq(&auth.organization.id))
        .filter(note_folder::Column::ArchivedAt.is_null())
        .filter(visible_folder_condition(&auth.user.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Note folder {id} not found")))
}

async fn validate_note_folder(
    state: &AppState,
    auth: &AuthContext,
    folder_id: Option<&str>,
) -> Result<Option<note_folder::Model>, ApiError> {
    let Some(folder_id) = folder_id.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    find_note_folder(state, auth, folder_id).await.map(Some)
}

fn normalize_note_title(value: &str) -> String {
    value
        .trim()
        .chars()
        .take(180)
        .collect::<String>()
        .trim()
        .to_owned()
        .if_empty("Untitled")
}

fn normalize_folder_name(value: &str) -> Result<String, ApiError> {
    let name = value.trim();
    if name.is_empty() {
        return Err(ApiError::BadRequest("Folder name is required".to_owned()));
    }
    Ok(name.chars().take(120).collect())
}

fn normalize_note_visibility(value: Option<&str>) -> Result<String, ApiError> {
    match value.unwrap_or("workspace").trim() {
        "workspace" => Ok("workspace".to_owned()),
        "private" => Ok("private".to_owned()),
        _ => Err(ApiError::BadRequest(
            "Visibility must be workspace or private".to_owned(),
        )),
    }
}

fn note_brief(note: note::Model) -> Value {
    json!({
        "id": note.id,
        "folder_id": note.folder_id,
        "title": note.title,
        "visibility": note.visibility,
        "snippet": note.body_snippet.unwrap_or_default().chars().take(280).collect::<String>(),
        "body_sha256": note.body_sha256,
        "current_version_id": note.current_version_id,
        "created_at": note.created_at.to_rfc3339(),
        "updated_at": note.updated_at.to_rfc3339(),
    })
}

async fn note_full(state: &AppState, note: note::Model) -> Result<Value, ApiError> {
    let body_markdown = note_storage::read_current_body(state, &note).await?;
    let current_version = match note.current_version_id.as_deref() {
        Some(version_id) => {
            note_version::Entity::find_by_id(version_id)
                .filter(note_version::Column::NoteId.eq(&note.id))
                .one(&state.db)
                .await?
        }
        None => None,
    };
    let has_uncommitted_changes = current_version
        .as_ref()
        .map(|version| note.body_sha256.as_deref() != Some(version.body_sha256.as_str()))
        .unwrap_or(true);
    Ok(json!({
        "id": note.id,
        "folder_id": note.folder_id,
        "title": note.title,
        "body_markdown": body_markdown,
        "body_sha256": note.body_sha256,
        "current_version_id": note.current_version_id,
        "has_uncommitted_changes": has_uncommitted_changes,
        "visibility": note.visibility,
        "created_by_id": note.created_by_id,
        "updated_by_id": note.updated_by_id,
        "created_at": note.created_at.to_rfc3339(),
        "updated_at": note.updated_at.to_rfc3339(),
    }))
}

fn note_version_brief(version: note_version::Model) -> Value {
    json!({
        "id": version.id,
        "note_id": version.note_id,
        "body_sha256": version.body_sha256,
        "parent_version_id": version.parent_version_id,
        "commit_message": version.commit_message,
        "created_by_id": version.created_by_id,
        "created_at": version.created_at.to_rfc3339(),
    })
}

fn folder_brief(folder: note_folder::Model) -> Value {
    json!({
        "id": folder.id,
        "name": folder.name,
        "visibility": folder.visibility,
        "created_at": folder.created_at.to_rfc3339(),
        "updated_at": folder.updated_at.to_rfc3339(),
    })
}

async fn sync_note_mentions<C>(
    db: &C,
    note_id: &str,
    body_markdown: &str,
    now: chrono::DateTime<chrono::FixedOffset>,
) -> Result<(), ApiError>
where
    C: ConnectionTrait,
{
    note_mention::Entity::delete_many()
        .filter(note_mention::Column::NoteId.eq(note_id))
        .exec(db)
        .await?;

    for (target_type, target_id) in parse_note_mentions(body_markdown) {
        note_mention::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            note_id: Set(note_id.to_owned()),
            target_type: Set(target_type),
            target_id: Set(target_id),
            created_at: Set(now),
        }
        .insert(db)
        .await?;
    }
    Ok(())
}

fn parse_note_mentions(markdown: &str) -> Vec<(String, String)> {
    let Ok(pattern) = Regex::new(r"\[[^\]]+\]\(produktive://(issue|chat|user)/([^)]+)\)") else {
        return Vec::new();
    };
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for capture in pattern.captures_iter(markdown) {
        let target_type = capture.get(1).map(|m| m.as_str()).unwrap_or_default();
        let target_id = capture.get(2).map(|m| m.as_str()).unwrap_or_default();
        if target_id.is_empty() {
            continue;
        }
        if seen.insert((target_type.to_owned(), target_id.to_owned())) {
            out.push((target_type.to_owned(), target_id.to_owned()));
        }
    }
    out
}

trait IfEmpty {
    fn if_empty(self, fallback: &str) -> String;
}

impl IfEmpty for String {
    fn if_empty(self, fallback: &str) -> String {
        if self.is_empty() {
            fallback.to_owned()
        } else {
            self
        }
    }
}
