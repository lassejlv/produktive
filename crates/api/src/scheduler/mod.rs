pub mod record;

use std::time::Duration;

use entity::monitor::MonitorKind;
use sea_orm::{DatabaseBackend, FromQueryResult, Statement};
use unstatus_probe::{ProbeOutcome, ProbeSpec};
use uuid::Uuid;

use crate::state::AppState;

pub struct DueProbe {
    pub lease_id: Uuid,
    pub region_id: Uuid,
    pub region_slug: String,
    pub spec: ProbeSpec,
}

#[derive(FromQueryResult)]
struct DueProbeRow {
    lease_id: Uuid,
    region_id: Uuid,
    region_slug: String,
    id: Uuid,
    workspace_id: Uuid,
    slug: String,
    name: String,
    kind: MonitorKind,
    target: String,
    interval_seconds: i32,
    timeout_ms: i32,
    expected_status: Option<i32>,
    expected_body_contains: Option<String>,
    dsl_source: Option<String>,
}

impl DueProbeRow {
    fn into_due_probe(self) -> DueProbe {
        DueProbe {
            lease_id: self.lease_id,
            region_id: self.region_id,
            region_slug: self.region_slug,
            spec: ProbeSpec {
                id: self.id,
                workspace_id: self.workspace_id,
                slug: self.slug,
                name: self.name,
                kind: self.kind,
                target: self.target,
                interval_seconds: self.interval_seconds,
                timeout_ms: self.timeout_ms,
                expected_status: self.expected_status,
                expected_body_contains: self.expected_body_contains,
                dsl_source: self.dsl_source,
            },
        }
    }
}

pub fn spawn(state: AppState) {
    if !state.config.api_local_worker_enabled {
        tracing::info!("local API worker disabled");
        return;
    }

    tokio::spawn(async move {
        let tick = Duration::from_millis(state.config.scheduler_tick_ms);
        let mut interval = tokio::time::interval(tick);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            if let Err(e) = run_once(&state).await {
                tracing::error!(error = ?e, "local worker tick failed");
            }
        }
    });
}

async fn run_once(state: &AppState) -> anyhow::Result<()> {
    let available = state.check_semaphore.available_permits() as u64;
    if available == 0 {
        return Ok(());
    }
    let limit = state.config.scheduler_max_due_per_tick.min(available) as i64;
    let due = claim_due_region(state, &state.config.local_region_slug, limit).await?;

    for job in due {
        let st = state.clone();
        let permit = st.check_semaphore.clone().acquire_owned().await?;
        tokio::spawn(async move {
            let monitor_id = job.spec.id;
            let outcome =
                unstatus_probe::run(&st.http, &job.spec, st.config.http_check_max_body_bytes)
                    .await
                    .compact();
            if let Err(e) =
                record::record(&st, monitor_id, job.region_id, Some(job.lease_id), outcome).await
            {
                tracing::error!(
                    error = ?e,
                    %monitor_id,
                    region = %job.region_slug,
                    "record check failed"
                );
            }
            drop(permit);
        });
    }
    Ok(())
}

pub async fn claim_due_region(
    state: &AppState,
    region_slug: &str,
    limit: i64,
) -> anyhow::Result<Vec<DueProbe>> {
    let mut jobs = Vec::new();
    for _ in 0..limit {
        let lease_id = Uuid::now_v7();
        let Some(row) = claim_one_due_region(state, region_slug, lease_id).await? else {
            break;
        };
        jobs.push(row.into_due_probe());
    }
    Ok(jobs)
}

async fn claim_one_due_region(
    state: &AppState,
    region_slug: &str,
    lease_id: Uuid,
) -> anyhow::Result<Option<DueProbeRow>> {
    let lease_seconds = state.config.worker_lease_seconds as i64;
    let row = DueProbeRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        WITH candidate AS (
            SELECT s.monitor_id, s.region_id
            FROM monitor_region_states s
            JOIN monitor_regions mr
              ON mr.monitor_id = s.monitor_id AND mr.region_id = s.region_id
            JOIN regions r ON r.id = s.region_id
            JOIN monitors m ON m.id = s.monitor_id
            WHERE r.slug = $1
              AND r.enabled = true
              AND mr.enabled = true
              AND m.enabled = true
              AND m.billing_paused_at IS NULL
              AND (
                s.lease_expires_at IS NULL
                OR s.lease_expires_at < now()
              )
              AND (
                s.last_checked_at IS NULL
                OR s.last_checked_at + (m.interval_seconds || ' seconds')::interval < now()
              )
            ORDER BY s.last_checked_at NULLS FIRST, m.created_at
            LIMIT 1
            FOR UPDATE OF s SKIP LOCKED
        )
        UPDATE monitor_region_states s
        SET lease_id = $2,
            lease_expires_at = now() + ($3 || ' seconds')::interval,
            updated_at = now()
        FROM candidate c
        JOIN monitors m ON m.id = c.monitor_id
        JOIN regions r ON r.id = c.region_id
        WHERE s.monitor_id = c.monitor_id
          AND s.region_id = c.region_id
        RETURNING
            s.lease_id,
            r.id AS region_id,
            r.slug AS region_slug,
            m.id,
            m.workspace_id,
            m.slug,
            m.name,
            m.kind,
            m.target,
            m.interval_seconds,
            m.timeout_ms,
            m.expected_status,
            m.expected_body_contains,
            m.dsl_source
        "#,
        [region_slug.into(), lease_id.into(), lease_seconds.into()],
    ))
    .one(&state.db)
    .await?;
    Ok(row)
}

#[derive(FromQueryResult)]
pub struct LeaseRow {
    pub monitor_id: Uuid,
    pub region_id: Uuid,
    pub region_slug: String,
}

pub async fn resolve_active_lease(
    state: &AppState,
    lease_id: Uuid,
) -> anyhow::Result<Option<LeaseRow>> {
    let row = LeaseRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT s.monitor_id, s.region_id, r.slug AS region_slug
        FROM monitor_region_states s
        JOIN regions r ON r.id = s.region_id
        WHERE s.lease_id = $1
          AND s.lease_expires_at >= now()
        "#,
        [lease_id.into()],
    ))
    .one(&state.db)
    .await?;
    Ok(row)
}

pub fn outcome_from_worker(
    status: i16,
    latency_ms: Option<i32>,
    status_code: Option<i32>,
    error: Option<String>,
) -> ProbeOutcome {
    ProbeOutcome {
        status,
        latency_ms,
        status_code,
        error,
        body: None,
        headers: None,
    }
}
