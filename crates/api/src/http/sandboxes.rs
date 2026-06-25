use axum::{
    extract::{Path, State},
    routing::{delete, get, post},
    Extension, Json, Router,
};
use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::ApiResult,
    http::sandbox_service::{
        self, CreateSandboxInput, ExecSandboxInput, UpdateSandboxInput,
    },
    middleware::Membership,
    state::AppState,
};

pub use sandbox_service::{
    CreatedSandboxApiToken, DeploySandboxView, SandboxApiTokenView, SandboxCheckpointView,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/sandboxes/tokens", get(list_api_tokens).post(create_api_token))
        .route("/sandboxes/tokens/{token_id}", delete(revoke_api_token))
        .route("/sandboxes", get(list_sandboxes).post(create_sandbox))
        .route(
            "/sandboxes/{sandbox_id}",
            get(get_sandbox)
                .patch(update_sandbox)
                .delete(delete_sandbox),
        )
        .route("/sandboxes/{sandbox_id}/exec", post(exec_sandbox))
        .route(
            "/sandboxes/{sandbox_id}/checkpoints",
            get(list_checkpoints).post(create_checkpoint),
        )
        .route(
            "/sandboxes/{sandbox_id}/checkpoints/{checkpoint_id}/restore",
            post(restore_checkpoint),
        )
        .route(
            "/sandboxes/{sandbox_id}/checkpoints/{checkpoint_id}",
            delete(delete_checkpoint),
        )
}

#[derive(Deserialize, ToSchema)]
pub struct CreateSandboxBody {
    pub name: String,
    #[serde(default)]
    pub slug: Option<String>,
    #[serde(default)]
    pub region: Option<String>,
    #[serde(default)]
    pub cpus: Option<i32>,
    #[serde(default)]
    pub ram_mb: Option<i32>,
    #[serde(default)]
    pub storage_gb: Option<i32>,
    #[serde(default)]
    pub url_auth: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateSandboxBody {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub url_auth: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct ExecSandboxBody {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub cwd: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct ExecSandboxView {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub truncated: bool,
}

#[derive(Deserialize, ToSchema)]
pub struct CreateCheckpointBody {
    #[serde(default)]
    pub comment: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct CreateSandboxApiTokenBody {
    pub name: String,
    #[serde(default)]
    pub expires_at: Option<DateTime<FixedOffset>>,
}

#[utoipa::path(get, path = "/api/workspaces/{wid}/deployments/sandboxes/tokens", tag = "deployments", security(("bearerAuth" = [])))]
pub async fn list_api_tokens(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<Vec<SandboxApiTokenView>>> {
    sandbox_service::list_api_tokens(&state, m.workspace.id)
        .await
        .map(Json)
}

#[utoipa::path(post, path = "/api/workspaces/{wid}/deployments/sandboxes/tokens", tag = "deployments", security(("bearerAuth" = [])))]
pub async fn create_api_token(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    auth: AuthUser,
    Json(body): Json<CreateSandboxApiTokenBody>,
) -> ApiResult<Json<CreatedSandboxApiToken>> {
    m.require_owner()?;
    sandbox_service::create_api_token(
        &state,
        m.workspace.id,
        auth.user.id,
        body.name,
        body.expires_at,
    )
    .await
    .map(Json)
}

#[utoipa::path(delete, path = "/api/workspaces/{wid}/deployments/sandboxes/tokens/{token_id}", tag = "deployments", security(("bearerAuth" = [])))]
pub async fn revoke_api_token(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, token_id)): Path<(String, Uuid)>,
) -> ApiResult<Json<crate::auth::routes::OkResponse>> {
    m.require_owner()?;
    sandbox_service::revoke_api_token(&state, m.workspace.id, token_id).await?;
    Ok(Json(crate::auth::routes::OkResponse { ok: true }))
}

#[utoipa::path(get, path = "/api/workspaces/{wid}/deployments/sandboxes", tag = "deployments", security(("bearerAuth" = [])))]
pub async fn list_sandboxes(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<Vec<DeploySandboxView>>> {
    sandbox_service::list_sandboxes(&state, m.workspace.id)
        .await
        .map(Json)
}

#[utoipa::path(post, path = "/api/workspaces/{wid}/deployments/sandboxes", tag = "deployments", security(("bearerAuth" = [])))]
pub async fn create_sandbox(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    auth: AuthUser,
    Json(body): Json<CreateSandboxBody>,
) -> ApiResult<Json<DeploySandboxView>> {
    m.require_owner()?;
    sandbox_service::create_sandbox(
        &state,
        m.workspace.id,
        Some(auth.user.id),
        CreateSandboxInput {
            name: body.name,
            slug: body.slug,
            region: body.region,
            cpus: body.cpus,
            ram_mb: body.ram_mb,
            storage_gb: body.storage_gb,
            url_auth: body.url_auth,
        },
    )
    .await
    .map(Json)
}

#[utoipa::path(get, path = "/api/workspaces/{wid}/deployments/sandboxes/{sandbox_id}", tag = "deployments", security(("bearerAuth" = [])))]
pub async fn get_sandbox(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, sandbox_id)): Path<(String, Uuid)>,
) -> ApiResult<Json<DeploySandboxView>> {
    sandbox_service::get_sandbox(&state, m.workspace.id, sandbox_id)
        .await
        .map(Json)
}

#[utoipa::path(patch, path = "/api/workspaces/{wid}/deployments/sandboxes/{sandbox_id}", tag = "deployments", security(("bearerAuth" = [])))]
pub async fn update_sandbox(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, sandbox_id)): Path<(String, Uuid)>,
    Json(body): Json<UpdateSandboxBody>,
) -> ApiResult<Json<DeploySandboxView>> {
    m.require_owner()?;
    sandbox_service::update_sandbox(
        &state,
        m.workspace.id,
        sandbox_id,
        UpdateSandboxInput {
            name: body.name,
            url_auth: body.url_auth,
        },
    )
    .await
    .map(Json)
}

#[utoipa::path(delete, path = "/api/workspaces/{wid}/deployments/sandboxes/{sandbox_id}", tag = "deployments", security(("bearerAuth" = [])))]
pub async fn delete_sandbox(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, sandbox_id)): Path<(String, Uuid)>,
) -> ApiResult<Json<crate::auth::routes::OkResponse>> {
    m.require_owner()?;
    sandbox_service::delete_sandbox(&state, m.workspace.id, sandbox_id).await?;
    Ok(Json(crate::auth::routes::OkResponse { ok: true }))
}

#[utoipa::path(post, path = "/api/workspaces/{wid}/deployments/sandboxes/{sandbox_id}/exec", tag = "deployments", security(("bearerAuth" = [])))]
pub async fn exec_sandbox(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, sandbox_id)): Path<(String, Uuid)>,
    Json(body): Json<ExecSandboxBody>,
) -> ApiResult<Json<ExecSandboxView>> {
    m.require_owner()?;
    let output = sandbox_service::exec_sandbox(
        &state,
        m.workspace.id,
        sandbox_id,
        ExecSandboxInput {
            command: body.command,
            args: body.args,
            cwd: body.cwd,
            timeout: sandbox_service::EXEC_TIMEOUT,
        },
    )
    .await?;
    Ok(Json(ExecSandboxView {
        exit_code: output.exit_code,
        stdout: output.stdout,
        stderr: output.stderr,
        truncated: output.truncated,
    }))
}

#[utoipa::path(get, path = "/api/workspaces/{wid}/deployments/sandboxes/{sandbox_id}/checkpoints", tag = "deployments", security(("bearerAuth" = [])))]
pub async fn list_checkpoints(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, sandbox_id)): Path<(String, Uuid)>,
) -> ApiResult<Json<Vec<SandboxCheckpointView>>> {
    sandbox_service::list_checkpoints(&state, m.workspace.id, sandbox_id)
        .await
        .map(Json)
}

#[utoipa::path(post, path = "/api/workspaces/{wid}/deployments/sandboxes/{sandbox_id}/checkpoints", tag = "deployments", security(("bearerAuth" = [])))]
pub async fn create_checkpoint(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, sandbox_id)): Path<(String, Uuid)>,
    Json(body): Json<CreateCheckpointBody>,
) -> ApiResult<Json<SandboxCheckpointView>> {
    m.require_owner()?;
    sandbox_service::create_checkpoint(&state, m.workspace.id, sandbox_id, body.comment)
        .await
        .map(Json)
}

#[utoipa::path(post, path = "/api/workspaces/{wid}/deployments/sandboxes/{sandbox_id}/checkpoints/{checkpoint_id}/restore", tag = "deployments", security(("bearerAuth" = [])))]
pub async fn restore_checkpoint(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, sandbox_id, checkpoint_id)): Path<(String, Uuid, String)>,
) -> ApiResult<Json<crate::auth::routes::OkResponse>> {
    m.require_owner()?;
    sandbox_service::restore_checkpoint(&state, m.workspace.id, sandbox_id, &checkpoint_id)
        .await?;
    Ok(Json(crate::auth::routes::OkResponse { ok: true }))
}

#[utoipa::path(delete, path = "/api/workspaces/{wid}/deployments/sandboxes/{sandbox_id}/checkpoints/{checkpoint_id}", tag = "deployments", security(("bearerAuth" = [])))]
pub async fn delete_checkpoint(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, sandbox_id, checkpoint_id)): Path<(String, Uuid, String)>,
) -> ApiResult<Json<crate::auth::routes::OkResponse>> {
    m.require_owner()?;
    sandbox_service::delete_checkpoint(&state, m.workspace.id, sandbox_id, &checkpoint_id)
        .await?;
    Ok(Json(crate::auth::routes::OkResponse { ok: true }))
}
