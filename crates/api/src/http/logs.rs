use axum::{
    body::Bytes,
    extract::{Path, Query, State},
    routing::{delete, get, patch, post},
    Extension, Json, Router,
};
use chrono::{DateTime, FixedOffset, Utc};
use entity::log_access_request::{self, AccessStatus};
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    middleware::Membership,
    state::AppState,
};

const LOGS_DISABLED: &str = "logs are disabled";

pub fn workspace_routes(_state: AppState) -> Router<AppState> {
    Router::new()
        .route("/access", get(get_access))
        .route("/access/request", post(request_access))
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

#[allow(dead_code)]
#[derive(Deserialize, ToSchema)]
pub struct CreateLogProjectBody {
    pub name: String,
    pub slug: Option<String>,
    pub description: Option<String>,
    pub retention_days: Option<i32>,
}

#[allow(dead_code)]
#[derive(Deserialize, ToSchema)]
pub struct CreateLogTokenBody {
    pub name: String,
    pub expires_at: Option<DateTime<FixedOffset>>,
}

#[allow(dead_code)]
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

#[allow(dead_code)]
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

#[allow(dead_code)]
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

pub async fn list_projects() -> Json<Vec<LogProjectView>> {
    Json(Vec::new())
}

pub async fn create_project(
    Json(_body): Json<CreateLogProjectBody>,
) -> ApiResult<Json<LogProjectView>> {
    Err(disabled())
}

pub async fn get_project(
    Path((_wid, _project)): Path<(String, String)>,
) -> ApiResult<Json<LogProjectView>> {
    Err(ApiError::not_found("log project not found"))
}

pub async fn delete_project(
    Path((_wid, _project)): Path<(String, String)>,
) -> ApiResult<Json<OkResponse>> {
    Err(disabled())
}

pub async fn list_tokens(
    Path((_wid, _project)): Path<(String, String)>,
) -> Json<Vec<LogIngestTokenView>> {
    Json(Vec::new())
}

pub async fn create_token(
    Path((_wid, _project)): Path<(String, String)>,
    Json(_body): Json<CreateLogTokenBody>,
) -> ApiResult<Json<CreatedLogIngestToken>> {
    Err(disabled())
}

pub async fn revoke_token(
    Path((_wid, _project, _token_id)): Path<(String, String, Uuid)>,
) -> ApiResult<Json<OkResponse>> {
    Err(disabled())
}

pub async fn search_events(
    Path((_wid, _project)): Path<(String, String)>,
    Query(_query): Query<LogSearchQuery>,
) -> Json<LogSearchResponse> {
    Json(LogSearchResponse {
        events: Vec::new(),
        storage: LogStorageInfo {
            storage_uri: "disabled".to_owned(),
            backend: "disabled".to_owned(),
        },
    })
}

pub async fn list_alert_rules(
    Path((_wid, _project)): Path<(String, String)>,
) -> Json<Vec<LogAlertRuleView>> {
    Json(Vec::new())
}

pub async fn create_alert_rule(
    Path((_wid, _project)): Path<(String, String)>,
    Json(_body): Json<CreateLogAlertRuleBody>,
) -> ApiResult<Json<LogAlertRuleView>> {
    Err(disabled())
}

pub async fn update_alert_rule(
    Path((_wid, _project, _rule_id)): Path<(String, String, Uuid)>,
    Json(_body): Json<UpdateLogAlertRuleBody>,
) -> ApiResult<Json<LogAlertRuleView>> {
    Err(disabled())
}

pub async fn delete_alert_rule(
    Path((_wid, _project, _rule_id)): Path<(String, String, Uuid)>,
) -> ApiResult<Json<OkResponse>> {
    Err(disabled())
}

async fn ingest(_headers: axum::http::HeaderMap, _body: Bytes) -> ApiResult<Json<IngestResponse>> {
    Err(disabled())
}

fn disabled() -> ApiError {
    ApiError::service_unavailable(LOGS_DISABLED)
}
