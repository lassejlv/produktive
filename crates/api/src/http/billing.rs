use crate::{
    auth::{require_auth, AuthContext},
    error::ApiError,
    state::AppState,
};
use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, FixedOffset, Utc};
use polar_rs::{
    models::{CreateCheckoutRequest, CreateCustomerSessionRequest, Subscription},
    webhooks::verify,
    PolarError,
};
use produktive_entity::{member, organization_subscription as os};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, QueryOrder,
};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;

const ACTIVE_STATUSES: &[&str] = &["active", "trialing"];

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/plans", get(plans))
        .route("/status", get(status))
        .route("/checkout", post(checkout))
        .route("/portal", post(portal))
        .route("/cancel", post(cancel))
        .route("/resume", post(resume))
        .route("/webhook", post(webhook))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BillingStatusResponse {
    customer_id: String,
    pro_plan_id: String,
    is_pro: bool,
    can_manage: bool,
    subscriptions: Vec<BillingSubscriptionResponse>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BillingSubscriptionResponse {
    id: String,
    plan_id: String,
    status: String,
    current_period_end: Option<i64>,
    trial_ends_at: Option<i64>,
    canceled_at: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BillingUrlResponse {
    url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PricingPlanResponse {
    name: String,
    price_amount: i64,
    currency: String,
    recurring_interval: Option<String>,
}

#[derive(Serialize)]
struct PricingPlansResponse {
    plans: Vec<PricingPlanResponse>,
}

async fn plans(State(state): State<AppState>) -> Result<Json<PricingPlansResponse>, ApiError> {
    let product = state
        .polar
        .products()
        .get(&state.config.polar_pro_product_id)
        .await
        .map_err(map_polar_error)?;

    let price = product
        .prices
        .iter()
        .find(|p| !p.is_archived && p.amount_type.as_deref() == Some("fixed"))
        .ok_or_else(|| {
            ApiError::Internal(anyhow::anyhow!(
                "Pro product has no active fixed price configured"
            ))
        })?;

    let plan = PricingPlanResponse {
        name: product.name,
        price_amount: price.price_amount.unwrap_or(0),
        currency: price
            .price_currency
            .clone()
            .unwrap_or_else(|| "eur".to_owned()),
        recurring_interval: price
            .recurring_interval
            .clone()
            .or(product.recurring_interval),
    };

    Ok(Json(PricingPlansResponse { plans: vec![plan] }))
}

async fn status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<BillingStatusResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let role = active_member_role(&state, &auth.user.id, &auth.organization.id).await?;
    let subs = load_subscriptions(&state, &auth.organization.id).await?;

    Ok(Json(build_status(
        &state,
        role.as_deref() == Some("owner"),
        subs,
        &auth.organization.id,
    )))
}

async fn checkout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<BillingUrlResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner(&state, &auth.user.id, &auth.organization.id).await?;

    let mut metadata: HashMap<String, Value> = HashMap::new();
    metadata.insert("organization_id".to_owned(), json!(auth.organization.id));
    metadata.insert("created_by_user_id".to_owned(), json!(auth.user.id));

    let success_url = format!("{}/account?billing=success", state.config.app_url);
    let response = state
        .polar
        .checkouts()
        .create(CreateCheckoutRequest {
            products: vec![state.config.polar_pro_product_id.clone()],
            external_customer_id: Some(auth.organization.id.clone()),
            customer_email: Some(auth.user.email.clone()),
            customer_name: Some(auth.organization.name.clone()),
            success_url: Some(success_url),
            metadata,
            ..Default::default()
        })
        .await
        .map_err(map_polar_error)?;

    Ok(Json(BillingUrlResponse { url: response.url }))
}

async fn portal(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<BillingUrlResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner(&state, &auth.user.id, &auth.organization.id).await?;

    let session = state
        .polar
        .customer_sessions()
        .create(CreateCustomerSessionRequest::External {
            external_customer_id: auth.organization.id.clone(),
            return_url: Some(format!("{}/account", state.config.app_url)),
        })
        .await
        .map_err(map_polar_error)?;

    Ok(Json(BillingUrlResponse {
        url: session.customer_portal_url,
    }))
}

async fn cancel(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<BillingStatusResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner(&state, &auth.user.id, &auth.organization.id).await?;

    let target = active_subscription(&state, &auth.organization.id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("No active subscription to cancel".to_owned()))?;

    let updated = state
        .polar
        .subscriptions()
        .cancel_at_period_end(&target.id, true)
        .await
        .map_err(map_polar_error)?;

    upsert_subscription(&state, &updated, Some(auth.organization.id.clone())).await?;

    let role = active_member_role(&state, &auth.user.id, &auth.organization.id).await?;
    let subs = load_subscriptions(&state, &auth.organization.id).await?;
    Ok(Json(build_status(
        &state,
        role.as_deref() == Some("owner"),
        subs,
        &auth.organization.id,
    )))
}

async fn resume(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<BillingStatusResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner(&state, &auth.user.id, &auth.organization.id).await?;

    let target = latest_subscription(&state, &auth.organization.id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("No subscription to resume".to_owned()))?;

    let updated = state
        .polar
        .subscriptions()
        .cancel_at_period_end(&target.id, false)
        .await
        .map_err(map_polar_error)?;

    upsert_subscription(&state, &updated, Some(auth.organization.id.clone())).await?;

    let role = active_member_role(&state, &auth.user.id, &auth.organization.id).await?;
    let subs = load_subscriptions(&state, &auth.organization.id).await?;
    Ok(Json(build_status(
        &state,
        role.as_deref() == Some("owner"),
        subs,
        &auth.organization.id,
    )))
}

async fn webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, ApiError> {
    let id = header(&headers, "webhook-id");
    let timestamp = header(&headers, "webhook-timestamp");
    let signature = header(&headers, "webhook-signature");

    let event = verify(
        body.as_ref(),
        id,
        timestamp,
        signature,
        &state.config.polar_webhook_secret,
    )
    .map_err(|err| {
        tracing::warn!(error = %err, "polar webhook verification failed");
        ApiError::Unauthorized
    })?;

    if let Some(sub) = event.as_subscription() {
        let org_id = resolve_organization_id(sub);
        if let Err(err) = upsert_subscription(&state, sub, org_id).await {
            tracing::error!(error = ?err, subscription_id = %sub.id, "failed to upsert polar subscription");
            return Err(err);
        }
    }

    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn is_pro(state: &AppState, auth: &AuthContext) -> Result<bool, ApiError> {
    let now = Utc::now().fixed_offset();
    let pro_id = &state.config.polar_pro_product_id;
    let subs = load_subscriptions(state, &auth.organization.id).await?;
    Ok(subs.iter().any(|s| {
        s.product_id == *pro_id
            && ACTIVE_STATUSES.contains(&s.status.as_str())
            && s.ends_at.map_or(true, |t| t > now)
    }))
}

pub(crate) async fn require_pro(state: &AppState, auth: &AuthContext) -> Result<(), ApiError> {
    if is_pro(state, auth).await? {
        return Ok(());
    }
    Err(ApiError::Forbidden(
        "Pro plan required for this feature".to_owned(),
    ))
}

async fn upsert_subscription(
    state: &AppState,
    sub: &Subscription,
    fallback_org_id: Option<String>,
) -> Result<(), ApiError> {
    let Some(organization_id) = resolve_organization_id(sub).or(fallback_org_id) else {
        tracing::warn!(
            subscription_id = %sub.id,
            "polar subscription missing organization reference; skipping"
        );
        return Ok(());
    };

    let existing = os::Entity::find_by_id(sub.id.clone())
        .one(&state.db)
        .await?;
    let now = Utc::now().fixed_offset();
    let product_id = sub.product_id.clone().unwrap_or_default();

    let mut active = match existing {
        Some(model) => {
            let mut active: os::ActiveModel = model.into();
            active.organization_id = Set(organization_id);
            active.product_id = Set(product_id);
            active.updated_at = Set(now);
            active
        }
        None => os::ActiveModel {
            id: Set(sub.id.clone()),
            organization_id: Set(organization_id),
            product_id: Set(product_id),
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        },
    };

    active.status = Set(sub.status.clone());
    active.cancel_at_period_end = Set(sub.cancel_at_period_end);
    active.current_period_end = Set(parse_dt(sub.current_period_end.as_deref()));
    active.canceled_at = Set(parse_dt(sub.canceled_at.as_deref()));
    active.ends_at = Set(parse_dt(sub.ends_at.as_deref()));
    active.customer_id = Set(sub.customer_id.clone());

    active.save(&state.db).await?;
    Ok(())
}

fn resolve_organization_id(sub: &Subscription) -> Option<String> {
    sub.metadata
        .get("organization_id")
        .or_else(|| sub.metadata.get("organizationId"))
        .and_then(|v| v.as_str().map(ToOwned::to_owned))
        .or_else(|| {
            sub.customer
                .as_ref()
                .and_then(|c| c.external_id.clone())
                .or_else(|| {
                    sub.customer
                        .as_ref()
                        .and_then(|c| c.metadata.get("organization_id"))
                        .and_then(|v| v.as_str().map(ToOwned::to_owned))
                })
        })
}

fn parse_dt(value: Option<&str>) -> Option<DateTime<FixedOffset>> {
    value.and_then(|raw| DateTime::parse_from_rfc3339(raw).ok())
}

fn header<'a>(headers: &'a HeaderMap, name: &str) -> &'a str {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
}

async fn load_subscriptions(
    state: &AppState,
    organization_id: &str,
) -> Result<Vec<os::Model>, ApiError> {
    Ok(os::Entity::find()
        .filter(os::Column::OrganizationId.eq(organization_id))
        .order_by_desc(os::Column::CreatedAt)
        .all(&state.db)
        .await?)
}

async fn active_subscription(
    state: &AppState,
    organization_id: &str,
) -> Result<Option<os::Model>, ApiError> {
    let now = Utc::now().fixed_offset();
    Ok(load_subscriptions(state, organization_id)
        .await?
        .into_iter()
        .find(|m| {
            ACTIVE_STATUSES.contains(&m.status.as_str())
                && m.ends_at.map_or(true, |t| t > now)
                && !m.cancel_at_period_end
        }))
}

async fn latest_subscription(
    state: &AppState,
    organization_id: &str,
) -> Result<Option<os::Model>, ApiError> {
    Ok(load_subscriptions(state, organization_id)
        .await?
        .into_iter()
        .next())
}

fn build_status(
    state: &AppState,
    can_manage: bool,
    subs: Vec<os::Model>,
    fallback_id: &str,
) -> BillingStatusResponse {
    let now = Utc::now().fixed_offset();
    let pro_id = &state.config.polar_pro_product_id;
    let is_pro = subs.iter().any(|s| {
        s.product_id == *pro_id
            && ACTIVE_STATUSES.contains(&s.status.as_str())
            && s.ends_at.map_or(true, |t| t > now)
    });
    let customer_id = subs
        .iter()
        .find_map(|s| s.customer_id.clone())
        .unwrap_or_else(|| fallback_id.to_owned());
    let subscriptions = subs
        .into_iter()
        .map(|s| BillingSubscriptionResponse {
            id: s.id,
            plan_id: s.product_id,
            status: s.status,
            current_period_end: s.current_period_end.map(|t| t.timestamp()),
            trial_ends_at: None,
            canceled_at: s.canceled_at.map(|t| t.timestamp()),
        })
        .collect::<Vec<_>>();

    BillingStatusResponse {
        customer_id,
        pro_plan_id: pro_id.clone(),
        is_pro,
        can_manage,
        subscriptions,
    }
}

async fn require_owner(
    state: &AppState,
    user_id: &str,
    organization_id: &str,
) -> Result<(), ApiError> {
    if active_member_role(state, user_id, organization_id)
        .await?
        .as_deref()
        == Some("owner")
    {
        return Ok(());
    }

    Err(ApiError::Forbidden(
        "Only organization owners can manage billing".to_owned(),
    ))
}

async fn active_member_role(
    state: &AppState,
    user_id: &str,
    organization_id: &str,
) -> Result<Option<String>, ApiError> {
    Ok(member::Entity::find()
        .filter(member::Column::UserId.eq(user_id))
        .filter(member::Column::OrganizationId.eq(organization_id))
        .one(&state.db)
        .await?
        .map(|membership| membership.role))
}

fn map_polar_error(error: PolarError) -> ApiError {
    match error {
        PolarError::Api(api) if api.status.is_client_error() => {
            tracing::warn!(
                status = %api.status,
                error_type = ?api.error_type,
                message = %api.message,
                "Polar billing request failed"
            );
            if api.status == StatusCode::UNAUTHORIZED || api.status == StatusCode::FORBIDDEN {
                ApiError::Internal(anyhow::anyhow!("Polar billing credentials were rejected"))
            } else {
                ApiError::BadRequest(format!("Billing request failed: {}", api.message))
            }
        }
        other => {
            tracing::error!(error = ?other, "Polar billing provider error");
            ApiError::Internal(anyhow::anyhow!("Billing provider error"))
        }
    }
}
