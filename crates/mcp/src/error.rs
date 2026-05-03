use rust_mcp_sdk::{auth::AuthenticationError, schema::schema_utils::CallToolError};

pub(crate) fn tool_error(message: impl Into<String>) -> CallToolError {
    CallToolError::from_message(message.into())
}

pub(crate) fn db_tool_error(error: sea_orm::DbErr) -> CallToolError {
    tracing::error!(%error, "database error in MCP tool");
    tool_error("Database error")
}

pub(crate) fn auth_server_error(error: sea_orm::DbErr) -> AuthenticationError {
    tracing::error!(%error, "database error in MCP authentication");
    AuthenticationError::ServerError {
        description: "Database error".to_owned(),
    }
}
