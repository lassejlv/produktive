use crate::state::AppState;
use chrono::{DateTime, Duration, FixedOffset, Utc};
use polar_rs::models::{IngestEvent, IngestEventsRequest};
use produktive_billing::ChatTurnUsage;
use produktive_entity::{billing_usage_event as usage_event, organization_subscription as os};
use sea_orm::{
    sea_query::{LockBehavior, LockType, OnConflict},
    ActiveModelTrait, ColumnTrait, Condition, EntityTrait, IntoActiveModel, QueryFilter,
    QueryOrder, QuerySelect, Set, TransactionTrait,
};
use serde_json::Value;
use std::collections::HashMap;
use std::time::Duration as StdDuration;
use uuid::Uuid;

const EVENT_NAME: &str = "ai_message";
const TICK_SECONDS: u64 = 15;
const BATCH_SIZE: u64 = 25;
const MAX_ATTEMPTS: i32 = 10;
const PROCESSING_TIMEOUT_SECONDS: i64 = 300;
const SUBSCRIPTION_GRACE_SECONDS: i64 = 86_400;
const ACTIVE_STATUSES: &[&str] = &["active", "trialing"];
const STATUS_PENDING: &str = "pending";
const STATUS_PROCESSING: &str = "processing";
const STATUS_SENT: &str = "sent";
const STATUS_FAILED: &str = "failed";
const STATUS_LOCAL_ONLY: &str = "local_only";

pub fn spawn_billing_usage_worker(state: AppState) {
    tracing::info!(
        meter_id = %state.config.polar_ai_messages_meter_id,
        "starting billing usage worker"
    );

    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(StdDuration::from_secs(TICK_SECONDS));
        loop {
            ticker.tick().await;
            if let Err(error) = flush_due_events(&state).await {
                tracing::warn!(%error, "billing usage worker tick failed");
            }
        }
    });
}

pub async fn enqueue_chat_turn_usage(
    state: &AppState,
    usage: ChatTurnUsage,
) -> Result<(), anyhow::Error> {
    let now = Utc::now().fixed_offset();
    let active = usage_event::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        organization_id: Set(usage.organization_id),
        chat_id: Set(usage.chat_id),
        user_message_id: Set(usage.user_message_id),
        external_id: Set(usage.external_id),
        model: Set(usage.model),
        credits: Set(to_i64(usage.credits)),
        prompt_tokens: Set(to_i64(usage.prompt_tokens)),
        completion_tokens: Set(to_i64(usage.completion_tokens)),
        total_tokens: Set(to_i64(usage.total_tokens)),
        usage_source: Set(usage.usage_source.as_str().to_owned()),
        tool_call_count: Set(to_i64(usage.tool_call_count)),
        tool_result_bytes: Set(to_i64(usage.tool_result_bytes)),
        round_count: Set(to_i64(usage.round_count)),
        metadata: Set(usage.metadata),
        status: Set(STATUS_PENDING.to_owned()),
        attempts: Set(0),
        last_error: Set(None),
        next_retry_at: Set(None),
        sent_at: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    };

    usage_event::Entity::insert(active)
        .on_conflict(
            OnConflict::column(usage_event::Column::ExternalId)
                .do_nothing()
                .to_owned(),
        )
        .exec_without_returning(&state.db)
        .await?;

    Ok(())
}

async fn flush_due_events(state: &AppState) -> Result<(), anyhow::Error> {
    let now = Utc::now().fixed_offset();
    let rows = claim_due_events(state, now).await?;

    for row in rows {
        if let Err(error) = flush_one_event(state, row).await {
            tracing::warn!(%error, "billing usage event flush failed");
        }
    }

    Ok(())
}

async fn claim_due_events(
    state: &AppState,
    now: DateTime<FixedOffset>,
) -> Result<Vec<usage_event::Model>, anyhow::Error> {
    let txn = state.db.begin().await?;
    let stale_processing_at = now - Duration::seconds(PROCESSING_TIMEOUT_SECONDS);
    let rows = usage_event::Entity::find()
        .filter(
            Condition::any()
                .add(
                    Condition::all()
                        .add(usage_event::Column::Status.eq(STATUS_PENDING))
                        .add(
                            usage_event::Column::NextRetryAt
                                .is_null()
                                .or(usage_event::Column::NextRetryAt.lte(now)),
                        ),
                )
                .add(
                    Condition::all()
                        .add(usage_event::Column::Status.eq(STATUS_PROCESSING))
                        .add(usage_event::Column::UpdatedAt.lte(stale_processing_at)),
                ),
        )
        .order_by_asc(usage_event::Column::CreatedAt)
        .limit(BATCH_SIZE)
        .lock_with_behavior(LockType::Update, LockBehavior::SkipLocked)
        .all(&txn)
        .await?;

    for row in &rows {
        let mut active = row.clone().into_active_model();
        active.status = Set(STATUS_PROCESSING.to_owned());
        active.updated_at = Set(now);
        active.update(&txn).await?;
    }

    txn.commit().await?;
    Ok(rows)
}

async fn flush_one_event(state: &AppState, row: usage_event::Model) -> Result<(), anyhow::Error> {
    match billable_state(state, &row).await? {
        BillableState::Billable => {}
        BillableState::WaitingForSubscription => {
            mark_pending(
                state,
                row,
                "waiting for matching Polar subscription period".to_owned(),
            )
            .await?;
            return Ok(());
        }
        BillableState::LocalOnly => {
            mark_local_only(state, row).await?;
            return Ok(());
        }
    }

    let event = IngestEvent {
        name: EVENT_NAME.to_owned(),
        external_customer_id: row.organization_id.clone(),
        timestamp: Some(row.created_at.to_rfc3339()),
        external_id: Some(row.external_id.clone()),
        parent_id: None,
        metadata: metadata_map(row.metadata.clone()),
    };

    let response = state
        .polar
        .events()
        .ingest(IngestEventsRequest {
            events: vec![event],
        })
        .await;

    match response {
        Ok(result) => {
            let now = Utc::now().fixed_offset();
            let mut active = row.into_active_model();
            active.status = Set(STATUS_SENT.to_owned());
            active.sent_at = Set(Some(now));
            active.updated_at = Set(now);
            active.last_error = Set(None);
            active.update(&state.db).await?;
            tracing::info!(
                inserted = result.inserted,
                duplicates = result.duplicates,
                "billing usage event ingested"
            );
        }
        Err(error) => {
            mark_retry(state, row, error.to_string()).await?;
        }
    }

    Ok(())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BillableState {
    Billable,
    WaitingForSubscription,
    LocalOnly,
}

async fn billable_state(
    state: &AppState,
    row: &usage_event::Model,
) -> Result<BillableState, anyhow::Error> {
    let now = Utc::now().fixed_offset();
    let event_time = row.created_at;
    let mut product_ids = vec![state.config.polar_pro_product_id.clone()];
    if let Some(team_product_id) = &state.config.polar_team_product_id {
        product_ids.push(team_product_id.clone());
    }

    let subscription = os::Entity::find()
        .filter(os::Column::OrganizationId.eq(&row.organization_id))
        .filter(os::Column::ProductId.is_in(product_ids))
        .filter(os::Column::Status.is_in(ACTIVE_STATUSES.iter().copied()))
        .all(&state.db)
        .await?;

    if subscription
        .into_iter()
        .any(|sub| subscription_covers_event(&sub, event_time))
    {
        return Ok(BillableState::Billable);
    }

    if now - event_time < Duration::seconds(SUBSCRIPTION_GRACE_SECONDS) {
        return Ok(BillableState::WaitingForSubscription);
    }

    Ok(BillableState::LocalOnly)
}

fn subscription_covers_event(sub: &os::Model, event_time: DateTime<FixedOffset>) -> bool {
    let start = sub.current_period_start.unwrap_or(sub.created_at);
    let end = sub.ends_at.or(sub.current_period_end);

    event_time >= start && end.map_or(true, |end| event_time <= end)
}

async fn mark_local_only(state: &AppState, row: usage_event::Model) -> Result<(), anyhow::Error> {
    let now = Utc::now().fixed_offset();
    let mut active = row.into_active_model();
    active.status = Set(STATUS_LOCAL_ONLY.to_owned());
    active.updated_at = Set(now);
    active.update(&state.db).await?;
    Ok(())
}

async fn mark_pending(
    state: &AppState,
    row: usage_event::Model,
    reason: String,
) -> Result<(), anyhow::Error> {
    let now = Utc::now().fixed_offset();
    let mut active = row.into_active_model();
    active.status = Set(STATUS_PENDING.to_owned());
    active.last_error = Set(Some(reason));
    active.next_retry_at = Set(Some(now + Duration::seconds(900)));
    active.updated_at = Set(now);
    active.update(&state.db).await?;
    Ok(())
}

async fn mark_retry(
    state: &AppState,
    row: usage_event::Model,
    error: String,
) -> Result<(), anyhow::Error> {
    let now = Utc::now().fixed_offset();
    let attempts = row.attempts.saturating_add(1);
    let failed = attempts >= MAX_ATTEMPTS;
    let mut active = row.into_active_model();
    active.attempts = Set(attempts);
    active.last_error = Set(Some(error));
    active.updated_at = Set(now);
    active.status = Set(if failed {
        STATUS_FAILED
    } else {
        STATUS_PENDING
    }
    .to_owned());
    active.next_retry_at = Set(if failed {
        None
    } else {
        Some(next_retry_at(now, attempts))
    });
    active.update(&state.db).await?;
    Ok(())
}

fn next_retry_at(now: DateTime<FixedOffset>, attempts: i32) -> DateTime<FixedOffset> {
    let seconds = 60_i64.saturating_mul(2_i64.saturating_pow(attempts.max(0) as u32));
    now + Duration::seconds(seconds.min(3_600))
}

fn metadata_map(value: Value) -> HashMap<String, Value> {
    match value {
        Value::Object(map) => map.into_iter().collect(),
        _ => HashMap::new(),
    }
}

fn to_i64(value: u64) -> i64 {
    value.min(i64::MAX as u64) as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn subscription(start: DateTime<FixedOffset>, end: DateTime<FixedOffset>) -> os::Model {
        os::Model {
            id: "sub_1".to_owned(),
            organization_id: "org_1".to_owned(),
            product_id: "product_1".to_owned(),
            status: "active".to_owned(),
            current_period_start: Some(start),
            current_period_end: Some(end),
            cancel_at_period_end: false,
            canceled_at: None,
            ends_at: None,
            customer_id: Some("customer_1".to_owned()),
            created_at: start,
            updated_at: start,
        }
    }

    #[test]
    fn subscription_period_must_cover_event_time() {
        let start = DateTime::parse_from_rfc3339("2026-05-01T00:00:00Z").unwrap();
        let end = DateTime::parse_from_rfc3339("2026-06-01T00:00:00Z").unwrap();
        let sub = subscription(start, end);

        assert!(subscription_covers_event(
            &sub,
            DateTime::parse_from_rfc3339("2026-05-15T12:00:00Z").unwrap(),
        ));
        assert!(!subscription_covers_event(
            &sub,
            DateTime::parse_from_rfc3339("2026-04-30T23:59:59Z").unwrap(),
        ));
        assert!(!subscription_covers_event(
            &sub,
            DateTime::parse_from_rfc3339("2026-06-01T00:00:01Z").unwrap(),
        ));
    }
}
