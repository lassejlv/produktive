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
use chrono::{DateTime, Datelike, FixedOffset, TimeZone, Utc};
use polar_rs::{
    models::{CreateCheckoutRequest, CreateCustomerSessionRequest, Product, Subscription},
    webhooks::{verify, WebhookEvent},
    PolarError,
};
use produktive_entity::{billing_usage_event as bue, member, organization_subscription as os};
use sea_orm::{
    sea_query::OnConflict, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, QueryOrder,
};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;

const ACTIVE_STATUSES: &[&str] = &["active", "trialing"];
const FALLBACK_USAGE_PERIOD_DAYS: i64 = 30;
const FREE_DAILY_CREDITS: i64 = 10;
const PRO_INCLUDED_CREDITS: i64 = 500;
const TEAM_INCLUDED_CREDITS: i64 = 5_000;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/plans", get(plans))
        .route("/status", get(status))
        .route("/usage", get(usage))
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
    id: String,
    slug: String,
    name: String,
    price_amount: i64,
    currency: String,
    recurring_interval: Option<String>,
}

#[derive(Serialize)]
struct PricingPlansResponse {
    plans: Vec<PricingPlanResponse>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BillingUsageResponse {
    period_start: i64,
    period_end: i64,
    plan_name: String,
    included_credits: i64,
    used_credits: i64,
    remaining_credits: i64,
    overage_credits: i64,
    pending_events: usize,
    sent_events: usize,
    failed_events: usize,
    daily: Vec<BillingUsageDailyResponse>,
    recent: Vec<BillingUsageEventResponse>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BillingUsageDailyResponse {
    date: String,
    credits: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BillingUsageEventResponse {
    id: String,
    created_at: i64,
    model: String,
    credits: i64,
    total_tokens: i64,
    usage_source: String,
    status: String,
}

struct UsagePlan {
    name: String,
    included_credits: i64,
    period_start: DateTime<FixedOffset>,
    period_end: DateTime<FixedOffset>,
    allows_overage: bool,
}

async fn plans(State(state): State<AppState>) -> Result<Json<PricingPlansResponse>, ApiError> {
    let mut plans = Vec::with_capacity(2);
    plans.push(pricing_plan(&state, &state.config.polar_pro_product_id).await?);

    if let Some(team_product_id) = state.config.polar_team_product_id.as_deref() {
        plans.push(pricing_plan(&state, team_product_id).await?);
    }

    Ok(Json(PricingPlansResponse { plans }))
}

async fn pricing_plan(state: &AppState, product_id: &str) -> Result<PricingPlanResponse, ApiError> {
    let product = state
        .polar
        .products()
        .get(product_id)
        .await
        .map_err(map_polar_error)?;

    pricing_plan_from_product(product)
}

fn pricing_plan_from_product(product: Product) -> Result<PricingPlanResponse, ApiError> {
    let price = product
        .prices
        .iter()
        .find(|p| !p.is_archived && p.amount_type.as_deref() == Some("fixed"))
        .ok_or_else(|| {
            ApiError::Internal(anyhow::anyhow!(
                "Product {} has no active fixed price configured",
                product.id
            ))
        })?;

    Ok(PricingPlanResponse {
        id: product.id,
        slug: product.name.trim().to_lowercase().replace(' ', "-"),
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
    })
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

async fn usage(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<BillingUsageResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let now = Utc::now().fixed_offset();
    let subs = load_subscriptions(&state, &auth.organization.id).await?;
    let plan = usage_plan(&state, &subs, now);
    let rows = usage_rows_for_period(
        &state,
        &auth.organization.id,
        plan.period_start,
        plan.period_end,
    )
    .await?;

    let used_credits = used_credits_from_rows(&rows, &plan);
    let remaining_credits = plan.included_credits.saturating_sub(used_credits).max(0);
    let overage_credits = used_credits.saturating_sub(plan.included_credits).max(0);
    let pending_events = rows
        .iter()
        .filter(|row| row.status == "pending" || row.status == "processing")
        .count();
    let sent_events = rows.iter().filter(|row| row.status == "sent").count();
    let failed_events = rows.iter().filter(|row| row.status == "failed").count();
    let daily = usage_daily(&rows, &plan, now);
    let recent = rows
        .iter()
        .take(8)
        .map(|row| BillingUsageEventResponse {
            id: row.id.clone(),
            created_at: row.created_at.timestamp(),
            model: row.model.clone(),
            credits: row.credits,
            total_tokens: row.total_tokens,
            usage_source: row.usage_source.clone(),
            status: row.status.clone(),
        })
        .collect();

    Ok(Json(BillingUsageResponse {
        period_start: plan.period_start.timestamp(),
        period_end: plan.period_end.timestamp(),
        plan_name: plan.name,
        included_credits: plan.included_credits,
        used_credits,
        remaining_credits,
        overage_credits,
        pending_events,
        sent_events,
        failed_events,
        daily,
        recent,
    }))
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
        tracing::warn!(
            error = %err,
            webhook_id = %id,
            "polar webhook verification failed"
        );
        ApiError::Forbidden("Invalid webhook signature".to_owned())
    })?;

    let event_type = describe_event(&event);
    tracing::info!(webhook_id = %id, event = %event_type, "polar webhook received");

    if let Some(sub) = event.as_subscription() {
        let org_id = resolve_organization_id(sub);
        if org_id.is_none() {
            tracing::warn!(
                webhook_id = %id,
                event = %event_type,
                subscription_id = %sub.id,
                customer_id = ?sub.customer_id,
                customer_external_id = ?sub.customer.as_ref().and_then(|c| c.external_id.as_deref()),
                "polar subscription event missing organization id; subscription will be ignored"
            );
        } else {
            tracing::info!(
                webhook_id = %id,
                event = %event_type,
                subscription_id = %sub.id,
                organization_id = ?org_id,
                status = %sub.status,
                "applying polar subscription event"
            );
        }
        if let Err(err) = upsert_subscription(&state, sub, org_id).await {
            tracing::error!(
                error = ?err,
                webhook_id = %id,
                subscription_id = %sub.id,
                "failed to upsert polar subscription"
            );
            return Err(err);
        }
    }

    Ok(StatusCode::ACCEPTED)
}

fn describe_event(event: &WebhookEvent) -> &str {
    match event {
        WebhookEvent::SubscriptionCreated(_) => "subscription.created",
        WebhookEvent::SubscriptionUpdated(_) => "subscription.updated",
        WebhookEvent::SubscriptionActive(_) => "subscription.active",
        WebhookEvent::SubscriptionCanceled(_) => "subscription.canceled",
        WebhookEvent::SubscriptionUncanceled(_) => "subscription.uncanceled",
        WebhookEvent::SubscriptionRevoked(_) => "subscription.revoked",
        WebhookEvent::SubscriptionPastDue(_) => "subscription.past_due",
        WebhookEvent::CustomerCreated(_) => "customer.created",
        WebhookEvent::CustomerUpdated(_) => "customer.updated",
        WebhookEvent::CustomerDeleted(_) => "customer.deleted",
        WebhookEvent::CustomerStateChanged(_) => "customer.state_changed",
        WebhookEvent::Other { event_type, .. } => event_type,
    }
}

pub(crate) async fn is_pro(state: &AppState, auth: &AuthContext) -> Result<bool, ApiError> {
    let now = Utc::now().fixed_offset();
    let subs = load_subscriptions(state, &auth.organization.id).await?;
    Ok(subs.iter().any(|s| {
        is_paid_product(state, &s.product_id)
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

pub(crate) async fn require_ai_usage_capacity(
    state: &AppState,
    auth: &AuthContext,
) -> Result<(), ApiError> {
    let now = Utc::now().fixed_offset();
    let subs = load_subscriptions(state, &auth.organization.id).await?;
    let plan = usage_plan(state, &subs, now);

    if plan.allows_overage {
        return Ok(());
    }

    let rows = usage_rows_for_period(
        state,
        &auth.organization.id,
        plan.period_start,
        plan.period_end,
    )
    .await?;
    let used_credits = used_credits_from_rows(&rows, &plan);

    if used_credits < plan.included_credits {
        return Ok(());
    }

    Err(ApiError::Forbidden(format!(
        "{} AI credits used for today. Upgrade to continue.",
        plan.included_credits
    )))
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

    let now = Utc::now().fixed_offset();
    let product_id = sub.product_id.clone().unwrap_or_default();

    let active = os::ActiveModel {
        id: Set(sub.id.clone()),
        organization_id: Set(organization_id),
        product_id: Set(product_id),
        status: Set(sub.status.clone()),
        current_period_start: Set(parse_dt(sub.current_period_start.as_deref())),
        current_period_end: Set(parse_dt(sub.current_period_end.as_deref())),
        cancel_at_period_end: Set(sub.cancel_at_period_end),
        canceled_at: Set(parse_dt(sub.canceled_at.as_deref())),
        ends_at: Set(parse_dt(sub.ends_at.as_deref())),
        customer_id: Set(sub.customer_id.clone()),
        created_at: Set(now),
        updated_at: Set(now),
    };

    os::Entity::insert(active)
        .on_conflict(
            OnConflict::column(os::Column::Id)
                .update_columns([
                    os::Column::OrganizationId,
                    os::Column::ProductId,
                    os::Column::Status,
                    os::Column::CurrentPeriodStart,
                    os::Column::CurrentPeriodEnd,
                    os::Column::CancelAtPeriodEnd,
                    os::Column::CanceledAt,
                    os::Column::EndsAt,
                    os::Column::CustomerId,
                    os::Column::UpdatedAt,
                ])
                .to_owned(),
        )
        .exec_without_returning(&state.db)
        .await?;

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

fn is_paid_product(state: &AppState, product_id: &str) -> bool {
    product_id == state.config.polar_pro_product_id
        || state
            .config
            .polar_team_product_id
            .as_deref()
            .is_some_and(|team_product_id| product_id == team_product_id)
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
        is_paid_product(state, &s.product_id)
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

fn usage_plan(state: &AppState, subs: &[os::Model], now: DateTime<FixedOffset>) -> UsagePlan {
    let mut active_subs = subs
        .iter()
        .filter(|sub| {
            ACTIVE_STATUSES.contains(&sub.status.as_str())
                && sub.ends_at.map_or(true, |ends_at| ends_at > now)
                && sub
                    .current_period_start
                    .map_or(true, |period_start| period_start <= now)
                && sub
                    .current_period_end
                    .map_or(true, |period_end| period_end > now)
                && usage_plan_for_product(state, &sub.product_id).is_some()
        })
        .collect::<Vec<_>>();
    active_subs.sort_by_key(|sub| {
        sub.current_period_end
            .or(sub.current_period_start)
            .unwrap_or(sub.updated_at)
    });

    let fallback_start = now - chrono::Duration::days(FALLBACK_USAGE_PERIOD_DAYS);

    if let Some(sub) = active_subs.last() {
        if let Some((name, included_credits, allows_overage)) =
            usage_plan_for_product(state, &sub.product_id)
        {
            return usage_plan_period(
                name,
                included_credits,
                allows_overage,
                sub,
                fallback_start,
                now,
            );
        }
    }

    UsagePlan {
        name: "Free".to_owned(),
        included_credits: FREE_DAILY_CREDITS,
        period_start: start_of_day(now),
        period_end: now,
        allows_overage: false,
    }
}

fn usage_plan_for_product<'a>(
    state: &'a AppState,
    product_id: &str,
) -> Option<(&'a str, i64, bool)> {
    if product_id == state.config.polar_pro_product_id {
        return Some(("Pro", PRO_INCLUDED_CREDITS, true));
    }

    state
        .config
        .polar_team_product_id
        .as_deref()
        .filter(|team_product_id| product_id == *team_product_id)
        .map(|_| ("Team", TEAM_INCLUDED_CREDITS, true))
}

fn usage_plan_period(
    name: &str,
    included_credits: i64,
    allows_overage: bool,
    sub: &os::Model,
    fallback_start: DateTime<FixedOffset>,
    now: DateTime<FixedOffset>,
) -> UsagePlan {
    UsagePlan {
        name: name.to_owned(),
        included_credits,
        period_start: sub.current_period_start.unwrap_or(fallback_start),
        period_end: sub.current_period_end.or(sub.ends_at).unwrap_or(now),
        allows_overage,
    }
}

fn start_of_day(now: DateTime<FixedOffset>) -> DateTime<FixedOffset> {
    now.timezone()
        .with_ymd_and_hms(now.year(), now.month(), now.day(), 0, 0, 0)
        .single()
        .unwrap_or(now - chrono::Duration::hours(24))
}

fn usage_daily(
    rows: &[bue::Model],
    plan: &UsagePlan,
    period_end: DateTime<FixedOffset>,
) -> Vec<BillingUsageDailyResponse> {
    let mut credits_by_date = HashMap::<String, i64>::new();
    for row in rows {
        if !usage_counts_toward_plan_total(row, plan) {
            continue;
        }
        let date = row.created_at.date_naive().to_string();
        *credits_by_date.entry(date).or_default() += row.credits.max(0);
    }

    let days = (period_end.date_naive() - plan.period_start.date_naive()).num_days();
    (0..=days)
        .map(|offset| {
            let date = (plan.period_start + chrono::Duration::days(offset))
                .date_naive()
                .to_string();
            BillingUsageDailyResponse {
                credits: credits_by_date.get(&date).copied().unwrap_or_default(),
                date,
            }
        })
        .collect()
}

async fn usage_rows_for_period(
    state: &AppState,
    organization_id: &str,
    period_start: DateTime<FixedOffset>,
    period_end: DateTime<FixedOffset>,
) -> Result<Vec<bue::Model>, ApiError> {
    Ok(bue::Entity::find()
        .filter(bue::Column::OrganizationId.eq(organization_id))
        .filter(bue::Column::CreatedAt.gte(period_start))
        .filter(bue::Column::CreatedAt.lte(period_end))
        .order_by_desc(bue::Column::CreatedAt)
        .all(&state.db)
        .await?)
}

fn used_credits_from_rows(rows: &[bue::Model], plan: &UsagePlan) -> i64 {
    rows.iter()
        .filter(|row| usage_counts_toward_plan_total(row, plan))
        .map(|row| row.credits.max(0))
        .sum()
}

fn usage_counts_toward_plan_total(row: &bue::Model, plan: &UsagePlan) -> bool {
    if row.status == "failed" {
        return false;
    }

    row.status != "local_only" || !plan.allows_overage
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

#[cfg(test)]
mod tests {
    use super::*;
    use polar_rs::models::Customer;
    use std::collections::HashMap;

    fn subscription() -> Subscription {
        Subscription {
            id: "sub_1".to_owned(),
            status: "active".to_owned(),
            customer_id: Some("customer_1".to_owned()),
            product_id: Some("product_1".to_owned()),
            current_period_start: None,
            current_period_end: None,
            cancel_at_period_end: false,
            canceled_at: None,
            started_at: None,
            ends_at: None,
            customer: None,
            metadata: HashMap::new(),
        }
    }

    fn usage_plan_fixture(allows_overage: bool) -> UsagePlan {
        let now = Utc::now().fixed_offset();
        UsagePlan {
            name: if allows_overage { "Pro" } else { "Free" }.to_owned(),
            included_credits: if allows_overage {
                PRO_INCLUDED_CREDITS
            } else {
                FREE_DAILY_CREDITS
            },
            period_start: now - chrono::Duration::days(1),
            period_end: now,
            allows_overage,
        }
    }

    fn usage_event(status: &str, credits: i64) -> bue::Model {
        let now = Utc::now().fixed_offset();
        bue::Model {
            id: format!("event_{status}_{credits}"),
            organization_id: "org_1".to_owned(),
            chat_id: "chat_1".to_owned(),
            user_message_id: "message_1".to_owned(),
            external_id: format!("external_{status}_{credits}"),
            model: "test-model".to_owned(),
            credits,
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
            usage_source: "test".to_owned(),
            tool_call_count: 0,
            tool_result_bytes: 0,
            round_count: 1,
            metadata: json!({}),
            status: status.to_owned(),
            attempts: 0,
            last_error: None,
            next_retry_at: None,
            sent_at: None,
            created_at: now,
            updated_at: now,
        }
    }

    #[test]
    fn subscription_org_resolution_prefers_subscription_metadata() {
        let mut sub = subscription();
        sub.metadata
            .insert("organization_id".to_owned(), json!("org_from_subscription"));
        sub.customer = Some(Customer {
            id: "customer_1".to_owned(),
            external_id: Some("org_from_customer".to_owned()),
            email: None,
            name: None,
            metadata: HashMap::new(),
        });

        assert_eq!(
            resolve_organization_id(&sub).as_deref(),
            Some("org_from_subscription")
        );
    }

    #[test]
    fn subscription_org_resolution_uses_customer_external_id() {
        let mut sub = subscription();
        sub.customer = Some(Customer {
            id: "customer_1".to_owned(),
            external_id: Some("org_from_customer".to_owned()),
            email: None,
            name: None,
            metadata: HashMap::new(),
        });

        assert_eq!(
            resolve_organization_id(&sub).as_deref(),
            Some("org_from_customer")
        );
    }

    #[test]
    fn free_usage_counts_local_only_events_for_quota() {
        let plan = usage_plan_fixture(false);
        let rows = vec![
            usage_event("pending", 4),
            usage_event("local_only", 3),
            usage_event("failed", 20),
        ];

        assert_eq!(used_credits_from_rows(&rows, &plan), 7);
    }

    #[test]
    fn paid_usage_excludes_local_only_events_from_billable_total() {
        let plan = usage_plan_fixture(true);
        let rows = vec![
            usage_event("sent", 4),
            usage_event("local_only", 3),
            usage_event("failed", 20),
        ];

        assert_eq!(used_credits_from_rows(&rows, &plan), 4);
    }
}
