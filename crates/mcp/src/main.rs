use anyhow::Context;
use async_trait::async_trait;
use chrono::Utc;
use produktive_entity::{
    issue, issue_comment, issue_event, mcp_api_key, member, organization, user,
};
use rust_mcp_sdk::{
    McpServer,
    auth::{AuthInfo, AuthProvider, AuthenticationError, OauthEndpoint},
    error::SdkResult,
    macros::{JsonSchema, mcp_tool},
    mcp_http::{GenericBody, GenericBodyExt, McpAppState, http},
    mcp_server::{HyperServerOptions, ServerHandler, ToMcpServerHandler, hyper_server},
    schema::{
        CallToolRequestParams, CallToolResult, Implementation, InitializeResult, ListToolsResult,
        PaginatedRequestParams, ProtocolVersion, RpcError, ServerCapabilities,
        ServerCapabilitiesTools, TextContent, schema_utils::CallToolError,
    },
};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, Database, DatabaseConnection, EntityTrait, IntoActiveModel,
    QueryFilter, QueryOrder, QuerySelect, Set,
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, sync::Arc};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    db: DatabaseConnection,
}

#[derive(Clone)]
struct ProduktiveAuthProvider {
    state: AppState,
}

#[async_trait]
impl AuthProvider for ProduktiveAuthProvider {
    async fn verify_token(&self, access_token: String) -> Result<AuthInfo, AuthenticationError> {
        let access_token = normalize_bearer_token(&access_token);
        let hash = hash_token(access_token);
        let now = Utc::now().fixed_offset();
        let key = mcp_api_key::Entity::find()
            .filter(mcp_api_key::Column::TokenHash.eq(hash))
            .one(&self.state.db)
            .await
            .map_err(auth_server_error)?
            .ok_or(AuthenticationError::InvalidToken {
                description: "Invalid MCP API key",
            })?;

        if key.revoked_at.is_some() {
            return Err(AuthenticationError::InvalidOrExpiredToken(
                "MCP API key has been revoked".to_owned(),
            ));
        }
        if key.expires_at.is_some_and(|expires_at| expires_at <= now) {
            return Err(AuthenticationError::InvalidOrExpiredToken(
                "MCP API key has expired".to_owned(),
            ));
        }

        let mut active = key.clone().into_active_model();
        active.last_used_at = Set(Some(now));
        active.updated_at = Set(now);
        active
            .update(&self.state.db)
            .await
            .map_err(auth_server_error)?;

        let mut extra = Map::new();
        if let Some(organization_id) = valid_active_workspace(&self.state.db, &key).await? {
            extra.insert("organization_id".to_owned(), json!(organization_id));
        }

        Ok(AuthInfo {
            token_unique_id: key.id,
            client_id: Some("produktive-mcp".to_owned()),
            user_id: Some(key.user_id),
            scopes: Some(vec!["mcp".to_owned()]),
            expires_at: None,
            audience: None,
            extra: Some(extra),
        })
    }

    fn auth_endpoints(&self) -> Option<&HashMap<String, OauthEndpoint>> {
        None
    }

    async fn handle_request(
        &self,
        _request: http::Request<&str>,
        _state: Arc<McpAppState>,
    ) -> Result<http::Response<GenericBody>, rust_mcp_sdk::mcp_server::error::TransportServerError>
    {
        Ok(GenericBody::create_404_response())
    }

    fn protected_resource_metadata_url(&self) -> Option<&str> {
        None
    }
}

#[derive(Clone)]
struct ProduktiveHandler {
    state: AppState,
}

#[async_trait]
impl ServerHandler for ProduktiveHandler {
    async fn handle_list_tools_request(
        &self,
        _params: Option<PaginatedRequestParams>,
        _runtime: Arc<dyn McpServer>,
    ) -> Result<ListToolsResult, RpcError> {
        Ok(ListToolsResult {
            tools: vec![
                ListWorkspacesTool::tool(),
                CurrentWorkspaceTool::tool(),
                SelectWorkspaceTool::tool(),
                ListMembersTool::tool(),
                ListIssuesTool::tool(),
                GetIssueTool::tool(),
                CreateIssueTool::tool(),
                UpdateIssueTool::tool(),
                ListIssueCommentsTool::tool(),
                CreateIssueCommentTool::tool(),
            ],
            meta: None,
            next_cursor: None,
        })
    }

    async fn handle_call_tool_request(
        &self,
        params: CallToolRequestParams,
        runtime: Arc<dyn McpServer>,
    ) -> Result<CallToolResult, CallToolError> {
        let auth = runtime
            .auth_info_cloned()
            .await
            .ok_or_else(|| tool_error("Missing MCP authentication"))?;
        let ctx = RequestContext::from_auth(&self.state, auth).await?;
        let result = match params.name.as_ref() {
            name if name == ListWorkspacesTool::tool_name() => {
                list_workspaces(&self.state, &ctx).await
            }
            name if name == CurrentWorkspaceTool::tool_name() => {
                current_workspace(&self.state, &ctx).await
            }
            name if name == SelectWorkspaceTool::tool_name() => {
                let args: SelectWorkspaceTool = parse_args(&params)?;
                select_workspace(&self.state, &ctx, args).await
            }
            name if name == ListMembersTool::tool_name() => list_members(&self.state, &ctx).await,
            name if name == ListIssuesTool::tool_name() => {
                let args: ListIssuesTool = parse_args(&params)?;
                list_issues(&self.state, &ctx, args).await
            }
            name if name == GetIssueTool::tool_name() => {
                let args: GetIssueTool = parse_args(&params)?;
                get_issue(&self.state, &ctx, args).await
            }
            name if name == CreateIssueTool::tool_name() => {
                let args: CreateIssueTool = parse_args(&params)?;
                create_issue(&self.state, &ctx, args).await
            }
            name if name == UpdateIssueTool::tool_name() => {
                let args: UpdateIssueTool = parse_args(&params)?;
                update_issue(&self.state, &ctx, args).await
            }
            name if name == ListIssueCommentsTool::tool_name() => {
                let args: ListIssueCommentsTool = parse_args(&params)?;
                list_issue_comments(&self.state, &ctx, args).await
            }
            name if name == CreateIssueCommentTool::tool_name() => {
                let args: CreateIssueCommentTool = parse_args(&params)?;
                create_issue_comment(&self.state, &ctx, args).await
            }
            _ => return Err(CallToolError::unknown_tool(params.name)),
        }?;

        Ok(json_tool_result(result))
    }
}

#[derive(Debug)]
struct RequestContext {
    key_id: String,
    user_id: String,
    organization_id: Option<String>,
}

impl RequestContext {
    async fn from_auth(state: &AppState, auth: AuthInfo) -> Result<Self, CallToolError> {
        let user_id = auth
            .user_id
            .ok_or_else(|| tool_error("MCP API key did not resolve to a user"))?;
        let key = mcp_api_key::Entity::find_by_id(&auth.token_unique_id)
            .one(&state.db)
            .await
            .map_err(db_tool_error)?
            .ok_or_else(|| tool_error("MCP API key no longer exists"))?;
        let organization_id = valid_active_workspace(&state.db, &key)
            .await
            .map_err(auth_to_tool_error)?;

        Ok(Self {
            key_id: auth.token_unique_id,
            user_id,
            organization_id,
        })
    }

    fn require_workspace(&self) -> Result<&str, CallToolError> {
        self.organization_id.as_deref().ok_or_else(|| {
            tool_error("No workspace selected. Call list_workspaces, then select_workspace.")
        })
    }
}

#[mcp_tool(
    name = "list_workspaces",
    description = "List Produktive workspaces available to the authenticated API key user."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema, Default)]
struct ListWorkspacesTool {}

#[mcp_tool(
    name = "current_workspace",
    description = "Show the currently selected Produktive workspace for this MCP API key."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema, Default)]
struct CurrentWorkspaceTool {}

#[mcp_tool(
    name = "select_workspace",
    description = "Select the Produktive workspace subsequent MCP tools should operate on."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
struct SelectWorkspaceTool {
    /// Workspace/organization id returned by list_workspaces.
    organization_id: String,
}

#[mcp_tool(
    name = "list_members",
    description = "List members of the currently selected Produktive workspace."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema, Default)]
struct ListMembersTool {}

#[mcp_tool(
    name = "list_issues",
    description = "List issues in the selected workspace. Optional filters: status, priority, assigned_to_id. Returns newest issues first."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema, Default)]
struct ListIssuesTool {
    status: Option<String>,
    priority: Option<String>,
    assigned_to_id: Option<String>,
    limit: Option<u64>,
}

#[mcp_tool(name = "get_issue", description = "Get one issue by id.")]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
struct GetIssueTool {
    id: String,
}

#[mcp_tool(
    name = "create_issue",
    description = "Create a new issue in the selected workspace."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
struct CreateIssueTool {
    title: String,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    assigned_to_id: Option<String>,
}

#[mcp_tool(
    name = "update_issue",
    description = "Update an existing issue. Only provided fields are changed. Pass empty assigned_to_id to unassign."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
struct UpdateIssueTool {
    id: String,
    title: Option<String>,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    assigned_to_id: Option<String>,
}

#[mcp_tool(
    name = "list_issue_comments",
    description = "List comments for an issue in the selected workspace."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
struct ListIssueCommentsTool {
    issue_id: String,
}

#[mcp_tool(
    name = "create_issue_comment",
    description = "Create a comment on an issue in the selected workspace."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
struct CreateIssueCommentTool {
    issue_id: String,
    body: String,
}

async fn list_workspaces(state: &AppState, ctx: &RequestContext) -> Result<Value, CallToolError> {
    let memberships = member::Entity::find()
        .filter(member::Column::UserId.eq(&ctx.user_id))
        .order_by_asc(member::Column::CreatedAt)
        .all(&state.db)
        .await
        .map_err(db_tool_error)?;

    let mut workspaces = Vec::with_capacity(memberships.len());
    for membership in memberships {
        if let Some(org) = organization::Entity::find_by_id(&membership.organization_id)
            .one(&state.db)
            .await
            .map_err(db_tool_error)?
        {
            workspaces.push(json!({
                "id": org.id,
                "name": org.name,
                "slug": org.slug,
                "role": membership.role,
                "selected": ctx.organization_id.as_deref() == Some(org.id.as_str()),
            }));
        }
    }

    Ok(json!({ "workspaces": workspaces }))
}

async fn current_workspace(state: &AppState, ctx: &RequestContext) -> Result<Value, CallToolError> {
    let Some(id) = ctx.organization_id.as_deref() else {
        return Ok(json!({ "workspace": null }));
    };
    let workspace = organization::Entity::find_by_id(id)
        .one(&state.db)
        .await
        .map_err(db_tool_error)?;
    Ok(json!({ "workspace": workspace }))
}

async fn select_workspace(
    state: &AppState,
    ctx: &RequestContext,
    args: SelectWorkspaceTool,
) -> Result<Value, CallToolError> {
    let organization_id = required(args.organization_id, "organization_id")?;
    ensure_member(state, &ctx.user_id, &organization_id).await?;
    let org = organization::Entity::find_by_id(&organization_id)
        .one(&state.db)
        .await
        .map_err(db_tool_error)?
        .ok_or_else(|| tool_error("Workspace not found"))?;

    let key = mcp_api_key::Entity::find_by_id(&ctx.key_id)
        .one(&state.db)
        .await
        .map_err(db_tool_error)?
        .ok_or_else(|| tool_error("MCP API key no longer exists"))?;
    let mut active = key.into_active_model();
    active.active_organization_id = Set(Some(org.id.clone()));
    active.updated_at = Set(Utc::now().fixed_offset());
    active.update(&state.db).await.map_err(db_tool_error)?;

    Ok(json!({
        "selected": true,
        "workspace": { "id": org.id, "name": org.name, "slug": org.slug }
    }))
}

async fn list_members(state: &AppState, ctx: &RequestContext) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let memberships = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(organization_id))
        .order_by_asc(member::Column::CreatedAt)
        .all(&state.db)
        .await
        .map_err(db_tool_error)?;

    let mut members = Vec::with_capacity(memberships.len());
    for membership in memberships {
        if let Some(user) = user::Entity::find_by_id(&membership.user_id)
            .one(&state.db)
            .await
            .map_err(db_tool_error)?
        {
            members.push(json!({
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "image": user.image,
                "role": membership.role,
            }));
        }
    }
    Ok(json!({ "members": members }))
}

async fn list_issues(
    state: &AppState,
    ctx: &RequestContext,
    args: ListIssuesTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let mut select = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(organization_id))
        .order_by_desc(issue::Column::CreatedAt)
        .limit(args.limit.unwrap_or(50).clamp(1, 100));

    if let Some(status) = non_empty(args.status) {
        select = select.filter(issue::Column::Status.eq(status));
    }
    if let Some(priority) = non_empty(args.priority) {
        select = select.filter(issue::Column::Priority.eq(priority));
    }
    if let Some(assignee) = non_empty(args.assigned_to_id) {
        select = select.filter(issue::Column::AssignedToId.eq(assignee));
    }

    let rows = select.all(&state.db).await.map_err(db_tool_error)?;
    let mut issues = Vec::with_capacity(rows.len());
    for row in rows {
        issues.push(issue_json(state, &row, false).await?);
    }
    Ok(json!({ "issues": issues }))
}

async fn get_issue(
    state: &AppState,
    ctx: &RequestContext,
    args: GetIssueTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let issue = find_issue(state, organization_id, &args.id).await?;
    Ok(json!({ "issue": issue_json(state, &issue, true).await? }))
}

async fn create_issue(
    state: &AppState,
    ctx: &RequestContext,
    args: CreateIssueTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let title = required(args.title, "title")?;
    let assigned_to_id = normalize_assignee(args.assigned_to_id);
    if let Some(id) = assigned_to_id.as_deref() {
        ensure_member(state, id, organization_id).await?;
    }

    let now = Utc::now().fixed_offset();
    let row = issue::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization_id.to_owned()),
        title: Set(title),
        description: Set(non_empty(args.description)),
        status: Set(non_empty(args.status).unwrap_or_else(|| "backlog".to_owned())),
        priority: Set(non_empty(args.priority).unwrap_or_else(|| "medium".to_owned())),
        created_by_id: Set(Some(ctx.user_id.clone())),
        assigned_to_id: Set(assigned_to_id),
        parent_id: Set(None),
        project_id: Set(None),
        attachments: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await
    .map_err(db_tool_error)?;

    record_event(
        state,
        organization_id,
        &row.id,
        Some(&ctx.user_id),
        "created",
        json!([
            {"field": "title", "before": null, "after": row.title},
            {"field": "status", "before": null, "after": row.status},
            {"field": "priority", "before": null, "after": row.priority}
        ]),
    )
    .await?;

    Ok(json!({ "issue": issue_json(state, &row, true).await? }))
}

async fn update_issue(
    state: &AppState,
    ctx: &RequestContext,
    args: UpdateIssueTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let before = find_issue(state, organization_id, &args.id).await?;
    let mut active = before.clone().into_active_model();
    let mut changes = Vec::new();

    if let Some(title) = args.title {
        let next = required(title, "title")?;
        push_change(&mut changes, "title", Some(&before.title), Some(&next));
        active.title = Set(next);
    }
    if let Some(description) = args.description {
        let next = non_empty(Some(description));
        push_change(
            &mut changes,
            "description",
            before.description.as_deref(),
            next.as_deref(),
        );
        active.description = Set(next);
    }
    if let Some(status) = args.status {
        let next = required(status, "status")?;
        push_change(&mut changes, "status", Some(&before.status), Some(&next));
        active.status = Set(next);
    }
    if let Some(priority) = args.priority {
        let next = required(priority, "priority")?;
        push_change(
            &mut changes,
            "priority",
            Some(&before.priority),
            Some(&next),
        );
        active.priority = Set(next);
    }
    if let Some(raw_assignee) = args.assigned_to_id {
        let next = normalize_assignee(Some(raw_assignee));
        if let Some(id) = next.as_deref() {
            ensure_member(state, id, organization_id).await?;
        }
        push_change(
            &mut changes,
            "assignedToId",
            before.assigned_to_id.as_deref(),
            next.as_deref(),
        );
        active.assigned_to_id = Set(next);
    }

    active.updated_at = Set(Utc::now().fixed_offset());
    let updated = active.update(&state.db).await.map_err(db_tool_error)?;
    if !changes.is_empty() {
        record_event(
            state,
            organization_id,
            &updated.id,
            Some(&ctx.user_id),
            "updated",
            Value::Array(changes.clone()),
        )
        .await?;
    }

    Ok(json!({
        "issue": issue_json(state, &updated, true).await?,
        "changes": changes,
    }))
}

async fn list_issue_comments(
    state: &AppState,
    ctx: &RequestContext,
    args: ListIssueCommentsTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    find_issue(state, organization_id, &args.issue_id).await?;
    let rows = issue_comment::Entity::find()
        .filter(issue_comment::Column::OrganizationId.eq(organization_id))
        .filter(issue_comment::Column::IssueId.eq(&args.issue_id))
        .order_by_asc(issue_comment::Column::CreatedAt)
        .all(&state.db)
        .await
        .map_err(db_tool_error)?;

    let mut comments = Vec::with_capacity(rows.len());
    for row in rows {
        comments.push(comment_json(state, row).await?);
    }
    Ok(json!({ "comments": comments }))
}

async fn create_issue_comment(
    state: &AppState,
    ctx: &RequestContext,
    args: CreateIssueCommentTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let found = find_issue(state, organization_id, &args.issue_id).await?;
    let body = required(args.body, "body")?;
    let now = Utc::now().fixed_offset();
    let row = issue_comment::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization_id.to_owned()),
        issue_id: Set(found.id.clone()),
        author_id: Set(Some(ctx.user_id.clone())),
        body: Set(body),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await
    .map_err(db_tool_error)?;

    let mut active = found.into_active_model();
    active.updated_at = Set(Utc::now().fixed_offset());
    active.update(&state.db).await.map_err(db_tool_error)?;

    Ok(json!({ "comment": comment_json(state, row).await? }))
}

async fn find_issue(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<issue::Model, CallToolError> {
    issue::Entity::find()
        .filter(issue::Column::Id.eq(id))
        .filter(issue::Column::OrganizationId.eq(organization_id))
        .one(&state.db)
        .await
        .map_err(db_tool_error)?
        .ok_or_else(|| tool_error(format!("Issue {id} not found")))
}

async fn issue_json(
    state: &AppState,
    issue: &issue::Model,
    full: bool,
) -> Result<Value, CallToolError> {
    let assigned_to = match issue.assigned_to_id.as_deref() {
        Some(id) => user::Entity::find_by_id(id)
            .one(&state.db)
            .await
            .map_err(db_tool_error)?
            .map(|user| json!({ "id": user.id, "name": user.name, "email": user.email })),
        None => None,
    };

    let mut value = json!({
        "id": issue.id,
        "title": issue.title,
        "status": issue.status,
        "priority": issue.priority,
        "assigned_to": assigned_to,
        "created_at": issue.created_at.to_rfc3339(),
        "updated_at": issue.updated_at.to_rfc3339(),
    });
    if full {
        value["description"] = issue
            .description
            .as_ref()
            .map(|value| json!(value))
            .unwrap_or(Value::Null);
        value["attachments"] = issue.attachments.clone().unwrap_or_else(|| json!([]));
        value["parent_id"] = issue
            .parent_id
            .as_ref()
            .map(|value| json!(value))
            .unwrap_or(Value::Null);
        value["project_id"] = issue
            .project_id
            .as_ref()
            .map(|value| json!(value))
            .unwrap_or(Value::Null);
    }
    Ok(value)
}

async fn comment_json(
    state: &AppState,
    comment: issue_comment::Model,
) -> Result<Value, CallToolError> {
    let author = match comment.author_id.as_deref() {
        Some(id) => user::Entity::find_by_id(id)
            .one(&state.db)
            .await
            .map_err(db_tool_error)?
            .map(|user| json!({ "id": user.id, "name": user.name, "email": user.email })),
        None => None,
    };
    Ok(json!({
        "id": comment.id,
        "body": comment.body,
        "author": author,
        "created_at": comment.created_at.to_rfc3339(),
        "updated_at": comment.updated_at.to_rfc3339(),
    }))
}

async fn valid_active_workspace(
    db: &DatabaseConnection,
    key: &mcp_api_key::Model,
) -> Result<Option<String>, AuthenticationError> {
    let Some(organization_id) = key.active_organization_id.as_deref() else {
        return Ok(None);
    };
    let is_member = member::Entity::find()
        .filter(member::Column::UserId.eq(&key.user_id))
        .filter(member::Column::OrganizationId.eq(organization_id))
        .one(db)
        .await
        .map_err(auth_server_error)?
        .is_some();
    Ok(is_member.then(|| organization_id.to_owned()))
}

async fn ensure_member(
    state: &AppState,
    user_id: &str,
    organization_id: &str,
) -> Result<(), CallToolError> {
    let exists = member::Entity::find()
        .filter(member::Column::UserId.eq(user_id))
        .filter(member::Column::OrganizationId.eq(organization_id))
        .one(&state.db)
        .await
        .map_err(db_tool_error)?
        .is_some();
    if exists {
        Ok(())
    } else {
        Err(tool_error("User is not a member of that workspace"))
    }
}

async fn record_event(
    state: &AppState,
    organization_id: &str,
    issue_id: &str,
    actor_id: Option<&str>,
    action: &str,
    changes: Value,
) -> Result<(), CallToolError> {
    issue_event::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization_id.to_owned()),
        issue_id: Set(issue_id.to_owned()),
        actor_id: Set(actor_id.map(str::to_owned)),
        action: Set(action.to_owned()),
        changes: Set(changes),
        created_at: Set(Utc::now().fixed_offset()),
    }
    .insert(&state.db)
    .await
    .map_err(db_tool_error)?;
    Ok(())
}

fn parse_args<T: DeserializeOwned>(params: &CallToolRequestParams) -> Result<T, CallToolError> {
    let value = serde_json::to_value(&params.arguments)
        .map_err(|error| tool_error(format!("Invalid arguments: {error}")))?;
    let value = if value.is_null() { json!({}) } else { value };
    serde_json::from_value(value).map_err(|error| tool_error(format!("Invalid arguments: {error}")))
}

fn json_tool_result(value: Value) -> CallToolResult {
    let text = serde_json::to_string_pretty(&value).unwrap_or_else(|_| value.to_string());
    CallToolResult::text_content(vec![TextContent::from(text)])
}

fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

fn normalize_bearer_token(value: &str) -> &str {
    let value = value.trim();
    value
        .get(..7)
        .filter(|prefix| prefix.eq_ignore_ascii_case("bearer "))
        .and_then(|_| value.get(7..))
        .unwrap_or(value)
        .trim()
}

fn required(value: String, field: &str) -> Result<String, CallToolError> {
    let value = value.trim();
    if value.is_empty() {
        Err(tool_error(format!("{field} is required")))
    } else {
        Ok(value.to_owned())
    }
}

fn non_empty(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn normalize_assignee(value: Option<String>) -> Option<String> {
    non_empty(value)
}

fn push_change(changes: &mut Vec<Value>, field: &str, before: Option<&str>, after: Option<&str>) {
    if before != after {
        changes.push(json!({
            "field": field,
            "before": before,
            "after": after,
        }));
    }
}

fn tool_error(message: impl Into<String>) -> CallToolError {
    CallToolError::from_message(message.into())
}

fn db_tool_error(error: sea_orm::DbErr) -> CallToolError {
    tracing::error!(%error, "database error in MCP tool");
    tool_error("Database error")
}

fn auth_to_tool_error(error: AuthenticationError) -> CallToolError {
    tool_error(error.to_string())
}

fn auth_server_error(error: sea_orm::DbErr) -> AuthenticationError {
    tracing::error!(%error, "database error in MCP authentication");
    AuthenticationError::ServerError {
        description: "Database error".to_owned(),
    }
}

#[tokio::main]
async fn main() -> SdkResult<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "produktive_mcp=info,rust_mcp_sdk=info".into()),
        )
        .init();

    let database_url = std::env::var("DATABASE_URL")
        .context("DATABASE_URL is required")
        .map_err(|error| rust_mcp_sdk::error::McpSdkError::Internal {
            description: error.to_string(),
        })?;
    let db = Database::connect(&database_url)
        .await
        .context("failed to connect to database")
        .map_err(|error| rust_mcp_sdk::error::McpSdkError::Internal {
            description: error.to_string(),
        })?;
    let state = AppState { db };
    let port = std::env::var("PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(3001);

    let server_details = InitializeResult {
        server_info: Implementation {
            name: "produktive-mcp".into(),
            version: env!("CARGO_PKG_VERSION").into(),
            title: Some("Produktive MCP".into()),
            description: Some("MCP server for Produktive workspaces, members, and issues.".into()),
            icons: vec![],
            website_url: Some("https://produktive.app".into()),
        },
        capabilities: ServerCapabilities {
            tools: Some(ServerCapabilitiesTools { list_changed: None }),
            ..Default::default()
        },
        protocol_version: ProtocolVersion::V2025_11_25.into(),
        instructions: Some(
            "Use list_workspaces and select_workspace before workspace-scoped tools if no workspace is selected."
                .into(),
        ),
        meta: None,
    };

    let handler = ProduktiveHandler {
        state: state.clone(),
    };
    let auth = ProduktiveAuthProvider { state };
    let server = hyper_server::create_server(
        server_details,
        handler.to_mcp_server_handler(),
        HyperServerOptions {
            host: "0.0.0.0".to_owned(),
            port,
            sse_support: true,
            auth: Some(Arc::new(auth)),
            health_endpoint: Some("/health".to_owned()),
            ..Default::default()
        },
    );

    tracing::info!(%port, "Produktive MCP server listening");
    server.start().await
}
