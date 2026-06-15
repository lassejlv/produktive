use axum::{
    body::Bytes,
    extract::{Path, Query, State},
    http::HeaderMap,
    routing::{delete, get, patch, post},
    Extension, Json, Router,
};
use chrono::{DateTime, Duration, FixedOffset, Utc};
use produktive_logging::{
    clean_level, normalize_payload, AppendBatch, LogStorageInfo, LogStoreOptions, SearchEvent,
    SearchRequest,
};
use rand::RngCore;
use sea_orm::{ConnectionTrait, DatabaseBackend, FromQueryResult, Statement, Value};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    auth::password::sha256_hex,
    error::{ApiError, ApiResult},
    middleware::Membership,
    slug,
    state::AppState,
};

pub fn workspace_routes() -> Router<AppState> {
    Router::new()
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

#[derive(Serialize, FromQueryResult, ToSchema)]
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

#[derive(Serialize, FromQueryResult, ToSchema)]
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

#[derive(Serialize, FromQueryResult, ToSchema)]
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
    #[serde(default = "default_true")]
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
pub struct LogSearchResponse {
    pub events: Vec<SearchEvent>,
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

#[derive(FromQueryResult)]
struct TokenProject {
    workspace_id: Uuid,
    project_id: Uuid,
    token_id: Uuid,
    storage_uri: Option<String>,
    region: Option<String>,
    endpoint: Option<String>,
    access_key_id: Option<String>,
    secret_access_key: Option<String>,
}

#[derive(FromQueryResult)]
struct ProjectStorage {
    storage_uri: Option<String>,
    region: Option<String>,
    endpoint: Option<String>,
    access_key_id: Option<String>,
    secret_access_key: Option<String>,
}

fn default_true() -> bool {
    true
}

pub async fn list_projects(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<Vec<LogProjectView>>> {
    Ok(Json(load_projects(&state, m.workspace.id).await?))
}

pub async fn create_project(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Json(body): Json<CreateLogProjectBody>,
) -> ApiResult<Json<LogProjectView>> {
    m.require_owner()?;
    let name = body.name.trim();
    if name.is_empty() {
        return Err(ApiError::bad_request("project name required"));
    }
    let retention_days = body.retention_days.unwrap_or(14).clamp(1, 90);
    let slug = match body
        .slug
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        Some(input) => {
            let slug = slug::slugify(input, "logs");
            if !slug::is_valid_slug(&slug) {
                return Err(ApiError::bad_request("invalid project slug"));
            }
            slug
        }
        None => slug::unique_log_project_slug(&state.db, m.workspace.id, name).await?,
    };
    let bucket_id = choose_log_bucket(&state).await?;

    let now = Utc::now().fixed_offset();
    let id = Uuid::now_v7();
    let res = state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO log_projects (
                id, workspace_id, bucket_id, slug, name, description, retention_days, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
            "#,
            vec![
                id.into(),
                m.workspace.id.into(),
                bucket_id.into(),
                slug.into(),
                name.to_owned().into(),
                body.description
                    .map(|v| v.trim().to_owned())
                    .filter(|v| !v.is_empty())
                    .into(),
                retention_days.into(),
                now.into(),
            ],
        ))
        .await;
    match res {
        Ok(_) => Ok(Json(
            resolve_project(&state, m.workspace.id, &id.to_string()).await?,
        )),
        Err(sea_orm::DbErr::Exec(err)) if err.to_string().contains("uniq_log_projects") => {
            Err(ApiError::conflict("log project slug already exists"))
        }
        Err(err) => Err(err.into()),
    }
}

pub async fn get_project(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, project)): Path<(String, String)>,
) -> ApiResult<Json<LogProjectView>> {
    Ok(Json(
        resolve_project(&state, m.workspace.id, &project).await?,
    ))
}

pub async fn delete_project(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, project)): Path<(String, String)>,
) -> ApiResult<Json<OkResponse>> {
    m.require_owner()?;
    let project = resolve_project(&state, m.workspace.id, &project).await?;
    let storage_options = project_storage_options(&state, project.id).await?;
    state
        .logs
        .delete_project_data_with(storage_options, m.workspace.id, project.id)
        .await
        .map_err(|error| {
            tracing::error!(project_id = %project.id, error = ?error, "log project storage delete failed");
            ApiError::service_unavailable("log project storage delete failed")
        })?;
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "DELETE FROM log_projects WHERE workspace_id = $1 AND id = $2",
            vec![m.workspace.id.into(), project.id.into()],
        ))
        .await?;
    Ok(Json(OkResponse { ok: true }))
}

pub async fn list_tokens(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, project)): Path<(String, String)>,
) -> ApiResult<Json<Vec<LogIngestTokenView>>> {
    let project = resolve_project(&state, m.workspace.id, &project).await?;
    Ok(Json(load_tokens(&state, m.workspace.id, project.id).await?))
}

pub async fn create_token(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, project)): Path<(String, String)>,
    Json(body): Json<CreateLogTokenBody>,
) -> ApiResult<Json<CreatedLogIngestToken>> {
    m.require_owner()?;
    let project = resolve_project(&state, m.workspace.id, &project).await?;
    let name = body.name.trim();
    if name.is_empty() {
        return Err(ApiError::bad_request("token name required"));
    }
    let id = Uuid::now_v7();
    let now = Utc::now().fixed_offset();
    let token = generate_ingest_token(id);
    let token_hash = sha256_hex(&token);
    let token_prefix = token.chars().take(16).collect::<String>();
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO log_ingest_tokens (
                id, workspace_id, project_id, name, token_hash, token_prefix, expires_at, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            "#,
            vec![
                id.into(),
                m.workspace.id.into(),
                project.id.into(),
                name.to_owned().into(),
                token_hash.into(),
                token_prefix.into(),
                body.expires_at.into(),
                now.into(),
            ],
        ))
        .await?;

    let token_view = load_token(&state, m.workspace.id, project.id, id).await?;
    Ok(Json(CreatedLogIngestToken { token, token_view }))
}

pub async fn revoke_token(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, project, token_id)): Path<(String, String, Uuid)>,
) -> ApiResult<Json<OkResponse>> {
    m.require_owner()?;
    let project = resolve_project(&state, m.workspace.id, &project).await?;
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE log_ingest_tokens
            SET revoked_at = now()
            WHERE workspace_id = $1 AND project_id = $2 AND id = $3 AND revoked_at IS NULL
            "#,
            vec![m.workspace.id.into(), project.id.into(), token_id.into()],
        ))
        .await?;
    Ok(Json(OkResponse { ok: true }))
}

pub async fn search_events(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, project)): Path<(String, String)>,
    Query(query): Query<LogSearchQuery>,
) -> ApiResult<Json<LogSearchResponse>> {
    let project = resolve_project(&state, m.workspace.id, &project).await?;
    let now = Utc::now().fixed_offset();
    let to = query.to.unwrap_or(now);
    let from = query.from.unwrap_or(to - Duration::hours(1));
    if from > to {
        return Err(ApiError::bad_request("from must be before to"));
    }
    let limit = query.limit.unwrap_or(100).min(1000) as usize;
    let storage = project_storage_options(&state, project.id).await?;
    let storage_info = log_storage_info(storage.as_ref(), state.logs.info());
    let request = SearchRequest {
        workspace_id: m.workspace.id,
        project_id: project.id,
        from_ms: from.timestamp_millis(),
        to_ms: to.timestamp_millis(),
        limit,
        query: query.q,
        level: query.level,
        service: query.service,
    };

    if let Some(cache) = state.log_hot_cache.as_ref() {
        match cache.search(&request).await {
            Ok(Some(events)) => {
                return Ok(Json(LogSearchResponse {
                    events,
                    storage: storage_info,
                }));
            }
            Ok(None) => {}
            Err(error) => {
                tracing::warn!(project_id = %project.id, error = ?error, "log hot cache search failed");
            }
        }
    }

    let events = state
        .logs
        .search_with(storage, request.clone())
        .await
        .map_err(|error| {
            tracing::error!(project_id = %project.id, error = ?error, "log search failed");
            ApiError::service_unavailable("log search failed")
        })?;
    if let Some(cache) = state.log_hot_cache.as_ref() {
        if let Err(error) = cache.cache_search_result(&request, &events).await {
            tracing::warn!(project_id = %project.id, error = ?error, "log search cache write failed");
        }
    }
    Ok(Json(LogSearchResponse {
        events,
        storage: storage_info,
    }))
}

pub async fn list_alert_rules(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, project)): Path<(String, String)>,
) -> ApiResult<Json<Vec<LogAlertRuleView>>> {
    let project = resolve_project(&state, m.workspace.id, &project).await?;
    Ok(Json(
        load_alert_rules(&state, m.workspace.id, project.id).await?,
    ))
}

pub async fn create_alert_rule(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, project)): Path<(String, String)>,
    Json(body): Json<CreateLogAlertRuleBody>,
) -> ApiResult<Json<LogAlertRuleView>> {
    m.require_owner()?;
    let project = resolve_project(&state, m.workspace.id, &project).await?;
    let name = body.name.trim();
    if name.is_empty() {
        return Err(ApiError::bad_request("alert name required"));
    }
    let threshold = body.threshold_count.unwrap_or(1).clamp(1, 100_000);
    let window = body.window_seconds.unwrap_or(300).clamp(60, 86_400);
    let level =
        clean_level(body.level).map_err(|error| ApiError::bad_request(error.to_string()))?;
    let now = Utc::now().fixed_offset();
    let id = Uuid::now_v7();
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO log_alert_rules (
                id, workspace_id, project_id, name, query, level, threshold_count,
                window_seconds, enabled, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
            "#,
            vec![
                id.into(),
                m.workspace.id.into(),
                project.id.into(),
                name.to_owned().into(),
                body.query.trim().to_owned().into(),
                level.into(),
                threshold.into(),
                window.into(),
                body.enabled.into(),
                now.into(),
            ],
        ))
        .await?;
    Ok(Json(
        load_alert_rule(&state, m.workspace.id, project.id, id).await?,
    ))
}

pub async fn update_alert_rule(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, project, rule_id)): Path<(String, String, Uuid)>,
    Json(body): Json<UpdateLogAlertRuleBody>,
) -> ApiResult<Json<LogAlertRuleView>> {
    m.require_owner()?;
    let project = resolve_project(&state, m.workspace.id, &project).await?;
    let mut assignments = Vec::new();
    let mut values: Vec<Value> = vec![m.workspace.id.into(), project.id.into(), rule_id.into()];
    let mut next = 4;
    if let Some(name) = body.name {
        let name = name.trim().to_owned();
        if name.is_empty() {
            return Err(ApiError::bad_request("alert name required"));
        }
        assignments.push(format!("name = ${next}"));
        values.push(name.into());
        next += 1;
    }
    if let Some(query) = body.query {
        assignments.push(format!("query = ${next}"));
        values.push(query.trim().to_owned().into());
        next += 1;
    }
    if let Some(level) = body.level {
        assignments.push(format!("level = ${next}"));
        values.push(
            clean_level(level)
                .map_err(|error| ApiError::bad_request(error.to_string()))?
                .into(),
        );
        next += 1;
    }
    if let Some(threshold) = body.threshold_count {
        assignments.push(format!("threshold_count = ${next}"));
        values.push(threshold.clamp(1, 100_000).into());
        next += 1;
    }
    if let Some(window) = body.window_seconds {
        assignments.push(format!("window_seconds = ${next}"));
        values.push(window.clamp(60, 86_400).into());
        next += 1;
    }
    if let Some(enabled) = body.enabled {
        assignments.push(format!("enabled = ${next}"));
        values.push(enabled.into());
    }
    if assignments.is_empty() {
        return Ok(Json(
            load_alert_rule(&state, m.workspace.id, project.id, rule_id).await?,
        ));
    }
    assignments.push("updated_at = now()".to_string());
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            format!(
                "UPDATE log_alert_rules SET {} WHERE workspace_id = $1 AND project_id = $2 AND id = $3",
                assignments.join(", ")
            ),
            values,
        ))
        .await?;
    Ok(Json(
        load_alert_rule(&state, m.workspace.id, project.id, rule_id).await?,
    ))
}

pub async fn delete_alert_rule(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, project, rule_id)): Path<(String, String, Uuid)>,
) -> ApiResult<Json<OkResponse>> {
    m.require_owner()?;
    let project = resolve_project(&state, m.workspace.id, &project).await?;
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "DELETE FROM log_alert_rules WHERE workspace_id = $1 AND project_id = $2 AND id = $3",
            vec![m.workspace.id.into(), project.id.into(), rule_id.into()],
        ))
        .await?;
    Ok(Json(OkResponse { ok: true }))
}

pub async fn ingest(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Json<IngestResponse>> {
    if body.len() > state.config.log_ingest_max_body_bytes {
        return Err(ApiError::bad_request("log ingest body too large"));
    }
    let token = ingest_token_from_headers(&headers).ok_or(ApiError::Unauthorized)?;
    let token_hash = sha256_hex(&token);
    let target = find_token_project(&state, &token_hash).await?;
    let payload = parse_ingest_payload(&body)?;
    let events = normalize_payload(&payload, state.config.log_ingest_max_batch_events)
        .map_err(|error| ApiError::bad_request(error.to_string()))?;
    let accepted = events.len();
    if accepted == 0 {
        return Err(ApiError::bad_request("no log events supplied"));
    }

    let cache_events = events.clone();
    state
        .logs
        .append_with(
            token_storage_options(&state, &target),
            AppendBatch {
                workspace_id: target.workspace_id,
                project_id: target.project_id,
                events,
            },
        )
        .await
        .map_err(|error| {
            tracing::error!(project_id = %target.project_id, error = ?error, "log ingest write failed");
            ApiError::service_unavailable("log ingest failed")
        })?;

    if let Some(cache) = state.log_hot_cache.as_ref() {
        if let Err(error) = cache
            .append(target.workspace_id, target.project_id, &cache_events)
            .await
        {
            tracing::warn!(project_id = %target.project_id, error = ?error, "log hot cache append failed");
        }
    }

    record_ingest_usage(&state, &target, accepted, body.len()).await?;
    Ok(Json(IngestResponse {
        accepted,
        project_id: target.project_id,
    }))
}

fn parse_ingest_payload(body: &[u8]) -> ApiResult<serde_json::Value> {
    match serde_json::from_slice(body) {
        Ok(payload) => Ok(payload),
        Err(json_error) => {
            let body = std::str::from_utf8(body)
                .map_err(|_| ApiError::bad_request(format!("invalid JSON body: {json_error}")))?;
            json5::from_str(body).map_err(|json5_error| {
                ApiError::bad_request(format!(
                    "invalid JSON body: {json_error}; JSON5 fallback failed: {json5_error}"
                ))
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::parse_ingest_payload;

    #[test]
    fn parse_ingest_payload_accepts_json5_trailing_commas() {
        let payload = parse_ingest_payload(
            br#"{
                "level": "info",
                "message": "information",
                "service": "api",
            }"#,
        )
        .expect("payload should parse with json5 fallback");

        assert_eq!(payload["level"], "info");
        assert_eq!(payload["message"], "information");
        assert_eq!(payload["service"], "api");
    }
}

async fn load_projects(state: &AppState, workspace_id: Uuid) -> ApiResult<Vec<LogProjectView>> {
    Ok(LogProjectView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT p.id,
               p.workspace_id,
               p.bucket_id,
               b.name AS bucket_name,
               b.storage_uri AS bucket_storage_uri,
               p.slug,
               p.name,
               p.description,
               p.retention_days,
               p.created_at,
               p.updated_at,
               COALESCE(SUM(u.event_count) FILTER (WHERE u.bucket_start >= now() - interval '24 hours'), 0)::bigint AS event_count_24h,
               COALESCE(SUM(u.bytes_ingested) FILTER (WHERE u.bucket_start >= now() - interval '24 hours'), 0)::bigint AS bytes_ingested_24h,
               MAX(u.last_ingested_at) AS last_ingested_at
        FROM log_projects p
        LEFT JOIN log_storage_buckets b ON b.id = p.bucket_id
        LEFT JOIN log_usage_rollups u ON u.project_id = p.id
        WHERE p.workspace_id = $1
        GROUP BY p.id, b.id
        ORDER BY p.created_at DESC
        "#,
        vec![workspace_id.into()],
    ))
    .all(&state.db)
    .await?)
}

async fn resolve_project(
    state: &AppState,
    workspace_id: Uuid,
    ident: &str,
) -> ApiResult<LogProjectView> {
    let trimmed = ident.trim();
    let mut values: Vec<Value> = vec![workspace_id.into()];
    let predicate = if let Ok(id) = Uuid::parse_str(trimmed) {
        values.push(id.into());
        "p.id = $2"
    } else {
        let slug = trimmed.to_lowercase();
        if !slug::is_valid_slug(&slug) {
            return Err(ApiError::bad_request("invalid log project"));
        }
        values.push(slug.into());
        "p.slug = $2"
    };
    LogProjectView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        format!(
            r#"
            SELECT p.id,
                   p.workspace_id,
                   p.bucket_id,
                   b.name AS bucket_name,
                   b.storage_uri AS bucket_storage_uri,
                   p.slug,
                   p.name,
                   p.description,
                   p.retention_days,
                   p.created_at,
                   p.updated_at,
                   COALESCE(SUM(u.event_count) FILTER (WHERE u.bucket_start >= now() - interval '24 hours'), 0)::bigint AS event_count_24h,
                   COALESCE(SUM(u.bytes_ingested) FILTER (WHERE u.bucket_start >= now() - interval '24 hours'), 0)::bigint AS bytes_ingested_24h,
                   MAX(u.last_ingested_at) AS last_ingested_at
            FROM log_projects p
            LEFT JOIN log_storage_buckets b ON b.id = p.bucket_id
            LEFT JOIN log_usage_rollups u ON u.project_id = p.id
            WHERE p.workspace_id = $1 AND {predicate}
            GROUP BY p.id, b.id
            "#
        ),
        values,
    ))
    .one(&state.db)
    .await?
    .ok_or_else(|| ApiError::not_found("log project"))
}

async fn load_tokens(
    state: &AppState,
    workspace_id: Uuid,
    project_id: Uuid,
) -> ApiResult<Vec<LogIngestTokenView>> {
    Ok(
        LogIngestTokenView::find_by_statement(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
        SELECT id, workspace_id, project_id, name, token_prefix, last_used_at,
               expires_at, revoked_at, created_at
        FROM log_ingest_tokens
        WHERE workspace_id = $1 AND project_id = $2
        ORDER BY created_at DESC
        "#,
            vec![workspace_id.into(), project_id.into()],
        ))
        .all(&state.db)
        .await?,
    )
}

async fn load_token(
    state: &AppState,
    workspace_id: Uuid,
    project_id: Uuid,
    token_id: Uuid,
) -> ApiResult<LogIngestTokenView> {
    LogIngestTokenView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT id, workspace_id, project_id, name, token_prefix, last_used_at,
               expires_at, revoked_at, created_at
        FROM log_ingest_tokens
        WHERE workspace_id = $1 AND project_id = $2 AND id = $3
        "#,
        vec![workspace_id.into(), project_id.into(), token_id.into()],
    ))
    .one(&state.db)
    .await?
    .ok_or_else(|| ApiError::not_found("log ingest token"))
}

async fn load_alert_rules(
    state: &AppState,
    workspace_id: Uuid,
    project_id: Uuid,
) -> ApiResult<Vec<LogAlertRuleView>> {
    Ok(
        LogAlertRuleView::find_by_statement(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
        SELECT id, workspace_id, project_id, name, query, level, threshold_count,
               window_seconds, enabled, last_evaluated_at, last_fired_at,
               created_at, updated_at
        FROM log_alert_rules
        WHERE workspace_id = $1 AND project_id = $2
        ORDER BY created_at DESC
        "#,
            vec![workspace_id.into(), project_id.into()],
        ))
        .all(&state.db)
        .await?,
    )
}

async fn load_alert_rule(
    state: &AppState,
    workspace_id: Uuid,
    project_id: Uuid,
    rule_id: Uuid,
) -> ApiResult<LogAlertRuleView> {
    LogAlertRuleView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT id, workspace_id, project_id, name, query, level, threshold_count,
               window_seconds, enabled, last_evaluated_at, last_fired_at,
               created_at, updated_at
        FROM log_alert_rules
        WHERE workspace_id = $1 AND project_id = $2 AND id = $3
        "#,
        vec![workspace_id.into(), project_id.into(), rule_id.into()],
    ))
    .one(&state.db)
    .await?
    .ok_or_else(|| ApiError::not_found("log alert rule"))
}

async fn find_token_project(state: &AppState, token_hash: &str) -> ApiResult<TokenProject> {
    TokenProject::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT t.workspace_id,
               t.project_id,
               t.id AS token_id,
               b.storage_uri,
               b.region,
               b.endpoint,
               b.access_key_id,
               b.secret_access_key
        FROM log_ingest_tokens t
        JOIN log_projects p ON p.id = t.project_id
        LEFT JOIN log_storage_buckets b ON b.id = p.bucket_id
        WHERE t.token_hash = $1
          AND t.revoked_at IS NULL
          AND (t.expires_at IS NULL OR t.expires_at > now())
        "#,
        vec![token_hash.into()],
    ))
    .one(&state.db)
    .await?
    .ok_or(ApiError::Unauthorized)
}

async fn choose_log_bucket(state: &AppState) -> ApiResult<Option<Uuid>> {
    let configured = state
        .db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "SELECT COUNT(*)::bigint AS count FROM log_storage_buckets",
            Vec::<Value>::new(),
        ))
        .await?
        .and_then(|row| row.try_get::<i64>("", "count").ok())
        .unwrap_or(0);
    if configured == 0 {
        return Ok(None);
    }

    let bucket_id = state
        .db
        .query_one(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            SELECT b.id
            FROM log_storage_buckets b
            LEFT JOIN log_projects p ON p.bucket_id = b.id
            WHERE b.enabled = true
            GROUP BY b.id
            HAVING COUNT(p.id) < b.max_projects
            ORDER BY COUNT(p.id) ASC, b.created_at ASC
            LIMIT 1
            "#,
            Vec::<Value>::new(),
        ))
        .await?
        .and_then(|row| row.try_get::<Uuid>("", "id").ok());

    bucket_id
        .map(Some)
        .ok_or_else(|| ApiError::service_unavailable("no log storage bucket is available"))
}

async fn project_storage_options(
    state: &AppState,
    project_id: Uuid,
) -> ApiResult<Option<LogStoreOptions>> {
    let storage = ProjectStorage::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT b.storage_uri,
               b.region,
               b.endpoint,
               b.access_key_id,
               b.secret_access_key
        FROM log_projects p
        LEFT JOIN log_storage_buckets b ON b.id = p.bucket_id
        WHERE p.id = $1
        "#,
        vec![project_id.into()],
    ))
    .one(&state.db)
    .await?
    .ok_or_else(|| ApiError::not_found("log project"))?;

    Ok(storage_options(
        &state.config,
        storage.storage_uri,
        storage.region,
        storage.endpoint,
        storage.access_key_id,
        storage.secret_access_key,
    ))
}

fn token_storage_options(state: &AppState, target: &TokenProject) -> Option<LogStoreOptions> {
    storage_options(
        &state.config,
        target.storage_uri.clone(),
        target.region.clone(),
        target.endpoint.clone(),
        target.access_key_id.clone(),
        target.secret_access_key.clone(),
    )
}

fn storage_options(
    config: &crate::config::Config,
    storage_uri: Option<String>,
    region: Option<String>,
    endpoint: Option<String>,
    access_key_id: Option<String>,
    secret_access_key: Option<String>,
) -> Option<LogStoreOptions> {
    let storage_uri = storage_uri
        .map(|value| value.trim().trim_end_matches('/').to_owned())
        .filter(|value| !value.is_empty())?;
    Some(LogStoreOptions {
        storage_uri,
        duckdb_path: config
            .log_duckdb_path
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned()),
        s3_region: region.or_else(|| config.log_s3_region.clone()),
        s3_endpoint: endpoint.or_else(|| config.log_s3_endpoint.clone()),
        s3_access_key_id: access_key_id.or_else(|| config.log_s3_access_key_id.clone()),
        s3_secret_access_key: secret_access_key.or_else(|| config.log_s3_secret_access_key.clone()),
    })
}

fn log_storage_info(options: Option<&LogStoreOptions>, default: LogStorageInfo) -> LogStorageInfo {
    match options {
        Some(options) => LogStorageInfo {
            storage_uri: options.storage_uri.clone(),
            backend: if options.storage_uri.starts_with("s3://") {
                "s3"
            } else {
                "local"
            },
        },
        None => default,
    }
}

async fn record_ingest_usage(
    state: &AppState,
    target: &TokenProject,
    accepted: usize,
    bytes: usize,
) -> ApiResult<()> {
    let now = Utc::now().fixed_offset();
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE log_ingest_tokens
            SET last_used_at = $1
            WHERE id = $2
            "#,
            vec![now.into(), target.token_id.into()],
        ))
        .await?;
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO log_usage_rollups (
                workspace_id, project_id, bucket_start, event_count, bytes_ingested, last_ingested_at
            )
            VALUES ($1, $2, date_trunc('hour', $3::timestamptz), $4, $5, $3)
            ON CONFLICT (project_id, bucket_start)
            DO UPDATE SET
                event_count = log_usage_rollups.event_count + EXCLUDED.event_count,
                bytes_ingested = log_usage_rollups.bytes_ingested + EXCLUDED.bytes_ingested,
                last_ingested_at = GREATEST(log_usage_rollups.last_ingested_at, EXCLUDED.last_ingested_at)
            "#,
            vec![
                target.workspace_id.into(),
                target.project_id.into(),
                now.into(),
                (accepted as i64).into(),
                (bytes as i64).into(),
            ],
        ))
        .await?;
    Ok(())
}

fn ingest_token_from_headers(headers: &HeaderMap) -> Option<String> {
    if let Some(value) = headers.get("x-produktive-log-token") {
        return value.to_str().ok().map(|v| v.trim().to_owned());
    }
    let auth = headers
        .get(axum::http::header::AUTHORIZATION)?
        .to_str()
        .ok()?;
    auth.strip_prefix("Bearer ")
        .or_else(|| auth.strip_prefix("bearer "))
        .map(|v| v.trim().to_owned())
}

fn generate_ingest_token(id: Uuid) -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    format!(
        "plog_{}_{}",
        id.simple().to_string().chars().take(12).collect::<String>(),
        hex::encode(bytes)
    )
}
