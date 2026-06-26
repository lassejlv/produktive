use axum::{
    extract::{Path, State},
    middleware::{from_fn_with_state, Next},
    response::Response,
    routing::get,
    Extension, Json, Router,
};
use axum::extract::Request;
use sea_orm::ConnectionTrait;
use serde::Deserialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    http::object_storage_service::{
        self, CreateObjectStorageBucketInput, CreatedObjectStorageBucketView,
        ObjectStorageBucketView,
    },
    middleware::Membership,
    state::AppState,
};

const ACCESS_APPROVED: i16 = 1;

pub fn routes(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/buckets", get(list_buckets).post(create_bucket))
        .route("/buckets/{bucket_id}", get(get_bucket).delete(delete_bucket))
        .route("/regions", get(list_regions))
        .route_layer(from_fn_with_state(state, object_storage_access_guard))
}

async fn object_storage_access_guard(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    req: Request,
    next: Next,
) -> Result<Response, ApiError> {
    if !state.config.object_storage_enabled {
        return Err(ApiError::service_unavailable("object storage is disabled"));
    }
    if !state.config.deployments_enabled {
        return Err(ApiError::service_unavailable("deployments are disabled"));
    }
    let row = state
        .db
        .query_one(sea_orm::Statement::from_sql_and_values(
            sea_orm::DatabaseBackend::Postgres,
            "SELECT status FROM deploy_access_requests WHERE workspace_id = $1",
            [m.workspace.id.into()],
        ))
        .await
        .map_err(ApiError::from)?;
    match row.and_then(|row| row.try_get::<i16>("", "status").ok()) {
        Some(ACCESS_APPROVED) => Ok(next.run(req).await),
        _ => Err(ApiError::Forbidden),
    }
}

#[derive(Deserialize, ToSchema)]
pub struct CreateObjectStorageBucketBody {
    pub name: String,
    #[serde(default)]
    pub slug: Option<String>,
    #[serde(default)]
    pub region: Option<String>,
    #[serde(default)]
    pub access: Option<String>,
}

#[utoipa::path(get, path = "/api/workspaces/{wid}/object-storage/regions", tag = "object-storage", security(("bearerAuth" = [])))]
pub async fn list_regions(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<Vec<tigris::DeployRegion>>> {
    object_storage_service::ensure_object_storage_access(&state, m.workspace.id).await?;
    Ok(Json(object_storage_service::list_regions()))
}

#[utoipa::path(get, path = "/api/workspaces/{wid}/object-storage/buckets", tag = "object-storage", security(("bearerAuth" = [])))]
pub async fn list_buckets(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<Vec<ObjectStorageBucketView>>> {
    object_storage_service::list_buckets(&state, m.workspace.id)
        .await
        .map(Json)
}

#[utoipa::path(post, path = "/api/workspaces/{wid}/object-storage/buckets", tag = "object-storage", security(("bearerAuth" = [])))]
pub async fn create_bucket(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    auth: AuthUser,
    Json(body): Json<CreateObjectStorageBucketBody>,
) -> ApiResult<Json<CreatedObjectStorageBucketView>> {
    m.require_owner()?;
    object_storage_service::create_bucket(
        &state,
        m.workspace.id,
        Some(auth.user.id),
        CreateObjectStorageBucketInput {
            name: body.name,
            slug: body.slug,
            region: body.region,
            access: body.access,
        },
    )
    .await
    .map(Json)
}

#[utoipa::path(get, path = "/api/workspaces/{wid}/object-storage/buckets/{bucket_id}", tag = "object-storage", security(("bearerAuth" = [])))]
pub async fn get_bucket(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, bucket_id)): Path<(String, Uuid)>,
) -> ApiResult<Json<ObjectStorageBucketView>> {
    object_storage_service::get_bucket(&state, m.workspace.id, bucket_id)
        .await
        .map(Json)
}

#[utoipa::path(delete, path = "/api/workspaces/{wid}/object-storage/buckets/{bucket_id}", tag = "object-storage", security(("bearerAuth" = [])))]
pub async fn delete_bucket(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, bucket_id)): Path<(String, Uuid)>,
) -> ApiResult<Json<crate::auth::routes::OkResponse>> {
    m.require_owner()?;
    object_storage_service::delete_bucket(&state, m.workspace.id, bucket_id).await?;
    Ok(Json(crate::auth::routes::OkResponse { ok: true }))
}
