use crate::{
    auth::require_auth,
    error::ApiError,
    permissions::{
        self, member_role, permission_catalog, sanitize_permissions, RoleInfo, ROLE_OWNER,
    },
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use chrono::Utc;
use produktive_entity::{invitation, member, organization_role};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, PaginatorTrait, QueryFilter, Set,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_roles).post(create_role))
        .route(
            "/{id}",
            axum::routing::patch(update_role).delete(delete_role),
        )
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RolesEnvelope {
    roles: Vec<RoleInfo>,
    permissions: Vec<permissions::PermissionInfo>,
}

async fn list_roles(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<RolesEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let roles = permissions::list_roles(&state.db, &auth.organization.id, false).await?;
    Ok(Json(RolesEnvelope {
        roles,
        permissions: permission_catalog(),
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RoleRequest {
    name: String,
    description: Option<String>,
    permissions: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RoleEnvelope {
    role: RoleInfo,
}

async fn create_role(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<RoleRequest>,
) -> Result<(StatusCode, Json<RoleEnvelope>), ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner_role(&state, &auth.user.id, &auth.organization.id).await?;

    let name = validate_name(&payload.name)?;
    let key = unique_role_key(&state, &auth.organization.id, &name).await?;
    let now = Utc::now().fixed_offset();
    let row = organization_role::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(auth.organization.id.clone()),
        key: Set(key),
        name: Set(name),
        description: Set(clean_description(payload.description)),
        permissions: Set(json!(sanitize_permissions(&payload.permissions))),
        is_system: Set(false),
        archived_at: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(RoleEnvelope {
            role: permissions::role_response(row),
        }),
    ))
}

async fn update_role(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<RoleRequest>,
) -> Result<Json<RoleEnvelope>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner_role(&state, &auth.user.id, &auth.organization.id).await?;

    let row = find_custom_role(&state, &auth.organization.id, &id).await?;
    let mut active = row.into_active_model();
    active.name = Set(validate_name(&payload.name)?);
    active.description = Set(clean_description(payload.description));
    active.permissions = Set(json!(sanitize_permissions(&payload.permissions)));
    active.updated_at = Set(Utc::now().fixed_offset());
    let updated = active.update(&state.db).await?;

    Ok(Json(RoleEnvelope {
        role: permissions::role_response(updated),
    }))
}

async fn delete_role(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner_role(&state, &auth.user.id, &auth.organization.id).await?;

    let row = find_custom_role(&state, &auth.organization.id, &id).await?;
    let assigned = member::Entity::find()
        .filter(member::Column::OrganizationId.eq(&auth.organization.id))
        .filter(member::Column::Role.eq(&row.key))
        .count(&state.db)
        .await?;
    if assigned > 0 {
        return Err(ApiError::BadRequest(
            "This role is assigned to members".to_owned(),
        ));
    }

    let pending_invites = invitation::Entity::find()
        .filter(invitation::Column::OrganizationId.eq(&auth.organization.id))
        .filter(invitation::Column::Role.eq(&row.key))
        .filter(invitation::Column::AcceptedAt.is_null())
        .filter(invitation::Column::RevokedAt.is_null())
        .count(&state.db)
        .await?;
    if pending_invites > 0 {
        return Err(ApiError::BadRequest(
            "This role is used by pending invitations".to_owned(),
        ));
    }

    let now = Utc::now().fixed_offset();
    let mut active = row.into_active_model();
    active.archived_at = Set(Some(now));
    active.updated_at = Set(now);
    active.update(&state.db).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn find_custom_role(
    state: &AppState,
    organization_id: &str,
    id: &str,
) -> Result<organization_role::Model, ApiError> {
    if permissions::is_built_in_role(id) {
        return Err(ApiError::BadRequest(
            "System roles cannot be changed".to_owned(),
        ));
    }
    organization_role::Entity::find()
        .filter(organization_role::Column::Id.eq(id))
        .filter(organization_role::Column::OrganizationId.eq(organization_id))
        .filter(organization_role::Column::ArchivedAt.is_null())
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("Role not found".to_owned()))
}

async fn unique_role_key(
    state: &AppState,
    organization_id: &str,
    name: &str,
) -> Result<String, ApiError> {
    let base = slugify(name);
    let mut candidate = base.clone();
    let mut suffix = 2;
    while permissions::role_exists(&state.db, organization_id, &candidate).await? {
        candidate = format!("{base}-{suffix}");
        suffix += 1;
    }
    Ok(candidate)
}

fn validate_name(input: &str) -> Result<String, ApiError> {
    let name = input.trim();
    if name.is_empty() {
        return Err(ApiError::BadRequest("Role name is required".to_owned()));
    }
    if name.chars().count() > 48 {
        return Err(ApiError::BadRequest(
            "Role name must be 48 characters or fewer".to_owned(),
        ));
    }
    Ok(name.to_owned())
}

fn clean_description(input: Option<String>) -> Option<String> {
    input
        .map(|value| value.trim().chars().take(160).collect::<String>())
        .filter(|value| !value.is_empty())
}

fn slugify(input: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash && !out.is_empty() {
            out.push('-');
            last_dash = true;
        }
    }
    let slug = out.trim_matches('-').chars().take(48).collect::<String>();
    if slug.is_empty() {
        "custom-role".to_owned()
    } else {
        slug
    }
}

async fn require_owner_role(
    state: &AppState,
    user_id: &str,
    organization_id: &str,
) -> Result<(), ApiError> {
    match member_role(&state.db, user_id, organization_id)
        .await?
        .as_deref()
    {
        Some(ROLE_OWNER) => Ok(()),
        _ => Err(ApiError::Forbidden(
            "Only workspace owners can manage roles".to_owned(),
        )),
    }
}
