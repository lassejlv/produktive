//! Periodic billing reconcile sweep. Monitors/members bill on the monthly peak
//! via `max`-aggregation meters, so even idle workspaces must re-report their
//! current counts at least once per period — this sweep guarantees that.

use std::time::Duration;

use entity::workspace;
use sea_orm::EntityTrait;

use crate::{billing::reconcile_usage, state::AppState};

pub fn spawn(state: AppState) {
    if state.billing.is_none() {
        return;
    }
    tokio::spawn(async move {
        let tick = Duration::from_secs(state.config.billing_reconcile_tick_seconds);
        let mut interval = tokio::time::interval(tick);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        // Consume the immediate first tick so the first sweep runs after one full
        // interval rather than hammering Polar at startup.
        interval.tick().await;

        loop {
            interval.tick().await;
            if let Err(error) = run_once(&state).await {
                tracing::error!(error = ?error, "billing reconcile sweep failed");
            }
        }
    });
}

async fn run_once(state: &AppState) -> anyhow::Result<()> {
    let workspaces = workspace::Entity::find().all(&state.db).await?;
    let total = workspaces.len();
    let mut reconciled = 0_usize;

    for ws in workspaces {
        match reconcile_usage(state, ws.id).await {
            Ok(()) => reconciled += 1,
            Err(error) => {
                tracing::debug!(workspace_id = %ws.id, error = %error, "reconcile failed for workspace")
            }
        }
        // Spread load so a large install doesn't burst Polar / the DB.
        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    tracing::info!(reconciled, total, "billing reconcile sweep complete");
    Ok(())
}
