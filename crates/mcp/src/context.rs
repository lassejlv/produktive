use rust_mcp_sdk::{auth::AuthInfo, schema::schema_utils::CallToolError};
use serde_json::{Map, Value};

use crate::{error::tool_error, state::AppState};

#[derive(Debug)]
pub(crate) struct RequestContext {
    pub(crate) grant_id: String,
    pub(crate) user_id: String,
    pub(crate) organization_id: Option<String>,
}

impl RequestContext {
    pub(crate) async fn from_auth(
        _state: &AppState,
        auth: AuthInfo,
    ) -> Result<Self, CallToolError> {
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

    pub(crate) fn require_workspace(&self) -> Result<&str, CallToolError> {
        self.organization_id.as_deref().ok_or_else(|| {
            tool_error("No workspace selected. Call list_workspaces, then select_workspace.")
        })
    }
}

fn metadata_string(meta: &Option<Map<String, Value>>, key: &str) -> Option<String> {
    match meta.as_ref()?.get(key) {
        Some(Value::String(value)) if !value.is_empty() => Some(value.to_owned()),
        _ => None,
    }
}
