use std::time::Duration;

use axum::{
    extract::{Path, Request, State},
    http::HeaderMap,
    middleware::{from_fn_with_state, Next},
    response::Response,
    routing::{delete, get, post},
    Extension, Json, Router,
};
use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    auth::routes::OkResponse,
    error::{ApiError, ApiResult},
    http::sandbox_service::{
        self, CreateSandboxInput, ExecSandboxInput, SandboxApiAuth, SandboxCheckpointView,
    },
    state::AppState,
};

const SANDBOX_TOKEN_HEADER: &str = "x-produktive-sandbox-token";

pub fn routes(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/", get(list_sandboxes).post(create_sandbox))
        .route("/{sandbox_id}", get(get_sandbox).delete(destroy_sandbox))
        .route("/{sandbox_id}/exec", post(exec_sandbox))
        .route(
            "/{sandbox_id}/checkpoints",
            get(list_checkpoints).post(create_checkpoint),
        )
        .route(
            "/{sandbox_id}/checkpoints/{checkpoint_id}/restore",
            post(restore_checkpoint),
        )
        .route(
            "/{sandbox_id}/checkpoints/{checkpoint_id}",
            delete(delete_checkpoint),
        )
        .route_layer(from_fn_with_state(state, sandbox_api_auth))
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicSandbox {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub status: String,
    pub region: String,
    pub cpus: i32,
    pub memory_mb: i32,
    pub storage_gb: i32,
    pub created_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicCreateSandboxBody {
    pub name: String,
    #[serde(default)]
    pub slug: Option<String>,
    #[serde(default)]
    pub region: Option<String>,
    #[serde(default)]
    pub cpus: Option<i32>,
    #[serde(default)]
    pub memory_mb: Option<i32>,
    #[serde(default)]
    pub storage_gb: Option<i32>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicExecBody {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub timeout_sec: Option<u64>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicExecResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
    pub truncated: bool,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicCheckpoint {
    pub id: String,
    pub comment: Option<String>,
    pub created_at: Option<DateTime<FixedOffset>>,
    pub source_id: Option<String>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicCreateCheckpointBody {
    #[serde(default)]
    pub comment: Option<String>,
}

#[utoipa::path(
    get,
    path = "/api/v1/sandboxes",
    responses((status = 200, body = [PublicSandbox])),
    security(("sandboxApiToken" = [])),
    tag = "sandboxes"
)]
pub async fn list_sandboxes(
    State(state): State<AppState>,
    Extension(auth): Extension<SandboxApiAuth>,
) -> ApiResult<Json<Vec<PublicSandbox>>> {
    let rows = sandbox_service::list_sandboxes(&state, auth.workspace_id).await?;
    Ok(Json(rows.into_iter().map(public_sandbox).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/sandboxes",
    request_body = PublicCreateSandboxBody,
    responses((status = 200, body = PublicSandbox)),
    security(("sandboxApiToken" = [])),
    tag = "sandboxes"
)]
pub async fn create_sandbox(
    State(state): State<AppState>,
    Extension(auth): Extension<SandboxApiAuth>,
    Json(body): Json<PublicCreateSandboxBody>,
) -> ApiResult<Json<PublicSandbox>> {
    let sandbox = sandbox_service::create_sandbox(
        &state,
        auth.workspace_id,
        None,
        CreateSandboxInput {
            name: body.name,
            slug: body.slug,
            region: body.region,
            cpus: body.cpus,
            ram_mb: body.memory_mb,
            storage_gb: body.storage_gb,
        },
    )
    .await?;
    Ok(Json(public_sandbox(sandbox)))
}

#[utoipa::path(
    get,
    path = "/api/v1/sandboxes/{sandbox_id}",
    responses((status = 200, body = PublicSandbox)),
    security(("sandboxApiToken" = [])),
    tag = "sandboxes"
)]
pub async fn get_sandbox(
    State(state): State<AppState>,
    Extension(auth): Extension<SandboxApiAuth>,
    Path((sandbox_id,)): Path<(Uuid,)>,
) -> ApiResult<Json<PublicSandbox>> {
    let sandbox = sandbox_service::get_sandbox(&state, auth.workspace_id, sandbox_id).await?;
    Ok(Json(public_sandbox(sandbox)))
}

#[utoipa::path(
    delete,
    path = "/api/v1/sandboxes/{sandbox_id}",
    responses((status = 200, body = OkResponse)),
    security(("sandboxApiToken" = [])),
    tag = "sandboxes"
)]
pub async fn destroy_sandbox(
    State(state): State<AppState>,
    Extension(auth): Extension<SandboxApiAuth>,
    Path((sandbox_id,)): Path<(Uuid,)>,
) -> ApiResult<Json<OkResponse>> {
    sandbox_service::delete_sandbox(&state, auth.workspace_id, sandbox_id).await?;
    Ok(Json(OkResponse { ok: true }))
}

#[utoipa::path(
    post,
    path = "/api/v1/sandboxes/{sandbox_id}/exec",
    request_body = PublicExecBody,
    responses((status = 200, body = PublicExecResult)),
    security(("sandboxApiToken" = [])),
    tag = "sandboxes"
)]
pub async fn exec_sandbox(
    State(state): State<AppState>,
    Extension(auth): Extension<SandboxApiAuth>,
    Path((sandbox_id,)): Path<(Uuid,)>,
    Json(body): Json<PublicExecBody>,
) -> ApiResult<Json<PublicExecResult>> {
    let timeout = body
        .timeout_sec
        .map(Duration::from_secs)
        .unwrap_or(sandbox_service::EXEC_TIMEOUT)
        .min(Duration::from_secs(300));
    let output = sandbox_service::exec_sandbox(
        &state,
        auth.workspace_id,
        sandbox_id,
        ExecSandboxInput {
            command: body.command,
            args: body.args,
            cwd: body.cwd,
            timeout,
        },
    )
    .await?;
    Ok(Json(PublicExecResult {
        exit_code: output.exit_code,
        stdout: output.stdout,
        stderr: output.stderr,
        timed_out: output.timed_out,
        truncated: output.truncated,
    }))
}

#[utoipa::path(
    get,
    path = "/api/v1/sandboxes/{sandbox_id}/checkpoints",
    responses((status = 200, body = [PublicCheckpoint])),
    security(("sandboxApiToken" = [])),
    tag = "sandboxes"
)]
pub async fn list_checkpoints(
    State(state): State<AppState>,
    Extension(auth): Extension<SandboxApiAuth>,
    Path((sandbox_id,)): Path<(Uuid,)>,
) -> ApiResult<Json<Vec<PublicCheckpoint>>> {
    let rows = sandbox_service::list_checkpoints(&state, auth.workspace_id, sandbox_id).await?;
    Ok(Json(rows.into_iter().map(public_checkpoint).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/sandboxes/{sandbox_id}/checkpoints",
    request_body = PublicCreateCheckpointBody,
    responses((status = 200, body = PublicCheckpoint)),
    security(("sandboxApiToken" = [])),
    tag = "sandboxes"
)]
pub async fn create_checkpoint(
    State(state): State<AppState>,
    Extension(auth): Extension<SandboxApiAuth>,
    Path((sandbox_id,)): Path<(Uuid,)>,
    Json(body): Json<PublicCreateCheckpointBody>,
) -> ApiResult<Json<PublicCheckpoint>> {
    let checkpoint =
        sandbox_service::create_checkpoint(&state, auth.workspace_id, sandbox_id, body.comment)
            .await?;
    Ok(Json(public_checkpoint(checkpoint)))
}

#[utoipa::path(
    post,
    path = "/api/v1/sandboxes/{sandbox_id}/checkpoints/{checkpoint_id}/restore",
    responses((status = 200, body = OkResponse)),
    security(("sandboxApiToken" = [])),
    tag = "sandboxes"
)]
pub async fn restore_checkpoint(
    State(state): State<AppState>,
    Extension(auth): Extension<SandboxApiAuth>,
    Path((sandbox_id, checkpoint_id)): Path<(Uuid, String)>,
) -> ApiResult<Json<OkResponse>> {
    sandbox_service::restore_checkpoint(&state, auth.workspace_id, sandbox_id, &checkpoint_id)
        .await?;
    Ok(Json(OkResponse { ok: true }))
}

#[utoipa::path(
    delete,
    path = "/api/v1/sandboxes/{sandbox_id}/checkpoints/{checkpoint_id}",
    responses((status = 200, body = OkResponse)),
    security(("sandboxApiToken" = [])),
    tag = "sandboxes"
)]
pub async fn delete_checkpoint(
    State(state): State<AppState>,
    Extension(auth): Extension<SandboxApiAuth>,
    Path((sandbox_id, checkpoint_id)): Path<(Uuid, String)>,
) -> ApiResult<Json<OkResponse>> {
    sandbox_service::delete_checkpoint(&state, auth.workspace_id, sandbox_id, &checkpoint_id)
        .await?;
    Ok(Json(OkResponse { ok: true }))
}

async fn sandbox_api_auth(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut req: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let token = extract_sandbox_token(&headers).ok_or(ApiError::Unauthorized)?;
    let auth = sandbox_service::authenticate_api_token(&state, &token).await?;
    req.extensions_mut().insert(auth);
    Ok(next.run(req).await)
}

fn extract_sandbox_token(headers: &HeaderMap) -> Option<String> {
    if let Some(value) = headers.get(SANDBOX_TOKEN_HEADER) {
        let token = value.to_str().ok()?.trim();
        if !token.is_empty() {
            return Some(token.to_owned());
        }
    }
    let value = headers
        .get(axum::http::header::AUTHORIZATION)?
        .to_str()
        .ok()?;
    value
        .strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(str::to_owned)
}

fn public_sandbox(view: sandbox_service::DeploySandboxView) -> PublicSandbox {
    PublicSandbox {
        id: view.id,
        name: view.name,
        slug: view.slug,
        status: sandbox_service::public_status(&view.status).to_owned(),
        region: view.region,
        cpus: view.cpus,
        memory_mb: view.ram_mb,
        storage_gb: view.storage_gb,
        created_at: view.created_at,
        updated_at: view.updated_at,
    }
}

fn public_checkpoint(view: SandboxCheckpointView) -> PublicCheckpoint {
    PublicCheckpoint {
        id: view.id,
        comment: view.comment,
        created_at: view.created_at,
        source_id: view.source_id,
    }
}
