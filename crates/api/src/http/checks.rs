use axum::{
    extract::{Path, Query, State},
    routing::get,
    Extension, Json, Router,
};
use chrono::{DateTime, Duration, FixedOffset, Utc};
use sea_orm::{DatabaseBackend, FromQueryResult, Statement};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    http::monitors::resolve_monitor,
    middleware::Membership,
    state::AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/monitors/{id}/checks", get(list_checks))
        .route("/monitors/{id}/stats", get(stats))
}

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct CheckQuery {
    pub from: Option<DateTime<FixedOffset>>,
    pub to: Option<DateTime<FixedOffset>>,
    pub limit: Option<u64>,
    pub region: Option<String>,
}

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct StatsQuery {
    pub window: Option<String>,
    pub region: Option<String>,
}

#[derive(Serialize, FromQueryResult, ToSchema)]
pub struct CheckRow {
    pub time: DateTime<FixedOffset>,
    pub region_id: Option<Uuid>,
    pub region_slug: Option<String>,
    pub region_name: Option<String>,
    pub status: i16,
    pub latency_ms: Option<i32>,
    pub status_code: Option<i32>,
    pub error_message: Option<String>,
}

#[derive(Serialize, FromQueryResult)]
struct StatsRow {
    total: i64,
    up: i64,
    avg_latency_ms: Option<f64>,
}

#[derive(Serialize, ToSchema)]
pub struct StatsResponse {
    pub window_seconds: i64,
    pub total: i64,
    pub up: i64,
    pub down: i64,
    pub uptime_percent: f64,
    pub avg_latency_ms: Option<f64>,
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/monitors/{id}/checks",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("id" = String, Path, description = "monitor id or slug"),
        CheckQuery,
    ),
    responses(
        (status = 200, body = [CheckRow]),
        (status = 404, description = "Monitor not found"),
    ),
    security(("bearerAuth" = [])),
    tag = "checks"
)]
pub async fn list_checks(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, id)): Path<(String, String)>,
    Query(q): Query<CheckQuery>,
) -> ApiResult<Json<Vec<CheckRow>>> {
    let monitor = resolve_monitor(&state, m.workspace.id, &id).await?;
    let limit = q.limit.unwrap_or(200).min(5000) as i64;
    let from = q
        .from
        .unwrap_or((Utc::now() - Duration::hours(24)).fixed_offset());
    let to = q.to.unwrap_or(Utc::now().fixed_offset());

    let rows = CheckRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT c.time,
               c.region_id,
               r.slug AS region_slug,
               r.name AS region_name,
               c.status,
               c.latency_ms,
               c.status_code,
               c.error_message
        FROM checks c
        LEFT JOIN regions r ON r.id = c.region_id
        WHERE c.monitor_id = $1
          AND c.time >= $2
          AND c.time <= $3
          AND ($5::text IS NULL OR r.slug = $5)
        ORDER BY c.time DESC
        LIMIT $4
        "#,
        [
            monitor.id.into(),
            from.into(),
            to.into(),
            limit.into(),
            q.region.map(|region| region.trim().to_lowercase()).into(),
        ],
    ))
    .all(&state.db)
    .await?;

    Ok(Json(rows))
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/monitors/{id}/stats",
    params(
        ("wid" = String, Path, description = "workspace id or slug"),
        ("id" = String, Path, description = "monitor id or slug"),
        StatsQuery,
    ),
    responses(
        (status = 200, body = StatsResponse),
        (status = 400, description = "Invalid window"),
        (status = 404, description = "Monitor not found"),
    ),
    security(("bearerAuth" = [])),
    tag = "checks"
)]
pub async fn stats(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Path((_wid, id)): Path<(String, String)>,
    Query(q): Query<StatsQuery>,
) -> ApiResult<Json<StatsResponse>> {
    let monitor = resolve_monitor(&state, m.workspace.id, &id).await?;
    let window = parse_window(q.window.as_deref().unwrap_or("24h"))?;
    let from = (Utc::now() - window).fixed_offset();

    let row = StatsRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT
            COUNT(*)::bigint AS total,
            COUNT(*) FILTER (WHERE status = 1)::bigint AS up,
            AVG(latency_ms)::float8 AS avg_latency_ms
        FROM checks c
        LEFT JOIN regions r ON r.id = c.region_id
        WHERE c.monitor_id = $1
          AND c.time >= $2
          AND ($3::text IS NULL OR r.slug = $3)
        "#,
        [
            monitor.id.into(),
            from.into(),
            q.region.map(|region| region.trim().to_lowercase()).into(),
        ],
    ))
    .one(&state.db)
    .await?
    .unwrap_or(StatsRow {
        total: 0,
        up: 0,
        avg_latency_ms: None,
    });

    let uptime = if row.total == 0 {
        0.0
    } else {
        (row.up as f64 / row.total as f64) * 100.0
    };
    Ok(Json(StatsResponse {
        window_seconds: window.num_seconds(),
        total: row.total,
        up: row.up,
        down: row.total - row.up,
        uptime_percent: uptime,
        avg_latency_ms: row.avg_latency_ms,
    }))
}

fn parse_window(s: &str) -> ApiResult<Duration> {
    let (num, unit) = s.split_at(s.len().saturating_sub(1));
    let n: i64 = num
        .parse()
        .map_err(|_| ApiError::bad_request("invalid window"))?;
    let d = match unit {
        "s" => Duration::seconds(n),
        "m" => Duration::minutes(n),
        "h" => Duration::hours(n),
        "d" => Duration::days(n),
        _ => return Err(ApiError::bad_request("window unit must be s/m/h/d")),
    };
    Ok(d)
}
