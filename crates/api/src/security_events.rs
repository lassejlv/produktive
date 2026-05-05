use crate::{error::ApiError, state::AppState};
use axum::http::HeaderMap;
use chrono::Utc;
use produktive_entity::security_event;
use sea_orm::{ActiveModelTrait, Set};
use serde_json::{json, Value};
use uuid::Uuid;

pub const EVENT_LOGIN_SUCCESS: &str = "login.success";
pub const EVENT_LOGIN_2FA_FAILED: &str = "login.2fa_failed";
pub const EVENT_TWO_FACTOR_ENABLED: &str = "two_factor.enabled";
pub const EVENT_TWO_FACTOR_DISABLED: &str = "two_factor.disabled";
pub const EVENT_TWO_FACTOR_BACKUP_CODES_REGENERATED: &str = "two_factor.backup_codes_regenerated";
pub const EVENT_WORKSPACE_REQUIRE_2FA_ENABLED: &str = "workspace.require_2fa_enabled";
pub const EVENT_WORKSPACE_REQUIRE_2FA_DISABLED: &str = "workspace.require_2fa_disabled";
pub const EVENT_MEMBER_ROLE_CHANGED: &str = "member.role_changed";
pub const EVENT_MEMBER_REMOVED: &str = "member.removed";
pub const EVENT_WORKSPACE_DELETED: &str = "workspace.deleted";
pub const EVENT_ACCOUNT_DELETED: &str = "account.deleted";
pub const EVENT_TWO_FACTOR_NUDGE_SENT: &str = "two_factor.nudge_sent";
pub const EVENT_TWO_FACTOR_RECOVERY_RESET: &str = "two_factor.recovery_reset";
pub const EVENT_TWO_FACTOR_ENFORCEMENT_BLOCKED: &str = "two_factor.enforcement_blocked";
pub const EVENT_TWO_FACTOR_ENFORCEMENT_SETUP_COMPLETED: &str =
    "two_factor.enforcement_setup_completed";

#[derive(Clone, Debug)]
pub struct SecurityEventInput {
    pub organization_id: Option<String>,
    pub actor_user_id: Option<String>,
    pub target_user_id: Option<String>,
    pub event_type: &'static str,
    pub metadata: Value,
}

pub async fn record_security_event(
    state: &AppState,
    headers: Option<&HeaderMap>,
    input: SecurityEventInput,
) -> Result<(), ApiError> {
    let now = Utc::now().fixed_offset();
    security_event::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(input.organization_id),
        actor_user_id: Set(input.actor_user_id),
        target_user_id: Set(input.target_user_id),
        event_type: Set(input.event_type.to_owned()),
        ip_address: Set(headers.and_then(ip_address)),
        user_agent: Set(headers.and_then(user_agent)),
        metadata: Set(input.metadata),
        created_at: Set(now),
    }
    .insert(&state.db)
    .await?;
    Ok(())
}

pub fn metadata_empty() -> Value {
    json!({})
}

fn ip_address(headers: &HeaderMap) -> Option<String> {
    headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|value| value.to_str().ok())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
        })
}

fn user_agent(headers: &HeaderMap) -> Option<String> {
    headers
        .get("user-agent")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(512).collect())
}
