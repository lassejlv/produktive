use std::collections::BTreeMap;

use axum::{
    extract::{Path, Query, Request, State},
    middleware::{from_fn_with_state, Next},
    response::Response,
    routing::{delete, get, post},
    Extension, Json, Router,
};
use chrono::{DateTime, FixedOffset, Utc};
use deploy::{
    catalog_from_fly, static_allowed_regions, validate_allowed_region, validate_env_name,
    validate_health_path, validate_image_for_registry, validate_internal_port,
    validate_volume_mount_path, validate_volume_name, validate_volume_size_gb, DeployRegion,
    DeploymentConfigSnapshot, DeploymentStatus, RegistryKind, ResourcePreset, SecretCipher,
    VolumeSpec, DEFAULT_DEPLOY_REGION,
};
use fly::fetch_platform_regions;
use sea_orm::{ConnectionTrait, DatabaseBackend, FromQueryResult, Statement};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    billing::require_deploy_metering_current,
    error::{ApiError, ApiResult},
    middleware::Membership,
    slug,
    state::AppState,
};

use super::custom_domains::normalize_domain;

const ACCESS_PENDING: i16 = 0;
const ACCESS_APPROVED: i16 = 1;
const ACCESS_DENIED: i16 = 2;

pub fn routes(state: AppState) -> Router<AppState> {
    let gated = Router::new()
        .route(
            "/registry-credentials",
            get(list_credentials).post(create_credential),
        )
        .route("/services", get(list_services).post(create_service))
        .route(
            "/services/{service_id}",
            get(get_service)
                .patch(update_service_settings)
                .delete(delete_service),
        )
        .route("/services/{service_id}/secrets", post(set_service_secrets))
        .route("/services/{service_id}/env", post(set_service_env))
        .route(
            "/services/{service_id}/volumes",
            get(list_service_volumes).post(create_service_volume),
        )
        .route(
            "/services/{service_id}/volumes/{volume_id}",
            delete(delete_service_volume).patch(update_service_volume),
        )
        .route(
            "/services/{service_id}/deployments",
            get(list_deployments).post(create_deployment),
        )
        .route("/services/{service_id}/rollback", post(rollback_service))
        .route("/services/{service_id}/stop", post(stop_service))
        .route(
            "/services/{service_id}/domains",
            get(list_service_domains).post(create_service_domain),
        )
        .route(
            "/services/{service_id}/domains/{domain_id}/verify",
            post(verify_service_domain),
        )
        .route(
            "/services/{service_id}/domains/{domain_id}",
            delete(remove_service_domain),
        )
        .route("/services/{service_id}/events", get(list_events))
        .route("/services/{service_id}/logs", get(list_logs))
        .route("/services/{service_id}/metrics", get(list_metrics))
        .route("/regions", get(list_regions))
        .merge(super::sandboxes::routes())
        .route_layer(from_fn_with_state(state, deploy_access_guard));

    Router::new()
        .route("/access", get(get_access))
        .route("/access/request", post(request_access))
        .merge(gated)
}

async fn deploy_access_guard(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    req: Request,
    next: Next,
) -> Result<Response, ApiError> {
    ensure_deployments_enabled(&state)?;
    require_deploy_metering_current(&state, m.workspace.id).await?;
    match load_access(&state, m.workspace.id).await? {
        Some(row) if row.status == ACCESS_APPROVED => Ok(next.run(req).await),
        _ => Err(ApiError::Forbidden),
    }
}

#[derive(Serialize, ToSchema)]
pub struct DeployAccessView {
    pub status: String,
    pub requested_at: Option<DateTime<FixedOffset>>,
    pub decided_at: Option<DateTime<FixedOffset>>,
}

#[derive(Serialize, FromQueryResult, ToSchema)]
pub struct DeployAccessRow {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub status: i16,
    pub requested_at: DateTime<FixedOffset>,
    pub decided_at: Option<DateTime<FixedOffset>>,
}

#[derive(Serialize, FromQueryResult, ToSchema)]
pub struct DeployRegistryCredentialView {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
    pub registry_kind: String,
    pub username: String,
    pub revoked_at: Option<DateTime<FixedOffset>>,
    pub created_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
}

#[derive(Serialize, FromQueryResult, ToSchema, Clone)]
pub struct DeployServiceView {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub registry_credential_id: Option<Uuid>,
    pub provider: String,
    pub provider_service_id: Option<String>,
    #[schema(value_type = Object)]
    pub provider_metadata: Value,
    pub slug: String,
    pub name: String,
    pub image: String,
    pub registry_kind: String,
    pub internal_port: i32,
    #[schema(value_type = Object)]
    pub env: Value,
    pub environment: String,
    pub health_check_path: String,
    pub region: String,
    pub resource_preset: String,
    pub url: Option<String>,
    pub status: String,
    pub canvas_x: i32,
    pub canvas_y: i32,
    pub disabled_at: Option<DateTime<FixedOffset>>,
    pub created_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
    /// When the most recent deployment was created; null if the service has
    /// never been deployed. Distinct from `updated_at`, which is bumped by
    /// canvas drags and resource edits and is therefore not a deploy signal.
    pub last_deploy_at: Option<DateTime<FixedOffset>>,
    /// Image digest of the most recent deployment, when known.
    pub last_deploy_image_digest: Option<String>,
}

#[derive(Serialize, FromQueryResult, ToSchema, Clone)]
pub struct DeployDeploymentView {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub service_id: Uuid,
    pub image: String,
    pub image_digest: Option<String>,
    pub status: String,
    pub provider: String,
    pub provider_deployment_id: Option<String>,
    pub provider_instance_id: Option<String>,
    #[schema(value_type = Object)]
    pub provider_metadata: Value,
    pub failure_message: Option<String>,
    pub url: Option<String>,
    pub started_at: Option<DateTime<FixedOffset>>,
    pub finished_at: Option<DateTime<FixedOffset>>,
    pub created_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
}

#[derive(Serialize, FromQueryResult, ToSchema, Clone)]
pub struct DeployServiceDomainView {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub service_id: Uuid,
    pub provider: String,
    pub provider_domain_id: Option<String>,
    pub hostname: String,
    pub status: String,
    #[schema(value_type = Object)]
    pub dns_requirements: Value,
    #[schema(value_type = Object)]
    pub validation_errors: Value,
    #[schema(value_type = Object)]
    pub provider_metadata: Value,
    pub verified_at: Option<DateTime<FixedOffset>>,
    pub created_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
}

#[derive(Serialize, FromQueryResult, ToSchema, Clone)]
pub struct DeployServiceVolumeView {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub service_id: Uuid,
    pub provider: String,
    pub provider_volume_id: Option<String>,
    pub name: String,
    pub mount_path: String,
    pub region: String,
    pub size_gb: i32,
    pub status: String,
    #[schema(value_type = Object)]
    pub provider_metadata: Value,
    pub created_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
}

#[derive(FromQueryResult)]
struct DeploymentSecretSnapshotRow {
    name: String,
    encrypted_value: String,
}

#[derive(FromQueryResult)]
struct DeploymentVolumeSnapshotRow {
    id: Uuid,
    provider_volume_id: Option<String>,
    name: String,
    mount_path: String,
    region: String,
    size_gb: i32,
}

#[derive(Serialize, FromQueryResult, ToSchema)]
pub struct DeployEventView {
    pub id: Uuid,
    pub service_id: Uuid,
    pub deployment_id: Option<Uuid>,
    pub level: String,
    pub message: String,
    #[schema(value_type = Object)]
    pub data: Value,
    pub created_at: DateTime<FixedOffset>,
}

#[derive(Serialize, FromQueryResult, ToSchema)]
pub struct DeployMetricPointView {
    pub bucket_start: DateTime<FixedOffset>,
    pub cpu_percent: Option<f64>,
    pub memory_mb: Option<f64>,
    pub requests: Option<f64>,
}

#[derive(Serialize, FromQueryResult, ToSchema)]
pub struct DeployLogLineView {
    pub timestamp: DateTime<FixedOffset>,
    pub level: String,
    pub message: String,
    #[schema(value_type = Object)]
    pub data: Value,
}

#[derive(Deserialize, ToSchema)]
pub struct CreateRegistryCredentialBody {
    pub name: String,
    pub registry_kind: String,
    pub username: String,
    pub password: String,
}

#[derive(Deserialize, ToSchema)]
pub struct CreateServiceBody {
    pub name: String,
    pub image: String,
    pub registry_kind: String,
    #[serde(default)]
    pub registry_credential_id: Option<Uuid>,
    pub internal_port: u16,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default)]
    pub secrets: BTreeMap<String, String>,
    #[serde(default)]
    pub environment: Option<String>,
    #[serde(default)]
    pub health_check_path: Option<String>,
    #[serde(default)]
    pub region: Option<String>,
    #[serde(default)]
    pub resource_preset: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateServiceSettingsBody {
    #[serde(default)]
    pub resource_preset: Option<String>,
    #[serde(default)]
    pub canvas_x: Option<i32>,
    #[serde(default)]
    pub canvas_y: Option<i32>,
}

#[derive(Deserialize, ToSchema)]
pub struct SetServiceSecretsBody {
    pub secrets: BTreeMap<String, String>,
}

#[derive(Deserialize, ToSchema)]
pub struct SetServiceEnvBody {
    pub env: BTreeMap<String, String>,
}

#[derive(Deserialize, ToSchema)]
pub struct CreateServiceVolumeBody {
    pub name: String,
    pub mount_path: String,
    pub size_gb: i32,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateServiceVolumeBody {
    #[serde(default)]
    pub mount_path: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct CreateDeploymentBody {
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default)]
    pub image_digest: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct CreateServiceDomainBody {
    pub hostname: String,
}

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct LimitQuery {
    pub limit: Option<u64>,
}

#[derive(Deserialize)]
pub struct ServicePath {
    #[serde(rename = "wid")]
    pub _wid: String,
    pub service_id: Uuid,
}

#[derive(Deserialize)]
pub struct ServiceDomainPath {
    #[serde(rename = "wid")]
    pub _wid: String,
    pub service_id: Uuid,
    pub domain_id: Uuid,
}

#[derive(Deserialize)]
pub struct ServiceVolumePath {
    #[serde(rename = "wid")]
    pub _wid: String,
    pub service_id: Uuid,
    pub volume_id: Uuid,
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/deployments/access",
    responses((status = 200, body = DeployAccessView)),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn get_access(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<DeployAccessView>> {
    if !state.config.deployments_enabled {
        return Ok(Json(DeployAccessView {
            status: "disabled".into(),
            requested_at: None,
            decided_at: None,
        }));
    }
    Ok(Json(access_view(
        load_access(&state, m.workspace.id).await?,
    )))
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/deployments/regions",
    responses((status = 200, body = [DeployRegion])),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn list_regions(State(state): State<AppState>) -> ApiResult<Json<Vec<DeployRegion>>> {
    ensure_deployments_enabled(&state)?;
    Ok(Json(load_deploy_regions(&state).await))
}

async fn load_deploy_regions(state: &AppState) -> Vec<DeployRegion> {
    match fetch_platform_regions(
        &state.http,
        &state.config.fly_api_hostname,
        state.config.fly_api_token.as_deref(),
    )
    .await
    {
        Ok(fly_regions) => catalog_from_fly(&fly_regions),
        Err(error) => {
            tracing::warn!(error = %error, "falling back to static deploy regions catalog");
            static_allowed_regions()
        }
    }
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/deployments/access/request",
    responses((status = 200, body = DeployAccessView)),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn request_access(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    auth: AuthUser,
) -> ApiResult<Json<DeployAccessView>> {
    ensure_deployments_enabled(&state)?;
    let now = Utc::now().fixed_offset();
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO deploy_access_requests (
                id, workspace_id, status, requested_by, requested_at, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $5, $5)
            ON CONFLICT (workspace_id) DO UPDATE SET
                status = CASE
                    WHEN deploy_access_requests.status = 2 THEN 0
                    ELSE deploy_access_requests.status
                END,
                requested_by = EXCLUDED.requested_by,
                requested_at = EXCLUDED.requested_at,
                updated_at = EXCLUDED.updated_at
            "#,
            [
                Uuid::now_v7().into(),
                m.workspace.id.into(),
                ACCESS_PENDING.into(),
                auth.user.id.into(),
                now.into(),
            ],
        ))
        .await?;
    Ok(Json(access_view(
        load_access(&state, m.workspace.id).await?,
    )))
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/deployments/registry-credentials",
    params(("wid" = String, Path, description = "workspace id or slug")),
    responses((status = 200, body = [DeployRegistryCredentialView])),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn list_credentials(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<Vec<DeployRegistryCredentialView>>> {
    let rows = DeployRegistryCredentialView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT id, workspace_id, name, registry_kind, username, revoked_at, created_at, updated_at
        FROM deploy_registry_credentials
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        "#,
        [m.workspace.id.into()],
    ))
    .all(&state.db)
    .await?;
    Ok(Json(rows))
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/deployments/registry-credentials",
    params(("wid" = String, Path, description = "workspace id or slug")),
    request_body = CreateRegistryCredentialBody,
    responses((status = 200, body = DeployRegistryCredentialView)),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn create_credential(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    auth: AuthUser,
    Json(body): Json<CreateRegistryCredentialBody>,
) -> ApiResult<Json<DeployRegistryCredentialView>> {
    m.require_owner()?;
    let cipher = deploy_cipher(&state)?;
    let registry = parse_registry_kind(&body.registry_kind)?;
    let name = clean_text(body.name, 1, 80, "name")?;
    let username = clean_text(body.username, 1, 256, "username")?;
    let password = clean_text(body.password, 1, 4096, "password")?;
    let encrypted = cipher.encrypt(&password).map_err(deploy_error)?;
    let now = Utc::now().fixed_offset();
    let id = Uuid::now_v7();
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO deploy_registry_credentials (
                id, workspace_id, name, registry_kind, username, encrypted_password,
                created_by, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
            "#,
            [
                id.into(),
                m.workspace.id.into(),
                name.into(),
                registry.as_str().into(),
                username.into(),
                encrypted.into(),
                auth.user.id.into(),
                now.into(),
            ],
        ))
        .await?;
    load_credential(&state, m.workspace.id, id).await.map(Json)
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/deployments/services",
    params(("wid" = String, Path, description = "workspace id or slug")),
    responses((status = 200, body = [DeployServiceView])),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn list_services(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<Vec<DeployServiceView>>> {
    let rows = service_rows(&state, m.workspace.id, None).await?;
    Ok(Json(rows))
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/deployments/services",
    params(("wid" = String, Path, description = "workspace id or slug")),
    request_body = CreateServiceBody,
    responses((status = 200, body = DeployServiceView)),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn create_service(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    auth: AuthUser,
    Json(body): Json<CreateServiceBody>,
) -> ApiResult<Json<DeployServiceView>> {
    m.require_owner()?;
    let cipher = deploy_cipher(&state)?;
    let count = workspace_service_count(&state, m.workspace.id).await?;
    if count >= state.config.deploy_max_services_per_workspace {
        return Err(ApiError::payment_required(
            "private preview service limit reached",
        ));
    }

    let registry = parse_registry_kind(&body.registry_kind)?;
    validate_image_for_registry(registry, body.image.trim()).map_err(deploy_error)?;
    validate_internal_port(body.internal_port).map_err(deploy_error)?;
    let health_check_path = body.health_check_path.unwrap_or_else(|| "/".into());
    validate_health_path(&health_check_path).map_err(deploy_error)?;
    let region = body
        .region
        .unwrap_or_else(|| DEFAULT_DEPLOY_REGION.into())
        .trim()
        .to_lowercase();
    validate_allowed_region(&region).map_err(deploy_error)?;
    let resource_preset = body
        .resource_preset
        .as_deref()
        .map(ResourcePreset::parse)
        .transpose()
        .map_err(deploy_error)?
        .unwrap_or(ResourcePreset::PreviewSmall);
    for name in body.env.keys().chain(body.secrets.keys()) {
        validate_env_name(name).map_err(deploy_error)?;
    }
    if let Some(credential_id) = body.registry_credential_id {
        ensure_credential(&state, m.workspace.id, credential_id).await?;
    }

    let name = clean_text(body.name, 1, 120, "name")?;
    let environment = body
        .environment
        .unwrap_or_else(|| "production".into())
        .trim()
        .to_lowercase();
    validate_slug_like(&environment, "environment")?;
    let slug = slug::unique_deploy_service_slug(&state.db, m.workspace.id, &name).await?;
    let now = Utc::now().fixed_offset();
    let id = Uuid::now_v7();

    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO deploy_services (
                id, workspace_id, registry_credential_id, provider, provider_metadata,
                slug, name, image, registry_kind, internal_port, env, environment,
                health_check_path, region, resource_preset, status, created_by, created_at, updated_at
            )
            VALUES ($1, $2, $3, 'fly', '{}', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)
            "#,
            [
                id.into(),
                m.workspace.id.into(),
                body.registry_credential_id.into(),
                slug.into(),
                name.into(),
                body.image.trim().to_owned().into(),
                registry.as_str().into(),
                i32::from(body.internal_port).into(),
                json!(body.env).into(),
                environment.into(),
                health_check_path.into(),
                region.into(),
                resource_preset.as_str().into(),
                DeploymentStatus::Stopped.code().into(),
                auth.user.id.into(),
                now.into(),
            ],
        ))
        .await?;

    write_service_secrets(
        &state,
        &cipher,
        m.workspace.id,
        id,
        auth.user.id,
        body.secrets,
    )
    .await?;
    insert_event(
        &state,
        m.workspace.id,
        id,
        None,
        "info",
        "service created",
        json!({}),
    )
    .await?;

    load_service(&state, m.workspace.id, id).await.map(Json)
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/deployments/services/{service_id}",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("service_id" = Uuid, Path, description = "deployment service id"),
    ),
    responses((status = 200, body = DeployServiceView)),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn get_service(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path(ServicePath { service_id, .. }): Path<ServicePath>,
) -> ApiResult<Json<DeployServiceView>> {
    load_service(&state, m.workspace.id, service_id)
        .await
        .map(Json)
}

#[utoipa::path(
    patch,
    path = "/api/workspaces/{wid}/deployments/services/{service_id}",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("service_id" = Uuid, Path, description = "deployment service id"),
    ),
    request_body = UpdateServiceSettingsBody,
    responses((status = 200, body = DeployServiceView)),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn update_service_settings(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path(ServicePath { service_id, .. }): Path<ServicePath>,
    Json(body): Json<UpdateServiceSettingsBody>,
) -> ApiResult<Json<DeployServiceView>> {
    ensure_service(&state, m.workspace.id, service_id).await?;

    if let Some(resource_preset) = body.resource_preset.as_deref() {
        m.require_owner()?;
        let resource_preset = ResourcePreset::parse(resource_preset).map_err(deploy_error)?;
        state
            .db
            .execute(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                r#"
                UPDATE deploy_services
                SET resource_preset = $3, updated_at = now()
                WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
                "#,
                [
                    m.workspace.id.into(),
                    service_id.into(),
                    resource_preset.as_str().into(),
                ],
            ))
            .await?;
        insert_event(
            &state,
            m.workspace.id,
            service_id,
            None,
            "info",
            "compute size updated",
            json!({
                "resource_preset": resource_preset.as_str(),
                "applies_on": "next_deployment"
            }),
        )
        .await?;
    }

    if body.canvas_x.is_some() || body.canvas_y.is_some() {
        state
            .db
            .execute(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                r#"
                UPDATE deploy_services
                SET canvas_x = COALESCE($3, canvas_x),
                    canvas_y = COALESCE($4, canvas_y),
                    updated_at = now()
                WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
                "#,
                [
                    m.workspace.id.into(),
                    service_id.into(),
                    body.canvas_x.into(),
                    body.canvas_y.into(),
                ],
            ))
            .await?;
    }

    load_service(&state, m.workspace.id, service_id)
        .await
        .map(Json)
}

#[utoipa::path(
    delete,
    path = "/api/workspaces/{wid}/deployments/services/{service_id}",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("service_id" = Uuid, Path, description = "deployment service id"),
    ),
    responses((status = 200, body = crate::http::workspaces::OkResponse)),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn delete_service(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path(ServicePath { service_id, .. }): Path<ServicePath>,
) -> ApiResult<Json<crate::http::workspaces::OkResponse>> {
    m.require_owner()?;
    ensure_service(&state, m.workspace.id, service_id).await?;
    let now = Utc::now().fixed_offset();
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE deploy_services
            SET status = $3,
                disabled_at = COALESCE(disabled_at, $4),
                deleted_at = COALESCE(deleted_at, $4),
                updated_at = $4
            WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
            "#,
            [
                m.workspace.id.into(),
                service_id.into(),
                DeploymentStatus::Stopped.code().into(),
                now.into(),
            ],
        ))
        .await?;
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE deploy_service_domains
            SET status = 'removing',
                deleted_at = COALESCE(deleted_at, $3),
                updated_at = $3
            WHERE workspace_id = $1
              AND service_id = $2
              AND deleted_at IS NULL
            "#,
            [m.workspace.id.into(), service_id.into(), now.into()],
        ))
        .await?;
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE deploy_service_volumes
            SET status = 'deleting',
                deleted_at = COALESCE(deleted_at, $3),
                updated_at = $3
            WHERE workspace_id = $1
              AND service_id = $2
              AND deleted_at IS NULL
            "#,
            [m.workspace.id.into(), service_id.into(), now.into()],
        ))
        .await?;
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE deployments
            SET status = $3, finished_at = COALESCE(finished_at, $4), updated_at = $4
            WHERE workspace_id = $1
              AND service_id = $2
              AND status = $5
              AND provider_instance_id IS NULL
            "#,
            [
                m.workspace.id.into(),
                service_id.into(),
                DeploymentStatus::Stopped.code().into(),
                now.into(),
                DeploymentStatus::Queued.code().into(),
            ],
        ))
        .await?;
    insert_event(
        &state,
        m.workspace.id,
        service_id,
        None,
        "warn",
        "service deletion requested",
        json!({}),
    )
    .await?;
    Ok(Json(crate::http::workspaces::OkResponse { ok: true }))
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/deployments/services/{service_id}/secrets",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("service_id" = Uuid, Path, description = "deployment service id"),
    ),
    request_body = SetServiceSecretsBody,
    responses((status = 200, body = DeployServiceView)),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn set_service_secrets(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    auth: AuthUser,
    Path(ServicePath { service_id, .. }): Path<ServicePath>,
    Json(body): Json<SetServiceSecretsBody>,
) -> ApiResult<Json<DeployServiceView>> {
    m.require_owner()?;
    let cipher = deploy_cipher(&state)?;
    ensure_service(&state, m.workspace.id, service_id).await?;
    for name in body.secrets.keys() {
        validate_env_name(name).map_err(deploy_error)?;
    }
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "DELETE FROM deploy_service_secrets WHERE workspace_id = $1 AND service_id = $2",
            [m.workspace.id.into(), service_id.into()],
        ))
        .await?;
    write_service_secrets(
        &state,
        &cipher,
        m.workspace.id,
        service_id,
        auth.user.id,
        body.secrets,
    )
    .await?;
    insert_event(
        &state,
        m.workspace.id,
        service_id,
        None,
        "info",
        "service secrets updated",
        json!({}),
    )
    .await?;
    load_service(&state, m.workspace.id, service_id)
        .await
        .map(Json)
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/deployments/services/{service_id}/env",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("service_id" = Uuid, Path, description = "deployment service id"),
    ),
    request_body = SetServiceEnvBody,
    responses((status = 200, body = DeployServiceView)),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn set_service_env(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path(ServicePath { service_id, .. }): Path<ServicePath>,
    Json(body): Json<SetServiceEnvBody>,
) -> ApiResult<Json<DeployServiceView>> {
    m.require_owner()?;
    ensure_service(&state, m.workspace.id, service_id).await?;
    for name in body.env.keys() {
        validate_env_name(name).map_err(deploy_error)?;
    }
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE deploy_services
            SET env = $3, updated_at = now()
            WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
            "#,
            [
                m.workspace.id.into(),
                service_id.into(),
                json!(body.env).into(),
            ],
        ))
        .await?;
    insert_event(
        &state,
        m.workspace.id,
        service_id,
        None,
        "info",
        "service env updated",
        json!({ "count": body.env.len() }),
    )
    .await?;
    load_service(&state, m.workspace.id, service_id)
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/deployments/services/{service_id}/volumes",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("service_id" = Uuid, Path, description = "deployment service id"),
    ),
    responses((status = 200, body = [DeployServiceVolumeView])),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn list_service_volumes(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path(ServicePath { service_id, .. }): Path<ServicePath>,
) -> ApiResult<Json<Vec<DeployServiceVolumeView>>> {
    ensure_service(&state, m.workspace.id, service_id).await?;
    Ok(Json(
        service_volume_rows(&state, m.workspace.id, service_id, None).await?,
    ))
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/deployments/services/{service_id}/volumes",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("service_id" = Uuid, Path, description = "deployment service id"),
    ),
    request_body = CreateServiceVolumeBody,
    responses((status = 200, body = DeployServiceVolumeView)),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn create_service_volume(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    auth: AuthUser,
    Path(ServicePath { service_id, .. }): Path<ServicePath>,
    Json(body): Json<CreateServiceVolumeBody>,
) -> ApiResult<Json<DeployServiceVolumeView>> {
    m.require_owner()?;
    let service = load_service(&state, m.workspace.id, service_id).await?;
    if service_volume_count(&state, m.workspace.id, service_id).await? >= 1 {
        return Err(ApiError::conflict(
            "Fly Machines support one volume per service",
        ));
    }
    let name = body.name.trim().to_lowercase();
    validate_volume_name(&name).map_err(deploy_error)?;
    let mount_path = body.mount_path.trim().to_owned();
    validate_volume_mount_path(&mount_path).map_err(deploy_error)?;
    validate_volume_size_gb(body.size_gb).map_err(deploy_error)?;
    let now = Utc::now().fixed_offset();
    let id = Uuid::now_v7();
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO deploy_service_volumes (
                id, workspace_id, service_id, provider, name, mount_path, region,
                size_gb, status, created_by, created_at, updated_at
            )
            VALUES ($1, $2, $3, 'fly', $4, $5, $6, $7, 'queued', $8, $9, $9)
            "#,
            [
                id.into(),
                m.workspace.id.into(),
                service_id.into(),
                name.clone().into(),
                mount_path.clone().into(),
                service.region.into(),
                body.size_gb.into(),
                auth.user.id.into(),
                now.into(),
            ],
        ))
        .await
        .map_err(map_service_volume_unique_err)?;
    insert_event(
        &state,
        m.workspace.id,
        service_id,
        None,
        "info",
        "volume attached",
        json!({
            "name": name,
            "mount_path": mount_path,
            "size_gb": body.size_gb,
            "applies_on": "next_deployment"
        }),
    )
    .await?;
    Ok(Json(
        load_service_volume(&state, m.workspace.id, service_id, id).await?,
    ))
}

#[utoipa::path(
    patch,
    path = "/api/workspaces/{wid}/deployments/services/{service_id}/volumes/{volume_id}",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("service_id" = Uuid, Path, description = "deployment service id"),
        ("volume_id" = Uuid, Path, description = "service volume id"),
    ),
    request_body = UpdateServiceVolumeBody,
    responses((status = 200, body = DeployServiceVolumeView)),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn update_service_volume(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path(ServiceVolumePath {
        service_id,
        volume_id,
        ..
    }): Path<ServiceVolumePath>,
    Json(body): Json<UpdateServiceVolumeBody>,
) -> ApiResult<Json<DeployServiceVolumeView>> {
    m.require_owner()?;
    let volume = load_service_volume(&state, m.workspace.id, service_id, volume_id).await?;
    let Some(mount_path) = body.mount_path else {
        return Ok(Json(volume));
    };
    let mount_path = mount_path.trim().to_owned();
    validate_volume_mount_path(&mount_path).map_err(deploy_error)?;
    if mount_path == volume.mount_path {
        return Ok(Json(volume));
    }

    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE deploy_service_volumes
            SET mount_path = $4, updated_at = now()
            WHERE workspace_id = $1
              AND service_id = $2
              AND id = $3
              AND deleted_at IS NULL
            "#,
            [
                m.workspace.id.into(),
                service_id.into(),
                volume_id.into(),
                mount_path.clone().into(),
            ],
        ))
        .await
        .map_err(map_service_volume_unique_err)?;
    insert_event(
        &state,
        m.workspace.id,
        service_id,
        None,
        "info",
        "volume mount path updated",
        json!({
            "name": volume.name,
            "previous_mount_path": volume.mount_path,
            "mount_path": mount_path,
            "applies_on": "next_deployment"
        }),
    )
    .await?;
    Ok(Json(
        load_service_volume(&state, m.workspace.id, service_id, volume_id).await?,
    ))
}

#[utoipa::path(
    delete,
    path = "/api/workspaces/{wid}/deployments/services/{service_id}/volumes/{volume_id}",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("service_id" = Uuid, Path, description = "deployment service id"),
        ("volume_id" = Uuid, Path, description = "service volume id"),
    ),
    responses((status = 200, body = crate::http::workspaces::OkResponse)),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn delete_service_volume(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path(ServiceVolumePath {
        service_id,
        volume_id,
        ..
    }): Path<ServiceVolumePath>,
) -> ApiResult<Json<crate::http::workspaces::OkResponse>> {
    m.require_owner()?;
    let volume = load_service_volume(&state, m.workspace.id, service_id, volume_id).await?;
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE deploy_service_volumes
            SET status = 'deleting',
                deleted_at = COALESCE(deleted_at, now()),
                updated_at = now()
            WHERE workspace_id = $1
              AND service_id = $2
              AND id = $3
            "#,
            [m.workspace.id.into(), service_id.into(), volume_id.into()],
        ))
        .await?;
    insert_event(
        &state,
        m.workspace.id,
        service_id,
        None,
        "warn",
        "volume removal requested",
        json!({
            "name": volume.name,
            "mount_path": volume.mount_path,
            "applies_on": "next_deployment"
        }),
    )
    .await?;
    Ok(Json(crate::http::workspaces::OkResponse { ok: true }))
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/deployments/services/{service_id}/deployments",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("service_id" = Uuid, Path, description = "deployment service id"),
        LimitQuery,
    ),
    responses((status = 200, body = [DeployDeploymentView])),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn list_deployments(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path(ServicePath { service_id, .. }): Path<ServicePath>,
    Query(q): Query<LimitQuery>,
) -> ApiResult<Json<Vec<DeployDeploymentView>>> {
    ensure_service(&state, m.workspace.id, service_id).await?;
    let rows = deployment_rows(&state, m.workspace.id, service_id, q.limit.unwrap_or(50)).await?;
    Ok(Json(rows))
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/deployments/services/{service_id}/deployments",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("service_id" = Uuid, Path, description = "deployment service id"),
    ),
    request_body = CreateDeploymentBody,
    responses((status = 200, body = DeployDeploymentView)),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn create_deployment(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    auth: AuthUser,
    Path(ServicePath { service_id, .. }): Path<ServicePath>,
    Json(body): Json<CreateDeploymentBody>,
) -> ApiResult<Json<DeployDeploymentView>> {
    m.require_owner()?;
    if active_deployment_count(&state, m.workspace.id).await?
        >= state.config.deploy_max_active_deployments_per_workspace
    {
        return Err(ApiError::payment_required(
            "private preview active deployment limit reached",
        ));
    }
    let service = load_service(&state, m.workspace.id, service_id).await?;
    let was_stopped = service.disabled_at.is_some();
    let registry = parse_registry_kind(&service.registry_kind)?;
    let image = body.image.unwrap_or_else(|| service.image.clone());
    validate_image_for_registry(registry, &image).map_err(deploy_error)?;
    let config_snapshot = deployment_config_snapshot(&state, &service).await?;

    let deployment = insert_deployment(
        &state,
        m.workspace.id,
        service_id,
        auth.user.id,
        image,
        body.image_digest,
        config_snapshot,
        "deployment queued",
    )
    .await?;
    clear_service_logs(&state, m.workspace.id, service_id).await?;
    insert_event(
        &state,
        m.workspace.id,
        service_id,
        Some(deployment.id),
        "info",
        "logs cleared for new deployment",
        json!({}),
    )
    .await?;
    mark_service_queued_for_deployment(&state, m.workspace.id, service_id, was_stopped).await?;
    Ok(Json(deployment))
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/deployments/services/{service_id}/rollback",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("service_id" = Uuid, Path, description = "deployment service id"),
    ),
    responses((status = 200, body = DeployDeploymentView)),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn rollback_service(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    auth: AuthUser,
    Path(ServicePath { service_id, .. }): Path<ServicePath>,
) -> ApiResult<Json<DeployDeploymentView>> {
    m.require_owner()?;
    let service = load_service(&state, m.workspace.id, service_id).await?;
    let was_stopped = service.disabled_at.is_some();
    if active_deployment_count(&state, m.workspace.id).await?
        >= state.config.deploy_max_active_deployments_per_workspace
    {
        return Err(ApiError::payment_required(
            "private preview active deployment limit reached",
        ));
    }
    let previous = DeployDeploymentView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT id, workspace_id, service_id, image, image_digest,
               CASE status
                    WHEN 0 THEN 'queued'
                    WHEN 1 THEN 'provisioning'
                    WHEN 2 THEN 'pulling'
                    WHEN 3 THEN 'starting'
                    WHEN 4 THEN 'healthy'
                    WHEN 5 THEN 'live'
                    WHEN 6 THEN 'failed'
                    WHEN 7 THEN 'rolling_back'
                    WHEN 8 THEN 'rolled_back'
                    WHEN 9 THEN 'stopped'
                    ELSE 'unknown'
               END AS status,
               provider, provider_deployment_id, provider_instance_id, provider_metadata,
               failure_message, url, started_at, finished_at, created_at, updated_at
        FROM deployments
        WHERE workspace_id = $1
          AND service_id = $2
          AND status IN (4, 5, 9)
          AND failure_message IS NULL
          AND provider_deployment_id IS NOT NULL
        ORDER BY created_at DESC
        OFFSET 1
        LIMIT 1
        "#,
        [m.workspace.id.into(), service_id.into()],
    ))
    .one(&state.db)
    .await?;
    let previous = previous.ok_or_else(|| ApiError::conflict("no previous live deployment"))?;
    let config_snapshot = deployment_config_snapshot(&state, &service).await?;
    let deployment = insert_deployment(
        &state,
        m.workspace.id,
        service_id,
        auth.user.id,
        previous.image,
        previous.image_digest,
        config_snapshot,
        "rollback queued",
    )
    .await?;
    clear_service_logs(&state, m.workspace.id, service_id).await?;
    insert_event(
        &state,
        m.workspace.id,
        service_id,
        Some(deployment.id),
        "info",
        "logs cleared for rollback",
        json!({}),
    )
    .await?;
    mark_service_queued_for_deployment(&state, m.workspace.id, service_id, was_stopped).await?;
    Ok(Json(deployment))
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/deployments/services/{service_id}/stop",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("service_id" = Uuid, Path, description = "deployment service id"),
    ),
    responses((status = 200, body = DeployServiceView)),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn stop_service(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path(ServicePath { service_id, .. }): Path<ServicePath>,
) -> ApiResult<Json<DeployServiceView>> {
    m.require_owner()?;
    ensure_service(&state, m.workspace.id, service_id).await?;
    let now = Utc::now().fixed_offset();
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE deploy_services
            SET status = $3, disabled_at = COALESCE(disabled_at, $4), updated_at = $4
            WHERE workspace_id = $1 AND id = $2
            "#,
            [
                m.workspace.id.into(),
                service_id.into(),
                DeploymentStatus::Stopped.code().into(),
                now.into(),
            ],
        ))
        .await?;
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE deployments
            SET status = $3, finished_at = COALESCE(finished_at, $4), updated_at = $4
            WHERE workspace_id = $1
              AND service_id = $2
              AND status = $5
              AND provider_instance_id IS NULL
            "#,
            [
                m.workspace.id.into(),
                service_id.into(),
                DeploymentStatus::Stopped.code().into(),
                now.into(),
                DeploymentStatus::Queued.code().into(),
            ],
        ))
        .await?;
    insert_event(
        &state,
        m.workspace.id,
        service_id,
        None,
        "warn",
        "service stop requested",
        json!({}),
    )
    .await?;
    load_service(&state, m.workspace.id, service_id)
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/deployments/services/{service_id}/domains",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("service_id" = Uuid, Path, description = "deployment service id"),
    ),
    responses((status = 200, body = [DeployServiceDomainView])),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn list_service_domains(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path(ServicePath { service_id, .. }): Path<ServicePath>,
) -> ApiResult<Json<Vec<DeployServiceDomainView>>> {
    ensure_service(&state, m.workspace.id, service_id).await?;
    Ok(Json(
        service_domain_rows(&state, m.workspace.id, service_id, None).await?,
    ))
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/deployments/services/{service_id}/domains",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("service_id" = Uuid, Path, description = "deployment service id"),
    ),
    request_body = CreateServiceDomainBody,
    responses((status = 200, body = DeployServiceDomainView)),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn create_service_domain(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    auth: AuthUser,
    Path(ServicePath { service_id, .. }): Path<ServicePath>,
    Json(body): Json<CreateServiceDomainBody>,
) -> ApiResult<Json<DeployServiceDomainView>> {
    m.require_owner()?;
    let service = load_service(&state, m.workspace.id, service_id).await?;
    if service.provider_service_id.is_none() {
        return Err(ApiError::bad_request(
            "deploy the service once before adding a custom domain",
        ));
    }
    let hostname = normalize_domain(&body.hostname)
        .ok_or_else(|| ApiError::bad_request("hostname must be a valid domain"))?;
    if hostname.ends_with(".fly.dev") {
        return Err(ApiError::bad_request("use the generated Fly URL directly"));
    }

    let now = Utc::now().fixed_offset();
    let id = Uuid::now_v7();
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO deploy_service_domains (
                id, workspace_id, service_id, provider, hostname, status,
                created_by, created_at, updated_at
            )
            VALUES ($1, $2, $3, 'fly', $4, 'queued', $5, $6, $6)
            "#,
            [
                id.into(),
                m.workspace.id.into(),
                service_id.into(),
                hostname.clone().into(),
                auth.user.id.into(),
                now.into(),
            ],
        ))
        .await
        .map_err(map_service_domain_unique_err)?;
    insert_event(
        &state,
        m.workspace.id,
        service_id,
        None,
        "info",
        "custom domain requested",
        json!({ "hostname": hostname }),
    )
    .await?;
    Ok(Json(
        load_service_domain(&state, m.workspace.id, service_id, id).await?,
    ))
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/deployments/services/{service_id}/domains/{domain_id}/verify",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("service_id" = Uuid, Path, description = "deployment service id"),
        ("domain_id" = Uuid, Path, description = "service domain id"),
    ),
    responses((status = 200, body = DeployServiceDomainView)),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn verify_service_domain(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path(ServiceDomainPath {
        service_id,
        domain_id,
        ..
    }): Path<ServiceDomainPath>,
) -> ApiResult<Json<DeployServiceDomainView>> {
    m.require_owner()?;
    let _ = load_service_domain(&state, m.workspace.id, service_id, domain_id).await?;
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE deploy_service_domains
            SET status = 'checking', updated_at = now()
            WHERE workspace_id = $1
              AND service_id = $2
              AND id = $3
              AND deleted_at IS NULL
            "#,
            [m.workspace.id.into(), service_id.into(), domain_id.into()],
        ))
        .await?;
    Ok(Json(
        load_service_domain(&state, m.workspace.id, service_id, domain_id).await?,
    ))
}

#[utoipa::path(
    delete,
    path = "/api/workspaces/{wid}/deployments/services/{service_id}/domains/{domain_id}",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("service_id" = Uuid, Path, description = "deployment service id"),
        ("domain_id" = Uuid, Path, description = "service domain id"),
    ),
    responses((status = 200, body = crate::http::workspaces::OkResponse)),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn remove_service_domain(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path(ServiceDomainPath {
        service_id,
        domain_id,
        ..
    }): Path<ServiceDomainPath>,
) -> ApiResult<Json<crate::http::workspaces::OkResponse>> {
    m.require_owner()?;
    let domain = load_service_domain(&state, m.workspace.id, service_id, domain_id).await?;
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE deploy_service_domains
            SET status = 'removing',
                deleted_at = COALESCE(deleted_at, now()),
                updated_at = now()
            WHERE workspace_id = $1
              AND service_id = $2
              AND id = $3
            "#,
            [m.workspace.id.into(), service_id.into(), domain_id.into()],
        ))
        .await?;
    insert_event(
        &state,
        m.workspace.id,
        service_id,
        None,
        "warn",
        "custom domain removal requested",
        json!({ "hostname": domain.hostname }),
    )
    .await?;
    Ok(Json(crate::http::workspaces::OkResponse { ok: true }))
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/deployments/services/{service_id}/events",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("service_id" = Uuid, Path, description = "deployment service id"),
        LimitQuery,
    ),
    responses((status = 200, body = [DeployEventView])),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn list_events(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path(ServicePath { service_id, .. }): Path<ServicePath>,
    Query(q): Query<LimitQuery>,
) -> ApiResult<Json<Vec<DeployEventView>>> {
    ensure_service(&state, m.workspace.id, service_id).await?;
    Ok(Json(
        event_rows(&state, m.workspace.id, service_id, q.limit.unwrap_or(100)).await?,
    ))
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/deployments/services/{service_id}/logs",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("service_id" = Uuid, Path, description = "deployment service id"),
        LimitQuery,
    ),
    responses((status = 200, body = [DeployLogLineView])),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn list_logs(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path(ServicePath { service_id, .. }): Path<ServicePath>,
    Query(q): Query<LimitQuery>,
) -> ApiResult<Json<Vec<DeployLogLineView>>> {
    ensure_service(&state, m.workspace.id, service_id).await?;
    let rows = DeployLogLineView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT observed_at AS timestamp,
               CASE
                   WHEN stream = 'stderr' THEN 'error'
                   ELSE COALESCE(NULLIF(data->>'level', ''), stream)
               END AS level,
               message,
               data
        FROM deploy_log_lines
        WHERE workspace_id = $1 AND service_id = $2
        ORDER BY observed_at DESC
        LIMIT $3
        "#,
        [
            m.workspace.id.into(),
            service_id.into(),
            q.limit.unwrap_or(100).into(),
        ],
    ))
    .all(&state.db)
    .await?;
    Ok(Json(rows))
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/deployments/services/{service_id}/metrics",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("service_id" = Uuid, Path, description = "deployment service id"),
    ),
    responses((status = 200, body = [DeployMetricPointView])),
    security(("bearerAuth" = [])),
    tag = "deployments"
)]
pub async fn list_metrics(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path(ServicePath { service_id, .. }): Path<ServicePath>,
) -> ApiResult<Json<Vec<DeployMetricPointView>>> {
    ensure_service(&state, m.workspace.id, service_id).await?;
    let rows = DeployMetricPointView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT bucket_start, cpu_percent, memory_mb, requests
        FROM deploy_metric_rollups
        WHERE workspace_id = $1 AND service_id = $2
        ORDER BY bucket_start ASC
        LIMIT 500
        "#,
        [m.workspace.id.into(), service_id.into()],
    ))
    .all(&state.db)
    .await?;
    Ok(Json(rows))
}

async fn load_access(state: &AppState, workspace_id: Uuid) -> ApiResult<Option<DeployAccessRow>> {
    Ok(
        DeployAccessRow::find_by_statement(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
        SELECT id, workspace_id, status, requested_at, decided_at
        FROM deploy_access_requests
        WHERE workspace_id = $1
        LIMIT 1
        "#,
            [workspace_id.into()],
        ))
        .one(&state.db)
        .await?,
    )
}

fn access_view(row: Option<DeployAccessRow>) -> DeployAccessView {
    match row {
        Some(row) => DeployAccessView {
            status: access_status_str(row.status).into(),
            requested_at: Some(row.requested_at),
            decided_at: row.decided_at,
        },
        None => DeployAccessView {
            status: "none".into(),
            requested_at: None,
            decided_at: None,
        },
    }
}

fn access_status_str(status: i16) -> &'static str {
    match status {
        ACCESS_PENDING => "pending",
        ACCESS_APPROVED => "approved",
        ACCESS_DENIED => "denied",
        _ => "unknown",
    }
}

async fn load_credential(
    state: &AppState,
    workspace_id: Uuid,
    id: Uuid,
) -> ApiResult<DeployRegistryCredentialView> {
    DeployRegistryCredentialView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT id, workspace_id, name, registry_kind, username, revoked_at, created_at, updated_at
        FROM deploy_registry_credentials
        WHERE workspace_id = $1 AND id = $2
        LIMIT 1
        "#,
        [workspace_id.into(), id.into()],
    ))
    .one(&state.db)
    .await?
    .ok_or_else(|| ApiError::not_found("registry credential not found"))
}

async fn ensure_credential(state: &AppState, workspace_id: Uuid, id: Uuid) -> ApiResult<()> {
    let row = state
        .db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT EXISTS(
                SELECT 1
                FROM deploy_registry_credentials
                WHERE workspace_id = $1 AND id = $2 AND revoked_at IS NULL
            ) AS exists
            "#,
            [workspace_id.into(), id.into()],
        ))
        .await?;
    if row
        .and_then(|row| row.try_get::<bool>("", "exists").ok())
        .unwrap_or(false)
    {
        Ok(())
    } else {
        Err(ApiError::bad_request("registry credential not found"))
    }
}

async fn service_rows(
    state: &AppState,
    workspace_id: Uuid,
    service_id: Option<Uuid>,
) -> ApiResult<Vec<DeployServiceView>> {
    let rows = DeployServiceView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT s.id, s.workspace_id, s.registry_credential_id, s.provider, s.provider_service_id,
               s.provider_metadata, s.slug, s.name, s.image, s.registry_kind, s.internal_port, s.env,
               s.environment, s.health_check_path, s.region, s.resource_preset, s.url,
               CASE s.status
                    WHEN 0 THEN 'queued'
                    WHEN 1 THEN 'provisioning'
                    WHEN 2 THEN 'pulling'
                    WHEN 3 THEN 'starting'
                    WHEN 4 THEN 'healthy'
                    WHEN 5 THEN 'live'
                    WHEN 6 THEN 'failed'
                    WHEN 7 THEN 'rolling_back'
                    WHEN 8 THEN 'rolled_back'
                    WHEN 9 THEN 'stopped'
                    ELSE 'unknown'
               END AS status,
               s.canvas_x, s.canvas_y,
               s.disabled_at, s.created_at, s.updated_at,
               ld.created_at AS last_deploy_at,
               ld.image_digest AS last_deploy_image_digest
        FROM deploy_services s
        LEFT JOIN LATERAL (
            SELECT d.created_at, d.image_digest
            FROM deployments d
            WHERE d.workspace_id = s.workspace_id AND d.service_id = s.id
            ORDER BY d.created_at DESC
            LIMIT 1
        ) ld ON true
        WHERE s.workspace_id = $1
          AND s.deleted_at IS NULL
          AND ($2 IS NULL OR s.id = $2)
        ORDER BY s.created_at DESC
        "#,
        [workspace_id.into(), service_id.into()],
    ))
    .all(&state.db)
    .await?;
    Ok(rows)
}

async fn load_service(
    state: &AppState,
    workspace_id: Uuid,
    service_id: Uuid,
) -> ApiResult<DeployServiceView> {
    service_rows(state, workspace_id, Some(service_id))
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| ApiError::not_found("deployment service not found"))
}

async fn ensure_service(state: &AppState, workspace_id: Uuid, service_id: Uuid) -> ApiResult<()> {
    let _ = load_service(state, workspace_id, service_id).await?;
    Ok(())
}

async fn service_volume_rows(
    state: &AppState,
    workspace_id: Uuid,
    service_id: Uuid,
    volume_id: Option<Uuid>,
) -> ApiResult<Vec<DeployServiceVolumeView>> {
    let rows = DeployServiceVolumeView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT id, workspace_id, service_id, provider, provider_volume_id,
               name, mount_path, region, size_gb, status, provider_metadata,
               created_at, updated_at
        FROM deploy_service_volumes
        WHERE workspace_id = $1
          AND service_id = $2
          AND ($3 IS NULL OR id = $3)
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        "#,
        [workspace_id.into(), service_id.into(), volume_id.into()],
    ))
    .all(&state.db)
    .await?;
    Ok(rows)
}

async fn load_service_volume(
    state: &AppState,
    workspace_id: Uuid,
    service_id: Uuid,
    volume_id: Uuid,
) -> ApiResult<DeployServiceVolumeView> {
    service_volume_rows(state, workspace_id, service_id, Some(volume_id))
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| ApiError::not_found("deployment service volume not found"))
}

async fn service_domain_rows(
    state: &AppState,
    workspace_id: Uuid,
    service_id: Uuid,
    domain_id: Option<Uuid>,
) -> ApiResult<Vec<DeployServiceDomainView>> {
    let rows = DeployServiceDomainView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT id, workspace_id, service_id, provider, provider_domain_id,
               hostname, status, dns_requirements, validation_errors, provider_metadata,
               verified_at, created_at, updated_at
        FROM deploy_service_domains
        WHERE workspace_id = $1
          AND service_id = $2
          AND ($3 IS NULL OR id = $3)
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        "#,
        [workspace_id.into(), service_id.into(), domain_id.into()],
    ))
    .all(&state.db)
    .await?;
    Ok(rows)
}

async fn load_service_domain(
    state: &AppState,
    workspace_id: Uuid,
    service_id: Uuid,
    domain_id: Uuid,
) -> ApiResult<DeployServiceDomainView> {
    service_domain_rows(state, workspace_id, service_id, Some(domain_id))
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| ApiError::not_found("deployment service domain not found"))
}

async fn deployment_rows(
    state: &AppState,
    workspace_id: Uuid,
    service_id: Uuid,
    limit: u64,
) -> ApiResult<Vec<DeployDeploymentView>> {
    let limit = limit.min(200) as i64;
    let rows = DeployDeploymentView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT id, workspace_id, service_id, image, image_digest,
               CASE status
                    WHEN 0 THEN 'queued'
                    WHEN 1 THEN 'provisioning'
                    WHEN 2 THEN 'pulling'
                    WHEN 3 THEN 'starting'
                    WHEN 4 THEN 'healthy'
                    WHEN 5 THEN 'live'
                    WHEN 6 THEN 'failed'
                    WHEN 7 THEN 'rolling_back'
                    WHEN 8 THEN 'rolled_back'
                    WHEN 9 THEN 'stopped'
                    ELSE 'unknown'
               END AS status,
               provider, provider_deployment_id, provider_instance_id, provider_metadata,
               failure_message, url, started_at, finished_at, created_at, updated_at
        FROM deployments
        WHERE workspace_id = $1 AND service_id = $2
        ORDER BY created_at DESC
        LIMIT $3
        "#,
        [workspace_id.into(), service_id.into(), limit.into()],
    ))
    .all(&state.db)
    .await?;
    Ok(rows)
}

async fn deployment_config_snapshot(
    state: &AppState,
    service: &DeployServiceView,
) -> ApiResult<DeploymentConfigSnapshot> {
    let internal_port = u16::try_from(service.internal_port)
        .map_err(|_| ApiError::bad_request("invalid deployment service internal port"))?;
    validate_internal_port(internal_port).map_err(deploy_error)?;
    let resource_preset = ResourcePreset::parse(&service.resource_preset).map_err(deploy_error)?;
    let env =
        serde_json::from_value::<BTreeMap<String, String>>(service.env.clone()).unwrap_or_default();

    let secret_rows =
        DeploymentSecretSnapshotRow::find_by_statement(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
        SELECT name, encrypted_value
        FROM deploy_service_secrets
        WHERE workspace_id = $1 AND service_id = $2
        ORDER BY name ASC
        "#,
            [service.workspace_id.into(), service.id.into()],
        ))
        .all(&state.db)
        .await?;
    let encrypted_secrets = secret_rows
        .into_iter()
        .map(|row| (row.name, row.encrypted_value))
        .collect();

    let volume_rows =
        DeploymentVolumeSnapshotRow::find_by_statement(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
        SELECT id, provider_volume_id, name, mount_path, region, size_gb
        FROM deploy_service_volumes
        WHERE workspace_id = $1
          AND service_id = $2
          AND deleted_at IS NULL
        ORDER BY created_at ASC
        "#,
            [service.workspace_id.into(), service.id.into()],
        ))
        .all(&state.db)
        .await?;
    let volumes = volume_rows
        .into_iter()
        .map(|row| VolumeSpec {
            id: row.id,
            provider_volume_id: row.provider_volume_id,
            name: row.name,
            mount_path: row.mount_path,
            region: row.region,
            size_gb: row.size_gb,
        })
        .collect();

    Ok(DeploymentConfigSnapshot {
        provider_service_id: service.provider_service_id.clone(),
        app_name: service.slug.clone(),
        internal_port,
        environment: service.environment.clone(),
        health_check_path: service.health_check_path.clone(),
        region: service.region.clone(),
        resource_preset,
        volumes,
        env,
        encrypted_secrets,
    })
}

/// Wipes stored runtime log lines for a service. Called when a new deployment
/// is queued so each release starts with a clean log timeline rather than
/// carrying the previous release's stdout/stderr.
async fn clear_service_logs(
    state: &AppState,
    workspace_id: Uuid,
    service_id: Uuid,
) -> ApiResult<()> {
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "DELETE FROM deploy_log_lines WHERE workspace_id = $1 AND service_id = $2",
            [workspace_id.into(), service_id.into()],
        ))
        .await?;
    Ok(())
}

async fn insert_deployment(
    state: &AppState,
    workspace_id: Uuid,
    service_id: Uuid,
    user_id: Uuid,
    image: String,
    image_digest: Option<String>,
    config_snapshot: DeploymentConfigSnapshot,
    event_message: &str,
) -> ApiResult<DeployDeploymentView> {
    let now = Utc::now().fixed_offset();
    let id = Uuid::now_v7();
    let config_snapshot =
        serde_json::to_value(config_snapshot).map_err(|error| ApiError::Internal(error.into()))?;
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO deployments (
                id, workspace_id, service_id, image, image_digest, status, requested_by,
                provider, provider_metadata, config_snapshot, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'fly', '{}', $8, $9, $9)
            "#,
            [
                id.into(),
                workspace_id.into(),
                service_id.into(),
                image.into(),
                image_digest.into(),
                DeploymentStatus::Queued.code().into(),
                user_id.into(),
                config_snapshot.into(),
                now.into(),
            ],
        ))
        .await?;
    insert_event(
        state,
        workspace_id,
        service_id,
        Some(id),
        "info",
        event_message,
        json!({}),
    )
    .await?;
    Ok(deployment_rows(state, workspace_id, service_id, 1)
        .await?
        .into_iter()
        .next()
        .expect("deployment just inserted"))
}

async fn mark_service_queued_for_deployment(
    state: &AppState,
    workspace_id: Uuid,
    service_id: Uuid,
    was_stopped: bool,
) -> ApiResult<()> {
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE deploy_services
            SET status = $3,
                disabled_at = NULL,
                updated_at = now()
            WHERE workspace_id = $1 AND id = $2
            "#,
            [
                workspace_id.into(),
                service_id.into(),
                DeploymentStatus::Queued.code().into(),
            ],
        ))
        .await?;
    if was_stopped {
        insert_event(
            state,
            workspace_id,
            service_id,
            None,
            "info",
            "service resumed for deployment",
            json!({}),
        )
        .await?;
    }
    Ok(())
}

async fn event_rows(
    state: &AppState,
    workspace_id: Uuid,
    service_id: Uuid,
    limit: u64,
) -> ApiResult<Vec<DeployEventView>> {
    let limit = limit.min(500) as i64;
    let rows = DeployEventView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT id, service_id, deployment_id, level, message, data, created_at
        FROM deploy_events
        WHERE workspace_id = $1 AND service_id = $2
        ORDER BY created_at DESC
        LIMIT $3
        "#,
        [workspace_id.into(), service_id.into(), limit.into()],
    ))
    .all(&state.db)
    .await?;
    Ok(rows)
}

async fn insert_event(
    state: &AppState,
    workspace_id: Uuid,
    service_id: Uuid,
    deployment_id: Option<Uuid>,
    level: &str,
    message: &str,
    data: Value,
) -> ApiResult<()> {
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO deploy_events (
                id, workspace_id, service_id, deployment_id, level, message, data, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            "#,
            [
                Uuid::now_v7().into(),
                workspace_id.into(),
                service_id.into(),
                deployment_id.into(),
                level.into(),
                message.into(),
                data.into(),
                Utc::now().fixed_offset().into(),
            ],
        ))
        .await?;
    Ok(())
}

async fn write_service_secrets(
    state: &AppState,
    cipher: &SecretCipher,
    workspace_id: Uuid,
    service_id: Uuid,
    user_id: Uuid,
    secrets: BTreeMap<String, String>,
) -> ApiResult<()> {
    if secrets.is_empty() {
        return Ok(());
    }
    let now = Utc::now().fixed_offset();
    for (name, value) in secrets {
        let encrypted = cipher.encrypt(&value).map_err(deploy_error)?;
        state
            .db
            .execute(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                r#"
                INSERT INTO deploy_service_secrets (
                    id, workspace_id, service_id, name, encrypted_value, created_by, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
                ON CONFLICT (service_id, name) DO UPDATE SET
                    encrypted_value = EXCLUDED.encrypted_value,
                    updated_at = EXCLUDED.updated_at
                "#,
                [
                    Uuid::now_v7().into(),
                    workspace_id.into(),
                    service_id.into(),
                    name.into(),
                    encrypted.into(),
                    user_id.into(),
                    now.into(),
                ],
            ))
            .await?;
    }
    Ok(())
}

async fn workspace_service_count(state: &AppState, workspace_id: Uuid) -> ApiResult<i64> {
    let row = state
        .db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT COUNT(*)::BIGINT AS count
            FROM deploy_services
            WHERE workspace_id = $1 AND deleted_at IS NULL
            "#,
            [workspace_id.into()],
        ))
        .await?;
    Ok(row
        .and_then(|row| row.try_get::<i64>("", "count").ok())
        .unwrap_or(0))
}

async fn active_deployment_count(state: &AppState, workspace_id: Uuid) -> ApiResult<i64> {
    let row = state
        .db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT COUNT(*)::BIGINT AS count
            FROM deployments
            WHERE workspace_id = $1 AND status IN (0, 1, 2, 3, 4, 5, 7)
            "#,
            [workspace_id.into()],
        ))
        .await?;
    Ok(row
        .and_then(|row| row.try_get::<i64>("", "count").ok())
        .unwrap_or(0))
}

async fn service_volume_count(
    state: &AppState,
    workspace_id: Uuid,
    service_id: Uuid,
) -> ApiResult<i64> {
    let row = state
        .db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT COUNT(*)::BIGINT AS count
            FROM deploy_service_volumes
            WHERE workspace_id = $1
              AND service_id = $2
              AND deleted_at IS NULL
            "#,
            [workspace_id.into(), service_id.into()],
        ))
        .await?;
    Ok(row
        .and_then(|row| row.try_get::<i64>("", "count").ok())
        .unwrap_or(0))
}

fn ensure_deployments_enabled(state: &AppState) -> ApiResult<()> {
    if state.config.deployments_enabled {
        Ok(())
    } else {
        Err(ApiError::service_unavailable("deployments are disabled"))
    }
}

fn deploy_cipher(state: &AppState) -> ApiResult<SecretCipher> {
    let key =
        state.config.deploy_secrets_key.as_deref().ok_or_else(|| {
            ApiError::service_unavailable("deployment secrets are not configured")
        })?;
    SecretCipher::from_hex_key(key).map_err(deploy_error)
}

fn parse_registry_kind(raw: &str) -> ApiResult<RegistryKind> {
    match raw.trim() {
        "ghcr" => Ok(RegistryKind::Ghcr),
        "docker_hub" | "dockerhub" | "docker-hub" => Ok(RegistryKind::DockerHub),
        _ => Err(ApiError::bad_request(
            "registry_kind must be ghcr or docker_hub",
        )),
    }
}

fn clean_text(value: String, min: usize, max: usize, label: &str) -> ApiResult<String> {
    let value = value.trim().to_owned();
    if value.len() < min {
        return Err(ApiError::bad_request(format!("{label} is required")));
    }
    if value.len() > max {
        return Err(ApiError::bad_request(format!(
            "{label} must be {max} characters or fewer"
        )));
    }
    Ok(value)
}

fn validate_slug_like(value: &str, label: &str) -> ApiResult<()> {
    let valid = !value.is_empty()
        && value.len() <= 64
        && value
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if valid {
        Ok(())
    } else {
        Err(ApiError::bad_request(format!("invalid {label}")))
    }
}

fn map_service_domain_unique_err(error: sea_orm::DbErr) -> ApiError {
    let message = error.to_string();
    if message.contains("uniq_deploy_service_domains_hostname_active")
        || message.contains("duplicate key")
    {
        ApiError::conflict("custom domain already added")
    } else {
        ApiError::from(error)
    }
}

fn map_service_volume_unique_err(error: sea_orm::DbErr) -> ApiError {
    let message = error.to_string();
    if message.contains("uniq_deploy_service_volumes_mount_active")
        || message.contains("duplicate key")
    {
        ApiError::conflict("a volume is already attached at that mount path")
    } else {
        ApiError::from(error)
    }
}

fn deploy_error(error: deploy::DeployError) -> ApiError {
    match error {
        deploy::DeployError::Validation(message) | deploy::DeployError::Config(message) => {
            ApiError::bad_request(message)
        }
        deploy::DeployError::NotFound(message) => ApiError::not_found(message),
        deploy::DeployError::RateLimited(message) => ApiError::too_many_requests(message),
        deploy::DeployError::Provider(message) | deploy::DeployError::Transport(message) => {
            ApiError::service_unavailable(message)
        }
        deploy::DeployError::Crypto(message) | deploy::DeployError::Decode(message) => {
            ApiError::Internal(anyhow::anyhow!(message))
        }
    }
}
