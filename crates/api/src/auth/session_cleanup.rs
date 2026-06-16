use std::time::Duration;

use chrono::Utc;
use entity::{password_reset_token, session};
use sea_orm::{ColumnTrait, Condition, EntityTrait, QueryFilter};

use crate::state::AppState;

pub fn spawn(state: AppState) {
    tokio::spawn(async move {
        let tick = Duration::from_secs(state.config.session_cleanup_tick_seconds);
        let mut interval = tokio::time::interval(tick);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            interval.tick().await;
            if let Err(error) = run_once(&state).await {
                tracing::error!(error = ?error, "session cleanup failed");
            }
        }
    });
}

async fn run_once(state: &AppState) -> anyhow::Result<()> {
    let result = session::Entity::delete_many()
        .filter(session::Column::ExpiresAt.lt(Utc::now().fixed_offset()))
        .exec(&state.db)
        .await?;

    if result.rows_affected > 0 {
        tracing::info!(
            deleted = result.rows_affected,
            "expired sessions cleaned up"
        );
    }

    // Prune password reset tokens that are spent (used) or past their TTL so the
    // table self-prunes rather than growing unbounded.
    let reset_result = password_reset_token::Entity::delete_many()
        .filter(
            Condition::any()
                .add(password_reset_token::Column::ExpiresAt.lt(Utc::now().fixed_offset()))
                .add(password_reset_token::Column::UsedAt.is_not_null()),
        )
        .exec(&state.db)
        .await?;

    if reset_result.rows_affected > 0 {
        tracing::info!(
            deleted = reset_result.rows_affected,
            "expired/used password reset tokens cleaned up"
        );
    }

    Ok(())
}
