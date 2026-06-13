use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::post,
    Json, Router,
};
use sea_orm::{ConnectionTrait, DatabaseBackend, Statement};
use serde::{Deserialize, Serialize};
use unstatus_probe::ProbeSpec;
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    scheduler,
    state::AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/heartbeat", post(heartbeat))
        .route("/jobs/claim", post(claim_jobs))
        .route("/jobs/{lease_id}/result", post(submit_result))
}

#[derive(Deserialize)]
pub struct HeartbeatBody {
    pub region_slug: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub capabilities: Vec<String>,
}

#[derive(Serialize)]
pub struct HeartbeatResponse {
    pub ok: bool,
}

#[derive(Deserialize)]
pub struct ClaimJobsBody {
    pub region_slug: String,
    #[serde(default)]
    pub max_jobs: Option<u64>,
}

#[derive(Serialize)]
pub struct ClaimJobsResponse {
    pub jobs: Vec<WorkerJob>,
}

#[derive(Serialize)]
pub struct WorkerJob {
    pub lease_id: Uuid,
    pub region_slug: String,
    pub max_body_bytes: usize,
    pub monitor: ProbeSpec,
}

#[derive(Deserialize)]
pub struct SubmitResultBody {
    pub status: i16,
    #[serde(default)]
    pub latency_ms: Option<i32>,
    #[serde(default)]
    pub status_code: Option<i32>,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct SubmitResultResponse {
    pub ok: bool,
}

async fn heartbeat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<HeartbeatBody>,
) -> ApiResult<Json<HeartbeatResponse>> {
    let slug = normalize_region_slug(&body.region_slug)?;
    authorize_worker_for_region(&state, &headers, &slug)?;
    let capabilities = if body.capabilities.is_empty() {
        vec![
            "http".to_string(),
            "tcp".to_string(),
            "postgres".to_string(),
            "redis".to_string(),
            "ssh".to_string(),
        ]
    } else {
        normalize_capabilities(body.capabilities)
    };
    let name = body
        .name
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| slug.clone());
    let version = body.version.map(|version| version.trim().to_string());
    let capabilities =
        serde_json::to_value(capabilities).map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?;

    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO regions (
                id, slug, name, enabled, heartbeat_at, version, capabilities, created_at, updated_at
            )
            VALUES ($1, $2, $3, true, now(), $4, $5, now(), now())
            ON CONFLICT (slug) DO UPDATE
            SET name = EXCLUDED.name,
                enabled = true,
                heartbeat_at = EXCLUDED.heartbeat_at,
                version = EXCLUDED.version,
                capabilities = EXCLUDED.capabilities,
                updated_at = now()
            "#,
            [
                Uuid::now_v7().into(),
                slug.into(),
                name.into(),
                version.into(),
                capabilities.into(),
            ],
        ))
        .await?;

    Ok(Json(HeartbeatResponse { ok: true }))
}

async fn claim_jobs(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ClaimJobsBody>,
) -> ApiResult<Json<ClaimJobsResponse>> {
    let region_slug = normalize_region_slug(&body.region_slug)?;
    authorize_worker_for_region(&state, &headers, &region_slug)?;
    let max_jobs = body.max_jobs.unwrap_or(16).clamp(1, 128);
    let jobs = scheduler::claim_due_region(&state, &region_slug, max_jobs as i64)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?
        .into_iter()
        .map(|job| WorkerJob {
            lease_id: job.lease_id,
            region_slug: job.region_slug,
            max_body_bytes: state.config.http_check_max_body_bytes,
            monitor: job.spec,
        })
        .collect();

    Ok(Json(ClaimJobsResponse { jobs }))
}

async fn submit_result(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(lease_id): Path<Uuid>,
    Json(body): Json<SubmitResultBody>,
) -> ApiResult<Json<SubmitResultResponse>> {
    if !matches!(body.status, 0..=2) {
        return Err(ApiError::bad_request("status must be 0, 1, or 2"));
    }
    let lease = scheduler::resolve_active_lease(&state, lease_id)
        .await
        .map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?
        .ok_or_else(|| ApiError::conflict("check lease is no longer active"))?;
    authorize_worker_for_region(&state, &headers, &lease.region_slug)?;
    let outcome =
        scheduler::outcome_from_worker(body.status, body.latency_ms, body.status_code, body.error);
    scheduler::record::record(
        &state,
        lease.monitor_id,
        lease.region_id,
        Some(lease_id),
        outcome,
    )
    .await
    .map_err(|e| ApiError::conflict(e.to_string()))?;

    Ok(Json(SubmitResultResponse { ok: true }))
}

fn authorize_worker_for_region(
    state: &AppState,
    headers: &HeaderMap,
    region_slug: &str,
) -> ApiResult<()> {
    let Some(expected) = state.config.worker_token_for_region(region_slug) else {
        return Err(ApiError::service_unavailable(
            "worker auth is not configured for this region",
        ));
    };
    let token = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .or_else(|| {
            headers
                .get("x-worker-token")
                .and_then(|value| value.to_str().ok())
        })
        .ok_or(ApiError::Unauthorized)?;
    if token != expected {
        return Err(ApiError::Unauthorized);
    }
    Ok(())
}

fn normalize_region_slug(slug: &str) -> ApiResult<String> {
    let slug = slug.trim().to_lowercase();
    let valid = !slug.is_empty()
        && slug.len() <= 64
        && slug
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if !valid {
        return Err(ApiError::bad_request("invalid region slug"));
    }
    Ok(slug)
}

fn normalize_capabilities(capabilities: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    capabilities
        .into_iter()
        .map(|capability| capability.trim().to_lowercase())
        .filter(|capability| !capability.is_empty())
        .filter(|capability| seen.insert(capability.clone()))
        .collect()
}
