use polar::CustomerState;
use sea_orm::{ConnectionTrait, DatabaseBackend, FromQueryResult, Statement};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    billing::{find_workspace_for_customer, parse_workspace_id, store_customer_state},
    error::{ApiError, ApiResult},
    state::AppState,
};

const STATUS_PROCESSING: i16 = 0;
const STATUS_PROCESSED: i16 = 1;
const STATUS_IGNORED: i16 = 2;
const STATUS_FAILED: i16 = 3;

#[derive(Debug, Clone, Deserialize)]
pub struct PolarWebhookPayload {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(default)]
    pub data: Value,
}

#[derive(Debug, Clone, Default)]
struct WebhookInfo {
    polar_event_id: Option<String>,
    event_type: String,
    workspace_id: Option<Uuid>,
    polar_customer_id: Option<String>,
    polar_external_id: Option<String>,
    polar_subscription_id: Option<String>,
}

#[derive(Debug, Clone)]
struct ProcessedInfo {
    workspace_id: Uuid,
    polar_customer_id: String,
    polar_external_id: Option<String>,
    polar_subscription_id: Option<String>,
}

enum WebhookOutcome {
    Processed(ProcessedInfo),
    Ignored,
}

pub async fn handle_polar_webhook(
    state: &AppState,
    webhook_id: String,
    payload: PolarWebhookPayload,
    raw_payload: Value,
) -> ApiResult<()> {
    let info = webhook_info(&payload);
    let status = record_webhook_received(state, &webhook_id, &info, raw_payload).await?;
    if matches!(status, STATUS_PROCESSED | STATUS_IGNORED) {
        return Ok(());
    }

    match process_webhook(state, &payload, &info).await {
        Ok(WebhookOutcome::Processed(info)) => {
            mark_webhook_event(state, &webhook_id, STATUS_PROCESSED, None, Some(&info)).await
        }
        Ok(WebhookOutcome::Ignored) => {
            mark_webhook_event(state, &webhook_id, STATUS_IGNORED, None, None).await
        }
        Err(error) => {
            let msg = error.to_string();
            mark_webhook_event(state, &webhook_id, STATUS_FAILED, Some(&msg), None).await?;
            Err(error)
        }
    }
}

async fn process_webhook(
    state: &AppState,
    payload: &PolarWebhookPayload,
    info: &WebhookInfo,
) -> ApiResult<WebhookOutcome> {
    if !is_state_changing_event(&payload.event_type) {
        return Ok(WebhookOutcome::Ignored);
    }

    if payload.event_type == "customer.deleted" {
        return process_deleted_customer(state, payload, info).await;
    }

    let billing = state
        .billing
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("billing is not configured"))?;

    let customer_state = if let Some(external_id) = info.polar_external_id.as_deref() {
        billing
            .client
            .customers()
            .state_by_external(external_id)
            .await?
    } else if let Some(customer_id) = info.polar_customer_id.as_deref() {
        billing.client.customers().state_by_id(customer_id).await?
    } else if let Some(workspace_id) =
        find_workspace_for_customer(state, None, info.polar_external_id.as_deref()).await?
    {
        billing
            .client
            .customers()
            .state_by_external(&workspace_id.to_string())
            .await?
    } else {
        return Ok(WebhookOutcome::Ignored);
    };

    let Some(workspace_id) = customer_state
        .external_id
        .as_deref()
        .and_then(parse_workspace_id)
        .or(info.workspace_id)
    else {
        return Ok(WebhookOutcome::Ignored);
    };

    store_customer_state(state, workspace_id, &customer_state, payload.id.as_deref()).await?;
    let processed = processed_info(workspace_id, &customer_state);
    Ok(WebhookOutcome::Processed(processed))
}

async fn process_deleted_customer(
    state: &AppState,
    payload: &PolarWebhookPayload,
    info: &WebhookInfo,
) -> ApiResult<WebhookOutcome> {
    let Some(workspace_id) = info
        .workspace_id
        .or_else(|| {
            info.polar_external_id
                .as_deref()
                .and_then(parse_workspace_id)
        })
        .or(find_workspace_for_customer(
            state,
            info.polar_customer_id.as_deref(),
            info.polar_external_id.as_deref(),
        )
        .await?)
    else {
        return Ok(WebhookOutcome::Ignored);
    };

    let customer_state = CustomerState {
        id: info
            .polar_customer_id
            .clone()
            .unwrap_or_else(|| "deleted".to_owned()),
        external_id: Some(workspace_id.to_string()),
        email: None,
        active_subscriptions: vec![],
        granted_benefits: vec![],
        active_meters: vec![],
    };
    store_customer_state(state, workspace_id, &customer_state, payload.id.as_deref()).await?;
    Ok(WebhookOutcome::Processed(processed_info(
        workspace_id,
        &customer_state,
    )))
}

fn processed_info(workspace_id: Uuid, state: &CustomerState) -> ProcessedInfo {
    ProcessedInfo {
        workspace_id,
        polar_customer_id: state.id.clone(),
        polar_external_id: state.external_id.clone(),
        polar_subscription_id: state.active_subscription().map(|sub| sub.id.clone()),
    }
}

fn webhook_info(payload: &PolarWebhookPayload) -> WebhookInfo {
    let mut info = WebhookInfo {
        polar_event_id: payload.id.clone(),
        event_type: payload.event_type.clone(),
        workspace_id: None,
        polar_customer_id: first_string(
            payload,
            &[
                &["data", "customer_id"],
                &["data", "customer", "id"],
                &["data", "customer", "customer_id"],
            ],
        ),
        polar_external_id: first_string(
            payload,
            &[
                &["data", "external_id"],
                &["data", "customer_external_id"],
                &["data", "customer", "external_id"],
                &["data", "metadata", "external_id"],
                &["data", "customer", "metadata", "external_id"],
            ],
        ),
        polar_subscription_id: first_string(
            payload,
            &[
                &["data", "subscription_id"],
                &["data", "subscription", "id"],
                &["data", "subscription", "subscription_id"],
            ],
        ),
    };
    if payload.event_type.starts_with("customer.") {
        info.polar_customer_id = info
            .polar_customer_id
            .or_else(|| string_at(&payload.data, &["id"]));
    }
    if payload.event_type.starts_with("subscription.") {
        info.polar_subscription_id = info
            .polar_subscription_id
            .or_else(|| string_at(&payload.data, &["id"]));
    }
    info.workspace_id = info
        .polar_external_id
        .as_deref()
        .and_then(parse_workspace_id);
    info
}

fn first_string(payload: &PolarWebhookPayload, paths: &[&[&str]]) -> Option<String> {
    paths.iter().find_map(|path| {
        let value = if path.first() == Some(&"data") {
            string_at(&payload.data, &path[1..])
        } else {
            None
        };
        value.filter(|value| !value.trim().is_empty())
    })
}

fn string_at(value: &Value, path: &[&str]) -> Option<String> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    current.as_str().map(str::to_owned).or_else(|| {
        current
            .as_i64()
            .map(|n| n.to_string())
            .or_else(|| current.as_u64().map(|n| n.to_string()))
    })
}

fn is_state_changing_event(event_type: &str) -> bool {
    matches!(
        event_type,
        "customer.state_changed"
            | "customer.updated"
            | "customer.deleted"
            | "subscription.created"
            | "subscription.updated"
            | "subscription.active"
            | "subscription.uncanceled"
            | "subscription.canceled"
            | "subscription.past_due"
            | "subscription.revoked"
            | "benefit_grant.created"
            | "benefit_grant.updated"
            | "benefit_grant.revoked"
            | "order.created"
            | "order.updated"
            | "order.paid"
    )
}

#[derive(FromQueryResult)]
struct StatusRow {
    status: i16,
}

async fn record_webhook_received(
    state: &AppState,
    webhook_id: &str,
    info: &WebhookInfo,
    payload: Value,
) -> ApiResult<i16> {
    let row = StatusRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        INSERT INTO polar_webhook_events (
            id, webhook_id, polar_event_id, event_type, workspace_id, polar_customer_id,
            polar_external_id, polar_subscription_id, payload, status, received_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
        ON CONFLICT (webhook_id) DO UPDATE SET
            status = CASE
                WHEN polar_webhook_events.status = $11 THEN $10
                ELSE polar_webhook_events.status
            END,
            error_message = CASE
                WHEN polar_webhook_events.status = $11 THEN NULL
                ELSE polar_webhook_events.error_message
            END,
            processed_at = CASE
                WHEN polar_webhook_events.status = $11 THEN NULL
                ELSE polar_webhook_events.processed_at
            END,
            payload = CASE
                WHEN polar_webhook_events.status = $11 THEN EXCLUDED.payload
                ELSE polar_webhook_events.payload
            END,
            received_at = CASE
                WHEN polar_webhook_events.status = $11 THEN now()
                ELSE polar_webhook_events.received_at
            END
        RETURNING status
        "#,
        vec![
            Uuid::now_v7().into(),
            webhook_id.to_owned().into(),
            info.polar_event_id.clone().into(),
            info.event_type.clone().into(),
            info.workspace_id.into(),
            info.polar_customer_id.clone().into(),
            info.polar_external_id.clone().into(),
            info.polar_subscription_id.clone().into(),
            payload.into(),
            STATUS_PROCESSING.into(),
            STATUS_FAILED.into(),
        ],
    ))
    .one(&state.db)
    .await?
    .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("failed to record Polar webhook")))?;
    Ok(row.status)
}

async fn mark_webhook_event(
    state: &AppState,
    webhook_id: &str,
    status: i16,
    error_message: Option<&str>,
    processed: Option<&ProcessedInfo>,
) -> ApiResult<()> {
    state
        .db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE polar_webhook_events
            SET status = $2,
                error_message = $3,
                processed_at = now(),
                workspace_id = COALESCE($4, workspace_id),
                polar_customer_id = COALESCE($5, polar_customer_id),
                polar_external_id = COALESCE($6, polar_external_id),
                polar_subscription_id = COALESCE($7, polar_subscription_id)
            WHERE webhook_id = $1
            "#,
            vec![
                webhook_id.to_owned().into(),
                status.into(),
                error_message.map(ToOwned::to_owned).into(),
                processed.map(|info| info.workspace_id).into(),
                processed.map(|info| info.polar_customer_id.clone()).into(),
                processed
                    .and_then(|info| info.polar_external_id.clone())
                    .into(),
                processed
                    .and_then(|info| info.polar_subscription_id.clone())
                    .into(),
            ],
        ))
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(event_type: &str, data: Value) -> PolarWebhookPayload {
        PolarWebhookPayload {
            id: Some("evt_1".to_owned()),
            event_type: event_type.to_owned(),
            data,
        }
    }

    #[test]
    fn extracts_customer_state_changed_identifiers() {
        let payload = payload(
            "customer.state_changed",
            serde_json::json!({
                "id": "cus_1",
                "external_id": "550e8400-e29b-41d4-a716-446655440000"
            }),
        );
        let info = webhook_info(&payload);
        assert_eq!(info.polar_customer_id.as_deref(), Some("cus_1"));
        assert_eq!(
            info.workspace_id,
            Some(Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap())
        );
    }

    #[test]
    fn extracts_subscription_identifiers() {
        let payload = payload(
            "subscription.updated",
            serde_json::json!({
                "id": "sub_1",
                "customer": {
                    "id": "cus_1",
                    "external_id": "550e8400-e29b-41d4-a716-446655440000"
                }
            }),
        );
        let info = webhook_info(&payload);
        assert_eq!(info.polar_customer_id.as_deref(), Some("cus_1"));
        assert_eq!(info.polar_subscription_id.as_deref(), Some("sub_1"));
    }

    #[test]
    fn classifies_unknown_events_as_non_state_changing() {
        assert!(is_state_changing_event("order.paid"));
        assert!(!is_state_changing_event("product.updated"));
    }
}
