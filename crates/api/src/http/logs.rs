use axum::{
    body::Bytes,
    extract::{Path, Query, Request, State},
    http::HeaderMap,
    middleware::{from_fn_with_state, Next},
    response::Response,
    routing::{delete, get, patch, post},
    Extension, Json, Router,
};
use chrono::{DateTime, Duration, FixedOffset, Utc};
use entity::{
    log_access_request::{self, AccessStatus},
    log_alert_rule, log_ingest_token, log_project, log_storage_bucket,
};
use rand::RngCore;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, QueryOrder,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    auth::{password::sha256_hex, AuthUser},
    error::{ApiError, ApiResult},
    logstore::NormalizedEvent,
    middleware::Membership,
    slug::slugify,
    state::AppState,
};

const LOGS_DISABLED: &str = "logs are disabled";
/// Plaintext ingest-token prefix; the stored hash is sha256 of the full token.
const TOKEN_PREFIX: &str = "plog_";
/// Header the produktive-logs client SDK uses to carry the ingest token.
const INGEST_TOKEN_HEADER: &str = "x-produktive-log-token";
/// Max events accepted in a single ingest request.
const MAX_INGEST_EVENTS: usize = 1_000;
const DEFAULT_RETENTION_DAYS: i32 = 30;

pub fn workspace_routes(state: AppState) -> Router<AppState> {
    // Functional log routes, gated behind the per-workspace access-approval
    // check. The `/access` routes below stay ungated so a workspace can still
    // request access while pending/denied.
    let gated = Router::new()
        .route("/projects", get(list_projects).post(create_project))
        .route(
            "/projects/{project}",
            get(get_project).delete(delete_project),
        )
        .route(
            "/projects/{project}/tokens",
            get(list_tokens).post(create_token),
        )
        .route(
            "/projects/{project}/tokens/{token_id}",
            delete(revoke_token),
        )
        .route("/projects/{project}/events", get(search_events))
        .route(
            "/projects/{project}/alerts",
            get(list_alert_rules).post(create_alert_rule),
        )
        .route(
            "/projects/{project}/alerts/{rule_id}",
            patch(update_alert_rule).delete(delete_alert_rule),
        )
        .route_layer(from_fn_with_state(state, log_access_guard));

    Router::new()
        .route("/access", get(get_access))
        .route("/access/request", post(request_access))
        .merge(gated)
}

/// Server-side enforcement of the per-workspace log-access approval gate.
///
/// The frontend hides logs behind an approval overlay, but that is advisory:
/// every functional log route must also reject callers whose workspace has not
/// been approved, so the gate cannot be bypassed via direct API calls. The
/// `/access` endpoints are intentionally left ungated so a workspace can still
/// request access.
async fn log_access_guard(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    req: Request,
    next: Next,
) -> Result<Response, ApiError> {
    match load_access(&state, m.workspace.id).await? {
        Some(row) if matches!(row.status, AccessStatus::Approved) => Ok(next.run(req).await),
        _ => Err(ApiError::Forbidden),
    }
}

pub fn ingest_routes() -> Router<AppState> {
    Router::new().route("/ingest", post(ingest))
}

#[derive(Serialize, ToSchema)]
pub struct LogAccessView {
    /// One of `none`, `pending`, `approved`, `denied`.
    pub status: String,
    pub requested_at: Option<DateTime<FixedOffset>>,
    pub decided_at: Option<DateTime<FixedOffset>>,
}

#[derive(Serialize, ToSchema)]
pub struct LogProjectView {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub bucket_id: Option<Uuid>,
    pub bucket_name: Option<String>,
    pub bucket_storage_uri: Option<String>,
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub retention_days: i32,
    pub created_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
    pub event_count_24h: i64,
    pub bytes_ingested_24h: i64,
    pub last_ingested_at: Option<DateTime<FixedOffset>>,
}

#[derive(Serialize, ToSchema)]
pub struct LogIngestTokenView {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub token_prefix: String,
    pub last_used_at: Option<DateTime<FixedOffset>>,
    pub expires_at: Option<DateTime<FixedOffset>>,
    pub revoked_at: Option<DateTime<FixedOffset>>,
    pub created_at: DateTime<FixedOffset>,
}

#[derive(Serialize, ToSchema)]
pub struct CreatedLogIngestToken {
    pub token: String,
    pub token_view: LogIngestTokenView,
}

#[derive(Serialize, ToSchema)]
pub struct LogAlertRuleView {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub query: String,
    pub level: Option<String>,
    pub threshold_count: i32,
    pub window_seconds: i32,
    pub enabled: bool,
    pub last_evaluated_at: Option<DateTime<FixedOffset>>,
    pub last_fired_at: Option<DateTime<FixedOffset>>,
    pub created_at: DateTime<FixedOffset>,
    pub updated_at: DateTime<FixedOffset>,
}

#[derive(Deserialize, ToSchema)]
pub struct CreateLogProjectBody {
    pub name: String,
    pub slug: Option<String>,
    pub description: Option<String>,
    pub retention_days: Option<i32>,
}

#[derive(Deserialize, ToSchema)]
pub struct CreateLogTokenBody {
    pub name: String,
    pub expires_at: Option<DateTime<FixedOffset>>,
}

#[derive(Deserialize, ToSchema)]
pub struct CreateLogAlertRuleBody {
    pub name: String,
    #[serde(default)]
    pub query: String,
    pub level: Option<String>,
    pub threshold_count: Option<i32>,
    pub window_seconds: Option<i32>,
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateLogAlertRuleBody {
    pub name: Option<String>,
    pub query: Option<String>,
    #[schema(value_type = Option<String>)]
    pub level: Option<Option<String>>,
    pub threshold_count: Option<i32>,
    pub window_seconds: Option<i32>,
    pub enabled: Option<bool>,
}

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct LogSearchQuery {
    pub from: Option<DateTime<FixedOffset>>,
    pub to: Option<DateTime<FixedOffset>>,
    pub q: Option<String>,
    pub level: Option<String>,
    pub service: Option<String>,
    pub limit: Option<u64>,
}

#[derive(Serialize, ToSchema)]
pub struct LogSearchEvent {
    pub event_id: String,
    pub timestamp: DateTime<FixedOffset>,
    pub received_at: DateTime<FixedOffset>,
    pub level: String,
    pub message: String,
    pub service: Option<String>,
    pub environment: Option<String>,
    pub operation: Option<String>,
    pub request_id: Option<String>,
    pub trace_id: Option<String>,
    pub source: String,
    pub event: Value,
    pub fields: Value,
}

#[derive(Serialize, ToSchema)]
pub struct LogStorageInfo {
    pub storage_uri: String,
    pub backend: String,
}

#[derive(Serialize, ToSchema)]
pub struct LogSearchResponse {
    pub events: Vec<LogSearchEvent>,
    pub storage: LogStorageInfo,
}

#[derive(Serialize, ToSchema)]
pub struct IngestResponse {
    pub accepted: usize,
    pub project_id: Uuid,
}

#[derive(Serialize, ToSchema)]
pub struct OkResponse {
    pub ok: bool,
}

async fn load_access(
    state: &AppState,
    workspace_id: Uuid,
) -> ApiResult<Option<log_access_request::Model>> {
    Ok(log_access_request::Entity::find()
        .filter(log_access_request::Column::WorkspaceId.eq(workspace_id))
        .one(&state.db)
        .await?)
}

fn access_status_str(status: AccessStatus) -> &'static str {
    match status {
        AccessStatus::Pending => "pending",
        AccessStatus::Approved => "approved",
        AccessStatus::Denied => "denied",
    }
}

impl LogAccessView {
    fn from_row(row: Option<log_access_request::Model>) -> Self {
        match row {
            None => LogAccessView {
                status: "none".to_owned(),
                requested_at: None,
                decided_at: None,
            },
            Some(row) => LogAccessView {
                status: access_status_str(row.status).to_owned(),
                requested_at: Some(row.requested_at),
                decided_at: row.decided_at,
            },
        }
    }
}

async fn get_access(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<LogAccessView>> {
    Ok(Json(LogAccessView::from_row(
        load_access(&state, m.workspace.id).await?,
    )))
}

async fn request_access(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    auth: AuthUser,
) -> ApiResult<Json<LogAccessView>> {
    let now = Utc::now().fixed_offset();
    let row = match load_access(&state, m.workspace.id).await? {
        Some(row) if matches!(row.status, AccessStatus::Approved | AccessStatus::Pending) => row,
        Some(row) => {
            let mut model: log_access_request::ActiveModel = row.into();
            model.status = Set(AccessStatus::Pending);
            model.requested_by = Set(Some(auth.user.id));
            model.requested_at = Set(now);
            model.decided_by = Set(None);
            model.decided_at = Set(None);
            model.updated_at = Set(now);
            model.update(&state.db).await?
        }
        None => {
            log_access_request::ActiveModel {
                id: Set(Uuid::now_v7()),
                workspace_id: Set(m.workspace.id),
                status: Set(AccessStatus::Pending),
                requested_by: Set(Some(auth.user.id)),
                requested_at: Set(now),
                decided_by: Set(None),
                decided_at: Set(None),
                created_at: Set(now),
                updated_at: Set(now),
            }
            .insert(&state.db)
            .await?
        }
    };
    Ok(Json(LogAccessView::from_row(Some(row))))
}

// --- View builders ------------------------------------------------------

impl LogProjectView {
    fn build(
        project: log_project::Model,
        bucket: Option<log_storage_bucket::Model>,
        event_count_24h: i64,
    ) -> Self {
        let (bucket_name, bucket_storage_uri) = match bucket {
            Some(b) => (Some(b.name), Some(b.storage_uri)),
            None => (None, None),
        };
        LogProjectView {
            id: project.id,
            workspace_id: project.workspace_id,
            bucket_id: project.bucket_id,
            bucket_name,
            bucket_storage_uri,
            slug: project.slug,
            name: project.name,
            description: project.description,
            retention_days: project.retention_days,
            created_at: project.created_at,
            updated_at: project.updated_at,
            event_count_24h,
            bytes_ingested_24h: 0,
            last_ingested_at: None,
        }
    }
}

impl From<log_ingest_token::Model> for LogIngestTokenView {
    fn from(t: log_ingest_token::Model) -> Self {
        LogIngestTokenView {
            id: t.id,
            workspace_id: t.workspace_id,
            project_id: t.project_id,
            name: t.name,
            token_prefix: t.token_prefix,
            last_used_at: t.last_used_at,
            expires_at: t.expires_at,
            revoked_at: t.revoked_at,
            created_at: t.created_at,
        }
    }
}

impl From<log_alert_rule::Model> for LogAlertRuleView {
    fn from(r: log_alert_rule::Model) -> Self {
        LogAlertRuleView {
            id: r.id,
            workspace_id: r.workspace_id,
            project_id: r.project_id,
            name: r.name,
            query: r.query,
            level: r.level,
            threshold_count: r.threshold_count,
            window_seconds: r.window_seconds,
            enabled: r.enabled,
            last_evaluated_at: r.last_evaluated_at,
            last_fired_at: r.last_fired_at,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

// --- Helpers ------------------------------------------------------------

/// Resolve a `{project}` path segment (UUID or slug) within the caller's
/// workspace. Guards against IDOR — a project from another workspace is treated
/// as not-found.
async fn resolve_project(
    state: &AppState,
    workspace_id: Uuid,
    ident: &str,
) -> ApiResult<log_project::Model> {
    let mut query =
        log_project::Entity::find().filter(log_project::Column::WorkspaceId.eq(workspace_id));
    if let Ok(id) = Uuid::parse_str(ident) {
        query = query.filter(log_project::Column::Id.eq(id));
    } else {
        query = query.filter(log_project::Column::Slug.eq(ident.trim().to_lowercase()));
    }
    query
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("log project not found"))
}

async fn load_bucket(
    state: &AppState,
    bucket_id: Option<Uuid>,
) -> ApiResult<Option<log_storage_bucket::Model>> {
    match bucket_id {
        Some(id) => Ok(log_storage_bucket::Entity::find_by_id(id)
            .one(&state.db)
            .await?),
        None => Ok(None),
    }
}

/// Count events for a project over the last 24h via NarrowDB. Returns 0 on any
/// failure so a transient storage hiccup never blocks the project listing.
async fn event_count_24h(state: &AppState, project_id: Uuid) -> i64 {
    let Some(narrow) = state.narrow.as_ref() else {
        return 0;
    };
    let since_ms = (Utc::now() - Duration::hours(24)).timestamp_millis();
    narrow
        .count_recent(&project_id.to_string(), since_ms)
        .await
        .unwrap_or(0)
}

// --- Project handlers ---------------------------------------------------

pub async fn list_projects(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<Vec<LogProjectView>>> {
    if state.narrow.is_none() {
        return Err(disabled());
    }
    let projects = log_project::Entity::find()
        .filter(log_project::Column::WorkspaceId.eq(m.workspace.id))
        .order_by_asc(log_project::Column::Name)
        .all(&state.db)
        .await?;

    let mut views = Vec::with_capacity(projects.len());
    for project in projects {
        let bucket = load_bucket(&state, project.bucket_id).await?;
        let count = event_count_24h(&state, project.id).await;
        views.push(LogProjectView::build(project, bucket, count));
    }
    Ok(Json(views))
}

pub async fn create_project(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Json(body): Json<CreateLogProjectBody>,
) -> ApiResult<Json<LogProjectView>> {
    if state.narrow.is_none() {
        return Err(disabled());
    }
    let name = body.name.trim().to_owned();
    if name.is_empty() {
        return Err(ApiError::bad_request("name is required"));
    }
    let slug_input = body.slug.as_deref().unwrap_or(&name);
    let slug = slugify(slug_input, "project");

    // Slug is unique per workspace.
    let exists = log_project::Entity::find()
        .filter(log_project::Column::WorkspaceId.eq(m.workspace.id))
        .filter(log_project::Column::Slug.eq(slug.clone()))
        .one(&state.db)
        .await?
        .is_some();
    if exists {
        return Err(ApiError::conflict(
            "a project with that slug already exists",
        ));
    }

    let retention_days = body.retention_days.unwrap_or(DEFAULT_RETENTION_DAYS).max(1);
    let now = Utc::now().fixed_offset();
    let project = log_project::ActiveModel {
        id: Set(Uuid::now_v7()),
        workspace_id: Set(m.workspace.id),
        bucket_id: Set(None),
        slug: Set(slug),
        name: Set(name),
        description: Set(body
            .description
            .map(|d| d.trim().to_owned())
            .filter(|d| !d.is_empty())),
        retention_days: Set(retention_days),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    Ok(Json(LogProjectView::build(project, None, 0)))
}

pub async fn get_project(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, project)): Path<(String, String)>,
) -> ApiResult<Json<LogProjectView>> {
    if state.narrow.is_none() {
        return Err(disabled());
    }
    let project = resolve_project(&state, m.workspace.id, &project).await?;
    let bucket = load_bucket(&state, project.bucket_id).await?;
    let count = event_count_24h(&state, project.id).await;
    Ok(Json(LogProjectView::build(project, bucket, count)))
}

pub async fn delete_project(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, project)): Path<(String, String)>,
) -> ApiResult<Json<OkResponse>> {
    if state.narrow.is_none() {
        return Err(disabled());
    }
    let project = resolve_project(&state, m.workspace.id, &project).await?;
    // Tokens and alert rules cascade-delete via FK in the migration.
    log_project::Entity::delete_by_id(project.id)
        .exec(&state.db)
        .await?;
    Ok(Json(OkResponse { ok: true }))
}

// --- Ingest-token handlers ---------------------------------------------

pub async fn list_tokens(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, project)): Path<(String, String)>,
) -> ApiResult<Json<Vec<LogIngestTokenView>>> {
    if state.narrow.is_none() {
        return Err(disabled());
    }
    let project = resolve_project(&state, m.workspace.id, &project).await?;
    let tokens = log_ingest_token::Entity::find()
        .filter(log_ingest_token::Column::ProjectId.eq(project.id))
        .order_by_desc(log_ingest_token::Column::CreatedAt)
        .all(&state.db)
        .await?;
    Ok(Json(tokens.into_iter().map(Into::into).collect()))
}

pub async fn create_token(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, project)): Path<(String, String)>,
    Json(body): Json<CreateLogTokenBody>,
) -> ApiResult<Json<CreatedLogIngestToken>> {
    if state.narrow.is_none() {
        return Err(disabled());
    }
    let project = resolve_project(&state, m.workspace.id, &project).await?;
    let name = body.name.trim().to_owned();
    if name.is_empty() {
        return Err(ApiError::bad_request("name is required"));
    }

    let mut buf = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut buf);
    let token = format!("{TOKEN_PREFIX}{}", hex::encode(buf));
    let token_hash = sha256_hex(&token);
    let token_prefix = token
        .chars()
        .take(TOKEN_PREFIX.len() + 6)
        .collect::<String>();

    let now = Utc::now().fixed_offset();
    let row = log_ingest_token::ActiveModel {
        id: Set(Uuid::now_v7()),
        workspace_id: Set(m.workspace.id),
        project_id: Set(project.id),
        name: Set(name),
        token_hash: Set(token_hash),
        token_prefix: Set(token_prefix),
        last_used_at: Set(None),
        expires_at: Set(body.expires_at),
        revoked_at: Set(None),
        created_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    Ok(Json(CreatedLogIngestToken {
        token,
        token_view: row.into(),
    }))
}

pub async fn revoke_token(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, project, token_id)): Path<(String, String, Uuid)>,
) -> ApiResult<Json<OkResponse>> {
    if state.narrow.is_none() {
        return Err(disabled());
    }
    let project = resolve_project(&state, m.workspace.id, &project).await?;
    let token = log_ingest_token::Entity::find_by_id(token_id)
        .filter(log_ingest_token::Column::ProjectId.eq(project.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("ingest token not found"))?;

    if token.revoked_at.is_none() {
        let mut model: log_ingest_token::ActiveModel = token.into();
        model.revoked_at = Set(Some(Utc::now().fixed_offset()));
        model.update(&state.db).await?;
    }
    Ok(Json(OkResponse { ok: true }))
}

// --- Search -------------------------------------------------------------

pub async fn search_events(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, project)): Path<(String, String)>,
    Query(query): Query<LogSearchQuery>,
) -> ApiResult<Json<LogSearchResponse>> {
    let Some(narrow) = state.narrow.clone() else {
        return Err(disabled());
    };
    let project = resolve_project(&state, m.workspace.id, &project).await?;
    let events = narrow.search(&project.id.to_string(), &query).await?;
    Ok(Json(LogSearchResponse {
        events,
        storage: LogStorageInfo {
            storage_uri: format!("narrowdb://{}", project.id),
            backend: "narrowdb".to_owned(),
        },
    }))
}

// --- Alert-rule handlers ------------------------------------------------

pub async fn list_alert_rules(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, project)): Path<(String, String)>,
) -> ApiResult<Json<Vec<LogAlertRuleView>>> {
    if state.narrow.is_none() {
        return Err(disabled());
    }
    let project = resolve_project(&state, m.workspace.id, &project).await?;
    let rules = log_alert_rule::Entity::find()
        .filter(log_alert_rule::Column::ProjectId.eq(project.id))
        .order_by_desc(log_alert_rule::Column::CreatedAt)
        .all(&state.db)
        .await?;
    Ok(Json(rules.into_iter().map(Into::into).collect()))
}

pub async fn create_alert_rule(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, project)): Path<(String, String)>,
    Json(body): Json<CreateLogAlertRuleBody>,
) -> ApiResult<Json<LogAlertRuleView>> {
    if state.narrow.is_none() {
        return Err(disabled());
    }
    let project = resolve_project(&state, m.workspace.id, &project).await?;
    let name = body.name.trim().to_owned();
    if name.is_empty() {
        return Err(ApiError::bad_request("name is required"));
    }

    let now = Utc::now().fixed_offset();
    let row = log_alert_rule::ActiveModel {
        id: Set(Uuid::now_v7()),
        workspace_id: Set(m.workspace.id),
        project_id: Set(project.id),
        name: Set(name),
        query: Set(body.query.trim().to_owned()),
        level: Set(body
            .level
            .map(|l| l.trim().to_owned())
            .filter(|l| !l.is_empty())),
        threshold_count: Set(body.threshold_count.unwrap_or(1).max(1)),
        window_seconds: Set(body.window_seconds.unwrap_or(300).max(1)),
        enabled: Set(body.enabled),
        last_evaluated_at: Set(None),
        last_fired_at: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await?;

    // TODO(alerts): background alert EVALUATION (periodic query of NarrowDB and
    // notification firing) is out of scope. Rules are persisted but never
    // evaluated yet; wire a sweep that reads each rule's window/threshold,
    // queries app_logs, and emits notifications / log_alert_firing rows.

    Ok(Json(row.into()))
}

pub async fn update_alert_rule(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, project, rule_id)): Path<(String, String, Uuid)>,
    Json(body): Json<UpdateLogAlertRuleBody>,
) -> ApiResult<Json<LogAlertRuleView>> {
    if state.narrow.is_none() {
        return Err(disabled());
    }
    let project = resolve_project(&state, m.workspace.id, &project).await?;
    let rule = log_alert_rule::Entity::find_by_id(rule_id)
        .filter(log_alert_rule::Column::ProjectId.eq(project.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("alert rule not found"))?;

    let mut model: log_alert_rule::ActiveModel = rule.into();
    if let Some(name) = body.name {
        let name = name.trim().to_owned();
        if name.is_empty() {
            return Err(ApiError::bad_request("name cannot be empty"));
        }
        model.name = Set(name);
    }
    if let Some(query) = body.query {
        model.query = Set(query.trim().to_owned());
    }
    if let Some(level) = body.level {
        model.level = Set(level.map(|l| l.trim().to_owned()).filter(|l| !l.is_empty()));
    }
    if let Some(threshold) = body.threshold_count {
        model.threshold_count = Set(threshold.max(1));
    }
    if let Some(window) = body.window_seconds {
        model.window_seconds = Set(window.max(1));
    }
    if let Some(enabled) = body.enabled {
        model.enabled = Set(enabled);
    }
    model.updated_at = Set(Utc::now().fixed_offset());

    let updated = model.update(&state.db).await?;
    Ok(Json(updated.into()))
}

pub async fn delete_alert_rule(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, project, rule_id)): Path<(String, String, Uuid)>,
) -> ApiResult<Json<OkResponse>> {
    if state.narrow.is_none() {
        return Err(disabled());
    }
    let project = resolve_project(&state, m.workspace.id, &project).await?;
    let rule = log_alert_rule::Entity::find_by_id(rule_id)
        .filter(log_alert_rule::Column::ProjectId.eq(project.id))
        .one(&state.db)
        .await?
        .ok_or_else(|| ApiError::not_found("alert rule not found"))?;
    log_alert_rule::Entity::delete_by_id(rule.id)
        .exec(&state.db)
        .await?;
    Ok(Json(OkResponse { ok: true }))
}

// --- Ingest -------------------------------------------------------------

async fn ingest(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Json<IngestResponse>> {
    let Some(narrow) = state.narrow.clone() else {
        return Err(disabled());
    };

    let token = extract_ingest_token(&headers).ok_or_else(|| ApiError::Unauthorized)?;
    let token_hash = sha256_hex(&token);

    let now = Utc::now().fixed_offset();
    let token_row = log_ingest_token::Entity::find()
        .filter(log_ingest_token::Column::TokenHash.eq(token_hash))
        .one(&state.db)
        .await?
        .ok_or(ApiError::Unauthorized)?;

    if token_row.revoked_at.is_some() {
        return Err(ApiError::Unauthorized);
    }
    if token_row.expires_at.is_some_and(|exp| exp <= now) {
        return Err(ApiError::Unauthorized);
    }

    let project_id = token_row.project_id;

    let payload: Value = parse_ingest_body(&body)?;
    let events = normalize_payload(&payload, MAX_INGEST_EVENTS)?;
    let accepted = if events.is_empty() {
        0
    } else {
        narrow
            .ingest_events(&project_id.to_string(), &events)
            .await?
    };

    // Best-effort last_used_at touch; ignore failures.
    let mut model: log_ingest_token::ActiveModel = token_row.into();
    model.last_used_at = Set(Some(now));
    if let Err(e) = model.update(&state.db).await {
        tracing::warn!(error = ?e, "failed to update ingest token last_used_at");
    }

    Ok(Json(IngestResponse {
        accepted,
        project_id,
    }))
}

/// Pull the ingest token from the `x-produktive-log-token` header or a
/// `Bearer` Authorization header.
fn extract_ingest_token(headers: &HeaderMap) -> Option<String> {
    if let Some(value) = headers
        .get(INGEST_TOKEN_HEADER)
        .and_then(|v| v.to_str().ok())
    {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_owned());
        }
    }
    headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(ToOwned::to_owned)
}

/// Parse the ingest body as JSON, or as NDJSON (one JSON object per line)
/// wrapped into `{ "events": [...] }`.
fn parse_ingest_body(body: &Bytes) -> ApiResult<Value> {
    let text =
        std::str::from_utf8(body).map_err(|_| ApiError::bad_request("invalid utf-8 body"))?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err(ApiError::bad_request("empty body"));
    }
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        return Ok(value);
    }
    // NDJSON fallback.
    let events: Vec<Value> = trimmed
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(serde_json::from_str::<Value>)
        .collect::<Result<_, _>>()
        .map_err(|_| ApiError::bad_request("invalid JSON / NDJSON body"))?;
    Ok(Value::Object(
        [("events".to_owned(), Value::Array(events))]
            .into_iter()
            .collect(),
    ))
}

// --- Payload normalization ----------------------------------------------
//
// Minimal copy of the normalization logic from the orphaned `crates/logging`
// crate (which pulls in a duckdb dependency we do not want). Turns a raw
// ingest payload into `NormalizedEvent`s for NarrowDB.

fn normalize_payload(payload: &Value, max_events: usize) -> ApiResult<Vec<NormalizedEvent>> {
    let raw_events: Vec<&Value> = if let Some(arr) = payload.as_array() {
        // A top-level JSON array of event objects (what the SDK / a plain
        // `[{...}]` POST sends).
        arr.iter().collect()
    } else if let Some(events) = payload.get("events").and_then(|v| v.as_array()) {
        events.iter().collect()
    } else if let Some(batch) = payload.get("batch").and_then(|v| v.as_array()) {
        batch.iter().collect()
    } else {
        vec![payload]
    };
    if raw_events.len() > max_events {
        return Err(ApiError::bad_request(format!(
            "too many log events; max batch is {max_events}"
        )));
    }
    let now_ms = Utc::now().timestamp_millis();
    Ok(raw_events
        .into_iter()
        .map(|raw| normalize_event(raw, now_ms))
        .collect())
}

fn normalize_event(raw: &Value, received_at_ms: i64) -> NormalizedEvent {
    let event = raw.get("event").unwrap_or(raw);
    let timestamp_ms = timestamp_ms(event)
        .or_else(|| timestamp_ms(raw))
        .unwrap_or(received_at_ms);
    let level = clean_level(string_field(event, &["level", "severity"]))
        .unwrap_or_else(|| "info".to_owned());
    let message = string_field(event, &["message", "msg"])
        .or_else(|| {
            event
                .get("error")
                .and_then(|error| string_field(error, &["message", "name"]))
        })
        .unwrap_or_else(|| "log event".to_owned());
    let request = raw.get("request");
    let service = string_field(event, &["service", "service_name"])
        .or_else(|| string_field(raw, &["service", "service_name"]));
    let environment = string_field(event, &["environment", "env"])
        .or_else(|| string_field(raw, &["environment", "env"]));
    let operation = string_field(event, &["operation", "op", "route", "path"])
        .or_else(|| request.and_then(|v| string_field(v, &["operation", "path"])));
    let request_id = string_field(event, &["request_id", "requestId"])
        .or_else(|| request.and_then(|v| string_field(v, &["request_id", "requestId"])));
    let trace_id = string_field(event, &["trace_id", "traceId"]);
    let source = string_field(raw, &["source"]).unwrap_or_else(|| "evlog".to_owned());
    let fields = match event.as_object() {
        Some(obj) => Value::Object(obj.clone()),
        None => event.clone(),
    };

    NormalizedEvent {
        event_id: Uuid::now_v7().to_string(),
        ts_ms: timestamp_ms,
        received_at_ms,
        level,
        message: truncate(message, 16_000),
        service: service.map(|v| truncate(v, 256)),
        environment: environment.map(|v| truncate(v, 128)),
        operation: operation.map(|v| truncate(v, 512)),
        request_id: request_id.map(|v| truncate(v, 256)),
        trace_id: trace_id.map(|v| truncate(v, 256)),
        source: truncate(source, 128),
        fields_json: serde_json::to_string(&fields).unwrap_or_else(|_| "{}".to_owned()),
    }
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value
            .get(*key)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(ToOwned::to_owned)
    })
}

fn timestamp_ms(value: &Value) -> Option<i64> {
    for key in ["timestamp", "time", "ts", "date"] {
        let Some(v) = value.get(key) else { continue };
        if let Some(n) = v.as_i64() {
            return Some(if n.abs() < 100_000_000_000 {
                n * 1000
            } else {
                n
            });
        }
        if let Some(f) = v.as_f64() {
            return Some(if f.abs() < 100_000_000_000.0 {
                (f * 1000.0) as i64
            } else {
                f as i64
            });
        }
        if let Some(s) = v.as_str() {
            if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
                return Some(dt.timestamp_millis());
            }
            if let Ok(n) = s.parse::<i64>() {
                return Some(if n.abs() < 100_000_000_000 {
                    n * 1000
                } else {
                    n
                });
            }
        }
    }
    None
}

fn clean_level(level: Option<String>) -> Option<String> {
    let level = level
        .map(|v| v.trim().to_ascii_lowercase())
        .filter(|v| !v.is_empty())?;
    match level.as_str() {
        "warning" => Some("warn".to_owned()),
        "trace" | "debug" | "info" | "warn" | "error" | "fatal" => Some(level),
        // Unknown levels fall back to info rather than rejecting the event.
        _ => Some("info".to_owned()),
    }
}

fn truncate(mut value: String, max: usize) -> String {
    if value.len() <= max {
        return value;
    }
    while value.len() > max {
        value.pop();
    }
    value
}

fn disabled() -> ApiError {
    ApiError::service_unavailable(LOGS_DISABLED)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn normalizes_top_level_array() {
        // A plain `[{...}]` POST (the produktive-logs SDK shape) must map each
        // object's keys onto columns — not collapse the whole array into one
        // event with a default message.
        let payload = json!([{
            "ts": 1_710_000_000_000_i64,
            "level": "warn",
            "service": "api",
            "environment": "prod",
            "operation": "GET /x",
            "message": "hi"
        }]);
        let events = normalize_payload(&payload, 100).unwrap();
        assert_eq!(events.len(), 1);
        let e = &events[0];
        assert_eq!(e.message, "hi");
        assert_eq!(e.level, "warn");
        assert_eq!(e.service.as_deref(), Some("api"));
        assert_eq!(e.environment.as_deref(), Some("prod"));
        assert_eq!(e.operation.as_deref(), Some("GET /x"));
        assert_eq!(e.ts_ms, 1_710_000_000_000);
    }

    #[test]
    fn normalizes_events_envelope_and_single_object() {
        let batched = json!({ "events": [{ "message": "a" }, { "message": "b" }] });
        assert_eq!(normalize_payload(&batched, 100).unwrap().len(), 2);

        let single = json!({ "message": "solo", "level": "error" });
        let events = normalize_payload(&single, 100).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].message, "solo");
        assert_eq!(events[0].level, "error");
    }
}
