//! Periodic deploy usage sweep. Every tick, for each billing-customer
//! workspace, compute the GB-hours / vCPU-hours / volume GB-hours consumed since
//! the last successful ingest and report them to Polar as three usage events.
//!
//! Mirrors [`super::sweep`] (the gauge re-report) but for deployment resource
//! meters. The events carry a deterministic `external_id` per (feature, billing
//! customer, window) so a re-run of the same window is deduped by Polar; if an
//! ingest fails the marker is left untouched and the next sweep widens the
//! window to re-attempt (self-healing).

use std::time::Duration;

use chrono::Utc;
use polar::EventCreate;
use sea_orm::{ConnectionTrait, DatabaseBackend, FromQueryResult, Statement};
use uuid::Uuid;

use crate::{
    billing::{
        customer_id,
        deploy_usage::{
            billing_customer_workspaces, compute_compute_hours, compute_volume_gb_hours,
            deploy_usage_event_key, ComputeKind,
        },
        Billing,
    },
    state::AppState,
};

/// Spawn the deploy usage sweep. No-op when billing is disabled or deployments
/// are off — there's nothing to meter.
pub fn spawn(state: AppState) {
    if state.billing.is_none() || !state.config.deployments_enabled {
        return;
    }
    tokio::spawn(async move {
        let tick = Duration::from_secs(state.config.deploy_usage_sweep_tick_seconds);
        let mut interval = tokio::time::interval(tick);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        // Consume the immediate first tick so the first sweep runs after one
        // full interval rather than at startup.
        interval.tick().await;

        loop {
            interval.tick().await;
            if let Err(error) = run_once(&state).await {
                tracing::error!(error = ?error, "deploy usage sweep failed");
            }
        }
    });
}

async fn run_once(state: &AppState) -> anyhow::Result<()> {
    let Some(billing) = state.billing.clone() else {
        return Ok(());
    };

    let workspaces = billing_customer_workspaces(state).await?;
    let now = Utc::now();
    let tick_seconds = state.config.deploy_usage_sweep_tick_seconds as i64;
    let default_window_start = now - chrono::Duration::seconds(tick_seconds);

    let mut swept = 0_usize;
    for billing_workspace_id in &workspaces {
        match sweep_one(
            state,
            &billing,
            *billing_workspace_id,
            default_window_start,
            now,
        )
        .await
        {
            Ok(true) => swept += 1,
            Ok(false) => {}
            Err(error) => tracing::warn!(
                workspace_id = %billing_workspace_id,
                error = %error,
                "deploy usage sweep failed for workspace"
            ),
        }
        // Spread Polar load across a large install.
        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    tracing::info!(
        swept,
        total = workspaces.len(),
        "deploy usage sweep complete"
    );
    Ok(())
}

/// Sweep one billing customer. Returns `true` if events were ingested.
async fn sweep_one(
    state: &AppState,
    billing: &Billing,
    billing_workspace_id: Uuid,
    default_window_start: chrono::DateTime<Utc>,
    window_end: chrono::DateTime<Utc>,
) -> anyhow::Result<bool> {
    let window_start = load_last_sent_at(state, billing_workspace_id)
        .await?
        .unwrap_or(default_window_start);
    if window_start >= window_end {
        return Ok(false);
    }

    let memory_hours = compute_compute_hours(
        state,
        billing_workspace_id,
        window_start,
        window_end,
        ComputeKind::Memory,
    )
    .await?;
    let cpu_hours = compute_compute_hours(
        state,
        billing_workspace_id,
        window_start,
        window_end,
        ComputeKind::Cpu,
    )
    .await?;
    let volume_hours =
        compute_volume_gb_hours(state, billing_workspace_id, window_start, window_end).await?;

    if memory_hours <= f64::EPSILON && cpu_hours <= f64::EPSILON && volume_hours <= f64::EPSILON {
        // Nothing billable this window — still advance the marker so the next
        // sweep doesn't re-scan an ever-growing empty window.
        persist_last_sent_at(state, billing_workspace_id, window_end).await?;
        return Ok(false);
    }

    let ext = customer_id(billing_workspace_id);
    let events = build_events(
        &ext,
        billing_workspace_id,
        window_start,
        window_end,
        memory_hours,
        cpu_hours,
        volume_hours,
    );

    match billing.client.events().ingest(events).await {
        Ok(_) => {
            billing.invalidate(billing_workspace_id);
            persist_last_sent_at(state, billing_workspace_id, window_end).await?;
            Ok(true)
        }
        Err(error) => {
            tracing::warn!(
                workspace_id = %billing_workspace_id,
                error = %error,
                "deploy usage sweep: Polar ingest failed; marker left so next sweep re-attempts"
            );
            Ok(false)
        }
    }
}

fn build_events(
    ext: &str,
    billing_workspace_id: Uuid,
    window_start: chrono::DateTime<Utc>,
    window_end: chrono::DateTime<Utc>,
    memory_hours: f64,
    cpu_hours: f64,
    volume_hours: f64,
) -> Vec<EventCreate> {
    let mut events = Vec::with_capacity(3);
    if memory_hours > f64::EPSILON {
        events.push(
            EventCreate::new("deploy_memory", ext)
                .metadata("value", memory_hours)
                .external_id(deploy_usage_event_key(
                    "memory",
                    billing_workspace_id,
                    window_start,
                    window_end,
                )),
        );
    }
    if cpu_hours > f64::EPSILON {
        events.push(
            EventCreate::new("deploy_cpu", ext)
                .metadata("value", cpu_hours)
                .external_id(deploy_usage_event_key(
                    "cpu",
                    billing_workspace_id,
                    window_start,
                    window_end,
                )),
        );
    }
    if volume_hours > f64::EPSILON {
        events.push(
            EventCreate::new("deploy_volume", ext)
                .metadata("value", volume_hours)
                .external_id(deploy_usage_event_key(
                    "volume",
                    billing_workspace_id,
                    window_start,
                    window_end,
                )),
        );
    }
    events
}

async fn load_last_sent_at(
    state: &AppState,
    billing_workspace_id: Uuid,
) -> anyhow::Result<Option<chrono::DateTime<Utc>>> {
    let row = LastSentRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"SELECT deploy_usage_last_sent_at AS last_sent_at
           FROM workspace_billing_states
           WHERE workspace_id = $1"#,
        [billing_workspace_id.into()],
    ))
    .one(&state.db)
    .await?;
    Ok(row
        .and_then(|r| r.last_sent_at)
        .map(|d| d.with_timezone(&Utc)))
}

async fn persist_last_sent_at(
    state: &AppState,
    billing_workspace_id: Uuid,
    at: chrono::DateTime<Utc>,
) -> anyhow::Result<()> {
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"UPDATE workspace_billing_states
               SET deploy_usage_last_sent_at = $2,
                   updated_at = now()
               WHERE workspace_id = $1"#,
            [billing_workspace_id.into(), at.fixed_offset().into()],
        ))
        .await?;
    Ok(())
}

#[derive(FromQueryResult)]
struct LastSentRow {
    last_sent_at: Option<chrono::DateTime<chrono::FixedOffset>>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn build_events_omits_zero_deltas() {
        let ws = Uuid::nil();
        let start = Utc.timestamp_opt(0, 0).unwrap();
        let end = Utc.timestamp_opt(3600, 0).unwrap();
        let events = build_events("cus_1", ws, start, end, 0.0, 0.0, 0.0);
        assert!(events.is_empty());
    }

    #[test]
    fn build_events_includes_only_nonzero_meters() {
        let ws = Uuid::nil();
        let start = Utc.timestamp_opt(0, 0).unwrap();
        let end = Utc.timestamp_opt(3600, 0).unwrap();
        let events = build_events("cus_1", ws, start, end, 1.5, 0.0, 2.0);
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].name, "deploy_memory");
        assert_eq!(events[1].name, "deploy_volume");
    }

    #[test]
    fn build_events_metadata_value_is_the_hours() {
        let ws = Uuid::nil();
        let start = Utc.timestamp_opt(0, 0).unwrap();
        let end = Utc.timestamp_opt(3600, 0).unwrap();
        let events = build_events("cus_1", ws, start, end, 1.5, 0.7, 0.0);
        let mem = &events[0];
        let value = mem.metadata.get("value").and_then(|v| v.as_f64()).unwrap();
        assert!((value - 1.5).abs() < f64::EPSILON);
        let cpu = &events[1];
        let value = cpu.metadata.get("value").and_then(|v| v.as_f64()).unwrap();
        assert!((value - 0.7).abs() < f64::EPSILON);
    }

    #[test]
    fn build_events_external_id_is_deterministic() {
        let ws = Uuid::nil();
        let start = Utc.timestamp_opt(0, 0).unwrap();
        let end = Utc.timestamp_opt(3600, 0).unwrap();
        let a = build_events("cus_1", ws, start, end, 1.0, 1.0, 1.0);
        let b = build_events("cus_1", ws, start, end, 1.0, 1.0, 1.0);
        assert_eq!(a[0].external_id, b[0].external_id);
        assert_eq!(a[1].external_id, b[1].external_id);
        assert_eq!(a[2].external_id, b[2].external_id);
        // And distinct per meter.
        assert_ne!(a[0].external_id, a[1].external_id);
        assert_ne!(a[1].external_id, a[2].external_id);
    }
}
