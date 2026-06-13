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
    Router::new()
        .route("/regions", get(list_regions))
        .route("/regions/{region_id}", patch(update_region))
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
    require_admin(&state, &auth)?;
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
    require_admin(&state, &auth)?;
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

fn require_admin(state: &AppState, auth: &AuthUser) -> ApiResult<()> {
    if auth.user.is_admin || state.config.is_admin_email(&auth.user.email) {
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
