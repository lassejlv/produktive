use crate::{error::ApiError, state::AppState};
use produktive_entity::member;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};

pub(crate) async fn validate_assignee(
    state: &AppState,
    organization_id: &str,
    assigned_to_id: Option<&str>,
) -> Result<(), ApiError> {
    let Some(assigned_to_id) = assigned_to_id else {
        return Ok(());
    };

    let member = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(organization_id))
        .filter(member::Column::UserId.eq(assigned_to_id))
        .one(&state.db)
        .await?;

    if member.is_none() {
        return Err(ApiError::BadRequest(
            "Assignee is not a member of this organization".to_owned(),
        ));
    }

    Ok(())
}

pub(crate) fn required_string(value: String, label: &str) -> Result<String, ApiError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(ApiError::BadRequest(format!("{label} is required")));
    }
    Ok(value.to_owned())
}

pub(crate) fn optional_string(value: Option<String>, default: &str) -> Result<String, ApiError> {
    match value {
        Some(value) => required_string(value, default),
        None => Ok(default.to_owned()),
    }
}

pub(crate) fn non_empty_optional(value: String) -> Result<Option<String>, ApiError> {
    let value = value.trim();
    Ok((!value.is_empty()).then(|| value.to_owned()))
}

pub(crate) fn normalize_assignee(value: Option<String>) -> Result<Option<String>, ApiError> {
    match value {
        Some(value) => non_empty_optional(value),
        None => Ok(None),
    }
}
