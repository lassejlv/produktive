//! Periodic retention sweep for log events stored in TimescaleDB.

use std::time::Duration;

use entity::log_project;
use sea_orm::EntityTrait;

use crate::state::AppState;

const SWEEP_INTERVAL_SECS: u64 = 3600;

pub fn spawn(state: AppState) {
    if state.log_store.is_none() {
        return;
    }
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(SWEEP_INTERVAL_SECS));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        interval.tick().await;

        loop {
            interval.tick().await;
            if let Err(error) = run_once(&state).await {
                tracing::error!(error = ?error, "log retention sweep failed");
            }
        }
    });
}

async fn run_once(state: &AppState) -> anyhow::Result<()> {
    let Some(log_store) = state.log_store.as_ref() else {
        return Ok(());
    };

    let projects = log_project::Entity::find().all(&state.db).await?;
    let mut deleted_total = 0u64;

    for project in projects {
        match log_store
            .delete_expired_events(project.id, project.retention_days)
            .await
        {
            Ok(deleted) => {
                if deleted > 0 {
                    tracing::info!(
                        project_id = %project.id,
                        retention_days = project.retention_days,
                        deleted,
                        "log retention sweep deleted expired events"
                    );
                }
                deleted_total += deleted;
            }
            Err(error) => {
                tracing::warn!(
                    project_id = %project.id,
                    error = %error,
                    "log retention sweep failed for project"
                );
            }
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }

    if deleted_total > 0 {
        tracing::info!(deleted_total, "log retention sweep complete");
    }
    Ok(())
}
