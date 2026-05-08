use crate::{
    ai_usage::{self, AiPlan},
    auth::require_auth,
    error::ApiError,
    permissions::{require_permission, BILLING_MANAGE},
    state::AppState,
};
use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
    Json, Router,
};
use polar_rs::{webhooks, Polar};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const PRO_PLAN_ID: &str = "pro";

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/checkout", post(create_checkout))
        .route("/webhook", post(handle_webhook))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateCheckoutRequest {
    plan: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckoutResponse {
    url: String,
}

async fn create_checkout(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateCheckoutRequest>,
) -> Result<Json<CheckoutResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_permission(&state, &auth, BILLING_MANAGE).await?;

    if payload.plan != PRO_PLAN_ID {
        return Err(ApiError::BadRequest(
            "Only Pro checkout is available right now".to_owned(),
        ));
    }

    if ai_usage::AiPlan::from_str(&auth.organization.ai_plan) == AiPlan::Pro {
        return Err(ApiError::BadRequest(
            "This workspace is already on Pro".to_owned(),
        ));
    }

    let access_token = state
        .config
        .polar_access_token
        .as_deref()
        .ok_or_else(|| billing_not_configured("POLAR_ACCESS_TOKEN"))?;
    let product_id = state
        .config
        .polar_pro_product_id
        .as_deref()
        .ok_or_else(|| billing_not_configured("POLAR_PRO_PRODUCT_ID"))?;
    let organization_id = auth.organization.id.clone();
    let organization_slug = auth.organization.slug.clone();
    let user_email = auth.user.email.clone();
    let user_name = auth.user.name.clone();
    let polar = Polar::new(access_token).map_err(map_polar_error)?;
    let workspace_url = format!("{}/{}", state.config.app_url, organization_slug);
    let checkout = polar
        .checkouts()
        .create(&json!({
            "products": [product_id],
            "allow_discount_codes": true,
            "external_customer_id": organization_id,
            "customer_email": user_email,
            "customer_name": user_name,
            "success_url": format!("{workspace_url}/settings?billing=success"),
            "return_url": format!("{workspace_url}/settings?billing=cancelled"),
            "metadata": {
                "plan": PRO_PLAN_ID,
                "organizationId": organization_id,
                "organizationSlug": organization_slug
            }
        }))
        .await
        .map_err(map_polar_error)?;

    let url = checkout
        .get("url")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            ApiError::Internal(anyhow::anyhow!(
                "Polar checkout response did not include a URL"
            ))
        })?
        .to_owned();

    Ok(Json(CheckoutResponse { url }))
}

async fn handle_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, ApiError> {
    let secret = state
        .config
        .polar_webhook_secret
        .as_deref()
        .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("POLAR_WEBHOOK_SECRET is missing")))?;
    webhooks::validate_event(&body, &headers, secret).map_err(map_polar_error)?;
    let payload: Value = serde_json::from_slice(&body)
        .map_err(|error| ApiError::BadRequest(format!("Invalid webhook JSON: {error}")))?;
    let event_type = payload
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();

    if let Some(organization_id) = pro_checkout_organization_id(&payload) {
        if is_success_event(event_type, &payload) {
            ai_usage::update_plan(&state, &organization_id, AiPlan::Pro).await?;
        } else if is_revoked_event(event_type) {
            ai_usage::update_plan(&state, &organization_id, AiPlan::Free).await?;
        }
    }

    Ok(StatusCode::NO_CONTENT)
}

fn billing_not_configured(key: &str) -> ApiError {
    ApiError::BadRequest(format!("Billing is not configured: {key} is missing"))
}

fn map_polar_error(error: polar_rs::PolarError) -> ApiError {
    match error {
        polar_rs::PolarError::Api(api_error) => {
            tracing::warn!(error = %api_error, "polar api request failed");
            ApiError::BadRequest(api_error.to_string())
        }
        polar_rs::PolarError::Webhook(error) => {
            tracing::warn!(%error, "polar webhook verification failed");
            ApiError::BadRequest(format!("Invalid Polar webhook: {error}"))
        }
        polar_rs::PolarError::Json(error) => {
            tracing::warn!(%error, "polar json parsing failed");
            ApiError::BadRequest(format!("Invalid Polar payload: {error}"))
        }
        other => {
            tracing::error!(error = %other, "polar request failed");
            ApiError::Internal(other.into())
        }
    }
}

fn is_success_event(event_type: &str, payload: &Value) -> bool {
    match event_type {
        "order.paid" | "subscription.active" => true,
        "checkout.updated" => payload
            .pointer("/data/status")
            .and_then(Value::as_str)
            .is_some_and(|status| status == "succeeded" || status == "confirmed"),
        "subscription.created" | "subscription.updated" => payload
            .pointer("/data/status")
            .and_then(Value::as_str)
            .is_some_and(|status| status == "active"),
        _ => false,
    }
}

fn is_revoked_event(event_type: &str) -> bool {
    event_type == "subscription.revoked"
}

fn pro_checkout_organization_id(payload: &Value) -> Option<String> {
    find_pro_metadata(payload).and_then(|metadata| {
        metadata
            .get("organizationId")
            .or_else(|| metadata.get("organization_id"))
            .and_then(Value::as_str)
            .map(str::to_owned)
    })
}

fn find_pro_metadata(value: &Value) -> Option<&serde_json::Map<String, Value>> {
    match value {
        Value::Object(object) => {
            if let Some(metadata) = object.get("metadata").and_then(Value::as_object) {
                let plan = metadata
                    .get("plan")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                if plan == PRO_PLAN_ID {
                    return Some(metadata);
                }
            }

            object.values().find_map(find_pro_metadata)
        }
        Value::Array(values) => values.iter().find_map(find_pro_metadata),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_checkout_metadata_in_nested_webhook_payloads() {
        let payload = json!({
            "type": "order.paid",
            "data": {
                "checkout": {
                    "metadata": {
                        "plan": "pro",
                        "organizationId": "org_123"
                    }
                }
            }
        });

        assert_eq!(
            pro_checkout_organization_id(&payload).as_deref(),
            Some("org_123")
        );
    }

    #[test]
    fn ignores_non_pro_metadata() {
        let payload = json!({
            "type": "order.paid",
            "data": {
                "metadata": {
                    "plan": "free",
                    "organizationId": "org_123"
                }
            }
        });

        assert_eq!(pro_checkout_organization_id(&payload), None);
    }

    #[test]
    fn treats_only_completed_checkout_updates_as_successful() {
        assert!(is_success_event(
            "checkout.updated",
            &json!({ "data": { "status": "succeeded" } })
        ));
        assert!(!is_success_event(
            "checkout.updated",
            &json!({ "data": { "status": "open" } })
        ));
    }

    #[test]
    fn treats_revoked_subscription_as_downgrade_event() {
        assert!(is_revoked_event("subscription.revoked"));
        assert!(!is_revoked_event("subscription.canceled"));
        assert!(!is_revoked_event("subscription.past_due"));
    }
}
