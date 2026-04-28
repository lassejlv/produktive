use crate::{auth::require_auth, error::ApiError, state::AppState};
use autumn_rs::{
    models::{
        Customer, GetOrCreateCustomerRequest, OpenCustomerPortalRequest, RedirectMode,
        SubscriptionStatus,
    },
    AutumnError,
};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use produktive_entity::member;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/status", get(status))
        .route("/checkout", post(checkout))
        .route("/portal", post(portal))
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

async fn status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<BillingStatusResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    let role = active_member_role(&state, &auth.user.id, &auth.organization.id).await?;
    let customer = get_or_create_customer(&state, &auth).await?;

    Ok(Json(status_response(
        &state.config.autumn_pro_plan_id,
        role.as_deref() == Some("owner"),
        customer,
        &auth.organization.id,
    )))
}

async fn checkout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<BillingUrlResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner(&state, &auth.user.id, &auth.organization.id).await?;
    get_or_create_customer(&state, &auth).await?;

    let success_url = format!("{}/account?billing=success", state.config.app_url);
    let response = state
        .autumn
        .attach(&auth.organization.id)
        .plan(&state.config.autumn_pro_plan_id)
        .redirect_mode(RedirectMode::Always)
        .success_url(success_url)
        .metadata_entry("organizationId", &auth.organization.id)
        .metadata_entry("createdByUserId", &auth.user.id)
        .send()
        .await
        .map_err(map_autumn_error)?;

    let url = response.payment_url.ok_or_else(|| {
        ApiError::BadRequest("Billing checkout did not return a payment URL".to_owned())
    })?;

    Ok(Json(BillingUrlResponse { url }))
}

async fn portal(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<BillingUrlResponse>, ApiError> {
    let auth = require_auth(&headers, &state).await?;
    require_owner(&state, &auth.user.id, &auth.organization.id).await?;
    get_or_create_customer(&state, &auth).await?;

    let response = state
        .autumn
        .billing()
        .open_customer_portal(OpenCustomerPortalRequest {
            customer_id: auth.organization.id,
            return_url: Some(format!("{}/account", state.config.app_url)),
            ..OpenCustomerPortalRequest::default()
        })
        .await
        .map_err(map_autumn_error)?;

    Ok(Json(BillingUrlResponse { url: response.url }))
}

async fn get_or_create_customer(
    state: &AppState,
    auth: &crate::auth::AuthContext,
) -> Result<Customer, ApiError> {
    let mut metadata: HashMap<String, Value> = HashMap::new();
    metadata.insert("organizationId".to_owned(), json!(auth.organization.id));
    metadata.insert("createdByUserId".to_owned(), json!(auth.user.id));

    state
        .autumn
        .customers()
        .get_or_create(GetOrCreateCustomerRequest {
            customer_id: Some(auth.organization.id.clone()),
            name: Some(auth.organization.name.clone()),
            email: Some(auth.user.email.clone()),
            metadata,
            ..GetOrCreateCustomerRequest::default()
        })
        .await
        .map_err(map_autumn_error)
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

fn status_response(
    pro_plan_id: &str,
    can_manage: bool,
    customer: Customer,
    fallback_customer_id: &str,
) -> BillingStatusResponse {
    let subscriptions = customer
        .subscriptions
        .into_iter()
        .map(|subscription| BillingSubscriptionResponse {
            id: subscription.id,
            plan_id: subscription.plan_id,
            status: subscription_status(subscription.status).to_owned(),
            current_period_end: subscription.current_period_end,
            trial_ends_at: subscription.trial_ends_at,
            canceled_at: subscription.canceled_at,
        })
        .collect::<Vec<_>>();
    let is_pro = subscriptions
        .iter()
        .any(|subscription| subscription.plan_id == pro_plan_id && subscription.status == "active");

    BillingStatusResponse {
        customer_id: customer
            .id
            .unwrap_or_else(|| fallback_customer_id.to_owned()),
        pro_plan_id: pro_plan_id.to_owned(),
        is_pro,
        can_manage,
        subscriptions,
    }
}

fn subscription_status(status: SubscriptionStatus) -> &'static str {
    match status {
        SubscriptionStatus::Active => "active",
        SubscriptionStatus::Scheduled => "scheduled",
    }
}

fn map_autumn_error(error: AutumnError) -> ApiError {
    match error {
        AutumnError::Api(api) if api.status.is_client_error() => {
            tracing::warn!(
                status = %api.status,
                code = ?api.code,
                message = %api.message,
                "Autumn billing request failed"
            );
            if api.status == StatusCode::UNAUTHORIZED || api.status == StatusCode::FORBIDDEN {
                ApiError::Internal(anyhow::anyhow!("Autumn billing credentials were rejected"))
            } else {
                ApiError::BadRequest(format!("Billing request failed: {}", api.message))
            }
        }
        other => {
            tracing::error!(error = ?other, "Autumn billing provider error");
            ApiError::Internal(anyhow::anyhow!("Billing provider error"))
        }
    }
}
