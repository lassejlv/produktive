use axum::{
    extract::{Query, State},
    routing::get,
    Extension, Json, Router,
};
use chrono::{DateTime, FixedOffset};
use sea_orm::{DatabaseBackend, FromQueryResult, Statement};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{error::ApiResult, middleware::Membership, state::AppState};

pub fn routes() -> Router<AppState> {
    Router::new().route("/", get(list))
}

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct IncidentQuery {
    /// `open`, `resolved`, or `all`.
    pub status: Option<String>,
    pub limit: Option<u64>,
}

#[derive(Serialize, FromQueryResult, ToSchema)]
pub struct IncidentView {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub monitor_id: Uuid,
    pub monitor_name: String,
    pub monitor_slug: String,
    pub monitor_kind: String,
    pub status: String,
    pub severity: String,
    pub started_at: DateTime<FixedOffset>,
    pub last_seen_at: DateTime<FixedOffset>,
    pub resolved_at: Option<DateTime<FixedOffset>>,
    pub error_message: Option<String>,
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

    let rows = IncidentView::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT
            i.id,
            i.workspace_id,
            i.monitor_id,
            m.name AS monitor_name,
            m.slug AS monitor_slug,
            CASE m.kind
                WHEN 0 THEN 'http'
                WHEN 1 THEN 'tcp'
                WHEN 2 THEN 'ping'
                WHEN 3 THEN 'postgres'
                WHEN 4 THEN 'redis'
                WHEN 5 THEN 'ssh'
                ELSE 'unknown'
            END AS monitor_kind,
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
        JOIN monitors m ON m.id = i.monitor_id
        WHERE i.workspace_id = $1
          AND ($2 IS NULL OR i.status = $2)
        ORDER BY i.started_at DESC
        LIMIT $3
        "#,
        [m.workspace.id.into(), status_filter.into(), limit.into()],
    ))
    .all(&state.db)
    .await?;

    Ok(Json(rows))
}
