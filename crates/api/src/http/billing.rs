use axum::{
    extract::State,
    http::HeaderMap,
    routing::{get, post},
    Extension, Json, Router,
};
use std::collections::BTreeMap;

use polar::{CheckoutCreate, CustomerState};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use url::Url;
use utoipa::ToSchema;

use crate::{
    billing::{
        self, billing_customer_workspace_id, billing_member_count, billing_monitor_count,
        customer_state_for_billing, ensure_customer, feature_noun, format_thousands,
        load_owner_email, member_count, monitor_count, overage_text, perk_label,
        refresh_and_store_customer_state, trim_decimal, Billing, FeatureEntitlement, PolarCatalog,
        TierCatalog, DEPLOY_METERED_FEATURES, METERED_FEATURES, PERK_FEATURES,
    },
    error::{ApiError, ApiResult},
    middleware::Membership,
    state::AppState,
};

/// True for the pure-overage deploy resource meters (billed from zero, no
/// included allowance). They render as a usage tile + an overage-rate plan line
/// rather than an "X / Y included" allowance.
fn is_deploy_meter(feature: &str) -> bool {
    DEPLOY_METERED_FEATURES.contains(&feature)
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/summary", get(summary))
        .route("/customer", get(get_customer))
        .route("/plans", get(list_plans))
        .route("/attach", post(attach))
        .route("/cancel", post(cancel_subscription))
        .route("/renew", post(renew_subscription))
        .route("/cancel-downgrade", post(cancel_downgrade))
        .route("/portal", post(open_portal))
        .route("/setup-payment", post(setup_payment))
}

fn require_billing(state: &AppState) -> ApiResult<&Billing> {
    state
        .billing
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("billing is not configured"))
}

#[derive(Deserialize, ToSchema)]
pub struct AttachBody {
    pub plan_id: String,
    #[serde(default)]
    pub success_url: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct PortalBody {
    #[serde(default)]
    pub return_url: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct SetupPaymentBody {
    #[serde(default)]
    pub plan_id: Option<String>,
    #[serde(default)]
    pub success_url: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct BillingSummary {
    pub billing_enabled: bool,
    pub customer_id: String,
    pub current_plan_id: Option<String>,
    pub current_plan_name: Option<String>,
    pub subscription_status: Option<String>,
    pub subscription_canceled_at: Option<i64>,
    pub subscription_current_period_end: Option<i64>,
    pub scheduled_plan_id: Option<String>,
    pub scheduled_plan_name: Option<String>,
    pub stripe_customer_id: Option<String>,
    pub portal_available: bool,
    pub plans: Vec<BillingPlanSummary>,
    pub balances: BTreeMap<String, BillingBalanceSummary>,
}

#[derive(Serialize, ToSchema)]
pub struct BillingPlanSummary {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub price: Option<BillingPlanPriceSummary>,
    pub current: bool,
    pub items: Vec<BillingPlanItemSummary>,
}

#[derive(Serialize, ToSchema)]
pub struct BillingPlanPriceSummary {
    pub amount: Option<f64>,
    pub interval: Option<String>,
    pub primary_text: Option<String>,
    pub secondary_text: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct BillingPlanItemSummary {
    pub feature_id: String,
    pub included: Option<f64>,
    pub unlimited: bool,
    pub primary_text: Option<String>,
    pub secondary_text: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct BillingBalanceSummary {
    pub feature_id: String,
    pub granted: Option<f64>,
    pub remaining: Option<f64>,
    pub usage: Option<f64>,
    pub unlimited: bool,
    pub next_reset_at: Option<i64>,
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/billing/summary",
    params(("wid" = String, Path)),
    responses((status = 200, body = BillingSummary)),
    security(("bearerAuth" = [])),
    tag = "billing"
)]
pub async fn summary(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<BillingSummary>> {
    let Some(billing) = state.billing.as_ref() else {
        return Ok(Json(disabled_summary(&state, m.workspace.id).await?));
    };
    let owner_email = load_owner_email(&state, m.workspace.owner_id).await?;
    if let Err(error) = ensure_customer(&state, &m.workspace, &owner_email).await {
        tracing::warn!(
            workspace_id = %m.workspace.id,
            error = ?error,
            "billing customer setup failed; returning catalog-only billing summary"
        );
    }
    let cstate = match customer_state_for_billing(&state, m.workspace.id).await {
        Ok(cstate) => Some(cstate),
        Err(error) => {
            tracing::warn!(
                workspace_id = %m.workspace.id,
                error = ?error,
                "billing customer state unavailable; returning catalog-only billing summary"
            );
            None
        }
    };
    let fallback_state;
    let cstate_ref = if let Some(cstate) = cstate.as_ref() {
        cstate.as_ref()
    } else {
        fallback_state =
            fallback_customer_state(billing_customer_workspace_id(&state, m.workspace.id).await?);
        &fallback_state
    };
    let catalog = &billing.catalog;
    let sub = cstate_ref.active_subscription();

    let current_plan_id = sub
        .and_then(|s| catalog.tier_for_product(&s.product_id))
        .map(str::to_owned)
        .or_else(|| Some("free".to_owned()));
    let current_plan_name = current_plan_id
        .as_deref()
        .and_then(|tier| catalog.tier(tier))
        .map(|t| t.name.clone());
    let subscription_status = sub.map(|s| s.status.clone());
    let subscription_canceled_at = sub.and_then(|s| {
        s.cancel_at_period_end
            .then(|| {
                parse_epoch(s.canceled_at.as_deref())
                    .or_else(|| parse_epoch(s.current_period_end.as_deref()))
            })
            .flatten()
    });
    let subscription_current_period_end =
        sub.and_then(|s| parse_epoch(s.current_period_end.as_deref()));

    let is_paid = current_plan_id.as_deref().is_some_and(|t| t != "free")
        && sub.is_some_and(|s| matches!(s.status.as_str(), "active" | "trialing" | "past_due"));
    // The web UI keys "paid plan" detection off this field; populate it with the
    // Polar customer id on paid plans (Polar runs the portal, not Stripe directly).
    let stripe_customer_id = is_paid.then(|| cstate_ref.id.clone());

    let plans = build_plans(catalog, current_plan_id.as_deref());
    let balances = build_balances(
        &state,
        m.workspace.id,
        cstate_ref,
        catalog,
        current_plan_id.as_deref(),
    )
    .await?;

    Ok(Json(BillingSummary {
        billing_enabled: true,
        customer_id: cstate_ref.id.clone(),
        current_plan_id,
        current_plan_name,
        subscription_status,
        subscription_canceled_at,
        subscription_current_period_end,
        // Polar has no "scheduled downgrade" concept; changes apply per its proration rules.
        scheduled_plan_id: None,
        scheduled_plan_name: None,
        stripe_customer_id,
        portal_available: cstate.is_some(),
        plans,
        balances,
    }))
}

fn fallback_customer_state(workspace_id: uuid::Uuid) -> CustomerState {
    CustomerState {
        id: workspace_id.to_string(),
        external_id: Some(workspace_id.to_string()),
        email: None,
        active_subscriptions: Vec::new(),
        granted_benefits: Vec::new(),
        active_meters: Vec::new(),
    }
}

async fn disabled_summary(state: &AppState, workspace_id: uuid::Uuid) -> ApiResult<BillingSummary> {
    let plan = disabled_plan_summary();
    let mut balances = BTreeMap::new();
    balances.insert(
        "monitors".to_owned(),
        BillingBalanceSummary {
            feature_id: "monitors".to_owned(),
            granted: None,
            remaining: None,
            usage: Some(monitor_count(state, workspace_id).await?),
            unlimited: true,
            next_reset_at: None,
        },
    );
    balances.insert(
        "members".to_owned(),
        BillingBalanceSummary {
            feature_id: "members".to_owned(),
            granted: None,
            remaining: None,
            usage: Some(member_count(state, workspace_id).await?),
            unlimited: true,
            next_reset_at: None,
        },
    );
    balances.insert(
        "events".to_owned(),
        BillingBalanceSummary {
            feature_id: "events".to_owned(),
            granted: None,
            remaining: None,
            usage: None,
            unlimited: true,
            next_reset_at: None,
        },
    );

    Ok(BillingSummary {
        billing_enabled: false,
        customer_id: workspace_id.to_string(),
        current_plan_id: Some("self_hosted".to_owned()),
        current_plan_name: Some("Self-hosted".to_owned()),
        subscription_status: None,
        subscription_canceled_at: None,
        subscription_current_period_end: None,
        scheduled_plan_id: None,
        scheduled_plan_name: None,
        stripe_customer_id: None,
        portal_available: false,
        plans: vec![plan],
        balances,
    })
}

fn disabled_plan_summary() -> BillingPlanSummary {
    let mut items = Vec::new();
    for feature in METERED_FEATURES {
        items.push(BillingPlanItemSummary {
            feature_id: feature.to_owned(),
            included: None,
            unlimited: true,
            primary_text: Some(format!("Unlimited {}", feature_noun(feature, 2.0))),
            secondary_text: None,
        });
    }
    for perk in PERK_FEATURES {
        items.push(BillingPlanItemSummary {
            feature_id: perk.to_owned(),
            included: Some(1.0),
            unlimited: false,
            primary_text: Some(perk_label(perk).to_owned()),
            secondary_text: None,
        });
    }

    BillingPlanSummary {
        id: "self_hosted".to_owned(),
        name: "Self-hosted".to_owned(),
        description: Some("Billing is disabled on this server.".to_owned()),
        price: Some(BillingPlanPriceSummary {
            amount: Some(0.0),
            interval: None,
            primary_text: Some("Self-hosted".to_owned()),
            secondary_text: Some("no billing provider configured".to_owned()),
        }),
        current: true,
        items,
    }
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/billing/customer",
    params(("wid" = String, Path)),
    responses((status = 200, body = Object)),
    security(("bearerAuth" = [])),
    tag = "billing"
)]
pub async fn get_customer(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<Value>> {
    m.require_owner()?;
    let owner_email = load_owner_email(&state, m.workspace.owner_id).await?;
    ensure_customer(&state, &m.workspace, &owner_email).await?;

    let cstate = customer_state_for_billing(&state, m.workspace.id).await?;
    Ok(Json(
        serde_json::to_value(&*cstate).map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?,
    ))
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/billing/plans",
    params(("wid" = String, Path)),
    responses((status = 200, body = Object)),
    security(("bearerAuth" = [])),
    tag = "billing"
)]
pub async fn list_plans(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<Value>> {
    let billing = require_billing(&state)?;
    let owner_email = load_owner_email(&state, m.workspace.owner_id).await?;
    ensure_customer(&state, &m.workspace, &owner_email).await?;

    let current = customer_state_for_billing(&state, m.workspace.id)
        .await
        .ok()
        .and_then(|s| {
            s.active_subscription()
                .and_then(|sub| billing.catalog.tier_for_product(&sub.product_id))
                .map(str::to_owned)
        });
    let plans = build_plans(&billing.catalog, current.as_deref());
    Ok(Json(json!({ "list": plans })))
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/billing/attach",
    params(("wid" = String, Path)),
    request_body = AttachBody,
    responses((status = 200, body = Object)),
    security(("bearerAuth" = [])),
    tag = "billing"
)]
pub async fn attach(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    _headers: HeaderMap,
    Json(body): Json<AttachBody>,
) -> ApiResult<Json<Value>> {
    m.require_owner()?;
    let billing = require_billing(&state)?;
    let owner_email = load_owner_email(&state, m.workspace.owner_id).await?;

    let plan_id = body.plan_id.trim().to_owned();
    let Some(target) = billing.catalog.tier(&plan_id) else {
        return Err(ApiError::bad_request(
            "plan_id is not available for this workspace",
        ));
    };
    let ext = billing::customer_id(billing_customer_workspace_id(&state, m.workspace.id).await?);
    if let Err(error) = ensure_customer(&state, &m.workspace, &owner_email).await {
        if plan_id == "free" {
            return Err(error);
        }
        tracing::warn!(
            workspace_id = %m.workspace.id,
            plan_id,
            error = ?error,
            "billing customer setup failed before paid checkout; attempting checkout without subscription state"
        );
    }
    let cstate = match refresh_and_store_customer_state(&state, m.workspace.id).await {
        Ok(cstate) => Some(cstate),
        Err(error) if plan_id != "free" => {
            tracing::warn!(
                workspace_id = %m.workspace.id,
                plan_id,
                error = ?error,
                "billing customer state unavailable before paid checkout; continuing without subscription id"
            );
            None
        }
        Err(error) => return Err(error),
    };
    let sub = cstate
        .as_ref()
        .and_then(|state| state.active_subscription());
    let on_paid = sub.is_some_and(|s| {
        billing
            .catalog
            .tier_for_product(&s.product_id)
            .is_some_and(|t| t != "free")
    });

    // Downgrade/attach to free: no checkout.
    if plan_id == "free" {
        match sub {
            Some(s) if on_paid => {
                billing
                    .client
                    .subscriptions()
                    .change_product(&s.id, &target.product_id)
                    .await?;
            }
            Some(_) => {} // already free
            None => {
                billing
                    .client
                    .subscriptions()
                    .create(&target.product_id, &ext)
                    .await?;
            }
        }
        billing.invalidate(billing_customer_workspace_id(&state, m.workspace.id).await?);
        refresh_after_subscription_change(&state, m.workspace.id).await;
        return Ok(Json(json!({})));
    }

    // Paid target.
    if let Some(s) = sub {
        if on_paid {
            // Switch between paid plans in place (proration handled by Polar).
            billing
                .client
                .subscriptions()
                .change_product(&s.id, &target.product_id)
                .await?;
            billing.invalidate(billing_customer_workspace_id(&state, m.workspace.id).await?);
            refresh_after_subscription_change(&state, m.workspace.id).await;
            return Ok(Json(json!({})));
        }
    }

    // On free (or no sub): hosted checkout, upgrading the free subscription in place.
    let success_url = billing_return_url(&state, body.success_url, &m.workspace.slug)?;
    let checkout = CheckoutCreate::new(&target.product_id, &ext)
        .success_url(success_url)
        .subscription_id(sub.map(|s| s.id.clone()))
        .embed_origin(billing_embed_origin(&state));
    let checkout = billing.client.checkouts().create(checkout).await?;
    Ok(Json(json!({ "url": checkout.url })))
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/billing/cancel",
    params(("wid" = String, Path)),
    responses((status = 200, body = Object)),
    security(("bearerAuth" = [])),
    tag = "billing"
)]
pub async fn cancel_subscription(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<Value>> {
    set_cancel(&state, &m, true).await
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/billing/renew",
    params(("wid" = String, Path)),
    responses((status = 200, body = Object)),
    security(("bearerAuth" = [])),
    tag = "billing"
)]
pub async fn renew_subscription(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<Value>> {
    set_cancel(&state, &m, false).await
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/billing/cancel-downgrade",
    params(("wid" = String, Path)),
    responses((status = 200, body = Object)),
    security(("bearerAuth" = [])),
    tag = "billing"
)]
pub async fn cancel_downgrade(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
) -> ApiResult<Json<Value>> {
    // Polar has no scheduled downgrades to undo; reaffirm the subscription.
    set_cancel(&state, &m, false).await
}

async fn set_cancel(state: &AppState, m: &Membership, cancel: bool) -> ApiResult<Json<Value>> {
    m.require_owner()?;
    let billing = require_billing(state)?;
    let owner_email = load_owner_email(state, m.workspace.owner_id).await?;
    ensure_customer(state, &m.workspace, &owner_email).await?;

    let cstate = refresh_and_store_customer_state(state, m.workspace.id).await?;
    let sub = cstate
        .active_subscription()
        .ok_or_else(|| ApiError::bad_request("no active subscription to update"))?;
    billing
        .client
        .subscriptions()
        .set_cancel_at_period_end(&sub.id, cancel)
        .await?;
    billing.invalidate(m.workspace.id);
    refresh_after_subscription_change(state, m.workspace.id).await;
    Ok(Json(json!({})))
}

async fn refresh_after_subscription_change(state: &AppState, workspace_id: uuid::Uuid) {
    if let Err(e) = refresh_and_store_customer_state(state, workspace_id).await {
        tracing::warn!(workspace_id = %workspace_id, error = ?e, "failed to refresh billing state after subscription change");
    }
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/billing/portal",
    params(("wid" = String, Path)),
    request_body = PortalBody,
    responses((status = 200, body = Object)),
    security(("bearerAuth" = [])),
    tag = "billing"
)]
pub async fn open_portal(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    _headers: HeaderMap,
    Json(body): Json<PortalBody>,
) -> ApiResult<Json<Value>> {
    m.require_owner()?;
    let billing = require_billing(&state)?;
    let owner_email = load_owner_email(&state, m.workspace.owner_id).await?;
    ensure_customer(&state, &m.workspace, &owner_email).await?;

    let return_url = billing_return_url(&state, body.return_url, &m.workspace.slug)?;
    let ext = billing::customer_id(billing_customer_workspace_id(&state, m.workspace.id).await?);
    let session = billing
        .client
        .customer_sessions()
        .create(&ext, return_url.as_deref())
        .await?;
    Ok(Json(json!({ "url": session.customer_portal_url })))
}

#[utoipa::path(
    post,
    path = "/api/workspaces/{wid}/billing/setup-payment",
    params(("wid" = String, Path)),
    request_body = SetupPaymentBody,
    responses((status = 200, body = Object)),
    security(("bearerAuth" = [])),
    tag = "billing"
)]
pub async fn setup_payment(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    _headers: HeaderMap,
    Json(body): Json<SetupPaymentBody>,
) -> ApiResult<Json<Value>> {
    m.require_owner()?;
    let billing = require_billing(&state)?;
    let owner_email = load_owner_email(&state, m.workspace.owner_id).await?;
    if let Err(error) = ensure_customer(&state, &m.workspace, &owner_email).await {
        tracing::warn!(
            workspace_id = %m.workspace.id,
            error = ?error,
            "billing customer setup failed before setup-payment checkout; attempting checkout without subscription state"
        );
    }

    let cstate = match customer_state_for_billing(&state, m.workspace.id).await {
        Ok(cstate) => Some(cstate),
        Err(error) => {
            tracing::warn!(
                workspace_id = %m.workspace.id,
                error = ?error,
                "billing customer state unavailable before setup-payment checkout; continuing without subscription id"
            );
            None
        }
    };
    // Resolve the product to set up payment for: explicit plan, else current paid plan.
    let tier = body
        .plan_id
        .as_deref()
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(str::to_owned)
        .or_else(|| {
            cstate
                .as_ref()
                .and_then(|state| {
                    state
                        .active_subscription()
                        .and_then(|s| billing.catalog.tier_for_product(&s.product_id))
                })
                .filter(|t| *t != "free")
                .map(str::to_owned)
        })
        .or_else(|| {
            billing
                .catalog
                .default_paid_tier()
                .map(|tier| tier.tier.clone())
        });
    let Some(tier) = tier.and_then(|t| billing.catalog.tier(&t).cloned()) else {
        return Err(ApiError::bad_request("plan_id required"));
    };

    let success_url = billing_return_url(&state, body.success_url, &m.workspace.slug)?;
    let ext = billing::customer_id(billing_customer_workspace_id(&state, m.workspace.id).await?);
    let checkout = CheckoutCreate::new(&tier.product_id, &ext)
        .success_url(success_url)
        .subscription_id(
            cstate
                .as_ref()
                .and_then(|state| state.active_subscription().map(|s| s.id.clone())),
        )
        .embed_origin(billing_embed_origin(&state));
    let checkout = billing.client.checkouts().create(checkout).await?;
    Ok(Json(json!({ "url": checkout.url })))
}

// ---- summary builders -------------------------------------------------------

fn build_plans(catalog: &PolarCatalog, current: Option<&str>) -> Vec<BillingPlanSummary> {
    catalog
        .tiers_ordered()
        .into_iter()
        .map(|tier| plan_summary(tier, current))
        .collect()
}

fn plan_summary(tier: &TierCatalog, current: Option<&str>) -> BillingPlanSummary {
    let dollars = tier.price_cents as f64 / 100.0;
    let price = BillingPlanPriceSummary {
        amount: Some(dollars),
        interval: Some(tier.interval.clone()),
        primary_text: Some(format!("${}", trim_decimal(dollars))),
        secondary_text: Some(format!("per {}", tier.interval)),
    };

    let mut items = Vec::new();
    for feature in METERED_FEATURES {
        if let Some(ent) = tier.features.get(feature) {
            items.push(metered_item(feature, ent));
        } else if unlimited_when_missing(tier, feature) {
            items.push(unlimited_item(feature));
        }
    }
    for feature in DEPLOY_METERED_FEATURES {
        if let Some(ent) = tier.features.get(feature) {
            items.push(metered_item(feature, ent));
        }
    }
    for perk in PERK_FEATURES {
        items.push(perk_item(perk, tier.perks.contains(perk)));
    }

    BillingPlanSummary {
        current: current == Some(tier.tier.as_str()),
        id: tier.tier.clone(),
        name: tier.name.clone(),
        description: tier.description.clone(),
        price: Some(price),
        items,
    }
}

fn unlimited_when_missing(tier: &TierCatalog, feature: &str) -> bool {
    tier.tier != "free" && feature == "members"
}

fn unlimited_item(feature: &str) -> BillingPlanItemSummary {
    BillingPlanItemSummary {
        feature_id: feature.to_owned(),
        included: None,
        unlimited: true,
        primary_text: Some(format!("Unlimited {}", feature_noun(feature, 2.0))),
        secondary_text: None,
    }
}

fn metered_item(feature: &str, ent: &FeatureEntitlement) -> BillingPlanItemSummary {
    // Deploy resource meters are pure-overage from zero: headline the per-unit
    // rate rather than "0 GB-hours".
    if is_deploy_meter(feature) {
        return BillingPlanItemSummary {
            feature_id: feature.to_owned(),
            included: Some(ent.included),
            unlimited: false,
            primary_text: ent
                .unit_amount_cents
                .map(|cents| overage_text(feature, cents)),
            secondary_text: Some("metered usage".to_owned()),
        };
    }
    BillingPlanItemSummary {
        feature_id: feature.to_owned(),
        included: Some(ent.included),
        unlimited: false,
        primary_text: Some(format!(
            "{} {}",
            format_thousands(ent.included),
            feature_noun(feature, ent.included)
        )),
        secondary_text: ent
            .unit_amount_cents
            .map(|cents| overage_text(feature, cents)),
    }
}

fn perk_item(feature: &str, included: bool) -> BillingPlanItemSummary {
    BillingPlanItemSummary {
        feature_id: feature.to_owned(),
        included: Some(if included { 1.0 } else { 0.0 }),
        unlimited: false,
        primary_text: Some(perk_label(feature).to_owned()),
        secondary_text: (!included).then(|| "upgrade required".to_owned()),
    }
}

async fn build_balances(
    state: &AppState,
    workspace_id: uuid::Uuid,
    cstate: &CustomerState,
    catalog: &PolarCatalog,
    current: Option<&str>,
) -> ApiResult<BTreeMap<String, BillingBalanceSummary>> {
    let tier = current.unwrap_or("free");
    let next_reset_at = cstate
        .active_subscription()
        .and_then(|s| parse_epoch(s.current_period_end.as_deref()));

    let mut balances = BTreeMap::new();
    for feature in METERED_FEATURES {
        let Some(ent) = catalog.entitlement(tier, feature) else {
            if tier != "free" && feature == "members" {
                balances.insert(
                    feature.to_owned(),
                    BillingBalanceSummary {
                        feature_id: feature.to_owned(),
                        granted: None,
                        remaining: None,
                        usage: Some(billing_member_count(state, workspace_id).await?),
                        unlimited: true,
                        next_reset_at,
                    },
                );
            }
            continue;
        };
        let usage = match feature {
            "events" => Some(
                crate::billing::effective_events_consumed(
                    state,
                    workspace_id,
                    cstate,
                    &ent.meter_id,
                )
                .await?,
            ),
            "monitors" => Some(billing_monitor_count(state, workspace_id).await?),
            "members" => Some(billing_member_count(state, workspace_id).await?),
            _ => None,
        };
        let remaining = usage.map(|u| (ent.included - u).max(0.0));
        balances.insert(
            feature.to_owned(),
            BillingBalanceSummary {
                feature_id: feature.to_owned(),
                granted: Some(ent.included),
                remaining,
                usage,
                unlimited: false,
                next_reset_at,
            },
        );
    }

    // Deploy resource meters are pure-overage (no included allowance). Surface
    // the current-period consumption from Polar's meter balance so the billing
    // page can show "used this period" against the metered overage rate.
    for feature in DEPLOY_METERED_FEATURES {
        let Some(ent) = catalog.entitlement(tier, feature) else {
            continue;
        };
        // Deploy meters bill per second, so Polar's balance is in GB-seconds /
        // vCPU-seconds. Divide back to GB-hours / vCPU-hours for display — the
        // unit the billing page labels these tiles with.
        let usage = cstate
            .meter(&ent.meter_id)
            .map(|m| m.consumed_units / 3_600.0)
            .filter(|u| u.is_finite());
        balances.insert(
            feature.to_owned(),
            BillingBalanceSummary {
                feature_id: feature.to_owned(),
                granted: None,
                remaining: None,
                usage,
                unlimited: false,
                next_reset_at,
            },
        );
    }
    Ok(balances)
}

fn parse_epoch(raw: Option<&str>) -> Option<i64> {
    raw.and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.timestamp())
}

fn billing_return_url(
    state: &AppState,
    requested: Option<String>,
    slug: &str,
) -> ApiResult<Option<String>> {
    if let Some(requested) = requested
        .map(|url| url.trim().to_owned())
        .filter(|url| !url.is_empty())
    {
        return validate_billing_return_url(state, &requested).map(Some);
    }
    Ok(default_billing_url(state, slug))
}

fn default_billing_url(state: &AppState, slug: &str) -> Option<String> {
    state
        .config
        .app_url
        .as_ref()
        .map(|base| format!("{base}/{slug}/settings/billing?checkout=success"))
}

/// Polar requires `embed_origin` when checkout is opened via the embedded SDK.
pub fn embed_origin_from_app_url(app_url: &str) -> Option<String> {
    let parsed = Url::parse(app_url).ok()?;
    let host = parsed.host_str()?;
    let mut origin = format!("{}://{}", parsed.scheme(), host);
    if let Some(port) = parsed.port() {
        origin.push(':');
        origin.push_str(&port.to_string());
    }
    Some(origin)
}

fn billing_embed_origin(state: &AppState) -> Option<String> {
    state
        .config
        .app_url
        .as_deref()
        .and_then(embed_origin_from_app_url)
}

fn validate_billing_return_url(state: &AppState, requested: &str) -> ApiResult<String> {
    let app_url = state.config.app_url.as_ref().ok_or_else(|| {
        ApiError::service_unavailable("APP_URL must be configured for billing redirects")
    })?;
    let app_url =
        Url::parse(app_url).map_err(|_| ApiError::service_unavailable("APP_URL is invalid"))?;
    let requested = Url::parse(requested)
        .map_err(|_| ApiError::bad_request("billing return url must be absolute"))?;

    if requested.scheme() != app_url.scheme()
        || requested.host_str() != app_url.host_str()
        || requested.port_or_known_default() != app_url.port_or_known_default()
    {
        return Err(ApiError::bad_request(
            "billing return url must use the configured app origin",
        ));
    }

    Ok(requested.to_string())
}

#[cfg(test)]
mod tests {
    use super::embed_origin_from_app_url;

    #[test]
    fn embed_origin_strips_path() {
        assert_eq!(
            embed_origin_from_app_url("http://localhost:5173"),
            Some("http://localhost:5173".to_owned())
        );
        assert_eq!(
            embed_origin_from_app_url("https://produktive.app/app/billing"),
            Some("https://produktive.app".to_owned())
        );
    }

    #[test]
    fn embed_origin_keeps_non_default_port() {
        assert_eq!(
            embed_origin_from_app_url("http://localhost:3000/foo"),
            Some("http://localhost:3000".to_owned())
        );
    }
}
