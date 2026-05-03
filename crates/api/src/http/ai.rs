use crate::{ai_models::AI_MODELS, auth::require_auth, error::ApiError, state::AppState};
use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use produktive_ai::{CompletionResult, Message as AiMessage};
use produktive_entity::{issue, issue_comment, issue_event, issue_status, project, user};
use sea_orm::{ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const MAX_CONTEXT_ISSUES: u64 = 60;
const MAX_CONTEXT_PROJECTS: u64 = 20;
const MAX_PROJECT_EVENTS: u64 = 24;
const MAX_PROJECT_COMMENTS: u64 = 12;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/models", get(list_models))
        .route("/workspace-brief", post(generate_workspace_brief))
        .route(
            "/projects/{project_id}/health",
            post(generate_project_health),
        )
        .route("/issue-draft", post(generate_issue_draft))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelEntry {
    id: &'static str,
    name: &'static str,
    is_default: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelsResponse {
    models: Vec<ModelEntry>,
    default_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueDraftRequest {
    title: String,
    description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueDraftResponse {
    title: String,
    description: String,
    status: Option<String>,
    priority: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiBriefResponse {
    summary: String,
    risks: Vec<String>,
    next_actions: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    status_update: Option<String>,
    generated_at: String,
}

async fn list_models(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ModelsResponse>, ApiError> {
    require_auth(&headers, &state).await?;

    let default_id = state.config.ai_model.clone();
    let models = AI_MODELS
        .iter()
        .map(|model| ModelEntry {
            id: model.id,
            name: model.name,
            is_default: model.id == default_id,
        })
        .collect();

    Ok(Json(ModelsResponse { models, default_id }))
}

async fn generate_workspace_brief(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AiBriefResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let context = workspace_context(&state, &auth.organization.id).await?;
    let prompt = format!(
        "Generate an operational brief for the current Produktive workspace.\n\n{}",
        context
    );
    let mut response = generate_brief(&state, workspace_brief_system_prompt(), prompt).await?;
    response.status_update = None;
    Ok(Json(response))
}

async fn generate_project_health(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_id): Path<String>,
) -> Result<Json<AiBriefResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let project = project::Entity::find()
        .filter(project::Column::Id.eq(&project_id))
        .filter(project::Column::OrganizationId.eq(&auth.organization.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Project not found".to_owned()))?;
    let context = project_context(&state, &auth.organization.id, &project).await?;
    let prompt = format!(
        "Generate a health summary for this Produktive project.\n\n{}",
        context
    );
    generate_brief(&state, project_health_system_prompt(), prompt)
        .await
        .map(Json)
}

async fn generate_issue_draft(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<IssueDraftRequest>,
) -> Result<Json<IssueDraftResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let raw_title = payload.title.trim();
    let raw_description = payload.description.as_deref().unwrap_or("").trim();
    if raw_title.is_empty() && raw_description.is_empty() {
        return Err(ApiError::BadRequest(
            "Add a rough title or description first".to_owned(),
        ));
    }

    let statuses = issue_status_map(&state, &auth.organization.id).await?;
    let prompt = json!({
        "rough_title": raw_title,
        "rough_description": raw_description,
        "available_statuses": statuses,
        "available_priorities": ["urgent", "high", "medium", "low"],
    })
    .to_string();

    let result = state
        .ai
        .complete(
            &state.config.ai_model,
            issue_draft_system_prompt(),
            &[AiMessage::user(prompt)],
            &[],
        )
        .await
        .map_err(|error| ApiError::Internal(anyhow::anyhow!("AI request failed: {error}")))?;

    let text = match result {
        CompletionResult::Text { text, .. } => text,
        CompletionResult::ToolCalls { .. } => {
            return Err(ApiError::Internal(anyhow::anyhow!(
                "AI returned tool calls for an issue draft"
            )))
        }
    };

    parse_issue_draft_response(&text).map(Json)
}

async fn generate_brief(
    state: &AppState,
    system_prompt: &str,
    user_prompt: String,
) -> Result<AiBriefResponse, ApiError> {
    let result = state
        .ai
        .complete(
            &state.config.ai_model,
            system_prompt,
            &[AiMessage::user(user_prompt)],
            &[],
        )
        .await
        .map_err(|error| ApiError::Internal(anyhow::anyhow!("AI request failed: {error}")))?;

    let text = match result {
        CompletionResult::Text { text, .. } => text,
        CompletionResult::ToolCalls { .. } => {
            return Err(ApiError::Internal(anyhow::anyhow!(
                "AI returned tool calls for a read-only brief"
            )))
        }
    };

    let mut parsed = parse_brief_response(&text)?;
    parsed.generated_at = Utc::now().to_rfc3339();
    Ok(parsed)
}

async fn workspace_context(state: &AppState, organization_id: &str) -> Result<String, ApiError> {
    let statuses = issue_status_map(state, organization_id).await?;
    let issues = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(organization_id))
        .order_by_desc(issue::Column::UpdatedAt)
        .limit(MAX_CONTEXT_ISSUES)
        .all(&state.db)
        .await?;
    let projects = project::Entity::find()
        .filter(project::Column::OrganizationId.eq(organization_id))
        .filter(project::Column::ArchivedAt.is_null())
        .order_by_desc(project::Column::UpdatedAt)
        .limit(MAX_CONTEXT_PROJECTS)
        .all(&state.db)
        .await?;

    let total_issues = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(organization_id))
        .count(&state.db)
        .await?;
    let open_issues = issues
        .iter()
        .filter(|item| !is_done_like(&statuses, &item.status))
        .count();

    Ok(json!({
        "workspace": {
            "total_issues": total_issues,
            "sampled_recent_issues": issues.len(),
            "open_issues_in_sample": open_issues,
        },
        "statuses": statuses,
        "projects": projects.into_iter().map(project_context_item).collect::<Vec<_>>(),
        "recent_issues": issues.into_iter().map(|item| issue_context_item(&statuses, item)).collect::<Vec<_>>(),
    })
    .to_string())
}

async fn project_context(
    state: &AppState,
    organization_id: &str,
    project: &project::Model,
) -> Result<String, ApiError> {
    let statuses = issue_status_map(state, organization_id).await?;
    let issues = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(organization_id))
        .filter(issue::Column::ProjectId.eq(&project.id))
        .order_by_desc(issue::Column::UpdatedAt)
        .limit(MAX_CONTEXT_ISSUES)
        .all(&state.db)
        .await?;
    let issue_ids = issues
        .iter()
        .map(|item| item.id.clone())
        .collect::<Vec<_>>();
    let comments = if issue_ids.is_empty() {
        Vec::new()
    } else {
        issue_comment::Entity::find()
            .filter(issue_comment::Column::OrganizationId.eq(organization_id))
            .filter(issue_comment::Column::IssueId.is_in(issue_ids.clone()))
            .order_by_desc(issue_comment::Column::UpdatedAt)
            .limit(MAX_PROJECT_COMMENTS)
            .all(&state.db)
            .await?
    };
    let events = if issue_ids.is_empty() {
        Vec::new()
    } else {
        issue_event::Entity::find()
            .filter(issue_event::Column::OrganizationId.eq(organization_id))
            .filter(issue_event::Column::IssueId.is_in(issue_ids))
            .order_by_desc(issue_event::Column::CreatedAt)
            .limit(MAX_PROJECT_EVENTS)
            .all(&state.db)
            .await?
    };
    let lead = match &project.lead_id {
        Some(id) => user::Entity::find_by_id(id).one(&state.db).await?,
        None => None,
    };

    Ok(json!({
        "project": {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "status": project.status,
            "lead": lead.map(|user| json!({ "id": user.id, "name": user.name, "email": user.email })),
            "target_date": project.target_date.map(|date| date.to_rfc3339()),
            "created_at": project.created_at.to_rfc3339(),
            "updated_at": project.updated_at.to_rfc3339(),
        },
        "statuses": statuses,
        "issues": issues.into_iter().map(|item| issue_context_item(&statuses, item)).collect::<Vec<_>>(),
        "recent_comments": comments.into_iter().map(comment_context_item).collect::<Vec<_>>(),
        "recent_events": events.into_iter().map(event_context_item).collect::<Vec<_>>(),
    })
    .to_string())
}

async fn issue_status_map(state: &AppState, organization_id: &str) -> Result<Value, ApiError> {
    let rows = issue_status::Entity::find()
        .filter(issue_status::Column::OrganizationId.eq(organization_id))
        .filter(issue_status::Column::ArchivedAt.is_null())
        .order_by_asc(issue_status::Column::SortOrder)
        .all(&state.db)
        .await?;
    Ok(json!(rows
        .into_iter()
        .map(|status| {
            json!({
                "key": status.key,
                "name": status.name,
                "category": status.category,
                "sort_order": status.sort_order,
            })
        })
        .collect::<Vec<_>>()))
}

fn project_context_item(project: project::Model) -> Value {
    json!({
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "target_date": project.target_date.map(|date| date.to_rfc3339()),
        "updated_at": project.updated_at.to_rfc3339(),
    })
}

fn issue_context_item(statuses: &Value, issue: issue::Model) -> Value {
    let category = status_category(statuses, &issue.status);
    json!({
        "id": issue.id,
        "title": issue.title,
        "description": issue.description,
        "status": issue.status,
        "status_category": category,
        "priority": issue.priority,
        "assigned_to_id": issue.assigned_to_id,
        "project_id": issue.project_id,
        "created_at": issue.created_at.to_rfc3339(),
        "updated_at": issue.updated_at.to_rfc3339(),
    })
}

fn comment_context_item(comment: issue_comment::Model) -> Value {
    json!({
        "issue_id": comment.issue_id,
        "body": truncate_chars(&comment.body, 400),
        "updated_at": comment.updated_at.to_rfc3339(),
    })
}

fn event_context_item(event: issue_event::Model) -> Value {
    json!({
        "issue_id": event.issue_id,
        "action": event.action,
        "changes": event.changes,
        "created_at": event.created_at.to_rfc3339(),
    })
}

fn is_done_like(statuses: &Value, key: &str) -> bool {
    matches!(
        status_category(statuses, key).as_deref(),
        Some("done" | "canceled")
    )
}

fn status_category(statuses: &Value, key: &str) -> Option<String> {
    statuses.as_array().and_then(|items| {
        items.iter().find_map(|item| {
            let matches = item.get("key").and_then(Value::as_str) == Some(key);
            matches.then(|| {
                item.get("category")
                    .and_then(Value::as_str)
                    .unwrap_or("active")
                    .to_owned()
            })
        })
    })
}

fn workspace_brief_system_prompt() -> &'static str {
    "You are Produktive's workspace operations assistant. Return only compact JSON with keys summary, risks, nextActions. summary is one concise paragraph. risks and nextActions are arrays of 0-4 short, specific strings. Do not invent data. If there is too little data, say that directly."
}

fn project_health_system_prompt() -> &'static str {
    "You are Produktive's project health assistant. Return only compact JSON with keys summary, risks, nextActions, statusUpdate. summary is one concise paragraph. risks and nextActions are arrays of 0-4 short, specific strings. statusUpdate is a brief stakeholder-ready update. Do not invent data."
}

fn issue_draft_system_prompt() -> &'static str {
    "You are Produktive's issue editor. Rewrite rough issue input into a crisp issue draft. Return only compact JSON with keys title, description, status, priority. title must be specific and under 90 characters. description should use short Markdown sections only when useful, such as Context, Expected, Actual, Notes. status must be one available status key or null. priority must be urgent, high, medium, low, or null. Do not invent facts."
}

fn parse_brief_response(raw: &str) -> Result<AiBriefResponse, ApiError> {
    let value: Value = serde_json::from_str(raw)
        .or_else(|_| serde_json::from_str(extract_json_object(raw)))
        .map_err(|error| {
            ApiError::Internal(anyhow::anyhow!("AI returned invalid brief JSON: {error}"))
        })?;

    let summary = value
        .get("summary")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("No clear summary was generated.")
        .to_owned();
    let risks = string_array(&value, "risks");
    let next_actions = string_array(&value, "nextActions");
    let status_update = value
        .get("statusUpdate")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    Ok(AiBriefResponse {
        summary,
        risks,
        next_actions,
        status_update,
        generated_at: String::new(),
    })
}

fn parse_issue_draft_response(raw: &str) -> Result<IssueDraftResponse, ApiError> {
    let value: Value = serde_json::from_str(raw)
        .or_else(|_| serde_json::from_str(extract_json_object(raw)))
        .map_err(|error| {
            ApiError::Internal(anyhow::anyhow!(
                "AI returned invalid issue draft JSON: {error}"
            ))
        })?;

    let title = value
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("AI draft omitted title")))?
        .to_owned();
    let description = value
        .get("description")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("")
        .to_owned();
    let status = value
        .get("status")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let priority = value
        .get("priority")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    Ok(IssueDraftResponse {
        title,
        description,
        status,
        priority,
    })
}

fn extract_json_object(raw: &str) -> &str {
    let Some(start) = raw.find('{') else {
        return raw;
    };
    let Some(end) = raw.rfind('}') else {
        return raw;
    };
    &raw[start..=end]
}

fn string_array(value: &Value, key: &str) -> Vec<String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .take(4)
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn truncate_chars(value: &str, max: usize) -> String {
    let mut out = String::new();
    for ch in value.chars().take(max) {
        out.push(ch);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_brief_json_from_plain_response() {
        let parsed = parse_brief_response(
            r#"{"summary":"Active work is moving.","risks":["One stale issue"],"nextActions":["Review backlog"],"statusUpdate":"On track."}"#,
        )
        .expect("valid brief");

        assert_eq!(parsed.summary, "Active work is moving.");
        assert_eq!(parsed.risks, vec!["One stale issue"]);
        assert_eq!(parsed.next_actions, vec!["Review backlog"]);
        assert_eq!(parsed.status_update.as_deref(), Some("On track."));
    }

    #[test]
    fn parses_brief_json_inside_fenced_text() {
        let parsed = parse_brief_response(
            "```json\n{\"summary\":\"Sparse data.\",\"risks\":[],\"nextActions\":[]}\n```",
        )
        .expect("valid brief");

        assert_eq!(parsed.summary, "Sparse data.");
        assert!(parsed.risks.is_empty());
        assert!(parsed.next_actions.is_empty());
    }

    #[test]
    fn parses_issue_draft_json() {
        let parsed = parse_issue_draft_response(
            r###"{"title":"Fix broken project status update","description":"## Context\nChanging the project status fails.","status":"backlog","priority":"high"}"###,
        )
        .expect("valid issue draft");

        assert_eq!(parsed.title, "Fix broken project status update");
        assert_eq!(parsed.status.as_deref(), Some("backlog"));
        assert_eq!(parsed.priority.as_deref(), Some("high"));
        assert!(parsed.description.contains("Context"));
    }
}
