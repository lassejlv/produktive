use std::sync::Arc;

use chrono::{DateTime, Duration, FixedOffset, Utc};
use entity::{workspace, workspace_billing_state};
use polar::{CustomerState, StateMeter};
use sea_orm::{
    ColumnTrait, ConnectionTrait, DatabaseBackend, EntityTrait, FromQueryResult, QueryFilter,
    Statement,
};
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

const SNAPSHOT_MAX_AGE: Duration = Duration::minutes(5);

pub struct StoredCustomerState {
    pub state: Arc<CustomerState>,
    pub fresh: bool,
}

pub enum MeterUsageUpdate {
    Increment(f64),
    Set(f64),
}

pub async fn billing_customer_workspace_id(
    state: &AppState,
    workspace_id: Uuid,
) -> ApiResult<Uuid> {
    let Some(ws) = workspace::Entity::find_by_id(workspace_id)
        .one(&state.db)
        .await?
    else {
        return Ok(workspace_id);
    };
    if ws.is_personal {
        return Ok(ws.id);
    }

    let personal = workspace::Entity::find()
        .filter(workspace::Column::OwnerId.eq(ws.owner_id))
        .filter(workspace::Column::IsPersonal.eq(true))
        .one(&state.db)
        .await?;
    Ok(personal.map(|ws| ws.id).unwrap_or(ws.id))
}

pub async fn stored_customer_state(
    state: &AppState,
    workspace_id: Uuid,
) -> ApiResult<Option<StoredCustomerState>> {
    let Some(billing) = state.billing.as_ref() else {
        return Ok(None);
    };
    let billing_workspace_id = billing_customer_workspace_id(state, workspace_id).await?;
    let Some(row) = workspace_billing_state::Entity::find_by_id(billing_workspace_id)
        .one(&state.db)
        .await?
    else {
        return Ok(None);
    };
    let customer_state = match serde_json::from_value::<CustomerState>(row.customer_state) {
        Ok(state) => state,
        Err(error) => {
            tracing::warn!(workspace_id = %workspace_id, billing_workspace_id = %billing_workspace_id, error = ?error, "stored billing state is invalid");
            return Ok(None);
        }
    };
    let fresh = row.last_synced_at >= Utc::now().fixed_offset() - SNAPSHOT_MAX_AGE;
    let state = if fresh {
        billing.cache_state(billing_workspace_id, customer_state)
    } else {
        Arc::new(customer_state)
    };
    Ok(Some(StoredCustomerState { state, fresh }))
}

pub async fn customer_state_for_billing(
    state: &AppState,
    workspace_id: Uuid,
) -> ApiResult<Arc<CustomerState>> {
    let billing_workspace_id = billing_customer_workspace_id(state, workspace_id).await?;
    if let Some(cached) = state
        .billing
        .as_ref()
        .and_then(|billing| billing.cached_state(billing_workspace_id))
    {
        return Ok(cached);
    }

    let stored = stored_customer_state(state, workspace_id).await?;
    if let Some(stored) = stored.as_ref().filter(|stored| stored.fresh) {
        return Ok(stored.state.clone());
    }

    match refresh_and_store_customer_state(state, workspace_id).await {
        Ok(state) => Ok(state),
        Err(error) if stored.is_some() => {
            tracing::warn!(workspace_id = %workspace_id, error = ?error, "using stale stored billing state after Polar refresh failed");
            Ok(stored.expect("checked is_some").state)
        }
        Err(error) => Err(error),
    }
}

pub async fn refresh_and_store_customer_state(
    state: &AppState,
    workspace_id: Uuid,
) -> ApiResult<Arc<CustomerState>> {
    let billing_workspace_id = billing_customer_workspace_id(state, workspace_id).await?;
    let billing = state
        .billing
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("billing is not configured"))?;
    let customer_state = billing.refresh_state(billing_workspace_id).await?;
    store_customer_state(state, billing_workspace_id, &customer_state, None).await?;
    Ok(customer_state)
}

pub async fn store_customer_state(
    state: &AppState,
    workspace_id: Uuid,
    customer_state: &CustomerState,
    last_event_id: Option<&str>,
) -> ApiResult<()> {
    let billing_workspace_id = billing_customer_workspace_id(state, workspace_id).await?;
    let billing = state
        .billing
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("billing is not configured"))?;
    let sub = customer_state.active_subscription();
    let plan_id = plan_id_for_state(&billing.catalog, customer_state).to_owned();
    let product_id = sub.map(|sub| sub.product_id.clone());
    let subscription_id = sub.map(|sub| sub.id.clone());
    let subscription_status = sub.map(|sub| sub.status.clone());
    let cancel_at_period_end = sub.is_some_and(|sub| sub.cancel_at_period_end);
    let current_period_start =
        sub.and_then(|sub| parse_timestamp(sub.current_period_start.as_deref()));
    let current_period_end = sub.and_then(|sub| parse_timestamp(sub.current_period_end.as_deref()));
    let external_id = customer_state
        .external_id
        .clone()
        .unwrap_or_else(|| billing_workspace_id.to_string());
    let customer_state_json = serde_json::to_value(customer_state)
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?;

    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            INSERT INTO workspace_billing_states (
                workspace_id, polar_customer_id, polar_external_id, plan_id, polar_product_id,
                polar_subscription_id, subscription_status, cancel_at_period_end,
                current_period_start, current_period_end, customer_state, last_event_id,
                last_synced_at, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now(), now())
            ON CONFLICT (workspace_id) DO UPDATE SET
                polar_customer_id = EXCLUDED.polar_customer_id,
                polar_external_id = EXCLUDED.polar_external_id,
                plan_id = EXCLUDED.plan_id,
                polar_product_id = EXCLUDED.polar_product_id,
                polar_subscription_id = EXCLUDED.polar_subscription_id,
                subscription_status = EXCLUDED.subscription_status,
                cancel_at_period_end = EXCLUDED.cancel_at_period_end,
                current_period_start = EXCLUDED.current_period_start,
                current_period_end = EXCLUDED.current_period_end,
                customer_state = EXCLUDED.customer_state,
                last_event_id = COALESCE(EXCLUDED.last_event_id, workspace_billing_states.last_event_id),
                last_synced_at = now(),
                updated_at = now()
            "#,
            vec![
                billing_workspace_id.into(),
                customer_state.id.clone().into(),
                external_id.into(),
                plan_id.into(),
                product_id.into(),
                subscription_id.into(),
                subscription_status.into(),
                cancel_at_period_end.into(),
                current_period_start.into(),
                current_period_end.into(),
                customer_state_json.into(),
                last_event_id.map(ToOwned::to_owned).into(),
            ],
        ))
        .await?;

    billing.cache_state(billing_workspace_id, customer_state.clone());
    sync_monitor_billing_pause(state, billing_workspace_id, customer_state).await?;
    Ok(())
}

pub async fn update_stored_meter_usage(
    state: &AppState,
    workspace_id: Uuid,
    feature_id: &str,
    update: MeterUsageUpdate,
) -> ApiResult<()> {
    let Some(billing) = state.billing.as_ref() else {
        return Ok(());
    };
    let billing_workspace_id = billing_customer_workspace_id(state, workspace_id).await?;
    let Some(meter_id) = billing.catalog.meter_id(feature_id) else {
        return Ok(());
    };
    let Some(row) = workspace_billing_state::Entity::find()
        .filter(workspace_billing_state::Column::WorkspaceId.eq(billing_workspace_id))
        .one(&state.db)
        .await?
    else {
        return Ok(());
    };
    let mut customer_state = serde_json::from_value::<CustomerState>(row.customer_state)
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?;
    let Some(meter) = customer_state
        .active_meters
        .iter_mut()
        .find(|meter| meter.meter_id == meter_id)
    else {
        return Ok(());
    };
    apply_meter_update(meter, update);
    let customer_state_json = serde_json::to_value(&customer_state)
        .map_err(|error| ApiError::Internal(anyhow::anyhow!(error)))?;

    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE workspace_billing_states
            SET customer_state = $2,
                last_synced_at = now(),
                updated_at = now()
            WHERE workspace_id = $1
            "#,
            vec![billing_workspace_id.into(), customer_state_json.into()],
        ))
        .await?;
    billing.cache_state(billing_workspace_id, customer_state);
    Ok(())
}

/// Admin usage-reset bookkeeping for a billing customer, read from its
/// `workspace_billing_states` row (all `Utc`-normalised).
#[derive(Clone, Copy, Debug, Default)]
pub struct UsageReset {
    pub usage_reset_at: Option<DateTime<Utc>>,
    pub events_consumed_baseline: f64,
    pub events_baseline_period_end: Option<DateTime<Utc>>,
}

/// Load the usage-reset state for the billing customer behind `workspace_id`.
pub async fn load_usage_reset(state: &AppState, workspace_id: Uuid) -> ApiResult<UsageReset> {
    let billing_workspace_id = billing_customer_workspace_id(state, workspace_id).await?;
    let Some(row) = workspace_billing_state::Entity::find_by_id(billing_workspace_id)
        .one(&state.db)
        .await?
    else {
        return Ok(UsageReset::default());
    };
    Ok(UsageReset {
        usage_reset_at: row.usage_reset_at.map(|d| d.with_timezone(&Utc)),
        events_consumed_baseline: row.events_consumed_baseline,
        events_baseline_period_end: row
            .events_baseline_period_end
            .map(|d| d.with_timezone(&Utc)),
    })
}

/// Persist a usage reset onto the billing customer's row. `billing_workspace_id`
/// must already be the resolved billing-customer workspace.
pub async fn persist_usage_reset(
    state: &AppState,
    billing_workspace_id: Uuid,
    reset_at: DateTime<Utc>,
    events_consumed_baseline: f64,
    events_baseline_period_end: Option<DateTime<Utc>>,
) -> ApiResult<()> {
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE workspace_billing_states
            SET usage_reset_at = $2,
                events_consumed_baseline = $3,
                events_baseline_period_end = $4,
                updated_at = now()
            WHERE workspace_id = $1
            "#,
            vec![
                billing_workspace_id.into(),
                reset_at.fixed_offset().into(),
                events_consumed_baseline.into(),
                events_baseline_period_end.map(|d| d.fixed_offset()).into(),
            ],
        ))
        .await?;
    if let Some(billing) = state.billing.as_ref() {
        billing.invalidate(billing_workspace_id);
    }
    Ok(())
}

pub async fn find_workspace_for_customer(
    state: &AppState,
    customer_id: Option<&str>,
    external_id: Option<&str>,
) -> ApiResult<Option<Uuid>> {
    let Some(customer_id) = customer_id else {
        return Ok(external_id.and_then(parse_workspace_id));
    };

    #[derive(FromQueryResult)]
    struct WorkspaceRow {
        workspace_id: Uuid,
    }

    if let Some(row) = WorkspaceRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT workspace_id
        FROM workspace_billing_states
        WHERE polar_customer_id = $1
           OR ($2::TEXT IS NOT NULL AND polar_external_id = $2)
        ORDER BY updated_at DESC
        LIMIT 1
        "#,
        vec![
            customer_id.to_owned().into(),
            external_id.map(ToOwned::to_owned).into(),
        ],
    ))
    .one(&state.db)
    .await?
    {
        return Ok(Some(row.workspace_id));
    }

    Ok(external_id.and_then(parse_workspace_id))
}

pub fn parse_workspace_id(external_id: &str) -> Option<Uuid> {
    Uuid::parse_str(external_id).ok()
}

fn apply_meter_update(meter: &mut StateMeter, update: MeterUsageUpdate) {
    match update {
        MeterUsageUpdate::Increment(delta) => {
            meter.consumed_units += delta;
        }
        MeterUsageUpdate::Set(value) => {
            meter.consumed_units = value;
        }
    }
    meter.balance = meter.credited_units - meter.consumed_units;
}

async fn sync_monitor_billing_pause(
    state: &AppState,
    workspace_id: Uuid,
    customer_state: &CustomerState,
) -> ApiResult<()> {
    let is_past_due = customer_state
        .active_subscription()
        .is_some_and(|sub| sub.status == "past_due");
    let sql = if is_past_due {
        r#"
        UPDATE monitors
        SET billing_paused_at = COALESCE(billing_paused_at, now()),
            updated_at = now()
        WHERE workspace_id IN (
            SELECT owned.id
            FROM workspaces owned
            JOIN workspaces billing_ws ON billing_ws.owner_id = owned.owner_id
            WHERE billing_ws.id = $1
        )
          AND billing_paused_at IS NULL
        "#
    } else {
        r#"
        UPDATE monitors
        SET billing_paused_at = NULL,
            updated_at = now()
        WHERE workspace_id IN (
            SELECT owned.id
            FROM workspaces owned
            JOIN workspaces billing_ws ON billing_ws.owner_id = owned.owner_id
            WHERE billing_ws.id = $1
        )
          AND billing_paused_at IS NOT NULL
        "#
    };

    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            sql,
            vec![workspace_id.into()],
        ))
        .await?;
    Ok(())
}

fn parse_timestamp(raw: Option<&str>) -> Option<DateTime<FixedOffset>> {
    raw.and_then(|s| DateTime::parse_from_rfc3339(s).ok())
}

pub fn plan_id_for_state<'a>(
    catalog: &'a super::PolarCatalog,
    customer_state: &CustomerState,
) -> &'a str {
    customer_state
        .active_subscription()
        .and_then(|sub| catalog.tier_for_product(&sub.product_id))
        .unwrap_or("free")
}

#[cfg(test)]
mod tests {
    use super::*;
    use polar::StateSubscription;

    #[test]
    fn parse_workspace_id_only_accepts_uuids() {
        assert!(parse_workspace_id("550e8400-e29b-41d4-a716-446655440000").is_some());
        assert!(parse_workspace_id("customer-123").is_none());
    }

    #[test]
    fn meter_increment_updates_balance() {
        let mut meter = StateMeter {
            meter_id: "m_events".to_owned(),
            consumed_units: 10.0,
            credited_units: 25.0,
            balance: 15.0,
        };
        apply_meter_update(&mut meter, MeterUsageUpdate::Increment(5.0));
        assert_eq!(meter.consumed_units, 15.0);
        assert_eq!(meter.balance, 10.0);
    }

    #[test]
    fn past_due_state_is_detected_for_pause_sync() {
        let state = CustomerState {
            id: "cus_1".to_owned(),
            external_id: None,
            email: None,
            active_subscriptions: vec![StateSubscription {
                id: "sub_1".to_owned(),
                status: "past_due".to_owned(),
                product_id: "prod_basic".to_owned(),
                cancel_at_period_end: false,
                canceled_at: None,
                current_period_start: None,
                current_period_end: None,
                amount: 0,
                currency: None,
            }],
            granted_benefits: vec![],
            active_meters: vec![],
        };
        assert!(state
            .active_subscription()
            .is_some_and(|sub| sub.status == "past_due"));
    }

    #[test]
    fn plan_id_defaults_to_free_without_catalog_match() {
        let catalog = super::super::PolarCatalog::default();
        let state = CustomerState {
            id: "cus_1".to_owned(),
            external_id: None,
            email: None,
            active_subscriptions: vec![StateSubscription {
                id: "sub_1".to_owned(),
                status: "active".to_owned(),
                product_id: "prod_unknown".to_owned(),
                cancel_at_period_end: false,
                canceled_at: None,
                current_period_start: None,
                current_period_end: None,
                amount: 0,
                currency: None,
            }],
            granted_benefits: vec![],
            active_meters: vec![],
        };
        assert_eq!(plan_id_for_state(&catalog, &state), "free");
    }
}
