use autumn::{
    AttachParams, CancelAction, CustomerParams, ListPlansParams, OpenCustomerPortalParams,
    SetupPaymentParams, UpdateSubscriptionParams,
};
use axum::{
    extract::{Query, State},
    http::HeaderMap,
    routing::{get, post},
    Extension, Json, Router,
};
use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use url::Url;
use utoipa::{IntoParams, ToSchema};

use crate::{
    billing::{self, ensure_customer, load_owner_email},
    error::{ApiError, ApiResult},
    middleware::Membership,
    state::AppState,
};

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

fn require_autumn(state: &AppState) -> ApiResult<&autumn::Autumn> {
    state
        .autumn
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("billing is not configured"))
}

#[derive(Deserialize, IntoParams, ToSchema)]
pub struct CustomerQuery {
    #[param(example = "subscriptions.plan,balances.feature")]
    pub expand: Option<String>,
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
    #[serde(default)]
    pub configuration_id: Option<String>,
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
    let autumn = require_autumn(&state)?;
    let owner_email = load_owner_email(&state, m.workspace.owner_id).await?;
    ensure_customer(&state, &m.workspace, &owner_email).await?;

    let customer = autumn
        .customers()
        .get({
            let mut params = autumn::GetCustomerParams::new(billing::customer_id(m.workspace.id));
            params.expand = Some(vec![
                "subscriptions.plan".into(),
                "purchases.plan".into(),
                "balances.feature".into(),
            ]);
            params
        })
        .await?;

    let current_plan_id = current_plan_id(&customer);
    let subscription_status = current_subscription_status(&customer);
    let subscription_canceled_at = current_subscription(&customer)
        .and_then(|subscription| integer_field(subscription, "canceled_at"));
    let subscription_current_period_end =
        current_subscription(&customer).and_then(|subscription| {
            integer_field(subscription, "current_period_end")
                .or_else(|| integer_field(subscription, "current_period_ends_at"))
                .or_else(|| integer_field(subscription, "current_period_end_at"))
        });
    let scheduled_plan_id = scheduled_subscription(&customer).and_then(plan_id_from_subscription);
    let stripe_customer_id = customer.stripe_id.clone().or_else(|| {
        customer
            .extra
            .get("processors")
            .and_then(|processors| processors.get("stripe"))
            .and_then(|stripe| string_field(stripe, "id"))
    });

    let plans = autumn
        .plans()
        .list(ListPlansParams {
            customer_id: Some(billing::customer_id(m.workspace.id)),
            entity_id: None,
            include_archived: Some(false),
        })
        .await?
        .list
        .into_iter()
        .filter(|plan| !plan.add_on.unwrap_or(false))
        .map(|plan| plan_summary(plan, current_plan_id.as_deref()))
        .collect::<Vec<_>>();

    let current_plan_name = plans
        .iter()
        .find(|plan| Some(plan.id.as_str()) == current_plan_id.as_deref())
        .map(|plan| plan.name.clone());
    let scheduled_plan_name = plans
        .iter()
        .find(|plan| Some(plan.id.as_str()) == scheduled_plan_id.as_deref())
        .map(|plan| plan.name.clone());

    let balances = customer
        .balances
        .unwrap_or_default()
        .into_iter()
        .map(|(feature_id, balance)| {
            let summary = BillingBalanceSummary {
                feature_id: balance.feature_id,
                granted: balance.granted,
                remaining: balance.remaining,
                usage: balance.usage,
                unlimited: balance.unlimited.unwrap_or(false),
                next_reset_at: balance.next_reset_at,
            };
            (feature_id, summary)
        })
        .collect();

    Ok(Json(BillingSummary {
        customer_id: customer
            .id
            .unwrap_or_else(|| billing::customer_id(m.workspace.id)),
        current_plan_id,
        current_plan_name,
        subscription_status,
        subscription_canceled_at,
        subscription_current_period_end,
        scheduled_plan_id,
        scheduled_plan_name,
        portal_available: stripe_customer_id.is_some(),
        stripe_customer_id,
        plans,
        balances,
    }))
}

#[utoipa::path(
    get,
    path = "/api/workspaces/{wid}/billing/customer",
    params(("wid" = String, Path), CustomerQuery),
    responses((status = 200, body = Object)),
    security(("bearerAuth" = [])),
    tag = "billing"
)]
pub async fn get_customer(
    State(state): State<AppState>,
    Extension(m): Extension<Membership>,
    Query(query): Query<CustomerQuery>,
) -> ApiResult<Json<Value>> {
    m.require_owner()?;
    let autumn = require_autumn(&state)?;
    let owner_email = load_owner_email(&state, m.workspace.owner_id).await?;
    ensure_customer(&state, &m.workspace, &owner_email).await?;

    let expand = parse_expand(query.expand.as_deref())
        .unwrap_or_else(|| vec!["subscriptions.plan".into(), "balances.feature".into()]);

    let customer = autumn
        .customers()
        .get_or_create(
            CustomerParams::new(billing::customer_id(m.workspace.id))
                .name(m.workspace.name.clone())
                .email(owner_email)
                .expand(expand),
        )
        .await?;

    Ok(Json(
        serde_json::to_value(customer).map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?,
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
    let autumn = require_autumn(&state)?;
    let owner_email = load_owner_email(&state, m.workspace.owner_id).await?;
    ensure_customer(&state, &m.workspace, &owner_email).await?;

    let plans = autumn
        .plans()
        .list(ListPlansParams {
            customer_id: Some(billing::customer_id(m.workspace.id)),
            entity_id: None,
            include_archived: Some(false),
        })
        .await?;

    Ok(Json(
        serde_json::to_value(plans).map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?,
    ))
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
    let autumn = require_autumn(&state)?;
    let owner_email = load_owner_email(&state, m.workspace.owner_id).await?;
    ensure_customer(&state, &m.workspace, &owner_email).await?;

    let plan_id = body.plan_id.trim().to_owned();
    if plan_id.is_empty() {
        return Err(ApiError::bad_request("plan_id required"));
    }
    ensure_attachable_plan(autumn, m.workspace.id, &plan_id).await?;

    let success_url = billing_return_url(&state, body.success_url, &m.workspace.slug)?;

    let mut params = AttachParams::new(billing::customer_id(m.workspace.id), plan_id);
    if let Some(success_url) = success_url {
        params = params.success_url(success_url);
    }

    let response = autumn.billing().attach(params).await?;
    Ok(Json(
        serde_json::to_value(response).map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?,
    ))
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
    update_current_subscription(&state, &m, CancelAction::CancelEndOfCycle).await
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
    update_current_subscription(&state, &m, CancelAction::Uncancel).await
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
    update_current_subscription(&state, &m, CancelAction::Uncancel).await
}

async fn update_current_subscription(
    state: &AppState,
    m: &Membership,
    cancel_action: CancelAction,
) -> ApiResult<Json<Value>> {
    m.require_owner()?;
    let autumn = require_autumn(state)?;
    let owner_email = load_owner_email(state, m.workspace.owner_id).await?;
    ensure_customer(state, &m.workspace, &owner_email).await?;

    let customer = autumn
        .customers()
        .get({
            let mut params = autumn::GetCustomerParams::new(billing::customer_id(m.workspace.id));
            params.expand = Some(vec!["subscriptions.plan".into()]);
            params
        })
        .await?;
    let plan_id = current_plan_id(&customer)
        .ok_or_else(|| ApiError::bad_request("no active subscription to update"))?;

    let response = autumn
        .billing()
        .update(UpdateSubscriptionParams {
            customer_id: billing::customer_id(m.workspace.id),
            entity_id: None,
            plan_id: Some(plan_id),
            subscription_id: None,
            feature_quantities: None,
            version: None,
            customize: None,
            invoice_mode: None,
            proration_behavior: None,
            redirect_mode: None,
            discounts: None,
            cancel_action: Some(cancel_action),
            billing_cycle_anchor: None,
            no_billing_changes: None,
            recalculate_balances: None,
            extra: Default::default(),
        })
        .await?;

    Ok(Json(
        serde_json::to_value(response).map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?,
    ))
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
    let autumn = require_autumn(&state)?;
    let owner_email = load_owner_email(&state, m.workspace.owner_id).await?;
    ensure_customer(&state, &m.workspace, &owner_email).await?;

    let return_url = billing_return_url(&state, body.return_url, &m.workspace.slug)?;

    let response = autumn
        .billing()
        .open_customer_portal(OpenCustomerPortalParams {
            customer_id: billing::customer_id(m.workspace.id),
            configuration_id: body.configuration_id,
            return_url,
        })
        .await?;

    Ok(Json(
        serde_json::to_value(response).map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?,
    ))
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
    let autumn = require_autumn(&state)?;
    let owner_email = load_owner_email(&state, m.workspace.owner_id).await?;
    ensure_customer(&state, &m.workspace, &owner_email).await?;

    let success_url = billing_return_url(&state, body.success_url, &m.workspace.slug)?;
    let plan_id = match body.plan_id {
        Some(plan_id) => {
            let plan_id = plan_id.trim().to_owned();
            if plan_id.is_empty() {
                return Err(ApiError::bad_request("plan_id required"));
            }
            ensure_attachable_plan(autumn, m.workspace.id, &plan_id).await?;
            Some(plan_id)
        }
        None => None,
    };

    let response = autumn
        .billing()
        .setup_payment(SetupPaymentParams {
            customer_id: billing::customer_id(m.workspace.id),
            entity_id: None,
            plan_id,
            feature_quantities: None,
            version: None,
            customize: None,
            success_url,
            extra: Default::default(),
        })
        .await?;

    Ok(Json(
        serde_json::to_value(response).map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?,
    ))
}

fn parse_expand(raw: Option<&str>) -> Option<Vec<String>> {
    raw.map(|expand| {
        expand
            .split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(|item| match item {
                // Backward-compatible aliases for callers that used the older shorthand.
                "subscriptions" => "subscriptions.plan",
                "balances" => "balances.feature",
                other => other,
            })
            .filter(|item| {
                matches!(
                    *item,
                    "invoices"
                        | "trials_used"
                        | "rewards"
                        | "entities"
                        | "referrals"
                        | "payment_method"
                        | "subscriptions.plan"
                        | "purchases.plan"
                        | "balances.feature"
                        | "flags.feature"
                        | "billing_controls.auto_topups.purchase_limit"
                )
            })
            .map(ToOwned::to_owned)
            .collect()
    })
}

fn current_plan_id(customer: &autumn::Customer) -> Option<String> {
    current_subscription(customer)
        .and_then(|subscription| {
            string_field(subscription, "plan_id")
                .or_else(|| {
                    subscription
                        .get("plan")
                        .and_then(|plan| string_field(plan, "id"))
                })
                .or_else(|| {
                    subscription
                        .get("product")
                        .and_then(|plan| string_field(plan, "id"))
                })
        })
        .or_else(|| {
            customer
                .purchases
                .as_ref()
                .and_then(|purchases| purchases.first())
                .and_then(|purchase| {
                    string_field(purchase, "plan_id")
                        .or_else(|| {
                            purchase
                                .get("plan")
                                .and_then(|plan| string_field(plan, "id"))
                        })
                        .or_else(|| {
                            purchase
                                .get("product")
                                .and_then(|plan| string_field(plan, "id"))
                        })
                })
        })
}

fn current_subscription_status(customer: &autumn::Customer) -> Option<String> {
    current_subscription(customer).and_then(|subscription| string_field(subscription, "status"))
}

fn plan_id_from_subscription(subscription: &Value) -> Option<String> {
    string_field(subscription, "plan_id")
        .or_else(|| {
            subscription
                .get("plan")
                .and_then(|plan| string_field(plan, "id"))
        })
        .or_else(|| {
            subscription
                .get("product")
                .and_then(|plan| string_field(plan, "id"))
        })
}

fn current_subscription(customer: &autumn::Customer) -> Option<&Value> {
    customer
        .subscriptions
        .as_ref()
        .and_then(|subscriptions| {
            subscriptions.iter().find(|subscription| {
                matches!(
                    string_field(subscription, "status").as_deref(),
                    Some("active" | "trialing" | "past_due")
                )
            })
        })
        .or_else(|| {
            customer
                .subscriptions
                .as_ref()
                .and_then(|subscriptions| subscriptions.first())
        })
}

fn scheduled_subscription(customer: &autumn::Customer) -> Option<&Value> {
    customer.subscriptions.as_ref().and_then(|subscriptions| {
        subscriptions.iter().find(|subscription| {
            string_field(subscription, "status").as_deref() == Some("scheduled")
        })
    })
}

fn plan_summary(plan: autumn::Plan, current_plan_id: Option<&str>) -> BillingPlanSummary {
    let price = plan.price.map(|price| {
        let (primary_text, secondary_text) = display_text(price.display.as_ref());
        BillingPlanPriceSummary {
            amount: price.amount,
            interval: price.interval.and_then(json_string),
            primary_text,
            secondary_text,
        }
    });

    BillingPlanSummary {
        current: current_plan_id == Some(plan.id.as_str()),
        id: plan.id,
        name: plan.name,
        description: plan.description,
        price,
        items: plan
            .items
            .unwrap_or_default()
            .into_iter()
            .filter_map(plan_item_summary)
            .collect(),
    }
}

fn plan_item_summary(item: Value) -> Option<BillingPlanItemSummary> {
    let feature_id = string_field(&item, "feature_id")?;
    let (primary_text, secondary_text) = display_text(item.get("display"));
    Some(BillingPlanItemSummary {
        feature_id,
        included: number_field(&item, "included"),
        unlimited: item
            .get("unlimited")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        primary_text,
        secondary_text,
    })
}

fn display_text(value: Option<&Value>) -> (Option<String>, Option<String>) {
    let primary = value.and_then(|display| string_field(display, "primary_text"));
    let secondary = value.and_then(|display| string_field(display, "secondary_text"));
    (primary, secondary)
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}

fn number_field(value: &Value, key: &str) -> Option<f64> {
    match value.get(key) {
        Some(Value::Number(number)) => number.as_f64(),
        Some(Value::Bool(true)) => Some(1.0),
        Some(Value::Bool(false)) => Some(0.0),
        _ => None,
    }
}

fn integer_field(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(Value::as_i64)
}

fn json_string<T: Serialize>(value: T) -> Option<String> {
    serde_json::to_value(value)
        .ok()
        .and_then(|value| value.as_str().map(ToOwned::to_owned))
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

async fn ensure_attachable_plan(
    autumn: &autumn::Autumn,
    workspace_id: uuid::Uuid,
    plan_id: &str,
) -> ApiResult<()> {
    let plans = autumn
        .plans()
        .list(ListPlansParams {
            customer_id: Some(billing::customer_id(workspace_id)),
            entity_id: None,
            include_archived: Some(false),
        })
        .await?;
    let allowed = plans.list.into_iter().any(|plan| {
        plan.id == plan_id && !plan.add_on.unwrap_or(false) && !plan.archived.unwrap_or(false)
    });
    if allowed {
        Ok(())
    } else {
        Err(ApiError::bad_request(
            "plan_id is not available for this workspace",
        ))
    }
}

// billing attach/portal/setup-payment return Autumn JSON payloads

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn current_plan_id_reads_expanded_subscription_plan() {
        let customer = autumn::Customer {
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
            subscriptions: Some(vec![json!({
                "status": "active",
                "plan": { "id": "pro", "name": "Pro" }
            })]),
            purchases: None,
            balances: None,
            flags: None,
            extra: Default::default(),
        };

        assert_eq!(current_plan_id(&customer).as_deref(), Some("pro"));
        assert_eq!(
            current_subscription_status(&customer).as_deref(),
            Some("active")
        );
    }

    #[test]
    fn current_plan_id_falls_back_to_purchase_plan() {
        let customer = autumn::Customer {
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
            purchases: Some(vec![json!({
                "plan_id": "free"
            })]),
            balances: None,
            flags: None,
            extra: Default::default(),
        };

        assert_eq!(current_plan_id(&customer).as_deref(), Some("free"));
    }

    #[test]
    fn plan_item_summary_keeps_display_and_boolean_grants() {
        let item = plan_item_summary(json!({
            "feature_id": "custom_domain",
            "included": 0,
            "unlimited": false,
            "display": {
                "primary_text": "Custom domain",
                "secondary_text": "included on Pro"
            }
        }))
        .expect("plan item");

        assert_eq!(item.feature_id, "custom_domain");
        assert_eq!(item.included, Some(0.0));
        assert_eq!(item.primary_text.as_deref(), Some("Custom domain"));
        assert_eq!(item.secondary_text.as_deref(), Some("included on Pro"));
    }
}
