use axum::{
    extract::{Path, State},
    routing::{get, patch},
    Json, Router,
};
use chrono::{DateTime, FixedOffset};
use entity::region;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, EntityTrait, QueryOrder};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    regions,
    state::AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new().route("/regions", get(list_regions)).route(
        "/regions/{region_id}",
        patch(update_region).delete(delete_region),
    )
}

#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct AdminRegionView {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub enabled: bool,
    pub heartbeat_at: Option<DateTime<FixedOffset>>,
    pub version: Option<String>,
    pub capabilities: Vec<String>,
    pub created_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateRegionBody {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub enabled: Option<bool>,
}

async fn list_regions(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<AdminRegionView>>> {
    require_admin(&auth)?;
    let rows = region::Entity::find()
        .order_by_asc(region::Column::Slug)
        .all(&state.db)
        .await?;
    Ok(Json(rows.into_iter().map(admin_region_view).collect()))
}

async fn update_region(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(region_id): Path<Uuid>,
    Json(body): Json<UpdateRegionBody>,
) -> ApiResult<Json<AdminRegionView>> {
    require_admin(&auth)?;
    let row = region::Entity::find_by_id(region_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("region not found"))?;
    let mut model: region::ActiveModel = row.into();

    if let Some(name) = body.name {
        let name = name.trim();
        if name.is_empty() || name.len() > 80 {
            return Err(ApiError::bad_request(
                "region name must be between 1 and 80 characters",
            ));
        }
        model.name = Set(name.to_string());
    }
    if let Some(enabled) = body.enabled {
        model.enabled = Set(enabled);
    }
    model.updated_at = Set(chrono::Utc::now().fixed_offset());

    let updated = model.update(&state.db).await?;
    Ok(Json(admin_region_view(updated)))
}

async fn delete_region(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(region_id): Path<Uuid>,
) -> ApiResult<Json<crate::http::workspaces::OkResponse>> {
    require_admin(&auth)?;
    let row = region::Entity::find_by_id(region_id)
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("region not found"))?;
    // The control plane's in-process worker probes from this region and every
    // monitor is assigned to it by default; deleting it would orphan those
    // assignments, so it can only ever be disabled.
    if row.slug == state.config.local_region_slug {
        return Err(ApiError::bad_request(
            "the control plane's local region cannot be deleted",
        ));
    }
    // monitor_regions / monitor_region_states cascade on delete; historical
    // `checks` rows keep their region_id (no FK) as immutable telemetry.
    region::Entity::delete_by_id(row.id).exec(&state.db).await?;
    Ok(Json(crate::http::workspaces::OkResponse { ok: true }))
}

fn require_admin(auth: &AuthUser) -> ApiResult<()> {
    if auth.user.is_admin {
        return Ok(());
    }
    Err(ApiError::Forbidden)
}

fn admin_region_view(region: region::Model) -> AdminRegionView {
    AdminRegionView {
        id: region.id,
        slug: region.slug,
        name: region.name,
        enabled: region.enabled,
        heartbeat_at: region.heartbeat_at,
        version: region.version,
        capabilities: regions::capabilities(&region.capabilities),
        created_at: region.created_at,
        updated_at: region.updated_at,
    }
}

#[cfg(test)]
mod tests {
    use super::require_admin;
    use crate::auth::AuthUser;
    use chrono::Utc;
    use entity::user;
    use uuid::Uuid;

    fn auth_user(email: &str, is_admin: bool) -> AuthUser {
        let now = Utc::now().fixed_offset();
        AuthUser {
            user: user::Model {
                id: Uuid::now_v7(),
                email: email.to_owned(),
                github_id: None,
                password_hash: "hash".to_owned(),
                is_admin,
                created_at: now,
                updated_at: now,
            },
            session_id: Uuid::now_v7(),
        }
    }

    #[test]
    fn admin_guard_uses_persisted_admin_flag() {
        assert!(require_admin(&auth_user("admin@example.com", true)).is_ok());
    }

    #[test]
    fn admin_guard_rejects_unflagged_user_even_with_admin_like_email() {
        assert!(require_admin(&auth_user("admin@example.com", false)).is_err());
    }
}
