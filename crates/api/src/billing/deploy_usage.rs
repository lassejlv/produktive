//! Deployment usage metering helpers — compute preset-allocated GB-seconds /
//! vCPU-seconds and volume GB-seconds over a sweep window, scoped to a billing
//! customer (the owner's personal workspace, like the rest of billing).
//!
//! The SQL math stays second-precision so start/stop timestamps can be clipped
//! exactly. The sweep converts these totals to fractional GB-hours / vCPU-hours
//! before sending usage to Polar, matching the live hourly unit prices while
//! preserving per-second billing.
//!
//! These are pure compute + SQL helpers. The actual Polar ingest lives in
//! [`super::deploy_sweep`], which calls these and turns the deltas into
//! `EventCreate` events.

use chrono::{DateTime, Utc};
use deploy::ResourcePreset;
use sea_orm::{DatabaseBackend, FromQueryResult, Statement};
use uuid::Uuid;

use crate::{billing::billing_customer_workspace_id, error::ApiResult, state::AppState};

/// Polar deployment status codes that count as billable compute runtime.
/// Queued(0) has no `started_at`; Stopped(9)/Failed(6)/RolledBack(8) close via
/// `finished_at`. See `crates/deploy/src/state.rs`.
const BILLABLE_DEPLOYMENT_STATUSES: [i16; 5] = [
    1, // Provisioning
    2, // Pulling
    3, // Starting
    4, // Healthy
    5, // Live
];

/// What resource to sum for [`compute_compute_seconds`].
#[derive(Clone, Copy, Debug)]
pub enum ComputeKind {
    /// GB-seconds: preset memory / 1024, multiplied by seconds occupied.
    Memory,
    /// vCPU-seconds: preset cpu count, multiplied by seconds occupied.
    Cpu,
}

/// Allocated memory in GB for a preset — the factor used to build internal
/// second-precision GB-second totals. [`super::deploy_sweep`] converts those
/// totals to GB-hours before Polar ingest.
pub fn preset_memory_gb(preset: ResourcePreset) -> f64 {
    preset.memory_mb() as f64 / 1024.0
}

/// Allocated vCPUs for a preset — the factor used to build internal
/// second-precision vCPU-second totals. [`super::deploy_sweep`] converts those
/// totals to vCPU-hours before Polar ingest.
pub fn preset_vcpus(preset: ResourcePreset) -> f64 {
    preset.cpus() as f64
}

/// Per-preset rate for a compute kind: GB for memory, vCPUs for cpu.
pub fn preset_rate(preset: ResourcePreset, kind: ComputeKind) -> f64 {
    match kind {
        ComputeKind::Memory => preset_memory_gb(preset),
        ComputeKind::Cpu => preset_vcpus(preset),
    }
}

/// Seconds a deployment occupied during `[window_start, window_end)`, clipped to
/// the window. `started_at` opens the interval; `finished_at` (or `window_end`
/// when the deployment is still running) closes it. Returns 0 if the deployment
/// didn't overlap the window or hasn't started yet.
pub fn windowed_seconds(
    started_at: Option<DateTime<Utc>>,
    finished_at: Option<DateTime<Utc>>,
    status: i16,
    window_start: DateTime<Utc>,
    window_end: DateTime<Utc>,
) -> f64 {
    let Some(start) = started_at else {
        return 0.0; // Queued, never claimed
    };
    // For still-running billable statuses, the runtime interval is open even
    // if `finished_at` was set when the deployment reached live.
    let end = if BILLABLE_DEPLOYMENT_STATUSES.contains(&status) {
        window_end
    } else {
        match finished_at {
            Some(f) => f,
            None => return 0.0, // no finished_at on a terminal status — nothing billable
        }
    };
    if end <= start {
        return 0.0;
    }
    let clipped_start = start.max(window_start);
    let clipped_end = end.min(window_end);
    if clipped_end <= clipped_start {
        return 0.0;
    }
    (clipped_end - clipped_start).num_milliseconds() as f64 / 1_000.0
}

/// Volume GB-seconds occupied during `[window_start, window_end)`, clipped to the
/// window. `provisioned_at` opens the interval — the moment the volume was
/// actually allocated on the provider, not row-insert time — so a queued or
/// never-provisioned volume (`provisioned_at` None) bills nothing, mirroring how
/// [`windowed_seconds`] gates on a deployment's `started_at`. `deleted_at` (or
/// `window_end` if still alive) closes.
pub fn windowed_volume_seconds(
    provisioned_at: Option<DateTime<Utc>>,
    deleted_at: Option<DateTime<Utc>>,
    window_start: DateTime<Utc>,
    window_end: DateTime<Utc>,
) -> f64 {
    let Some(start) = provisioned_at else {
        return 0.0; // queued / never provisioned on the provider
    };
    let end = deleted_at.unwrap_or(window_end);
    if end <= start {
        return 0.0;
    }
    let clipped_start = start.max(window_start);
    let clipped_end = end.min(window_end);
    if clipped_end <= clipped_start {
        return 0.0;
    }
    (clipped_end - clipped_start).num_milliseconds() as f64 / 1_000.0
}

/// Sum of compute seconds (GB-seconds or vCPU-seconds) across all deployments of
/// the billing customer behind `workspace_id`, over `[window_start, window_end)`.
/// Aggregates across every workspace the owner has, like the rest of billing.
pub async fn compute_compute_seconds(
    state: &AppState,
    workspace_id: Uuid,
    window_start: DateTime<Utc>,
    window_end: DateTime<Utc>,
    kind: ComputeKind,
) -> ApiResult<f64> {
    let billing_workspace_id = billing_customer_workspace_id(state, workspace_id).await?;

    let rows = DeploymentUsageRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT
            d.status           AS status,
            d.started_at       AS started_at,
            d.finished_at      AS finished_at,
            COALESCE(d.config_snapshot->>'resource_preset', s.resource_preset) AS resource_preset,
            COALESCE((d.config_snapshot->>'machine_count')::INTEGER, s.machine_count, 1) AS machine_count
        FROM deployments d
        JOIN deploy_services s ON s.id = d.service_id
        JOIN workspaces owned ON owned.id = s.workspace_id
        JOIN workspaces billing_ws ON billing_ws.owner_id = owned.owner_id
        WHERE billing_ws.id = $1
          AND d.started_at IS NOT NULL
          AND d.started_at < $3
          AND CASE
                WHEN d.status IN (1, 2, 3, 4, 5) THEN $3
                ELSE COALESCE(d.finished_at, $3)
              END > $2
        "#,
        [
            billing_workspace_id.into(),
            window_start.fixed_offset().into(),
            window_end.fixed_offset().into(),
        ],
    ))
    .all(&state.db)
    .await?;

    let mut total = 0.0;
    for row in rows {
        let Ok(preset) = ResourcePreset::parse(&row.resource_preset) else {
            continue;
        };
        let seconds = windowed_seconds(
            row.started_at.map(|d| d.with_timezone(&Utc)),
            row.finished_at.map(|d| d.with_timezone(&Utc)),
            row.status,
            window_start,
            window_end,
        );
        total += seconds * preset_rate(preset, kind) * f64::from(row.machine_count.max(1));
    }
    Ok(total)
}

/// Sum of volume GB-seconds across all volumes owned by the billing customer
/// behind `workspace_id`, over `[window_start, window_end)`.
pub async fn compute_volume_gb_seconds(
    state: &AppState,
    workspace_id: Uuid,
    window_start: DateTime<Utc>,
    window_end: DateTime<Utc>,
) -> ApiResult<f64> {
    let billing_workspace_id = billing_customer_workspace_id(state, workspace_id).await?;

    let rows = VolumeUsageRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT
            v.size_gb        AS size_gb,
            v.provisioned_at AS provisioned_at,
            v.deleted_at     AS deleted_at
        FROM deploy_service_volumes v
        JOIN deploy_services s ON s.id = v.service_id
        JOIN workspaces owned ON owned.id = s.workspace_id
        JOIN workspaces billing_ws ON billing_ws.owner_id = owned.owner_id
        WHERE billing_ws.id = $1
          AND v.provisioned_at IS NOT NULL
          AND v.provisioned_at < $3
          AND COALESCE(v.deleted_at, $3) > $2
        "#,
        [
            billing_workspace_id.into(),
            window_start.fixed_offset().into(),
            window_end.fixed_offset().into(),
        ],
    ))
    .all(&state.db)
    .await?;

    let mut total = 0.0;
    for row in rows {
        let seconds = windowed_volume_seconds(
            row.provisioned_at.map(|d| d.with_timezone(&Utc)),
            row.deleted_at.map(|d| d.with_timezone(&Utc)),
            window_start,
            window_end,
        );
        total += seconds * row.size_gb as f64;
    }
    Ok(total)
}

/// All billing-customer workspaces (personal workspaces) — the units the deploy
/// usage sweep iterates over. Each owner's usage aggregates onto their personal
/// workspace's Polar customer.
pub async fn billing_customer_workspaces(state: &AppState) -> ApiResult<Vec<Uuid>> {
    let rows = WorkspaceIdRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"SELECT id FROM workspaces WHERE is_personal = true ORDER BY id"#,
        [],
    ))
    .all(&state.db)
    .await?;
    Ok(rows.into_iter().map(|r| r.id).collect())
}

/// Deterministic Polar event dedup key for a single sweep window. Re-running the
/// same window yields the same key, so Polar counts it at most once.
pub fn deploy_usage_event_key(
    feature: &str,
    billing_workspace_id: Uuid,
    window_start: DateTime<Utc>,
    window_end: DateTime<Utc>,
) -> String {
    format!(
        "deploy-usage-{feature}-{billing_workspace_id}-{}-{}",
        window_start.timestamp(),
        window_end.timestamp()
    )
}

#[derive(FromQueryResult)]
struct DeploymentUsageRow {
    status: i16,
    started_at: Option<chrono::DateTime<chrono::FixedOffset>>,
    finished_at: Option<chrono::DateTime<chrono::FixedOffset>>,
    resource_preset: String,
    machine_count: i32,
}

#[derive(FromQueryResult)]
struct VolumeUsageRow {
    size_gb: i32,
    provisioned_at: Option<chrono::DateTime<chrono::FixedOffset>>,
    deleted_at: Option<chrono::DateTime<chrono::FixedOffset>>,
}

#[derive(FromQueryResult)]
struct WorkspaceIdRow {
    id: Uuid,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn ts(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(secs, 0).unwrap()
    }

    #[test]
    fn preset_memory_gb_converts_mb_to_gb() {
        assert_eq!(preset_memory_gb(ResourcePreset::PreviewSmall), 0.5);
        assert_eq!(preset_memory_gb(ResourcePreset::PreviewMedium), 1.0);
        assert_eq!(preset_memory_gb(ResourcePreset::PreviewLarge), 2.0);
    }

    #[test]
    fn preset_vcpus_matches_preset_cpus() {
        assert_eq!(preset_vcpus(ResourcePreset::PreviewSmall), 1.0);
        assert_eq!(preset_vcpus(ResourcePreset::PreviewLarge), 2.0);
    }

    #[test]
    fn machine_count_multiplies_compute_seconds() {
        let seconds = 60.0;
        let machines = 3;
        let preset = ResourcePreset::PreviewMedium;
        assert_eq!(
            seconds * preset_rate(preset, ComputeKind::Memory) * f64::from(machines),
            180.0
        );
        assert_eq!(
            seconds * preset_rate(preset, ComputeKind::Cpu) * f64::from(machines),
            180.0
        );
    }

    #[test]
    fn windowed_seconds_full_window_running_live() {
        let start = ts(0);
        let end = ts(3600);
        // Live across the whole window, no finished_at → end = window_end.
        let s = windowed_seconds(Some(ts(0)), None, 5, start, end);
        assert!((s - 3600.0).abs() < 1e-9);
    }

    #[test]
    fn windowed_seconds_starts_mid_window() {
        let start = ts(0);
        let end = ts(3600);
        let s = windowed_seconds(Some(ts(1800)), None, 5, start, end);
        assert!((s - 1800.0).abs() < 1e-9);
    }

    #[test]
    fn windowed_seconds_stops_mid_window() {
        let start = ts(0);
        let end = ts(3600);
        let s = windowed_seconds(Some(ts(0)), Some(ts(1800)), 9, start, end);
        assert!((s - 1800.0).abs() < 1e-9);
    }

    #[test]
    fn windowed_seconds_live_ignores_deploy_finished_at() {
        let start = ts(0);
        let end = ts(3600);
        let s = windowed_seconds(Some(ts(0)), Some(ts(120)), 5, start, end);
        assert!((s - 3600.0).abs() < 1e-9);
    }

    #[test]
    fn windowed_seconds_stopped_before_window_excluded() {
        let start = ts(3600);
        let end = ts(7200);
        let s = windowed_seconds(Some(ts(0)), Some(ts(1800)), 9, start, end);
        assert_eq!(s, 0.0);
    }

    #[test]
    fn windowed_seconds_queued_no_started_at() {
        let start = ts(0);
        let end = ts(3600);
        assert_eq!(windowed_seconds(None, None, 0, start, end), 0.0);
    }

    #[test]
    fn windowed_seconds_terminal_without_finished_at_is_zero() {
        let start = ts(0);
        let end = ts(3600);
        // Stopped status but no finished_at — defensive: nothing billable.
        assert_eq!(windowed_seconds(Some(ts(0)), None, 9, start, end), 0.0);
    }

    #[test]
    fn windowed_volume_seconds_full_window() {
        let start = ts(0);
        let end = ts(3600);
        let s = windowed_volume_seconds(Some(ts(0)), None, start, end);
        assert!((s - 3600.0).abs() < 1e-9);
    }

    #[test]
    fn windowed_volume_seconds_deleted_mid_window() {
        let start = ts(0);
        let end = ts(3600);
        let s = windowed_volume_seconds(Some(ts(0)), Some(ts(1800)), start, end);
        assert!((s - 1800.0).abs() < 1e-9);
    }

    #[test]
    fn windowed_volume_seconds_provisioned_mid_window() {
        let start = ts(0);
        let end = ts(3600);
        let s = windowed_volume_seconds(Some(ts(1800)), None, start, end);
        assert!((s - 1800.0).abs() < 1e-9);
    }

    #[test]
    fn windowed_volume_seconds_queued_not_provisioned_is_zero() {
        let start = ts(0);
        let end = ts(3600);
        // No provisioned_at — the volume row exists but Fly hasn't allocated it
        // yet (status 'queued'). Nothing billable.
        assert_eq!(windowed_volume_seconds(None, None, start, end), 0.0);
    }

    #[test]
    fn windowed_volume_seconds_deleted_before_window_excluded() {
        let start = ts(3600);
        let end = ts(7200);
        let s = windowed_volume_seconds(Some(ts(0)), Some(ts(1800)), start, end);
        assert_eq!(s, 0.0);
    }

    #[test]
    fn deploy_usage_event_key_is_deterministic_per_window() {
        let ws = Uuid::nil();
        let s = ts(1000);
        let e = ts(2000);
        let a = deploy_usage_event_key("deploy_memory", ws, s, e);
        let b = deploy_usage_event_key("deploy_memory", ws, s, e);
        assert_eq!(a, b);
        // Different feature → different key.
        assert_ne!(
            deploy_usage_event_key("deploy_cpu", ws, s, e),
            deploy_usage_event_key("deploy_memory", ws, s, e)
        );
        // Different window → different key.
        assert_ne!(deploy_usage_event_key("deploy_memory", ws, s, ts(3000)), a);
    }
}
