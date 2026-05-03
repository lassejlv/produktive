use chrono::{DateTime, FixedOffset};
use rust_mcp_sdk::schema::{
    schema_utils::CallToolError, CallToolRequestParams, CallToolResult, TextContent,
};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

use crate::error::tool_error;

pub(crate) fn parse_args<T: DeserializeOwned>(
    params: &CallToolRequestParams,
) -> Result<T, CallToolError> {
    let value = serde_json::to_value(&params.arguments)
        .map_err(|error| tool_error(format!("Invalid arguments: {error}")))?;
    let value = if value.is_null() { json!({}) } else { value };
    serde_json::from_value(value).map_err(|error| tool_error(format!("Invalid arguments: {error}")))
}

pub(crate) fn json_tool_result(value: Value) -> CallToolResult {
    let text = serde_json::to_string_pretty(&value).unwrap_or_else(|_| value.to_string());
    CallToolResult::text_content(vec![TextContent::from(text)])
}

pub(crate) fn required(value: String, field: &str) -> Result<String, CallToolError> {
    let value = value.trim();
    if value.is_empty() {
        Err(tool_error(format!("{field} is required")))
    } else {
        Ok(value.to_owned())
    }
}

pub(crate) fn non_empty(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

pub(crate) fn normalize_assignee(value: Option<String>) -> Option<String> {
    non_empty(value)
}

pub(crate) fn normalize_optional_string(value: Option<String>) -> Option<String> {
    non_empty(value)
}

pub(crate) fn normalize_ids(ids: Vec<String>) -> Vec<String> {
    ids.into_iter()
        .filter_map(|id| non_empty(Some(id)))
        .fold(Vec::new(), |mut acc, id| {
            if !acc.contains(&id) {
                acc.push(id);
            }
            acc
        })
}

pub(crate) fn normalize_color(value: Option<&str>, default: &str) -> String {
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

pub(crate) fn normalize_project_status(value: Option<&str>) -> String {
    let value = value.unwrap_or("planned").trim();
    match value {
        "planned" | "in-progress" | "completed" | "cancelled" => value.to_owned(),
        _ => "planned".to_owned(),
    }
}

pub(crate) fn parse_optional_date(
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

pub(crate) fn push_change(
    changes: &mut Vec<Value>,
    field: &str,
    before: Option<&str>,
    after: Option<&str>,
) {
    if before != after {
        changes.push(json!({
            "field": field,
            "before": before,
            "after": after,
        }));
    }
}

pub(crate) fn optional_env(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}
