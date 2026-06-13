use autumn::{
    AttachParams, Balance, CheckParams, Customer, CustomerParams, GetCustomerParams, ResetInterval,
    TrackParams,
};
use chrono::{DateTime, Duration, Months, TimeZone, Utc};
use entity::{monitor, user, workspace, workspace_member};
use sea_orm::{
    ColumnTrait, DatabaseBackend, EntityTrait, FromQueryResult, PaginatorTrait, QueryFilter,
    Statement,
};
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

pub const EVENT_UNITS_PER_CHECK: f64 = 10.0;

pub fn customer_id(workspace_id: Uuid) -> String {
    workspace_id.to_string()
}

pub async fn ensure_customer(
    state: &AppState,
    ws: &workspace::Model,
    owner_email: &str,
) -> ApiResult<()> {
    let Some(autumn) = state.autumn.as_ref() else {
        return Ok(());
    };

    let cid = customer_id(ws.id);
    let params = CustomerParams::new(cid.clone())
        .name(ws.name.clone())
        .email(owner_email.to_owned())
        .expand(["subscriptions.plan", "purchases.plan", "balances.feature"])
        .auto_enable_plan_id("free");

    let customer = autumn.customers().get_or_create(params).await?;
    if !customer_has_plan(&customer) {
        autumn
            .billing()
            .attach(AttachParams::new(cid, "free"))
            .await?;
    }
    reconcile_usage(state, ws.id).await?;
    Ok(())
}

pub async fn require_metered_feature(
    state: &AppState,
    workspace_id: Uuid,
    feature_id: &str,
    delta: f64,
) -> ApiResult<()> {
    let Some(autumn) = state.autumn.as_ref() else {
        return Ok(());
    };

    let cid = customer_id(workspace_id);
    let check = autumn
        .check(CheckParams::new(cid, feature_id).required_balance(delta))
        .await?;

    require_allowed(check.allowed, feature_id, "plan limit reached")
}

pub async fn require_boolean_feature(
    state: &AppState,
    workspace_id: Uuid,
    feature_id: &str,
) -> ApiResult<()> {
    let Some(autumn) = state.autumn.as_ref() else {
        return Ok(());
    };

    let cid = customer_id(workspace_id);
    let check = autumn.check(CheckParams::new(cid, feature_id)).await?;

    require_allowed(check.allowed, feature_id, "your plan does not include")
}

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

pub async fn track_feature_with_key(
    state: &AppState,
    workspace_id: Uuid,
    feature_id: &str,
    delta: f64,
    idempotency_key: Option<String>,
) {
    let Some(autumn) = state.autumn.as_ref() else {
        return;
    };

    let cid = customer_id(workspace_id);
    let mut params = TrackParams::new(cid).feature_id(feature_id).value(delta);
    if let Some(key) = idempotency_key {
        params = params.idempotency_key(key);
    }

    if let Err(e) = autumn.track(params).await {
        tracing::warn!(
            workspace_id = %workspace_id,
            feature_id,
            delta,
            error = %e,
            "failed to track Autumn usage"
        );
    }
}

pub async fn reconcile_usage(state: &AppState, workspace_id: Uuid) -> ApiResult<()> {
    let Some(autumn) = state.autumn.as_ref() else {
        return Ok(());
    };

    let cid = customer_id(workspace_id);
    let customer = autumn
        .customers()
        .get({
            let mut params = GetCustomerParams::new(cid.clone());
            params.expand = Some(vec!["balances.feature".into()]);
            params
        })
        .await?;

    let monitor_count = monitor::Entity::find()
        .filter(monitor::Column::WorkspaceId.eq(workspace_id))
        .count(&state.db)
        .await? as f64;

    let member_count = workspace_member::Entity::find()
        .filter(workspace_member::Column::WorkspaceId.eq(workspace_id))
        .count(&state.db)
        .await? as f64;

    let event_balance = customer.balances.as_ref().and_then(|b| b.get("events"));
    let event_count = count_checks_for_balance_window(state, workspace_id, event_balance).await?;
    let event_units = event_count * EVENT_UNITS_PER_CHECK;

    for (feature_id, db_count) in [
        ("monitors", monitor_count),
        ("members", member_count),
        ("events", event_units),
    ] {
        let balance = customer.balances.as_ref().and_then(|b| b.get(feature_id));
        let autumn_usage = balance_usage(balance);
        let delta = db_count - autumn_usage;
        if delta.abs() > f64::EPSILON {
            // Best-effort: the deterministic idempotency key means Autumn applies this
            // delta exactly once even when concurrent callers (e.g. the billing page
            // loading `customer` and `plans` together) race. A racing request gets a 409
            // "already received" — swallow it rather than failing the user-facing request.
            let key = reconcile_key(workspace_id, feature_id, db_count, autumn_usage, balance);
            track_feature_with_key(state, workspace_id, feature_id, delta, Some(key)).await;
        }
    }

    Ok(())
}

pub async fn load_owner_email(state: &AppState, owner_id: Uuid) -> ApiResult<String> {
    user::Entity::find_by_id(owner_id)
        .one(&state.db)
        .await?
        .map(|u| u.email)
        .ok_or_else(|| ApiError::not_found("workspace owner"))
}

fn balance_usage(balance: Option<&Balance>) -> f64 {
    balance.and_then(|b| b.usage).unwrap_or(0.0)
}

fn customer_has_plan(customer: &Customer) -> bool {
    let has_subscription = customer
        .subscriptions
        .as_ref()
        .is_some_and(|subscriptions| !subscriptions.is_empty());
    let has_purchase = customer
        .purchases
        .as_ref()
        .is_some_and(|purchases| !purchases.is_empty());
    let has_balances = customer
        .balances
        .as_ref()
        .is_some_and(|balances| !balances.is_empty());

    has_subscription || has_purchase || has_balances
}

#[derive(FromQueryResult)]
struct CountRow {
    count: i64,
}

async fn count_checks_for_balance_window(
    state: &AppState,
    workspace_id: Uuid,
    balance: Option<&Balance>,
) -> ApiResult<f64> {
    let Some(start) = balance.and_then(balance_window_start) else {
        return Ok(0.0);
    };
    let Some(end) = balance.and_then(balance_next_reset) else {
        return Ok(0.0);
    };

    let row = CountRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT COUNT(*)::BIGINT AS count
        FROM checks c
        JOIN monitors m ON m.id = c.monitor_id
        WHERE m.workspace_id = $1
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

fn balance_window_start(balance: &Balance) -> Option<DateTime<Utc>> {
    let next_reset = balance_next_reset(balance)?;
    let interval = balance
        .breakdown
        .as_ref()
        .and_then(|breakdown| breakdown.iter().find_map(|part| part.reset.as_ref()))
        .map(|reset| &reset.interval)
        .unwrap_or(&ResetInterval::Month);

    let start = match interval {
        ResetInterval::Minute => next_reset - Duration::minutes(1),
        ResetInterval::Hour => next_reset - Duration::hours(1),
        ResetInterval::Day => next_reset - Duration::days(1),
        ResetInterval::Week => next_reset - Duration::weeks(1),
        ResetInterval::Month => next_reset.checked_sub_months(Months::new(1))?,
        ResetInterval::Quarter => next_reset.checked_sub_months(Months::new(3))?,
        ResetInterval::SemiAnnual => next_reset.checked_sub_months(Months::new(6))?,
        ResetInterval::Year => next_reset.checked_sub_months(Months::new(12))?,
        ResetInterval::OneOff | ResetInterval::Multiple => return None,
    };

    Some(start)
}

fn balance_next_reset(balance: &Balance) -> Option<DateTime<Utc>> {
    autumn_timestamp(balance.next_reset_at?)
}

fn autumn_timestamp(raw: i64) -> Option<DateTime<Utc>> {
    if raw.abs() >= 10_000_000_000 {
        Utc.timestamp_millis_opt(raw).single()
    } else {
        Utc.timestamp_opt(raw, 0).single()
    }
}

fn reconcile_key(
    workspace_id: Uuid,
    feature_id: &str,
    db_count: f64,
    autumn_usage: f64,
    balance: Option<&Balance>,
) -> String {
    let reset = balance.and_then(|b| b.next_reset_at).unwrap_or_default();
    format!("reconcile-{workspace_id}-{feature_id}-{db_count:.6}-{autumn_usage:.6}-{reset}")
}

fn require_allowed(allowed: bool, feature_id: &str, reason: &str) -> ApiResult<()> {
    if allowed {
        Ok(())
    } else {
        let label = feature_label(feature_id);
        Err(ApiError::payment_required(format!(
            "{reason} {label}; upgrade your plan to continue"
        )))
    }
}

fn feature_label(feature_id: &str) -> &'static str {
    match feature_id {
        "monitors" => "monitors",
        "members" => "members",
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
    use autumn::Reset;
    use std::collections::BTreeMap;

    #[test]
    fn customer_id_is_workspace_uuid() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert_eq!(customer_id(id), "550e8400-e29b-41d4-a716-446655440000");
    }

    #[test]
    fn reconcile_key_includes_observed_balance_state() {
        let id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert_eq!(
            reconcile_key(id, "monitors", 5.0, 2.0, None),
            "reconcile-550e8400-e29b-41d4-a716-446655440000-monitors-5.000000-2.000000-0"
        );
    }

    #[test]
    fn check_events_are_weighted_for_billing() {
        assert_eq!(3.0 * EVENT_UNITS_PER_CHECK, 30.0);
    }

    #[test]
    fn customer_without_plan_state_needs_free_backfill() {
        let customer = Customer {
            id: Some("cus_123".into()),
            name: None,
            email: None,
            created_at: None,
            fingerprint: None,
            stripe_id: None,
            env: None,
            metadata: None,
            send_email_receipts: None,
            billing_controls: None,
            subscriptions: Some(vec![]),
            purchases: Some(vec![]),
            balances: Some(BTreeMap::new()),
            flags: None,
            extra: Default::default(),
        };

        assert!(!customer_has_plan(&customer));
    }

    #[test]
    fn customer_with_balances_is_treated_as_plan_attached() {
        let mut balances = BTreeMap::new();
        balances.insert("monitors".into(), balance_with_next_reset(1_779_724_800));
        let customer = Customer {
            id: Some("cus_123".into()),
            name: None,
            email: None,
            created_at: None,
            fingerprint: None,
            stripe_id: None,
            env: None,
            metadata: None,
            send_email_receipts: None,
            billing_controls: None,
            subscriptions: Some(vec![]),
            purchases: Some(vec![]),
            balances: Some(balances),
            flags: None,
            extra: Default::default(),
        };

        assert!(customer_has_plan(&customer));
    }

    #[test]
    fn monthly_balance_window_uses_previous_calendar_month() {
        let balance = balance_with_next_reset(1_780_272_000_000);
        let start = balance_window_start(&balance).expect("monthly reset window");

        assert_eq!(start, Utc.with_ymd_and_hms(2026, 5, 1, 0, 0, 0).unwrap());
    }

    #[test]
    fn autumn_timestamp_accepts_seconds_and_milliseconds() {
        let seconds = autumn_timestamp(1_780_272_000).expect("seconds timestamp");
        let millis = autumn_timestamp(1_780_272_000_000).expect("millis timestamp");

        assert_eq!(seconds, millis);
        assert_eq!(millis, Utc.with_ymd_and_hms(2026, 6, 1, 0, 0, 0).unwrap());
    }

    fn balance_with_next_reset(next_reset_at: i64) -> Balance {
        Balance {
            feature_id: "events".into(),
            feature: None,
            granted: Some(10_000.0),
            remaining: Some(10_000.0),
            usage: Some(0.0),
            unlimited: Some(false),
            overage_allowed: Some(false),
            max_purchase: None,
            next_reset_at: Some(next_reset_at),
            breakdown: Some(vec![autumn::BalanceBreakdown {
                id: "balance_123".into(),
                plan_id: Some("free".into()),
                included_grant: Some(10_000.0),
                prepaid_grant: None,
                remaining: Some(10_000.0),
                usage: Some(0.0),
                unlimited: Some(false),
                reset: Some(Reset {
                    interval: ResetInterval::Month,
                    interval_count: Some(1.0),
                    resets_at: Some(next_reset_at),
                    extra: Default::default(),
                }),
                price: None,
                expires_at: None,
                extra: Default::default(),
            }]),
            rollovers: None,
            extra: Default::default(),
        }
    }
}
