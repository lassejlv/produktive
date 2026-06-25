//! Periodic Cloudflare for SaaS reconcile sweep. Custom-hostname certificate
//! issuance is asynchronous, so we poll Cloudflare for each not-yet-active
//! hostname and flip `ssl_status` / `verified_at` once the cert goes live.

use std::time::Duration;

use entity::custom_domain;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, Condition, EntityTrait, QueryFilter,
};

use crate::state::AppState;

const TICK: Duration = Duration::from_secs(60);

pub fn spawn(state: AppState) {
    if state.cloudflare.is_none() {
        return;
    }
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(TICK);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            if let Err(error) = run_once(&state).await {
                tracing::error!(error = ?error, "custom-domain reconcile sweep failed");
            }
        }
    });
}

async fn run_once(state: &AppState) -> anyhow::Result<()> {
    let Some(cf) = state.cloudflare.as_ref() else {
        return Ok(());
    };

    // Cloudflare-backed domains whose cert isn't reported active yet.
    let pending = custom_domain::Entity::find()
        .filter(custom_domain::Column::CfHostnameId.is_not_null())
        .filter(
            Condition::any()
                .add(custom_domain::Column::SslStatus.ne("active"))
                .add(custom_domain::Column::SslStatus.is_null()),
        )
        .all(&state.db)
        .await?;

    for row in pending {
        let Some(cf_id) = row.cf_hostname_id.clone() else {
            continue;
        };
        match cf.get_custom_hostname(&cf_id).await {
            Ok(Some(ch)) => {
                let ssl_status = ch.ssl_status().map(str::to_owned);
                let active = ssl_status.as_deref() == Some("active");
                let now = chrono::Utc::now().fixed_offset();
                let mut am: custom_domain::ActiveModel = row.into();
                am.ssl_status = Set(ssl_status);
                am.cf_synced_at = Set(Some(now));
                if active {
                    am.verified_at = Set(Some(now));
                }
                am.updated_at = Set(now);
                if let Err(error) = am.update(&state.db).await {
                    tracing::warn!(error = %error, "failed to persist custom-domain sync");
                }
            }
            Ok(None) => {
                tracing::warn!(cf_id = %cf_id, "Cloudflare custom hostname missing during sweep");
            }
            Err(error) => {
                tracing::debug!(error = %error, cf_id = %cf_id, "custom hostname poll failed");
            }
        }
        // Spread load so a large install doesn't burst Cloudflare / the DB.
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    Ok(())
}
