use async_trait::async_trait;
use rust_mcp_sdk::{
    mcp_server::ServerHandler,
    schema::{
        schema_utils::CallToolError, CallToolRequestParams, CallToolResult, ListToolsResult,
        PaginatedRequestParams, RpcError,
    },
    McpServer,
};
use std::sync::Arc;

use crate::{
    context::RequestContext,
    error::tool_error,
    operations::{
        create_issue, create_issue_comment, create_label, create_project, current_workspace,
        get_issue, list_issue_comments, list_issues, list_labels, list_members, list_projects,
        list_workspaces, select_workspace, update_issue, update_label, update_project,
    },
    state::AppState,
    tools::{
        all_tools, CreateIssueCommentTool, CreateIssueTool, CreateLabelTool, CreateProjectTool,
        CurrentWorkspaceTool, GetIssueTool, ListIssueCommentsTool, ListIssuesTool, ListLabelsTool,
        ListMembersTool, ListProjectsTool, ListWorkspacesTool, SelectWorkspaceTool,
        UpdateIssueTool, UpdateLabelTool, UpdateProjectTool,
    },
    util::{json_tool_result, parse_args},
};

#[derive(Clone)]
pub(crate) struct ProduktiveHandler {
    pub(crate) state: AppState,
}

#[async_trait]
impl ServerHandler for ProduktiveHandler {
    async fn handle_list_tools_request(
        &self,
        _params: Option<PaginatedRequestParams>,
        _runtime: Arc<dyn McpServer>,
    ) -> Result<ListToolsResult, RpcError> {
        Ok(ListToolsResult {
            tools: all_tools(),
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
