use axum::{extract::State, routing::get, Extension, Json, Router};

use crate::{
    error::ApiResult,
    middleware::Membership,
    regions::{self, RegionView},
    state::AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new().route("/", get(list))
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/regions",
    params(("wid" = String, Path, description = "workspace id or slug")),
    responses((status = 200, body = [RegionView])),
    security(("bearerAuth" = [])),
    tag = "regions"
)]
pub async fn list(
    State(state): State<AppState>,
    Extension(_m): Extension<Membership>,
) -> ApiResult<Json<Vec<RegionView>>> {
    Ok(Json(regions::list_enabled_regions(&state).await?))
}
