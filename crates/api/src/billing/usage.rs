use chrono::{DateTime, Utc};
use entity::{monitor, user, workspace, workspace_member};
use polar::{CustomerCreate, CustomerState, EventCreate, PolarError};
use sea_orm::{
    ColumnTrait, DatabaseBackend, EntityTrait, FromQueryResult, PaginatorTrait, QueryFilter,
    Statement,
};
use uuid::Uuid;

use crate::{
    billing::{
        billing_customer_workspace_id, customer_state_for_billing, load_usage_reset,
        persist_usage_reset, refresh_and_store_customer_state, update_stored_meter_usage,
        MeterUsageUpdate, PolarCatalog, UsageReset,
    },
    error::{ApiError, ApiResult},
    state::AppState,
};

/// Each recorded check consumes this many billable "event" units.
pub const EVENT_UNITS_PER_CHECK: f64 = 2.0;

/// The billing-customer workspace UUID is the Polar customer `external_id`.
pub fn customer_id(workspace_id: Uuid) -> String {
    workspace_id.to_string()
}

/// Ensure the workspace has a Polar customer and an active subscription
/// (defaulting to the free tier), then reconcile reported usage.
pub async fn ensure_customer(
    state: &AppState,
    ws: &workspace::Model,
    owner_email: &str,
) -> ApiResult<()> {
    let Some(billing) = state.billing.as_ref() else {
        return Ok(());
    };
    let billing_workspace_id = billing_customer_workspace_id(state, ws.id).await?;
    let ext = customer_id(billing_workspace_id);

    // 1. customer exists?
    match billing.client.customers().get_by_external(&ext).await {
        Ok(Some(_)) => {}
        Ok(None) => {
            let create = CustomerCreate::new(owner_email.to_owned())
                .external_id(ext.clone())
                .name(ws.name.clone());
            match billing.client.customers().create(create).await {
                Ok(_) => {}
                // Lost a race with a concurrent create — fine, it exists now.
                Err(PolarError::Api(api)) if api.status.as_u16() == 409 => {}
                Err(e) => return Err(e.into()),
            }
        }
        Err(e) => return Err(e.into()),
    }

    // 2. active subscription? attach free if not.
    let cstate = refresh_and_store_customer_state(state, billing_workspace_id).await?;
    if cstate.active_subscription().is_none() {
        if let Some(free) = billing.catalog.free_product_id() {
            if let Err(e) = billing.client.subscriptions().create(free, &ext).await {
                tracing::warn!(workspace_id = %ws.id, error = %e, "failed to attach free plan");
            }
            billing.invalidate(billing_workspace_id);
            if let Err(e) = refresh_and_store_customer_state(state, billing_workspace_id).await {
                tracing::warn!(workspace_id = %ws.id, error = ?e, "failed to refresh billing state after free plan attach");
            }
        }
    }

    // 3. best-effort usage reconcile (never blocks the caller).
    if let Err(e) = reconcile_usage(state, ws.id).await {
        tracing::warn!(workspace_id = %ws.id, billing_workspace_id = %billing_workspace_id, error = %e, "usage reconcile failed");
    }
    Ok(())
}

/// Gate a metered feature: allow if the tier permits overage, otherwise enforce
/// `usage + delta <= included`. Usage is Polar's consumed meter balance for
/// `events`, or the live DB count for the `monitors`/`members` gauges.
pub async fn require_metered_feature(
    state: &AppState,
    workspace_id: Uuid,
    feature_id: &str,
    delta: f64,
) -> ApiResult<()> {
    let Some(billing) = state.billing.as_ref() else {
        return Ok(());
    };
    // Fail open: a billing outage must not block monitoring or product usage.
    let cstate = match customer_state_for_billing(state, workspace_id).await {
        Ok(state) => state,
        Err(e) => {
            tracing::warn!(workspace_id = %workspace_id, feature_id, error = ?e, "entitlement check skipped (billing state unavailable)");
            return Ok(());
        }
    };

    let tier = tier_of(&billing.catalog, &cstate);
    let Some(entitlement) = billing.catalog.entitlement(tier, feature_id) else {
        return Ok(()); // unknown feature/tier → no known limit
    };

    if entitlement.overage_allowed {
        return Ok(());
    }

    let usage = match feature_id {
        "events" => event_usage(state, workspace_id, &cstate, &entitlement.meter_id).await?,
        "monitors" => billing_monitor_count(state, workspace_id).await?,
        "members" => billing_member_count(state, workspace_id).await?,
        _ => 0.0,
    };

    if usage + delta <= entitlement.included + f64::EPSILON {
        Ok(())
    } else {
        Err(payment_required(feature_id, "plan limit reached"))
    }
}

/// Gate a boolean perk: allowed iff the workspace's current tier includes it.
pub async fn require_boolean_feature(
    state: &AppState,
    workspace_id: Uuid,
    feature_id: &str,
) -> ApiResult<()> {
    let Some(billing) = state.billing.as_ref() else {
        return Ok(());
    };
    let cstate = match customer_state_for_billing(state, workspace_id).await {
        Ok(state) => state,
        Err(e) => {
            tracing::warn!(workspace_id = %workspace_id, feature_id, error = ?e, "perk check skipped (billing state unavailable)");
            return Ok(());
        }
    };

    let tier = tier_of(&billing.catalog, &cstate);
    if billing.catalog.tier_has_perk(tier, feature_id) {
        Ok(())
    } else {
        Err(payment_required(feature_id, "your plan does not include"))
    }
}

/// Enforce the plan's minimum check interval via the boolean check-frequency
/// perks.
pub async fn require_monitor_interval(
    state: &AppState,
    workspace_id: Uuid,
    interval_seconds: i32,
) -> ApiResult<()> {
    if interval_seconds < 60 {
        return Err(ApiError::bad_request(
            "minimum monitor interval is 60 seconds",
        ));
    }

    if interval_seconds < 300 {
        require_boolean_feature(state, workspace_id, "one_min_checks").await?;
    } else if interval_seconds < 900 {
        require_boolean_feature(state, workspace_id, "five_min_checks").await?;
    }

    Ok(())
}

/// Block deployments for subscribers grandfathered onto a pre-metering version
/// of the usage-based plan. Polar doesn't reprice existing subscriptions when a
/// metered price is added to a product — those customers keep their original
/// pricing and, crucially, the new meters are *not* tracked against them. So the
/// reliable signal is: a non-free customer whose `active_meters` is missing the
/// deploy resource meters is on the old pricing and isn't being billed for
/// deployments. Free-tier workspaces pass. Fails open (allows) if billing is
/// disabled, the catalog lacks the deploy meters, or the customer state can't be
/// loaded — matching the rest of the billing gates.
pub async fn require_deploy_metering_current(
    state: &AppState,
    workspace_id: Uuid,
) -> ApiResult<()> {
    let Some(billing) = state.billing.as_ref() else {
        return Ok(());
    };

    // The deploy meter ids this catalog knows about. If the catalog doesn't
    // carry them (billing not fully provisioned), there's nothing to gate on.
    let deploy_meter_ids: Vec<String> = crate::billing::DEPLOY_METERED_FEATURES
        .iter()
        .filter_map(|feature| billing.catalog.meter_id(feature).map(str::to_owned))
        .collect();
    if deploy_meter_ids.is_empty() {
        return Ok(());
    }

    let cstate = match customer_state_for_billing(state, workspace_id).await {
        Ok(state) => state,
        Err(e) => {
            tracing::warn!(
                workspace_id = %workspace_id,
                error = ?e,
                "deploy metering currency check skipped (billing state unavailable)"
            );
            return Ok(());
        }
    };

    let tier = tier_of(&billing.catalog, &cstate);
    if tier == "free" {
        return Ok(());
    }
    if cstate.active_subscription().is_none() {
        return Ok(());
    }

    // A subscription on the current pricing has the deploy meters tracked
    // against it. A grandfathered subscription does not.
    if !subscription_has_deploy_meters(&cstate, &deploy_meter_ids) {
        return Err(ApiError::payment_required(
            "deployments require the current usage-based plan. Your subscription \
             is on an older version of the plan that doesn't include deployment \
             metering — please update your plan to continue.",
        ));
    }
    Ok(())
}

/// Pure decision: true when the customer's active meters include at least one
/// of the deploy resource meters (i.e. the subscription is on current pricing).
pub fn subscription_has_deploy_meters(
    cstate: &polar::CustomerState,
    deploy_meter_ids: &[String],
) -> bool {
    cstate
        .active_meters
        .iter()
        .any(|m| deploy_meter_ids.iter().any(|id| id == &m.meter_id))
}

pub async fn workspace_has_paid_plan(state: &AppState, workspace_id: Uuid) -> ApiResult<bool> {
    let Some(billing) = state.billing.as_ref() else {
        return Ok(true);
    };
    let cstate = customer_state_for_billing(state, workspace_id).await?;
    let Some(sub) = cstate.active_subscription() else {
        return Ok(false);
    };
    let Some(tier) = billing.catalog.tier_for_product(&sub.product_id) else {
        return Ok(false);
    };
    Ok(tier != "free" && matches!(sub.status.as_str(), "active" | "trialing" | "past_due"))
}

/// Report usage to Polar. For `events`, ingest the weighted delta (deduped by
/// `idempotency_key`); for the `monitors`/`members` gauges, report the current
/// DB count so the `max`-aggregation meter captures the period peak.
pub async fn track_feature_with_key(
    state: &AppState,
    workspace_id: Uuid,
    feature_id: &str,
    delta: f64,
    idempotency_key: Option<String>,
) {
    let Some(billing) = state.billing.as_ref() else {
        return;
    };
    let billing_workspace_id = match billing_customer_workspace_id(state, workspace_id).await {
        Ok(id) => id,
        Err(e) => {
            tracing::warn!(workspace_id = %workspace_id, error = ?e, "failed to resolve billing customer for usage tracking");
            return;
        }
    };
    let ext = customer_id(billing_workspace_id);

    let (event, local_update) = match feature_id {
        "events" => {
            let mut event = EventCreate::new("event", ext).metadata("units", delta);
            if let Some(key) = idempotency_key {
                event = event.external_id(key);
            }
            (event, Some(MeterUsageUpdate::Increment(delta)))
        }
        "monitors" => {
            let count = billing_monitor_count(state, workspace_id)
                .await
                .unwrap_or(0.0);
            (
                EventCreate::new("monitor", ext).metadata("value", count),
                Some(MeterUsageUpdate::Set(count)),
            )
        }
        "members" => {
            let count = billing_member_count(state, workspace_id)
                .await
                .unwrap_or(0.0);
            (
                EventCreate::new("member", ext).metadata("value", count),
                Some(MeterUsageUpdate::Set(count)),
            )
        }
        _ => return,
    };

    match billing.client.events().ingest(vec![event]).await {
        Ok(response) => {
            billing.invalidate(billing_workspace_id);
            let should_update = feature_id != "events" || response.inserted > 0;
            if should_update {
                if let Some(update) = local_update {
                    if let Err(e) =
                        update_stored_meter_usage(state, workspace_id, feature_id, update).await
                    {
                        tracing::warn!(
                            workspace_id = %workspace_id,
                            feature_id,
                            error = ?e,
                            "failed to update stored Polar usage"
                        );
                    }
                }
            }
        }
        Err(e) => {
            tracing::warn!(
                workspace_id = %workspace_id,
                feature_id,
                delta,
                error = %e,
                "failed to track Polar usage"
            );
        }
    }
}

/// Re-report current usage so Polar's meters stay in sync: the gauge counts
/// (monitors/members) keep the period peak current, and an `events` correction
/// event heals any per-check ingests dropped during an outage.
pub async fn reconcile_usage(state: &AppState, workspace_id: Uuid) -> ApiResult<()> {
    let Some(billing) = state.billing.as_ref() else {
        return Ok(());
    };
    let billing_workspace_id = billing_customer_workspace_id(state, workspace_id).await?;
    let ext = customer_id(billing_workspace_id);
    let cstate = refresh_and_store_customer_state(state, billing_workspace_id).await?;

    let monitor_count = billing_monitor_count(state, workspace_id).await?;
    let member_count = billing_member_count(state, workspace_id).await?;

    let mut events = vec![
        EventCreate::new("monitor", ext.clone()).metadata("value", monitor_count),
        EventCreate::new("member", ext.clone()).metadata("value", member_count),
    ];

    if let (Some(sub), Some(meter_id)) = (
        cstate.active_subscription(),
        billing.catalog.meter_id("events"),
    ) {
        if let (Some(start), Some(end)) = (
            parse_timestamp(sub.current_period_start.as_deref()),
            parse_timestamp(sub.current_period_end.as_deref()),
        ) {
            // Honour any admin usage reset so the sweep doesn't re-ingest the
            // checks we just discounted.
            let reset = load_usage_reset(state, workspace_id).await?;
            let effective_start = effective_window_start(start, end, &reset);
            let checks = count_checks_in_window(state, workspace_id, effective_start, end).await?;
            let db_units = checks * EVENT_UNITS_PER_CHECK;
            let consumed = apply_events_baseline(
                cstate
                    .meter(meter_id)
                    .map(|m| m.consumed_units)
                    .unwrap_or(0.0),
                Some(end),
                &reset,
            );
            let delta = db_units - consumed;
            if delta > f64::EPSILON {
                // Deterministic key: a racing reconcile applies the same
                // correction at most once.
                let key = format!(
                    "reconcile-events-{workspace_id}-{}-{db_units}",
                    end.timestamp()
                );
                events.push(
                    EventCreate::new("event", ext.clone())
                        .metadata("units", delta)
                        .external_id(key),
                );
            }
        }
    }

    if let Err(e) = billing.client.events().ingest(events).await {
        tracing::warn!(workspace_id = %workspace_id, error = %e, "failed to reconcile Polar usage");
        billing.invalidate(billing_workspace_id);
    } else if let Err(e) = refresh_and_store_customer_state(state, billing_workspace_id).await {
        tracing::warn!(workspace_id = %workspace_id, error = ?e, "failed to refresh billing state after usage reconcile");
        billing.invalidate(billing_workspace_id);
    }
    Ok(())
}

/// Outcome of an admin usage reset.
#[derive(Clone, Copy, Debug)]
pub struct UsageResetSummary {
    pub billing_workspace_id: Uuid,
    pub events_consumed_before: f64,
    pub events_consumed_after: f64,
    /// Whether the compensating event was accepted by Polar.
    pub polar_event_ingested: bool,
}

/// Reset a workspace's billing-events usage for the current period, in Polar and
/// locally. Mirrors the normal reporting path: a compensating negative `event`
/// corrects Polar's meter, while a stored baseline + reset marker make the local
/// enforcement/display read zero regardless of how Polar treats negative events.
///
/// Note: billing is aggregated on the owner's personal workspace, so this resets
/// usage for the whole billing customer (every workspace that owner has).
pub async fn reset_workspace_usage(
    state: &AppState,
    workspace_id: Uuid,
) -> ApiResult<UsageResetSummary> {
    let billing = state
        .billing
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("billing is not configured"))?;
    let Some(meter_id) = billing.catalog.meter_id("events").map(str::to_owned) else {
        return Err(ApiError::service_unavailable(
            "events meter is not configured",
        ));
    };
    let billing_workspace_id = billing_customer_workspace_id(state, workspace_id).await?;
    let ext = customer_id(billing_workspace_id);

    // Snapshot current consumption straight from Polar.
    let cstate = refresh_and_store_customer_state(state, billing_workspace_id).await?;
    let period_end = cstate
        .active_subscription()
        .and_then(|sub| parse_timestamp(sub.current_period_end.as_deref()));
    let consumed_before = cstate
        .meter(&meter_id)
        .map(|m| m.consumed_units)
        .unwrap_or(0.0);

    // Best-effort: correct Polar's billed meter with a compensating event. A
    // deterministic per-period key means a repeated reset in the same period
    // won't stack multiple credits.
    let mut polar_event_ingested = false;
    if consumed_before.abs() > f64::EPSILON {
        let key = match period_end {
            Some(end) => format!("usage-reset-{billing_workspace_id}-{}", end.timestamp()),
            None => format!("usage-reset-{billing_workspace_id}-noperiod"),
        };
        let event = EventCreate::new("event", ext)
            .metadata("units", -consumed_before)
            .external_id(key);
        match billing.client.events().ingest(vec![event]).await {
            Ok(_) => {
                polar_event_ingested = true;
                billing.invalidate(billing_workspace_id);
            }
            Err(e) => {
                tracing::warn!(workspace_id = %workspace_id, error = %e, "usage reset: compensating event ingest failed");
            }
        }
    }

    // Re-read so the baseline reflects whatever Polar actually did with the
    // negative event. Subtracting this observed value zeroes effective usage in
    // both the honored and ignored cases.
    let consumed_after = match refresh_and_store_customer_state(state, billing_workspace_id).await {
        Ok(state) => state
            .meter(&meter_id)
            .map(|m| m.consumed_units)
            .unwrap_or(0.0),
        Err(e) => {
            tracing::warn!(workspace_id = %workspace_id, error = ?e, "usage reset: post-correction refresh failed");
            consumed_before
        }
    };

    persist_usage_reset(
        state,
        billing_workspace_id,
        Utc::now(),
        consumed_after,
        period_end,
    )
    .await?;

    Ok(UsageResetSummary {
        billing_workspace_id,
        events_consumed_before: consumed_before,
        events_consumed_after: consumed_after,
        polar_event_ingested,
    })
}

pub async fn load_owner_email(state: &AppState, owner_id: Uuid) -> ApiResult<String> {
    user::Entity::find_by_id(owner_id)
        .one(&state.db)
        .await?
        .map(|u| u.email)
        .ok_or_else(|| ApiError::not_found("workspace owner"))
}

pub fn tier_of<'a>(catalog: &'a PolarCatalog, state: &CustomerState) -> &'a str {
    state
        .active_subscription()
        .and_then(|sub| catalog.tier_for_product(&sub.product_id))
        .unwrap_or("free")
}

pub(crate) async fn monitor_count(state: &AppState, workspace_id: Uuid) -> ApiResult<f64> {
    Ok(monitor::Entity::find()
        .filter(monitor::Column::WorkspaceId.eq(workspace_id))
        .count(&state.db)
        .await? as f64)
}

pub(crate) async fn member_count(state: &AppState, workspace_id: Uuid) -> ApiResult<f64> {
    Ok(workspace_member::Entity::find()
        .filter(workspace_member::Column::WorkspaceId.eq(workspace_id))
        .count(&state.db)
        .await? as f64)
}

pub async fn billing_monitor_count(state: &AppState, workspace_id: Uuid) -> ApiResult<f64> {
    let row = CountRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT COUNT(*)::BIGINT AS count
        FROM monitors m
        JOIN workspaces owned ON owned.id = m.workspace_id
        JOIN workspaces current ON current.owner_id = owned.owner_id
        WHERE current.id = $1
        "#,
        [workspace_id.into()],
    ))
    .one(&state.db)
    .await?;

    Ok(row.map(|row| row.count).unwrap_or_default() as f64)
}

pub async fn billing_member_count(state: &AppState, workspace_id: Uuid) -> ApiResult<f64> {
    let row = CountRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT COUNT(DISTINCT wm.user_id)::BIGINT AS count
        FROM workspace_members wm
        JOIN workspaces owned ON owned.id = wm.workspace_id
        JOIN workspaces current ON current.owner_id = owned.owner_id
        WHERE current.id = $1
        "#,
        [workspace_id.into()],
    ))
    .one(&state.db)
    .await?;

    Ok(row.map(|row| row.count).unwrap_or_default() as f64)
}

#[derive(FromQueryResult)]
struct CountRow {
    count: i64,
}

async fn count_checks_in_window(
    state: &AppState,
    workspace_id: Uuid,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> ApiResult<f64> {
    let row = CountRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT COUNT(*)::BIGINT AS count
        FROM checks c
        JOIN monitors m ON m.id = c.monitor_id
        JOIN workspaces owned ON owned.id = m.workspace_id
        JOIN workspaces current ON current.owner_id = owned.owner_id
        WHERE current.id = $1
          AND c.time >= $2
          AND c.time < $3
        "#,
        [
            workspace_id.into(),
            start.fixed_offset().into(),
            end.fixed_offset().into(),
        ],
    ))
    .one(&state.db)
    .await?;

    Ok(row.map(|row| row.count).unwrap_or_default() as f64)
}

/// The events meter consumed this period, after applying any admin usage reset.
/// This is `max(reset-adjusted Polar consumption, reset-windowed DB check count)`
/// — the same value used for both enforcement and display.
pub async fn effective_events_consumed(
    state: &AppState,
    workspace_id: Uuid,
    cstate: &CustomerState,
    meter_id: &str,
) -> ApiResult<f64> {
    let reset = load_usage_reset(state, workspace_id).await?;
    let consumed = cstate
        .meter(meter_id)
        .map(|m| m.consumed_units)
        .unwrap_or(0.0);
    let Some(sub) = cstate.active_subscription() else {
        return Ok(apply_events_baseline(consumed, None, &reset));
    };
    let (Some(start), Some(end)) = (
        parse_timestamp(sub.current_period_start.as_deref()),
        parse_timestamp(sub.current_period_end.as_deref()),
    ) else {
        return Ok(apply_events_baseline(consumed, None, &reset));
    };
    let effective_consumed = apply_events_baseline(consumed, Some(end), &reset);
    let effective_start = effective_window_start(start, end, &reset);
    let db_usage = count_checks_in_window(state, workspace_id, effective_start, end).await?
        * EVENT_UNITS_PER_CHECK;
    Ok(effective_consumed.max(db_usage))
}

async fn event_usage(
    state: &AppState,
    workspace_id: Uuid,
    cstate: &CustomerState,
    meter_id: &str,
) -> ApiResult<f64> {
    effective_events_consumed(state, workspace_id, cstate, meter_id).await
}

/// True when two period boundaries refer to the same billing period (allowing a
/// 1s slop for serialization rounding).
fn same_period(a: Option<DateTime<Utc>>, b: Option<DateTime<Utc>>) -> bool {
    match (a, b) {
        (Some(a), Some(b)) => (a - b).num_seconds().abs() <= 1,
        _ => false,
    }
}

/// Subtract a usage-reset baseline from raw Polar consumption, but only while the
/// reset still applies to the current period (the meter resets next period).
fn apply_events_baseline(
    consumed: f64,
    period_end: Option<DateTime<Utc>>,
    reset: &UsageReset,
) -> f64 {
    if same_period(reset.events_baseline_period_end, period_end) {
        (consumed - reset.events_consumed_baseline).max(0.0)
    } else {
        consumed
    }
}

/// The window start for counting checks: the reset instant if a reset happened
/// inside the current period, otherwise the period start.
fn effective_window_start(
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    reset: &UsageReset,
) -> DateTime<Utc> {
    match reset.usage_reset_at {
        Some(reset_at) if reset_at > start && reset_at < end => reset_at,
        _ => start,
    }
}

fn parse_timestamp(raw: Option<&str>) -> Option<DateTime<Utc>> {
    raw.and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.with_timezone(&Utc))
}

fn payment_required(feature_id: &str, reason: &str) -> ApiError {
    let label = feature_label(feature_id);
    ApiError::payment_required(format!("{reason} {label}; upgrade your plan to continue"))
}

fn feature_label(feature_id: &str) -> &'static str {
    match feature_id {
        "monitors" => "monitors",
        "members" => "members",
        "events" => "checks",
        "custom_domain" => "custom domains",
        "one_min_checks" => "1 minute checks",
        "five_min_checks" => "5 minute checks",
        "multi_region" => "multi-region checks",
        "priority_support" => "priority support",
        "remove_branding" => "removing branding",
        _ => "this feature",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn customer_id_is_workspace_uuid() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert_eq!(customer_id(id), "550e8400-e29b-41d4-a716-446655440000");
    }

    #[test]
    fn tier_defaults_to_free_without_subscription() {
        let catalog = PolarCatalog::default();
        let state: CustomerState = serde_json::from_value(serde_json::json!({
            "id": "cus_1", "active_subscriptions": [], "granted_benefits": [], "active_meters": []
        }))
        .unwrap();
        assert_eq!(tier_of(&catalog, &state), "free");
    }

    #[test]
    fn parse_timestamp_reads_rfc3339() {
        let dt = parse_timestamp(Some("2026-07-13T23:11:54Z")).unwrap();
        assert_eq!(dt, Utc.with_ymd_and_hms(2026, 7, 13, 23, 11, 54).unwrap());
        // sub-second precision is preserved
        assert!(parse_timestamp(Some("2026-07-13T23:11:54.391784Z")).is_some());
    }

    use chrono::TimeZone;

    #[test]
    fn check_events_are_weighted_for_billing() {
        assert_eq!(3.0 * EVENT_UNITS_PER_CHECK, 6.0);
    }

    fn period_end(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(secs, 0).unwrap()
    }

    #[test]
    fn baseline_subtracted_only_within_its_period() {
        let end = period_end(1_000_000);
        let reset = UsageReset {
            usage_reset_at: Some(period_end(999_000)),
            events_consumed_baseline: 80.0,
            events_baseline_period_end: Some(end),
        };
        // Same period: subtract the baseline (and clamp at zero).
        assert_eq!(apply_events_baseline(100.0, Some(end), &reset), 20.0);
        assert_eq!(apply_events_baseline(50.0, Some(end), &reset), 0.0);
        // Next period (meter already reset upstream): baseline no longer applies.
        assert_eq!(
            apply_events_baseline(100.0, Some(period_end(2_000_000)), &reset),
            100.0
        );
        // No baseline recorded: pass through unchanged.
        assert_eq!(
            apply_events_baseline(100.0, Some(end), &UsageReset::default()),
            100.0
        );
    }

    #[test]
    fn window_start_moves_to_reset_within_period() {
        let start = period_end(1000);
        let end = period_end(9000);
        let inside = UsageReset {
            usage_reset_at: Some(period_end(5000)),
            ..UsageReset::default()
        };
        assert_eq!(
            effective_window_start(start, end, &inside),
            period_end(5000)
        );
        // A reset from a previous period (before this window) is ignored.
        let stale = UsageReset {
            usage_reset_at: Some(period_end(500)),
            ..UsageReset::default()
        };
        assert_eq!(effective_window_start(start, end, &stale), start);
        assert_eq!(
            effective_window_start(start, end, &UsageReset::default()),
            start
        );
    }

    #[test]
    fn subscription_has_deploy_meters_detects_grandfathered_sub() {
        let deploy_meters = vec!["mtr_memory".to_owned(), "mtr_cpu".to_owned(), "mtr_volume".to_owned()];

        // Current pricing: the deploy meters are tracked against the customer.
        let current: CustomerState = serde_json::from_value(serde_json::json!({
            "id": "cus_1", "active_subscriptions": [], "granted_benefits": [],
            "active_meters": [
                { "meter_id": "mtr_memory", "consumed_units": 1.0 },
                { "meter_id": "mtr_events",  "consumed_units": 100.0 }
            ]
        }))
        .unwrap();
        assert!(subscription_has_deploy_meters(&current, &deploy_meters));

        // Grandfathered: the subscription predates the metered prices, so the
        // deploy meters are absent — only the legacy events meter is tracked.
        let grandfathered: CustomerState = serde_json::from_value(serde_json::json!({
            "id": "cus_2", "active_subscriptions": [], "granted_benefits": [],
            "active_meters": [
                { "meter_id": "mtr_events", "consumed_units": 100.0 }
            ]
        }))
        .unwrap();
        assert!(!subscription_has_deploy_meters(&grandfathered, &deploy_meters));

        // No meters at all (e.g. a fresh sub with no usage yet) → not current.
        let empty: CustomerState = serde_json::from_value(serde_json::json!({
            "id": "cus_3", "active_subscriptions": [], "granted_benefits": [], "active_meters": []
        }))
        .unwrap();
        assert!(!subscription_has_deploy_meters(&empty, &deploy_meters));
    }
}
