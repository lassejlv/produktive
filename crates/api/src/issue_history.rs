use crate::{error::ApiError, state::AppState};
use chrono::{DateTime, FixedOffset, Utc};
use produktive_entity::issue_event;
use sea_orm::{ActiveModelTrait, Set};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueChange {
    pub field: String,
    pub before: Value,
    pub after: Value,
}

pub async fn record_issue_event(
    state: &AppState,
    organization_id: &str,
    issue_id: &str,
    actor_id: Option<&str>,
    action: &str,
    changes: Vec<IssueChange>,
) -> Result<issue_event::Model, ApiError> {
    let now: DateTime<FixedOffset> = Utc::now().fixed_offset();

    issue_event::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(organization_id.to_owned()),
        issue_id: Set(issue_id.to_owned()),
        actor_id: Set(actor_id.map(ToOwned::to_owned)),
        action: Set(action.to_owned()),
        changes: Set(serde_json::to_value(changes).map_err(|error| {
            ApiError::Internal(anyhow::anyhow!(
                "failed to serialize issue history changes: {error}"
            ))
        })?),
        created_at: Set(now),
    }
    .insert(&state.db)
    .await
    .map_err(Into::into)
}

pub fn string_change(
    field: &str,
    before: Option<&str>,
    after: Option<&str>,
) -> Option<IssueChange> {
    if before == after {
        return None;
    }

    Some(IssueChange {
        field: field.to_owned(),
        before: before
            .map(|value| Value::String(value.to_owned()))
            .unwrap_or(Value::Null),
        after: after
            .map(|value| Value::String(value.to_owned()))
            .unwrap_or(Value::Null),
    })
}
