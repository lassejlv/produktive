use anyhow::Context;
use async_trait::async_trait;
use chrono::{DateTime, FixedOffset, Utc};
use produktive_entity::{
    issue, issue_comment, issue_event, issue_label, issue_status, label, member, organization,
    produktive_oauth_grant, produktive_oauth_token, project, user,
};
use rust_mcp_sdk::{
    auth::{AuthInfo, AuthProvider, AuthenticationError, OauthEndpoint},
    error::SdkResult,
    macros::{mcp_tool, JsonSchema},
    mcp_http::{http, GenericBody, GenericBodyExt, McpAppState},
    mcp_server::{hyper_server, HyperServerOptions, ServerHandler, ToMcpServerHandler},
    schema::{
        schema_utils::CallToolError, CallToolRequestParams, CallToolResult, Implementation,
        InitializeResult, ListToolsResult, PaginatedRequestParams, ProtocolVersion, RpcError,
        ServerCapabilities, ServerCapabilitiesTools, TextContent,
    },
    McpServer,
};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, Database, DatabaseConnection, EntityTrait, IntoActiveModel,
    PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, Set,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration as StdDuration, SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    db: DatabaseConnection,
    issuer_url: String,
    resource_url: String,
}

#[derive(Clone)]
struct ProduktiveAuthProvider {
    state: AppState,
    endpoints: HashMap<String, OauthEndpoint>,
    protected_resource_metadata_url: String,
}

#[async_trait]
impl AuthProvider for ProduktiveAuthProvider {
    async fn verify_token(&self, access_token: String) -> Result<AuthInfo, AuthenticationError> {
        let access_token = normalize_bearer_token(&access_token);
        let now = Utc::now().fixed_offset();
        let token = produktive_oauth_token::Entity::find()
            .filter(produktive_oauth_token::Column::AccessTokenHash.eq(hash_token(access_token)))
            .one(&self.state.db)
            .await
            .map_err(auth_server_error)?
            .ok_or_else(|| AuthenticationError::InvalidToken {
                description: "Invalid MCP OAuth token",
            })?;

        if token.revoked_at.is_some() || token.expires_at <= now {
            return Err(AuthenticationError::InvalidToken {
                description: "MCP OAuth token has expired or was revoked",
            });
        }
        if token.resource != self.state.resource_url {
            return Err(AuthenticationError::InvalidToken {
                description: "MCP OAuth token has the wrong resource",
            });
        }
        let grant = produktive_oauth_grant::Entity::find_by_id(&token.grant_id)
            .one(&self.state.db)
            .await
            .map_err(auth_server_error)?
            .ok_or_else(|| AuthenticationError::InvalidToken {
                description: "MCP OAuth grant no longer exists",
            })?;
        if grant.revoked_at.is_some() || grant.resource != self.state.resource_url {
            return Err(AuthenticationError::InvalidToken {
                description: "MCP OAuth grant is invalid",
            });
        }

        let expires_at = system_time_from_datetime(token.expires_at)?;

        let mut active = token.clone().into_active_model();
        active.last_used_at = Set(Some(now));
        active.updated_at = Set(now);
        active
            .update(&self.state.db)
            .await
            .map_err(auth_server_error)?;

        let mut extra = Map::new();
        if let Some(organization_id) = valid_selected_workspace(&self.state.db, &grant).await? {
            extra.insert("organization_id".to_owned(), json!(organization_id));
        }
        extra.insert("grant_id".to_owned(), json!(grant.id));

        Ok(AuthInfo {
            token_unique_id: token.id,
            client_id: Some(token.client_id),
            user_id: Some(token.user_id),
            scopes: Some(
                token
                    .scope
                    .split_whitespace()
                    .map(ToOwned::to_owned)
                    .collect(),
            ),
            expires_at: Some(expires_at),
            audience: None,
            extra: Some(extra),
        })
    }

    fn auth_endpoints(&self) -> Option<&HashMap<String, OauthEndpoint>> {
        Some(&self.endpoints)
    }

    async fn handle_request(
        &self,
        request: http::Request<&str>,
        _state: Arc<McpAppState>,
    ) -> Result<http::Response<GenericBody>, rust_mcp_sdk::mcp_server::error::TransportServerError>
    {
        if self.endpoint_type(&request) != Some(&OauthEndpoint::ProtectedResourceMetadata) {
            return Ok(GenericBody::create_404_response());
        }
        let metadata = json!({
            "resource": self.state.resource_url,
            "authorization_servers": [self.state.issuer_url],
            "scopes_supported": ["mcp"],
            "bearer_methods_supported": ["header"],
            "resource_name": "Produktive MCP",
            "resource_documentation": "https://produktive.app",
        });
        Ok(GenericBody::from_value(&metadata).into_json_response(http::StatusCode::OK, None))
    }

    fn protected_resource_metadata_url(&self) -> Option<&str> {
        Some(&self.protected_resource_metadata_url)
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
                ListLabelsTool::tool(),
                CreateLabelTool::tool(),
                UpdateLabelTool::tool(),
                ListProjectsTool::tool(),
                CreateProjectTool::tool(),
                UpdateProjectTool::tool(),
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
            name if name == ListLabelsTool::tool_name() => {
                let args: ListLabelsTool = parse_args(&params)?;
                list_labels(&self.state, &ctx, args).await
            }
            name if name == CreateLabelTool::tool_name() => {
                let args: CreateLabelTool = parse_args(&params)?;
                create_label(&self.state, &ctx, args).await
            }
            name if name == UpdateLabelTool::tool_name() => {
                let args: UpdateLabelTool = parse_args(&params)?;
                update_label(&self.state, &ctx, args).await
            }
            name if name == ListProjectsTool::tool_name() => {
                let args: ListProjectsTool = parse_args(&params)?;
                list_projects(&self.state, &ctx, args).await
            }
            name if name == CreateProjectTool::tool_name() => {
                let args: CreateProjectTool = parse_args(&params)?;
                create_project(&self.state, &ctx, args).await
            }
            name if name == UpdateProjectTool::tool_name() => {
                let args: UpdateProjectTool = parse_args(&params)?;
                update_project(&self.state, &ctx, args).await
            }
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
    grant_id: String,
    user_id: String,
    organization_id: Option<String>,
}

impl RequestContext {
    async fn from_auth(_state: &AppState, auth: AuthInfo) -> Result<Self, CallToolError> {
        let user_id = auth
            .user_id
            .ok_or_else(|| tool_error("MCP OAuth token did not resolve to a user"))?;
        let grant_id = metadata_string(&auth.extra, "grant_id")
            .ok_or_else(|| tool_error("MCP OAuth token did not resolve to a grant"))?;
        let organization_id = metadata_string(&auth.extra, "organization_id");

        Ok(Self {
            grant_id,
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
    description = "List Produktive workspaces available to the authenticated OAuth user."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema, Default)]
struct ListWorkspacesTool {}

#[mcp_tool(
    name = "current_workspace",
    description = "Show the currently selected Produktive workspace for this MCP OAuth grant."
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
    name = "list_labels",
    description = "List labels in the selected workspace. By default archived labels are hidden."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema, Default)]
struct ListLabelsTool {
    include_archived: Option<bool>,
}

#[mcp_tool(
    name = "create_label",
    description = "Create a label in the selected workspace."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
struct CreateLabelTool {
    name: String,
    description: Option<String>,
    color: Option<String>,
}

#[mcp_tool(
    name = "update_label",
    description = "Update a label. Set archived to true or false to archive or restore it."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
struct UpdateLabelTool {
    id: String,
    name: Option<String>,
    description: Option<String>,
    color: Option<String>,
    archived: Option<bool>,
}

#[mcp_tool(
    name = "list_projects",
    description = "List projects in the selected workspace. By default archived projects are hidden."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema, Default)]
struct ListProjectsTool {
    include_archived: Option<bool>,
}

#[mcp_tool(
    name = "create_project",
    description = "Create a project in the selected workspace."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
struct CreateProjectTool {
    name: String,
    description: Option<String>,
    status: Option<String>,
    color: Option<String>,
    icon: Option<String>,
    lead_id: Option<String>,
    target_date: Option<String>,
}

#[mcp_tool(
    name = "update_project",
    description = "Update a project. Set archived to true or false to archive or restore it."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
struct UpdateProjectTool {
    id: String,
    name: Option<String>,
    description: Option<String>,
    status: Option<String>,
    color: Option<String>,
    icon: Option<String>,
    lead_id: Option<String>,
    target_date: Option<String>,
    archived: Option<bool>,
}

#[mcp_tool(
    name = "list_issues",
    description = "List issues in the selected workspace. Optional filters: status, priority, assigned_to_id. Returns newest issues first."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema, Default)]
struct ListIssuesTool {
    status: Option<String>,
    priority: Option<String>,
    assigned_to_id: Option<String>,
    project_id: Option<String>,
    /// Filter to issues containing this label id.
    label_id: Option<String>,
    /// Filter to issues containing any of these label ids.
    label_ids: Option<Vec<String>>,
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
    project_id: Option<String>,
    label_ids: Option<Vec<String>>,
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
    project_id: Option<String>,
    label_ids: Option<Vec<String>>,
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

    let grant = produktive_oauth_grant::Entity::find_by_id(&ctx.grant_id)
        .one(&state.db)
        .await
        .map_err(db_tool_error)?
        .ok_or_else(|| tool_error("MCP OAuth grant no longer exists"))?;
    let mut active = grant.into_active_model();
    active.selected_organization_id = Set(Some(org.id.clone()));
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

async fn list_labels(
    state: &AppState,
    ctx: &RequestContext,
    args: ListLabelsTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let mut select = label::Entity::find()
        .filter(label::Column::OrganizationId.eq(organization_id))
        .order_by_asc(label::Column::Name);
    if !args.include_archived.unwrap_or(false) {
        select = select.filter(label::Column::ArchivedAt.is_null());
    }

    let rows = select.all(&state.db).await.map_err(db_tool_error)?;
    let mut labels = Vec::with_capacity(rows.len());
    for row in rows {
        labels.push(label_json(state, row).await?);
    }
    Ok(json!({ "labels": labels }))
}

async fn create_label(
    state: &AppState,
    ctx: &RequestContext,
    args: CreateLabelTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let name = required(args.name, "name")?;
    if name.chars().count() > 48 {
        return Err(tool_error("Label name must be 48 characters or fewer"));
    }
    ensure_unique_label_name(state, organization_id, &name, None).await?;

    let now = Utc::now().fixed_offset();
    let row = label::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization_id.to_owned()),
        name: Set(name),
        description: Set(non_empty(args.description)),
        color: Set(normalize_color(args.color.as_deref(), "gray")),
        created_by_id: Set(Some(ctx.user_id.clone())),
        archived_at: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await
    .map_err(db_tool_error)?;

    Ok(json!({ "label": label_json(state, row).await? }))
}

async fn update_label(
    state: &AppState,
    ctx: &RequestContext,
    args: UpdateLabelTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let id = required(args.id, "id")?;
    let existing = find_label(state, organization_id, &id).await?;
    let existing_id = existing.id.clone();
    let mut active = existing.into_active_model();

    if let Some(name) = args.name {
        let name = required(name, "name")?;
        if name.chars().count() > 48 {
            return Err(tool_error("Label name must be 48 characters or fewer"));
        }
        ensure_unique_label_name(state, organization_id, &name, Some(&existing_id)).await?;
        active.name = Set(name);
    }
    if let Some(description) = args.description {
        active.description = Set(non_empty(Some(description)));
    }
    if let Some(color) = args.color {
        active.color = Set(normalize_color(Some(&color), "gray"));
    }
    if let Some(archived) = args.archived {
        active.archived_at = Set(if archived {
            Some(Utc::now().fixed_offset())
        } else {
            None
        });
    }
    active.updated_at = Set(Utc::now().fixed_offset());

    let updated = active.update(&state.db).await.map_err(db_tool_error)?;
    Ok(json!({ "label": label_json(state, updated).await? }))
}

async fn list_projects(
    state: &AppState,
    ctx: &RequestContext,
    args: ListProjectsTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let mut select = project::Entity::find()
        .filter(project::Column::OrganizationId.eq(organization_id))
        .order_by_asc(project::Column::ArchivedAt)
        .order_by_asc(project::Column::SortOrder)
        .order_by_desc(project::Column::CreatedAt);
    if !args.include_archived.unwrap_or(false) {
        select = select.filter(project::Column::ArchivedAt.is_null());
    }

    let rows = select.all(&state.db).await.map_err(db_tool_error)?;
    let mut projects = Vec::with_capacity(rows.len());
    for row in rows {
        projects.push(project_json(state, row).await?);
    }
    Ok(json!({ "projects": projects }))
}

async fn create_project(
    state: &AppState,
    ctx: &RequestContext,
    args: CreateProjectTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let name = required(args.name, "name")?;
    let lead_id = normalize_optional_string(args.lead_id);
    if let Some(id) = lead_id.as_deref() {
        ensure_member(state, id, organization_id).await?;
    }
    let target_date = parse_optional_date(args.target_date.as_deref())?;
    let next_order = project::Entity::find()
        .filter(project::Column::OrganizationId.eq(organization_id))
        .select_only()
        .column_as(project::Column::SortOrder.max(), "max_order")
        .into_tuple::<Option<i32>>()
        .one(&state.db)
        .await
        .map_err(db_tool_error)?
        .flatten()
        .unwrap_or(0)
        + 1;
    let now = Utc::now().fixed_offset();
    let row = project::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization_id.to_owned()),
        name: Set(name),
        description: Set(non_empty(args.description)),
        status: Set(normalize_project_status(args.status.as_deref())),
        color: Set(normalize_color(args.color.as_deref(), "blue")),
        icon: Set(normalize_optional_string(args.icon)),
        lead_id: Set(lead_id),
        target_date: Set(target_date),
        sort_order: Set(next_order),
        created_by_id: Set(Some(ctx.user_id.clone())),
        archived_at: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await
    .map_err(db_tool_error)?;

    Ok(json!({ "project": project_json(state, row).await? }))
}

async fn update_project(
    state: &AppState,
    ctx: &RequestContext,
    args: UpdateProjectTool,
) -> Result<Value, CallToolError> {
    let organization_id = ctx.require_workspace()?;
    let id = required(args.id, "id")?;
    let existing = find_project(state, organization_id, &id).await?;
    let mut active = existing.into_active_model();

    if let Some(name) = args.name {
        active.name = Set(required(name, "name")?);
    }
    if let Some(description) = args.description {
        active.description = Set(non_empty(Some(description)));
    }
    if let Some(status) = args.status {
        active.status = Set(normalize_project_status(Some(&status)));
    }
    if let Some(color) = args.color {
        active.color = Set(normalize_color(Some(&color), "blue"));
    }
    if let Some(icon) = args.icon {
        active.icon = Set(normalize_optional_string(Some(icon)));
    }
    if let Some(lead_id) = args.lead_id {
        let lead_id = normalize_optional_string(Some(lead_id));
        if let Some(id) = lead_id.as_deref() {
            ensure_member(state, id, organization_id).await?;
        }
        active.lead_id = Set(lead_id);
    }
    if let Some(target_date) = args.target_date {
        active.target_date = Set(parse_optional_date(Some(&target_date))?);
    }
    if let Some(archived) = args.archived {
        active.archived_at = Set(if archived {
            Some(Utc::now().fixed_offset())
        } else {
            None
        });
    }
    active.updated_at = Set(Utc::now().fixed_offset());

    let updated = active.update(&state.db).await.map_err(db_tool_error)?;
    Ok(json!({ "project": project_json(state, updated).await? }))
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
        let status = validate_issue_status(state, organization_id, status).await?;
        select = select.filter(issue::Column::Status.eq(status));
    }
    if let Some(priority) = non_empty(args.priority) {
        select = select.filter(issue::Column::Priority.eq(priority));
    }
    if let Some(assignee) = non_empty(args.assigned_to_id) {
        select = select.filter(issue::Column::AssignedToId.eq(assignee));
    }
    if let Some(project_id) = non_empty(args.project_id) {
        select = select.filter(issue::Column::ProjectId.eq(project_id));
    }
    let mut label_ids = args.label_ids.unwrap_or_default();
    if let Some(label_id) = args.label_id {
        label_ids.push(label_id);
    }
    let label_ids = normalize_ids(label_ids);
    if !label_ids.is_empty() {
        validate_labels(state, organization_id, &label_ids).await?;
        let joins = issue_label::Entity::find()
            .filter(issue_label::Column::LabelId.is_in(label_ids))
            .all(&state.db)
            .await
            .map_err(db_tool_error)?;
        let issue_ids = normalize_ids(joins.into_iter().map(|join| join.issue_id).collect());
        if issue_ids.is_empty() {
            return Ok(json!({ "issues": [] }));
        }
        select = select.filter(issue::Column::Id.is_in(issue_ids));
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
    let project_id = normalize_optional_string(args.project_id);
    if let Some(id) = project_id.as_deref() {
        find_project(state, organization_id, id).await?;
    }
    let label_ids = normalize_ids(args.label_ids.unwrap_or_default());
    validate_labels(state, organization_id, &label_ids).await?;

    let status = match non_empty(args.status) {
        Some(status) => validate_issue_status(state, organization_id, status).await?,
        None => "backlog".to_owned(),
    };

    let now = Utc::now().fixed_offset();
    let row = issue::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization_id.to_owned()),
        title: Set(title),
        description: Set(non_empty(args.description)),
        status: Set(status),
        priority: Set(non_empty(args.priority).unwrap_or_else(|| "medium".to_owned())),
        created_by_id: Set(Some(ctx.user_id.clone())),
        assigned_to_id: Set(assigned_to_id),
        parent_id: Set(None),
        project_id: Set(project_id),
        attachments: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await
    .map_err(db_tool_error)?;
    replace_issue_labels(state, &row.id, &label_ids).await?;

    record_event(
        state,
        organization_id,
        &row.id,
        Some(&ctx.user_id),
        "created",
        json!([
            {"field": "title", "before": null, "after": row.title},
            {"field": "status", "before": null, "after": row.status},
            {"field": "priority", "before": null, "after": row.priority},
            {"field": "projectId", "before": null, "after": row.project_id},
            {"field": "labelIds", "before": null, "after": label_ids}
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
        let status = required(status, "status")?;
        let next = validate_issue_status(state, organization_id, status).await?;
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
    if let Some(raw_project_id) = args.project_id {
        let next = normalize_optional_string(Some(raw_project_id));
        if let Some(id) = next.as_deref() {
            find_project(state, organization_id, id).await?;
        }
        push_change(
            &mut changes,
            "projectId",
            before.project_id.as_deref(),
            next.as_deref(),
        );
        active.project_id = Set(next);
    }

    if let Some(label_ids) = args.label_ids {
        let label_ids = normalize_ids(label_ids);
        validate_labels(state, organization_id, &label_ids).await?;
        let before_label_ids = labels_for_issue(state, &before.id)
            .await?
            .into_iter()
            .map(|label| label.id)
            .collect::<Vec<_>>();
        if before_label_ids != label_ids {
            changes.push(json!({
                "field": "labelIds",
                "before": before_label_ids,
                "after": label_ids,
            }));
            replace_issue_labels(state, &before.id, &label_ids).await?;
        }
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

async fn find_label(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<label::Model, CallToolError> {
    label::Entity::find_by_id(id)
        .filter(label::Column::OrganizationId.eq(organization_id))
        .one(&state.db)
        .await
        .map_err(db_tool_error)?
        .ok_or_else(|| tool_error(format!("Label {id} not found")))
}

async fn find_project(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<project::Model, CallToolError> {
    project::Entity::find_by_id(id)
        .filter(project::Column::OrganizationId.eq(organization_id))
        .one(&state.db)
        .await
        .map_err(db_tool_error)?
        .ok_or_else(|| tool_error(format!("Project {id} not found")))
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
    let project = match issue.project_id.as_deref() {
        Some(id) => project::Entity::find_by_id(id)
            .one(&state.db)
            .await
            .map_err(db_tool_error)?
            .map(|project| {
                json!({
                    "id": project.id,
                    "name": project.name,
                    "status": project.status,
                    "color": project.color,
                    "icon": project.icon,
                })
            }),
        None => None,
    };
    let labels = labels_for_issue(state, &issue.id)
        .await?
        .into_iter()
        .map(|label| json!({ "id": label.id, "name": label.name, "color": label.color }))
        .collect::<Vec<_>>();

    let mut value = json!({
        "id": issue.id,
        "title": issue.title,
        "status": issue.status,
        "priority": issue.priority,
        "assigned_to": assigned_to,
        "project": project,
        "labels": labels,
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

async fn label_json(state: &AppState, row: label::Model) -> Result<Value, CallToolError> {
    let issue_count = issue_label::Entity::find()
        .filter(issue_label::Column::LabelId.eq(&row.id))
        .count(&state.db)
        .await
        .map_err(db_tool_error)?;
    Ok(json!({
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "color": row.color,
        "archived_at": row.archived_at.map(|value| value.to_rfc3339()),
        "created_at": row.created_at.to_rfc3339(),
        "updated_at": row.updated_at.to_rfc3339(),
        "issue_count": issue_count,
    }))
}

async fn project_json(state: &AppState, row: project::Model) -> Result<Value, CallToolError> {
    let lead = match row.lead_id.as_deref() {
        Some(id) => user::Entity::find_by_id(id)
            .one(&state.db)
            .await
            .map_err(db_tool_error)?
            .map(|user| json!({ "id": user.id, "name": user.name, "email": user.email, "image": user.image })),
        None => None,
    };
    let mut backlog = 0_u64;
    let mut todo = 0_u64;
    let mut in_progress = 0_u64;
    let mut done = 0_u64;
    let categories = issue_status_categories(state, &row.organization_id).await?;
    let issues = issue::Entity::find()
        .filter(issue::Column::OrganizationId.eq(&row.organization_id))
        .filter(issue::Column::ProjectId.eq(&row.id))
        .all(&state.db)
        .await
        .map_err(db_tool_error)?;
    let issue_count = issues.len() as u64;
    for issue in &issues {
        match categories
            .get(&issue.status)
            .map(String::as_str)
            .unwrap_or("active")
        {
            "backlog" => backlog += 1,
            "active" => {
                if issue.status == "in-progress" {
                    in_progress += 1;
                } else {
                    todo += 1;
                }
            }
            "done" => done += 1,
            "canceled" => {}
            _ => {}
        }
    }
    Ok(json!({
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "status": row.status,
        "color": row.color,
        "icon": row.icon,
        "lead_id": row.lead_id,
        "lead": lead,
        "target_date": row.target_date.map(|value| value.to_rfc3339()),
        "sort_order": row.sort_order,
        "archived_at": row.archived_at.map(|value| value.to_rfc3339()),
        "created_at": row.created_at.to_rfc3339(),
        "updated_at": row.updated_at.to_rfc3339(),
        "issue_count": issue_count,
        "done_count": done,
        "status_breakdown": {
            "backlog": backlog,
            "todo": todo,
            "in_progress": in_progress,
            "done": done,
        },
    }))
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

async fn valid_selected_workspace(
    db: &DatabaseConnection,
    grant: &produktive_oauth_grant::Model,
) -> Result<Option<String>, AuthenticationError> {
    let Some(organization_id) = grant.selected_organization_id.as_deref() else {
        return Ok(None);
    };
    let is_member = member::Entity::find()
        .filter(member::Column::UserId.eq(&grant.user_id))
        .filter(member::Column::OrganizationId.eq(organization_id))
        .one(db)
        .await
        .map_err(auth_server_error)?
        .is_some();
    Ok(is_member.then(|| organization_id.to_owned()))
}

fn metadata_string(meta: &Option<Map<String, Value>>, key: &str) -> Option<String> {
    match meta.as_ref()?.get(key) {
        Some(Value::String(value)) if !value.is_empty() => Some(value.to_owned()),
        _ => None,
    }
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

async fn validate_labels(
    state: &AppState,
    organization_id: &str,
    label_ids: &[String],
) -> Result<(), CallToolError> {
    if label_ids.is_empty() {
        return Ok(());
    }
    let rows = label::Entity::find()
        .filter(label::Column::OrganizationId.eq(organization_id))
        .filter(label::Column::Id.is_in(label_ids.iter().cloned()))
        .all(&state.db)
        .await
        .map_err(db_tool_error)?;
    if rows.len() != label_ids.len() {
        return Err(tool_error("One or more labels are invalid"));
    }
    if rows.iter().any(|row| row.archived_at.is_some()) {
        return Err(tool_error("Cannot attach an archived label"));
    }
    Ok(())
}

fn default_issue_status_category(key: &str) -> Option<&'static str> {
    match key {
        "backlog" => Some("backlog"),
        "todo" | "in-progress" => Some("active"),
        "done" => Some("done"),
        "canceled" => Some("canceled"),
        _ => None,
    }
}

async fn issue_status_categories(
    state: &AppState,
    organization_id: &str,
) -> Result<HashMap<String, String>, CallToolError> {
    let mut categories = HashMap::from([
        ("backlog".to_owned(), "backlog".to_owned()),
        ("todo".to_owned(), "active".to_owned()),
        ("in-progress".to_owned(), "active".to_owned()),
        ("done".to_owned(), "done".to_owned()),
        ("canceled".to_owned(), "canceled".to_owned()),
    ]);
    let rows = issue_status::Entity::find()
        .filter(issue_status::Column::OrganizationId.eq(organization_id))
        .filter(issue_status::Column::ArchivedAt.is_null())
        .all(&state.db)
        .await
        .map_err(db_tool_error)?;
    for row in rows {
        categories.insert(row.key, row.category);
    }
    Ok(categories)
}

async fn validate_issue_status(
    state: &AppState,
    organization_id: &str,
    status: String,
) -> Result<String, CallToolError> {
    let status = required(status, "status")?;
    if default_issue_status_category(&status).is_some() {
        return Ok(status);
    }
    let exists = issue_status::Entity::find()
        .filter(issue_status::Column::OrganizationId.eq(organization_id))
        .filter(issue_status::Column::Key.eq(&status))
        .filter(issue_status::Column::ArchivedAt.is_null())
        .one(&state.db)
        .await
        .map_err(db_tool_error)?
        .is_some();
    if exists {
        Ok(status)
    } else {
        Err(tool_error("Status does not exist"))
    }
}

async fn replace_issue_labels(
    state: &AppState,
    issue_id: &str,
    label_ids: &[String],
) -> Result<(), CallToolError> {
    issue_label::Entity::delete_many()
        .filter(issue_label::Column::IssueId.eq(issue_id))
        .exec(&state.db)
        .await
        .map_err(db_tool_error)?;
    if label_ids.is_empty() {
        return Ok(());
    }
    let now = Utc::now().fixed_offset();
    for label_id in label_ids {
        issue_label::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            issue_id: Set(issue_id.to_owned()),
            label_id: Set(label_id.clone()),
            created_at: Set(now),
        }
        .insert(&state.db)
        .await
        .map_err(db_tool_error)?;
    }
    Ok(())
}

async fn labels_for_issue(
    state: &AppState,
    issue_id: &str,
) -> Result<Vec<label::Model>, CallToolError> {
    let joins = issue_label::Entity::find()
        .filter(issue_label::Column::IssueId.eq(issue_id))
        .all(&state.db)
        .await
        .map_err(db_tool_error)?;
    if joins.is_empty() {
        return Ok(Vec::new());
    }
    let ids = joins
        .into_iter()
        .map(|join| join.label_id)
        .collect::<Vec<_>>();
    label::Entity::find()
        .filter(label::Column::Id.is_in(ids))
        .order_by_asc(label::Column::Name)
        .all(&state.db)
        .await
        .map_err(db_tool_error)
}

async fn ensure_unique_label_name(
    state: &AppState,
    organization_id: &str,
    name: &str,
    exclude_id: Option<&str>,
) -> Result<(), CallToolError> {
    let lowered = name.to_lowercase();
    let mut select = label::Entity::find()
        .filter(label::Column::OrganizationId.eq(organization_id))
        .filter(label::Column::ArchivedAt.is_null());
    if let Some(id) = exclude_id {
        select = select.filter(label::Column::Id.ne(id));
    }
    let rows = select.all(&state.db).await.map_err(db_tool_error)?;
    if rows.iter().any(|row| row.name.to_lowercase() == lowered) {
        return Err(tool_error("A label with this name already exists"));
    }
    Ok(())
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

fn normalize_bearer_token(value: &str) -> &str {
    let value = value.trim();
    value
        .get(..7)
        .filter(|prefix| prefix.eq_ignore_ascii_case("bearer "))
        .and_then(|_| value.get(7..))
        .unwrap_or(value)
        .trim()
}

fn system_time_from_datetime(
    value: DateTime<FixedOffset>,
) -> Result<SystemTime, AuthenticationError> {
    let timestamp = value.timestamp();
    let nanos = value.timestamp_subsec_nanos();
    if timestamp < 0 {
        return Err(AuthenticationError::InvalidToken {
            description: "MCP OAuth token has invalid expiration time",
        });
    }
    Ok(UNIX_EPOCH + StdDuration::new(timestamp as u64, nanos))
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

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    non_empty(value)
}

fn normalize_ids(ids: Vec<String>) -> Vec<String> {
    ids.into_iter()
        .filter_map(|id| non_empty(Some(id)))
        .fold(Vec::new(), |mut acc, id| {
            if !acc.contains(&id) {
                acc.push(id);
            }
            acc
        })
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
    let value = value.unwrap_or("planned").trim();
    match value {
        "planned" | "in-progress" | "completed" | "cancelled" => value.to_owned(),
        _ => "planned".to_owned(),
    }
}

fn parse_optional_date(
    value: Option<&str>,
) -> Result<Option<DateTime<FixedOffset>>, CallToolError> {
    let Some(raw) = value else {
        return Ok(None);
    };
    let value = raw.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if let Ok(date_time) = DateTime::parse_from_rfc3339(value) {
        return Ok(Some(date_time));
    }
    if let Ok(date) = chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d") {
        if let Some(date_time) = date.and_hms_opt(0, 0, 0) {
            return Ok(Some(date_time.and_utc().fixed_offset()));
        }
    }
    Err(tool_error(
        "Invalid target date format. Use RFC3339 or YYYY-MM-DD.",
    ))
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

fn auth_server_error(error: sea_orm::DbErr) -> AuthenticationError {
    tracing::error!(%error, "database error in MCP authentication");
    AuthenticationError::ServerError {
        description: "Database error".to_owned(),
    }
}

fn optional_env(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

fn protected_resource_metadata_path(resource_url: &str) -> String {
    let path = resource_url
        .split_once("://")
        .and_then(|(_, rest)| rest.find('/').map(|index| &rest[index..]))
        .unwrap_or("/");
    if path == "/" {
        "/.well-known/oauth-protected-resource".to_owned()
    } else {
        format!(
            "/.well-known/oauth-protected-resource{}",
            path.trim_end_matches('/')
        )
    }
}

fn protected_resource_metadata_url(resource_url: &str) -> String {
    let origin = resource_url
        .split_once("://")
        .and_then(|(scheme, rest)| {
            let host = rest.split('/').next()?;
            Some(format!("{scheme}://{host}"))
        })
        .unwrap_or_else(|| "https://mcp.produktive.app".to_owned());
    format!("{origin}{}", protected_resource_metadata_path(resource_url))
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
    let issuer_url = optional_env("APP_URL").unwrap_or_else(|| "https://produktive.app".to_owned());
    let resource_url = optional_env("MCP_RESOURCE_URL")
        .unwrap_or_else(|| "https://mcp.produktive.app/mcp".to_owned());
    let state = AppState {
        db,
        issuer_url: issuer_url.trim_end_matches('/').to_owned(),
        resource_url: resource_url.trim_end_matches('/').to_owned(),
    };
    let port = std::env::var("PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(3001);

    let server_details = InitializeResult {
        server_info: Implementation {
            name: "produktive-mcp".into(),
            version: env!("CARGO_PKG_VERSION").into(),
            title: Some("Produktive MCP".into()),
            description: Some(
                "MCP server for Produktive workspaces, members, labels, projects, and issues."
                    .into(),
            ),
            icons: vec![],
            website_url: Some("https://produktive.app".into()),
        },
        capabilities: ServerCapabilities {
            tools: Some(ServerCapabilitiesTools { list_changed: None }),
            ..Default::default()
        },
        protocol_version: ProtocolVersion::V2025_06_18.into(),
        instructions: Some(
            "Use list_workspaces and select_workspace before workspace-scoped tools if no workspace is selected."
                .into(),
        ),
        meta: None,
    };

    let handler = ProduktiveHandler {
        state: state.clone(),
    };
    let protected_resource_metadata_url = protected_resource_metadata_url(&state.resource_url);
    let protected_resource_path = protected_resource_metadata_path(&state.resource_url);
    let mut endpoints = HashMap::new();
    endpoints.insert(
        protected_resource_path,
        OauthEndpoint::ProtectedResourceMetadata,
    );
    let auth = ProduktiveAuthProvider {
        state,
        endpoints,
        protected_resource_metadata_url,
    };
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
