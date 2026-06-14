use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Extension, Json, Router,
};
use chrono::{DateTime, FixedOffset, Utc};
use sea_orm::{ConnectionTrait, DatabaseBackend, FromQueryResult, Statement};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    middleware::Membership,
    state::AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/{id}/updates", post(add_update))
}

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct IncidentQuery {
    /// `open`, `resolved`, or `all`.
    pub status: Option<String>,
    pub limit: Option<u64>,
}

#[derive(Deserialize, ToSchema)]
pub struct CreateIncidentBody {
    pub title: String,
    pub message: String,
    #[serde(default)]
    pub severity: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct IncidentUpdateBody {
    pub message: String,
    /// `investigating`, `identified`, `monitoring`, or `resolved`.
    #[serde(default)]
    pub status: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct IncidentView {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub monitor_id: Option<Uuid>,
    pub monitor_name: Option<String>,
    pub monitor_slug: Option<String>,
    pub monitor_kind: Option<String>,
    pub title: String,
    pub source: String,
    pub status: String,
    pub severity: String,
    pub started_at: DateTime<FixedOffset>,
    pub last_seen_at: DateTime<FixedOffset>,
    pub resolved_at: Option<DateTime<FixedOffset>>,
    pub error_message: Option<String>,
    pub updates: Vec<IncidentUpdateView>,
}

#[derive(Serialize, FromQueryResult, ToSchema, Clone)]
pub struct IncidentUpdateView {
    pub id: Uuid,
    pub incident_id: Uuid,
    pub status: String,
    pub message: String,
    pub created_by: Option<Uuid>,
    pub created_at: DateTime<FixedOffset>,
}

#[derive(FromQueryResult)]
struct IncidentRow {
    id: Uuid,
    workspace_id: Uuid,
    monitor_id: Option<Uuid>,
    monitor_name: Option<String>,
    monitor_slug: Option<String>,
    monitor_kind: Option<String>,
    title: String,
    source: String,
    status: String,
    severity: String,
    started_at: DateTime<FixedOffset>,
    last_seen_at: DateTime<FixedOffset>,
    resolved_at: Option<DateTime<FixedOffset>>,
    error_message: Option<String>,
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/incidents",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        IncidentQuery,
    ),
    responses((status = 200, body = [IncidentView])),
    security(("bearerAuth" = [])),
    tag = "incidents"
)]
pub async fn list(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Query(q): Query<IncidentQuery>,
) -> ApiResult<Json<Vec<IncidentView>>> {
    let status_filter = match q.status.as_deref() {
        Some("open") => Some(0i16),
        Some("resolved") => Some(1i16),
        _ => None,
    };
    let limit = q.limit.unwrap_or(100).min(500) as i64;
    let rows = incident_rows(&state, m.workspace.id, status_filter, limit).await?;
    let updates = updates_for(&state, m.workspace.id, &rows).await?;
    Ok(Json(attach_updates(rows, updates)))
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/incidents",
    params(("wid" = String, Path, description = "workspace id or slug")),
    request_body = CreateIncidentBody,
    responses((status = 200, body = IncidentView)),
    security(("bearerAuth" = [])),
    tag = "incidents"
)]
pub async fn create(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    auth: AuthUser,
    Json(body): Json<CreateIncidentBody>,
) -> ApiResult<Json<IncidentView>> {
    let title = clean_text(body.title, 3, 160, "title")?;
    let message = clean_text(body.message, 1, 4_000, "message")?;
    let severity = parse_severity(body.severity.as_deref())?;
    let now = Utc::now().fixed_offset();
    let incident_id = Uuid::now_v7();
    let update_id = Uuid::now_v7();

    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO incidents (
                id, workspace_id, monitor_id, title, source, status, severity,
                started_at, last_seen_at, resolved_at, error_message, created_at, updated_at
            )
            VALUES ($1, $2, NULL, $3, 1, 0, $4, $5, $5, NULL, $6, $5, $5)
            "#,
            [
                incident_id.into(),
                m.workspace.id.into(),
                title.into(),
                severity.into(),
                now.into(),
                message.clone().into(),
            ],
        ))
        .await?;

    insert_update(
        &state,
        m.workspace.id,
        incident_id,
        update_id,
        0,
        message,
        Some(auth.user.id),
        now,
    )
    .await?;

    Ok(Json(
        load_incident(&state, m.workspace.id, incident_id).await?,
    ))
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/incidents/{id}/updates",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("id" = Uuid, Path, description = "incident id"),
    ),
    request_body = IncidentUpdateBody,
    responses((status = 200, body = IncidentView)),
    security(("bearerAuth" = [])),
    tag = "incidents"
)]
pub async fn add_update(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<IncidentUpdateBody>,
) -> ApiResult<Json<IncidentView>> {
    let message = clean_text(body.message, 1, 4_000, "message")?;
    let update_status = parse_update_status(body.status.as_deref())?;
    let now = Utc::now().fixed_offset();

    let row = incident_row(&state, m.workspace.id, id)
        .await?
        .ok_or_else(|| ApiError::not_found("incident not found"))?;
    if row.status == "resolved" {
        return Err(ApiError::bad_request("incident is already resolved"));
    }

    insert_update(
        &state,
        m.workspace.id,
        id,
        Uuid::now_v7(),
        update_status,
        message.clone(),
        Some(auth.user.id),
        now,
    )
    .await?;

    let (incident_status, resolved_at) = if update_status == 3 {
        (1i16, Some(now))
    } else {
        (0i16, None)
    };
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE incidents
            SET status = $3,
                last_seen_at = $4,
                resolved_at = COALESCE($5, resolved_at),
                error_message = $6,
                updated_at = $4
            WHERE id = $1
              AND workspace_id = $2
            "#,
            [
                id.into(),
                m.workspace.id.into(),
                incident_status.into(),
                now.into(),
                resolved_at.into(),
                message.into(),
            ],
        ))
        .await?;

    Ok(Json(load_incident(&state, m.workspace.id, id).await?))
}

async fn incident_rows(
    state: &AppState,
    workspace_id: Uuid,
    status_filter: Option<i16>,
    limit: i64,
) -> ApiResult<Vec<IncidentRow>> {
    let rows = IncidentRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT
            i.id,
            i.workspace_id,
            i.monitor_id,
            m.name AS monitor_name,
            m.slug AS monitor_slug,
            CASE
                WHEN m.id IS NULL THEN NULL
                WHEN m.kind = 0 THEN 'http'
                WHEN m.kind = 1 THEN 'tcp'
                WHEN m.kind = 2 THEN 'ping'
                WHEN m.kind = 3 THEN 'postgres'
                WHEN m.kind = 4 THEN 'redis'
                WHEN m.kind = 5 THEN 'ssh'
                ELSE 'unknown'
            END AS monitor_kind,
            i.title,
            CASE i.source
                WHEN 1 THEN 'manual'
                ELSE 'automatic'
            END AS source,
            CASE i.status
                WHEN 0 THEN 'open'
                WHEN 1 THEN 'resolved'
                ELSE 'unknown'
            END AS status,
            CASE i.severity
                WHEN 0 THEN 'down'
                WHEN 2 THEN 'degraded'
                ELSE 'unknown'
            END AS severity,
            i.started_at,
            i.last_seen_at,
            i.resolved_at,
            i.error_message
        FROM incidents i
        LEFT JOIN monitors m ON m.id = i.monitor_id
        WHERE i.workspace_id = $1
          AND ($2 IS NULL OR i.status = $2)
        ORDER BY i.started_at DESC
        LIMIT $3
        "#,
        [workspace_id.into(), status_filter.into(), limit.into()],
    ))
    .all(&state.db)
    .await?;

    Ok(rows)
}

async fn incident_row(
    state: &AppState,
    workspace_id: Uuid,
    incident_id: Uuid,
) -> ApiResult<Option<IncidentRow>> {
    let rows = IncidentRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT
            i.id,
            i.workspace_id,
            i.monitor_id,
            m.name AS monitor_name,
            m.slug AS monitor_slug,
            CASE
                WHEN m.id IS NULL THEN NULL
                WHEN m.kind = 0 THEN 'http'
                WHEN m.kind = 1 THEN 'tcp'
                WHEN m.kind = 2 THEN 'ping'
                WHEN m.kind = 3 THEN 'postgres'
                WHEN m.kind = 4 THEN 'redis'
                WHEN m.kind = 5 THEN 'ssh'
                ELSE 'unknown'
            END AS monitor_kind,
            i.title,
            CASE i.source
                WHEN 1 THEN 'manual'
                ELSE 'automatic'
            END AS source,
            CASE i.status
                WHEN 0 THEN 'open'
                WHEN 1 THEN 'resolved'
                ELSE 'unknown'
            END AS status,
            CASE i.severity
                WHEN 0 THEN 'down'
                WHEN 2 THEN 'degraded'
                ELSE 'unknown'
            END AS severity,
            i.started_at,
            i.last_seen_at,
            i.resolved_at,
            i.error_message
        FROM incidents i
        LEFT JOIN monitors m ON m.id = i.monitor_id
        WHERE i.workspace_id = $1
          AND i.id = $2
        LIMIT 1
        "#,
        [workspace_id.into(), incident_id.into()],
    ))
    .one(&state.db)
    .await?;

    Ok(rows)
}

async fn load_incident(
    state: &AppState,
    workspace_id: Uuid,
    incident_id: Uuid,
) -> ApiResult<IncidentView> {
    let row = incident_row(state, workspace_id, incident_id)
        .await?
        .ok_or_else(|| ApiError::not_found("incident not found"))?;
    let rows = vec![row];
    let updates = updates_for(state, workspace_id, &rows).await?;
    attach_updates(rows, updates)
        .into_iter()
        .next()
        .ok_or_else(|| ApiError::not_found("incident not found"))
}

async fn updates_for(
    state: &AppState,
    workspace_id: Uuid,
    incidents: &[IncidentRow],
) -> ApiResult<Vec<IncidentUpdateView>> {
    if incidents.is_empty() {
        return Ok(Vec::new());
    }
    let ids: Vec<Uuid> = incidents.iter().map(|row| row.id).collect();
    let rows = IncidentUpdateView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT
            id,
            incident_id,
            CASE status
                WHEN 0 THEN 'investigating'
                WHEN 1 THEN 'identified'
                WHEN 2 THEN 'monitoring'
                WHEN 3 THEN 'resolved'
                ELSE 'unknown'
            END AS status,
            message,
            created_by,
            created_at
        FROM incident_updates
        WHERE workspace_id = $1
          AND incident_id = ANY($2)
        ORDER BY created_at ASC
        "#,
        [workspace_id.into(), ids.into()],
    ))
    .all(&state.db)
    .await?;
    Ok(rows)
}

async fn insert_update(
    state: &AppState,
    workspace_id: Uuid,
    incident_id: Uuid,
    update_id: Uuid,
    status: i16,
    message: String,
    created_by: Option<Uuid>,
    now: DateTime<FixedOffset>,
) -> ApiResult<()> {
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO incident_updates (
                id, workspace_id, incident_id, status, message, created_by, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            "#,
            [
                update_id.into(),
                workspace_id.into(),
                incident_id.into(),
                status.into(),
                message.into(),
                created_by.into(),
                now.into(),
            ],
        ))
        .await?;
    Ok(())
}

fn attach_updates(rows: Vec<IncidentRow>, updates: Vec<IncidentUpdateView>) -> Vec<IncidentView> {
    rows.into_iter()
        .map(|row| IncidentView {
            updates: updates
                .iter()
                .filter(|update| update.incident_id == row.id)
                .cloned()
                .collect(),
            id: row.id,
            workspace_id: row.workspace_id,
            monitor_id: row.monitor_id,
            monitor_name: row.monitor_name,
            monitor_slug: row.monitor_slug,
            monitor_kind: row.monitor_kind,
            title: row.title,
            source: row.source,
            status: row.status,
            severity: row.severity,
            started_at: row.started_at,
            last_seen_at: row.last_seen_at,
            resolved_at: row.resolved_at,
            error_message: row.error_message,
        })
        .collect()
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

fn parse_severity(raw: Option<&str>) -> ApiResult<i16> {
    match raw.unwrap_or("degraded") {
        "down" => Ok(0),
        "degraded" => Ok(2),
        _ => Err(ApiError::bad_request("severity must be down or degraded")),
    }
}

fn parse_update_status(raw: Option<&str>) -> ApiResult<i16> {
    match raw.unwrap_or("monitoring") {
        "investigating" => Ok(0),
        "identified" => Ok(1),
        "monitoring" => Ok(2),
        "resolved" => Ok(3),
        _ => Err(ApiError::bad_request(
            "status must be investigating, identified, monitoring, or resolved",
        )),
    }
}
