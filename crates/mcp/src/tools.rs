use rust_mcp_sdk::macros::{mcp_tool, JsonSchema};
use serde::{Deserialize, Serialize};

#[mcp_tool(
    name = "list_workspaces",
    description = "List Produktive workspaces available to the authenticated OAuth user."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema, Default)]
pub(crate) struct ListWorkspacesTool {}

#[mcp_tool(
    name = "current_workspace",
    description = "Show the currently selected Produktive workspace for this MCP OAuth grant."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema, Default)]
pub(crate) struct CurrentWorkspaceTool {}

#[mcp_tool(
    name = "select_workspace",
    description = "Select the Produktive workspace subsequent MCP tools should operate on."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub(crate) struct SelectWorkspaceTool {
    /// Workspace/organization id returned by list_workspaces.
    pub(crate) organization_id: String,
}

#[mcp_tool(
    name = "list_members",
    description = "List members of the currently selected Produktive workspace."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema, Default)]
pub(crate) struct ListMembersTool {}

#[mcp_tool(
    name = "list_labels",
    description = "List labels in the selected workspace. By default archived labels are hidden."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema, Default)]
pub(crate) struct ListLabelsTool {
    pub(crate) include_archived: Option<bool>,
}

#[mcp_tool(
    name = "create_label",
    description = "Create a label in the selected workspace."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub(crate) struct CreateLabelTool {
    pub(crate) name: String,
    pub(crate) description: Option<String>,
    pub(crate) color: Option<String>,
}

#[mcp_tool(
    name = "update_label",
    description = "Update a label. Set archived to true or false to archive or restore it."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub(crate) struct UpdateLabelTool {
    pub(crate) id: String,
    pub(crate) name: Option<String>,
    pub(crate) description: Option<String>,
    pub(crate) color: Option<String>,
    pub(crate) archived: Option<bool>,
}

#[mcp_tool(
    name = "list_projects",
    description = "List projects in the selected workspace. By default archived projects are hidden."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema, Default)]
pub(crate) struct ListProjectsTool {
    pub(crate) include_archived: Option<bool>,
}

#[mcp_tool(
    name = "create_project",
    description = "Create a project in the selected workspace."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub(crate) struct CreateProjectTool {
    pub(crate) name: String,
    pub(crate) description: Option<String>,
    pub(crate) status: Option<String>,
    pub(crate) color: Option<String>,
    pub(crate) icon: Option<String>,
    pub(crate) lead_id: Option<String>,
    pub(crate) target_date: Option<String>,
}

#[mcp_tool(
    name = "update_project",
    description = "Update a project. Set archived to true or false to archive or restore it."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub(crate) struct UpdateProjectTool {
    pub(crate) id: String,
    pub(crate) name: Option<String>,
    pub(crate) description: Option<String>,
    pub(crate) status: Option<String>,
    pub(crate) color: Option<String>,
    pub(crate) icon: Option<String>,
    pub(crate) lead_id: Option<String>,
    pub(crate) target_date: Option<String>,
    pub(crate) archived: Option<bool>,
}

#[mcp_tool(
    name = "list_issues",
    description = "List issues in the selected workspace. Optional filters: status, priority, assigned_to_id. Returns newest issues first."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema, Default)]
pub(crate) struct ListIssuesTool {
    pub(crate) status: Option<String>,
    pub(crate) priority: Option<String>,
    pub(crate) assigned_to_id: Option<String>,
    pub(crate) project_id: Option<String>,
    /// Filter to issues containing this label id.
    pub(crate) label_id: Option<String>,
    /// Filter to issues containing any of these label ids.
    pub(crate) label_ids: Option<Vec<String>>,
    pub(crate) limit: Option<u64>,
}

#[mcp_tool(name = "get_issue", description = "Get one issue by id.")]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub(crate) struct GetIssueTool {
    pub(crate) id: String,
}

#[mcp_tool(
    name = "create_issue",
    description = "Create a new issue in the selected workspace."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub(crate) struct CreateIssueTool {
    pub(crate) title: String,
    pub(crate) description: Option<String>,
    pub(crate) status: Option<String>,
    pub(crate) priority: Option<String>,
    pub(crate) assigned_to_id: Option<String>,
    pub(crate) project_id: Option<String>,
    pub(crate) label_ids: Option<Vec<String>>,
}

#[mcp_tool(
    name = "update_issue",
    description = "Update an existing issue. Only provided fields are changed. Pass empty assigned_to_id to unassign."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub(crate) struct UpdateIssueTool {
    pub(crate) id: String,
    pub(crate) title: Option<String>,
    pub(crate) description: Option<String>,
    pub(crate) status: Option<String>,
    pub(crate) priority: Option<String>,
    pub(crate) assigned_to_id: Option<String>,
    pub(crate) project_id: Option<String>,
    pub(crate) label_ids: Option<Vec<String>>,
}

#[mcp_tool(
    name = "list_issue_comments",
    description = "List comments for an issue in the selected workspace."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub(crate) struct ListIssueCommentsTool {
    pub(crate) issue_id: String,
}

#[mcp_tool(
    name = "create_issue_comment",
    description = "Create a comment on an issue in the selected workspace."
)]
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub(crate) struct CreateIssueCommentTool {
    pub(crate) issue_id: String,
    pub(crate) body: String,
}

pub(crate) fn all_tools() -> Vec<rust_mcp_sdk::schema::Tool> {
    vec![
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
    ]
}
