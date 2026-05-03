use crate::{
    error::ApiError,
    http::issue_statuses::validate_issue_status,
    issue_helpers::{non_empty_optional, optional_string, required_string},
    issue_history::{record_issue_event, string_change, IssueChange},
    permissions::{has_permission, ISSUES_CREATE, ISSUES_UPDATE},
    state::AppState,
};
use chrono::Utc;
use produktive_ai::{CompletionResult, Message as AiMessage, Tool, ToolCall};
use produktive_entity::{issue, member, organization, user};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter, QueryOrder,
    QuerySelect, Set,
};
use serde_json::{json, Value};
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct IntegrationIssueRequest {
    pub title: String,
    pub description: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub struct IntegrationIssuePatch {
    pub title: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
}

pub async fn list_issues_text(
    state: &AppState,
    organization_id: &str,
    status: Option<&str>,
    priority: Option<&str>,
) -> Result<String, ApiError> {
    let mut select = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(organization_id))
        .order_by_desc(issue::Column::CreatedAt)
        .limit(10);

    if let Some(status) = status {
        let status = validate_issue_status(state, organization_id, status).await?;
        select = select.filter(issue::Column::Status.eq(status));
    }
    if let Some(priority) = valid_priority(priority) {
        select = select.filter(issue::Column::Priority.eq(priority));
    }

    let rows = select.all(&state.db).await?;
    if rows.is_empty() {
        return Ok("No matching issues.".to_owned());
    }

    Ok(rows
        .iter()
        .map(|issue| {
            format!(
                "- `{}` [{} / {}] {}",
                short_id(&issue.id),
                issue.status,
                issue.priority,
                issue.title
            )
        })
        .collect::<Vec<_>>()
        .join("\n"))
}

pub async fn create_issue_for_actor(
    state: &AppState,
    organization_id: &str,
    actor_id: &str,
    request: IntegrationIssueRequest,
) -> Result<issue::Model, ApiError> {
    if !has_permission(&state.db, actor_id, organization_id, ISSUES_CREATE).await? {
        return Err(ApiError::Forbidden(
            "Missing permission to create issues".to_owned(),
        ));
    }

    let status = validate_issue_status(
        state,
        organization_id,
        &optional_string(request.status, "backlog")?,
    )
    .await?;
    let priority = valid_priority(request.priority.as_deref())
        .ok_or_else(|| ApiError::BadRequest("Priority does not exist".to_owned()))?;
    let now = Utc::now().fixed_offset();
    let issue = issue::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization_id.to_owned()),
        title: Set(required_string(request.title, "Title")?
            .chars()
            .take(180)
            .collect()),
        description: Set(non_empty_optional(request.description.unwrap_or_default())?),
        status: Set(status),
        priority: Set(priority),
        created_by_id: Set(Some(actor_id.to_owned())),
        assigned_to_id: Set(None),
        parent_id: Set(None),
        project_id: Set(None),
        attachments: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    record_issue_event(
        state,
        organization_id,
        &issue.id,
        Some(actor_id),
        "created",
        vec![
            IssueChange {
                field: "title".to_owned(),
                before: Value::Null,
                after: json!(issue.title),
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
        ],
    )
    .await?;

    Ok(issue)
}

pub async fn update_issue_for_actor(
    state: &AppState,
    organization_id: &str,
    actor_id: &str,
    id: &str,
    patch: IntegrationIssuePatch,
) -> Result<issue::Model, ApiError> {
    if !has_permission(&state.db, actor_id, organization_id, ISSUES_UPDATE).await? {
        return Err(ApiError::Forbidden(
            "Missing permission to update issues".to_owned(),
        ));
    }

    let row = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(organization_id))
        .filter(issue::Column::Id.eq(id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Issue not found".to_owned()))?;

    let before = row.clone();
    let mut active = row.into_active_model();
    let mut changes = Vec::new();

    if let Some(title) = patch.title {
        let next = required_string(title, "Title")?;
        if let Some(change) = string_change("title", Some(&before.title), Some(&next)) {
            changes.push(change);
        }
        active.title = Set(next);
    }
    if let Some(status) = patch.status {
        let next =
            validate_issue_status(state, organization_id, &required_string(status, "Status")?)
                .await?;
        if let Some(change) = string_change("status", Some(&before.status), Some(&next)) {
            changes.push(change);
        }
        active.status = Set(next);
    }
    if let Some(priority) = patch.priority {
        let next = valid_priority(Some(&priority))
            .ok_or_else(|| ApiError::BadRequest("Priority does not exist".to_owned()))?;
        if let Some(change) = string_change("priority", Some(&before.priority), Some(&next)) {
            changes.push(change);
        }
        active.priority = Set(next);
    }
    if changes.is_empty() {
        return Err(ApiError::BadRequest("No changes provided".to_owned()));
    }

    active.updated_at = Set(Utc::now().fixed_offset());
    let updated = active.update(&state.db).await?;
    record_issue_event(
        state,
        organization_id,
        &updated.id,
        Some(actor_id),
        "updated",
        changes,
    )
    .await?;
    Ok(updated)
}

pub async fn require_workspace_member(
    state: &AppState,
    organization_id: &str,
    user_id: &str,
) -> Result<member::Model, ApiError> {
    member::Entity::find()
        .filter(member::Column::OrganizationId.eq(organization_id))
        .filter(member::Column::UserId.eq(user_id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::Forbidden("User is not a member of this workspace".to_owned()))
}

pub async fn agent_ask(
    state: &AppState,
    organization_id: &str,
    actor_id: &str,
    platform: &str,
    prompt: String,
) -> Result<String, ApiError> {
    let actor = user::Entity::find_by_id(actor_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Linked Produktive user was not found".to_owned()))?;
    let org = organization::Entity::find_by_id(organization_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Workspace not found".to_owned()))?;
    let system = format!(
        "You are Produktive's {platform} agent. Workspace: {} ({}). Current user: {} ({}). Be concise and practical.",
        org.name, org.id, actor.name, actor.id
    );
    let mut history = vec![AiMessage::user(prompt)];
    let tools = agent_tools();

    for _ in 0..5 {
        let result = state
            .ai
            .complete(&state.config.ai_model, &system, &history, &tools)
            .await
            .map_err(|error| ApiError::Internal(anyhow::anyhow!("AI request failed: {error}")))?;
        match result {
            CompletionResult::Text { text, .. } => return Ok(truncate_for_chat(&text)),
            CompletionResult::ToolCalls {
                calls,
                reasoning_content,
                ..
            } => {
                history.push(AiMessage::assistant_tool_calls_with_reasoning(
                    calls.clone(),
                    reasoning_content,
                ));
                for call in calls {
                    let value = dispatch_agent_tool(state, organization_id, actor_id, &call).await;
                    let content = serde_json::to_string(&value).unwrap_or_else(|_| "{}".to_owned());
                    history.push(AiMessage::tool_result(call.id, content));
                }
            }
        }
    }

    Ok("The agent hit its tool-call limit before finishing. Try a narrower request.".to_owned())
}

fn agent_tools() -> Vec<Tool> {
    vec![
        Tool {
            name: "list_issues".to_owned(),
            description: "List issues in the linked Produktive workspace. Optional filters: status and priority.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "status": { "type": "string" },
                    "priority": { "type": "string", "description": "low, medium, high, or urgent" }
                }
            }),
        },
        Tool {
            name: "create_issue".to_owned(),
            description: "Create an issue in the linked Produktive workspace.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string" },
                    "description": { "type": "string" },
                    "status": { "type": "string", "description": "Defaults to backlog" },
                    "priority": { "type": "string", "description": "Defaults to medium" }
                },
                "required": ["title"]
            }),
        },
        Tool {
            name: "update_issue".to_owned(),
            description: "Update an existing issue in the linked Produktive workspace. The id must be the full issue id from list_issues.".to_owned(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "title": { "type": "string" },
                    "status": { "type": "string" },
                    "priority": { "type": "string" }
                },
                "required": ["id"]
            }),
        },
    ]
}

async fn dispatch_agent_tool(
    state: &AppState,
    organization_id: &str,
    actor_id: &str,
    call: &ToolCall,
) -> Value {
    let args = match serde_json::from_str::<Value>(&call.arguments) {
        Ok(value) => value,
        Err(error) => return json!({ "error": format!("Invalid JSON arguments: {error}") }),
    };
    match call.name.as_str() {
        "list_issues" => {
            let status = args.get("status").and_then(Value::as_str);
            let priority = args.get("priority").and_then(Value::as_str);
            match list_issues_text(state, organization_id, status, priority).await {
                Ok(text) => json!({ "issues": text }),
                Err(error) => json!({ "error": error.to_string() }),
            }
        }
        "create_issue" => {
            let request = IntegrationIssueRequest {
                title: args
                    .get("title")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned(),
                description: args
                    .get("description")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
                status: args
                    .get("status")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
                priority: args
                    .get("priority")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
            };
            match create_issue_for_actor(state, organization_id, actor_id, request).await {
                Ok(issue) => json!({ "issue": issue_json(issue) }),
                Err(error) => json!({ "error": error.to_string() }),
            }
        }
        "update_issue" => {
            let Some(id) = args.get("id").and_then(Value::as_str) else {
                return json!({ "error": "id is required" });
            };
            let patch = IntegrationIssuePatch {
                title: args
                    .get("title")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
                status: args
                    .get("status")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
                priority: args
                    .get("priority")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
            };
            match update_issue_for_actor(state, organization_id, actor_id, id, patch).await {
                Ok(issue) => json!({ "issue": issue_json(issue) }),
                Err(error) => json!({ "error": error.to_string() }),
            }
        }
        other => json!({ "error": format!("Unknown tool: {other}") }),
    }
}

fn issue_json(issue: issue::Model) -> Value {
    json!({
        "id": issue.id,
        "title": issue.title,
        "status": issue.status,
        "priority": issue.priority,
    })
}

pub fn valid_priority(value: Option<&str>) -> Option<String> {
    let normalized = value.unwrap_or("medium").trim().to_lowercase();
    matches!(normalized.as_str(), "low" | "medium" | "high" | "urgent").then_some(normalized)
}

pub fn short_id(id: &str) -> String {
    id.chars().take(8).collect()
}

pub fn truncate_for_chat(text: &str) -> String {
    const LIMIT: usize = 2900;
    if text.chars().count() <= LIMIT {
        text.to_owned()
    } else {
        format!("{}...", text.chars().take(LIMIT - 3).collect::<String>())
    }
}
