use std::{collections::BTreeMap, future::Future, pin::Pin, sync::Arc};

use ::axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, Method, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::{models::JsonMap, Autumn, AutumnError, CustomerParams, Result};

type IdentifyFuture = Pin<Box<dyn Future<Output = Result<IdentifyResult>> + Send>>;
type IdentifyFn = Arc<dyn Fn(IdentifyContext) -> IdentifyFuture + Send + Sync>;

#[derive(Clone)]
pub struct AxumAutumnConfig {
    autumn: Autumn,
    identify: Option<IdentifyFn>,
    billing_routes_enabled: bool,
}

#[derive(Debug, Clone)]
pub struct IdentifyContext {
    pub headers: HeaderMap,
    pub method: Method,
    pub uri: Uri,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentifyResult {
    pub customer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_data: Option<CustomerData>,
}

impl IdentifyResult {
    pub fn new(customer_id: impl Into<String>) -> Self {
        Self {
            customer_id: customer_id.into(),
            customer_data: None,
        }
    }

    pub fn with_customer_data(mut self, customer_data: CustomerData) -> Self {
        self.customer_data = Some(customer_data);
        self
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CustomerData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fingerprint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<JsonMap>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stripe_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub create_in_stripe: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_enable_plan_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub send_email_receipts: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_controls: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<Value>,
}

impl AxumAutumnConfig {
    pub fn new(autumn: Autumn) -> Self {
        Self {
            autumn,
            identify: None,
            billing_routes_enabled: false,
        }
    }

    pub fn identify<F, Fut>(mut self, identify: F) -> Self
    where
        F: Fn(IdentifyContext) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<IdentifyResult>> + Send + 'static,
    {
        self.identify = Some(Arc::new(move |ctx| Box::pin(identify(ctx))));
        self
    }

    pub fn enable_billing_routes(mut self) -> Self {
        self.billing_routes_enabled = true;
        self
    }
}

pub fn autumn_router(config: AxumAutumnConfig) -> Router {
    let state = Arc::new(config);

    Router::new()
        .route("/customer", get(get_customer))
        .route("/entity/{entity_id}", get(get_entity))
        .route("/plans", get(list_plans))
        .route("/events", get(list_events))
        .route("/events/aggregate", get(aggregate_events))
        .route("/referrals/create", post(create_referral_code))
        .route("/referrals/redeem", post(redeem_referral_code))
        .route("/billing/attach", post(billing_attach))
        .route("/billing/portal", post(billing_portal))
        .route("/billing/setup-payment", post(billing_setup_payment))
        .with_state(state)
}

async fn get_customer(
    State(state): State<Arc<AxumAutumnConfig>>,
    headers: HeaderMap,
    method: Method,
    uri: Uri,
    Query(query): Query<BTreeMap<String, String>>,
) -> HandlerResult {
    let identity = identify(&state, headers, method, uri).await?;
    let mut params = customer_params_from_identity(identity);
    params.expand = parse_expand(&query);

    Ok(Json(
        state
            .autumn
            .customers()
            .get_or_create(params)
            .await
            .map(to_value)??,
    ))
}

async fn get_entity(
    State(state): State<Arc<AxumAutumnConfig>>,
    headers: HeaderMap,
    method: Method,
    uri: Uri,
    Path(entity_id): Path<String>,
    Query(query): Query<BTreeMap<String, String>>,
) -> HandlerResult {
    let identity = identify(&state, headers, method, uri).await?;
    let body = object_with_customer(&identity.customer_id)
        .with("entity_id", entity_id)
        .with_optional("expand", parse_expand_value(&query))
        .finish();

    Ok(Json(state.autumn.post("/v1/entities.get", body).await?))
}

async fn list_plans(
    State(state): State<Arc<AxumAutumnConfig>>,
    headers: HeaderMap,
    method: Method,
    uri: Uri,
    Query(query): Query<BTreeMap<String, String>>,
) -> HandlerResult {
    let identity = identify(&state, headers, method, uri).await?;
    let body = query_to_value(query)
        .with("customer_id", identity.customer_id)
        .finish();

    Ok(Json(state.autumn.post("/v1/plans.list", body).await?))
}

async fn list_events(
    State(state): State<Arc<AxumAutumnConfig>>,
    headers: HeaderMap,
    method: Method,
    uri: Uri,
    Query(query): Query<BTreeMap<String, String>>,
) -> HandlerResult {
    let identity = identify(&state, headers, method, uri).await?;
    let body = query_to_value(query)
        .with("customer_id", identity.customer_id)
        .finish();

    Ok(Json(state.autumn.post("/v1/events.list", body).await?))
}

async fn aggregate_events(
    State(state): State<Arc<AxumAutumnConfig>>,
    headers: HeaderMap,
    method: Method,
    uri: Uri,
    Query(query): Query<BTreeMap<String, String>>,
) -> HandlerResult {
    let identity = identify(&state, headers, method, uri).await?;
    let body = query_to_value(query)
        .with("customer_id", identity.customer_id)
        .finish();

    Ok(Json(state.autumn.post("/v1/events.aggregate", body).await?))
}

async fn create_referral_code(
    State(state): State<Arc<AxumAutumnConfig>>,
    headers: HeaderMap,
    method: Method,
    uri: Uri,
    Json(body): Json<Value>,
) -> HandlerResult {
    let identity = identify(&state, headers, method, uri).await?;
    let body = inject_customer_id(body, &identity.customer_id)?;

    Ok(Json(
        state.autumn.post("/v1/referrals.create_code", body).await?,
    ))
}

async fn redeem_referral_code(
    State(state): State<Arc<AxumAutumnConfig>>,
    headers: HeaderMap,
    method: Method,
    uri: Uri,
    Json(body): Json<Value>,
) -> HandlerResult {
    let identity = identify(&state, headers, method, uri).await?;
    let body = inject_customer_id(body, &identity.customer_id)?;

    Ok(Json(
        state.autumn.post("/v1/referrals.redeem_code", body).await?,
    ))
}

async fn billing_attach(
    State(state): State<Arc<AxumAutumnConfig>>,
    headers: HeaderMap,
    method: Method,
    uri: Uri,
    Json(body): Json<Value>,
) -> HandlerResult {
    ensure_billing_enabled(&state)?;
    let identity = identify(&state, headers, method, uri).await?;
    let body = inject_customer_id(body, &identity.customer_id)?;

    Ok(Json(state.autumn.post("/v1/billing.attach", body).await?))
}

async fn billing_portal(
    State(state): State<Arc<AxumAutumnConfig>>,
    headers: HeaderMap,
    method: Method,
    uri: Uri,
    Json(body): Json<Value>,
) -> HandlerResult {
    ensure_billing_enabled(&state)?;
    let identity = identify(&state, headers, method, uri).await?;
    let body = inject_customer_id(body, &identity.customer_id)?;

    Ok(Json(
        state
            .autumn
            .post("/v1/billing.open_customer_portal", body)
            .await?,
    ))
}

async fn billing_setup_payment(
    State(state): State<Arc<AxumAutumnConfig>>,
    headers: HeaderMap,
    method: Method,
    uri: Uri,
    Json(body): Json<Value>,
) -> HandlerResult {
    ensure_billing_enabled(&state)?;
    let identity = identify(&state, headers, method, uri).await?;
    let body = inject_customer_id(body, &identity.customer_id)?;

    Ok(Json(
        state.autumn.post("/v1/billing.setup_payment", body).await?,
    ))
}

async fn identify(
    state: &AxumAutumnConfig,
    headers: HeaderMap,
    method: Method,
    uri: Uri,
) -> Result<IdentifyResult> {
    let identify = state
        .identify
        .as_ref()
        .ok_or_else(|| AutumnError::Handler("identify callback not configured".into()))?;

    identify(IdentifyContext {
        headers,
        method,
        uri,
    })
    .await
}

fn ensure_billing_enabled(state: &AxumAutumnConfig) -> Result<()> {
    if state.billing_routes_enabled {
        Ok(())
    } else {
        Err(AutumnError::Handler("billing routes are disabled".into()))
    }
}

fn customer_params_from_identity(identity: IdentifyResult) -> CustomerParams {
    let mut params = CustomerParams::new(identity.customer_id);

    if let Some(data) = identity.customer_data {
        params.name = data.name;
        params.email = data.email;
        params.fingerprint = data.fingerprint;
        params.metadata = data.metadata;
        params.stripe_id = data.stripe_id;
        params.create_in_stripe = data.create_in_stripe;
        params.auto_enable_plan_id = data.auto_enable_plan_id;
        params.send_email_receipts = data.send_email_receipts;
        params.billing_controls = data.billing_controls;
        params.config = data.config;
    }

    params
}

fn inject_customer_id(mut body: Value, customer_id: &str) -> Result<Value> {
    if body.is_null() {
        body = Value::Object(Map::new());
    }

    let object = body
        .as_object_mut()
        .ok_or_else(|| AutumnError::Handler("request body must be a JSON object".into()))?;

    if let Some(existing) = object.get("customer_id").and_then(Value::as_str) {
        if existing != customer_id {
            return Err(AutumnError::Handler(
                "request customer_id does not match authenticated customer".into(),
            ));
        }
    }

    object.insert("customer_id".into(), Value::String(customer_id.into()));
    Ok(body)
}

fn parse_expand(query: &BTreeMap<String, String>) -> Option<Vec<String>> {
    query.get("expand").map(|expand| {
        expand
            .split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(ToOwned::to_owned)
            .collect()
    })
}

fn parse_expand_value(query: &BTreeMap<String, String>) -> Option<Value> {
    parse_expand(query).map(|items| Value::Array(items.into_iter().map(Value::String).collect()))
}

fn to_value<T: Serialize>(value: T) -> Result<Value> {
    serde_json::to_value(value).map_err(AutumnError::Encode)
}

fn query_to_value(query: BTreeMap<String, String>) -> ObjectBuilder {
    let mut builder = ObjectBuilder::default();
    for (key, value) in query {
        builder.map.insert(key, query_value(value));
    }
    builder
}

fn object_with_customer(customer_id: &str) -> ObjectBuilder {
    ObjectBuilder::default().with("customer_id", customer_id)
}

fn query_value(value: String) -> Value {
    if value.eq_ignore_ascii_case("true") {
        return Value::Bool(true);
    }
    if value.eq_ignore_ascii_case("false") {
        return Value::Bool(false);
    }
    if let Ok(number) = value.parse::<i64>() {
        return Value::Number(number.into());
    }
    if let Ok(number) = value.parse::<f64>() {
        if let Some(number) = serde_json::Number::from_f64(number) {
            return Value::Number(number);
        }
    }
    Value::String(value)
}

#[derive(Default)]
struct ObjectBuilder {
    map: Map<String, Value>,
}

impl ObjectBuilder {
    fn with(mut self, key: impl Into<String>, value: impl Into<Value>) -> Self {
        self.map.insert(key.into(), value.into());
        self
    }

    fn with_optional(mut self, key: impl Into<String>, value: Option<Value>) -> Self {
        if let Some(value) = value {
            self.map.insert(key.into(), value);
        }
        self
    }

    fn finish(self) -> Value {
        Value::Object(self.map)
    }
}

type HandlerResult = std::result::Result<Json<Value>, HandlerError>;

struct HandlerError(AutumnError);

impl From<AutumnError> for HandlerError {
    fn from(error: AutumnError) -> Self {
        Self(error)
    }
}

impl IntoResponse for HandlerError {
    fn into_response(self) -> Response {
        let status = match &self.0 {
            AutumnError::Api(api) => api.status,
            AutumnError::Handler(_) => StatusCode::BAD_REQUEST,
            AutumnError::MissingSecretKey
            | AutumnError::InvalidBaseUrl(_)
            | AutumnError::Encode(_)
            | AutumnError::Transport(_)
            | AutumnError::Decode(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };

        let body = Json(serde_json::json!({ "error": self.0.to_string() }));
        (status, body).into_response()
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn inject_customer_id_rejects_customer_spoofing() {
        let error = inject_customer_id(json!({ "customer_id": "other" }), "cus_123")
            .expect_err("spoofed customer id should be rejected");

        assert!(error.to_string().contains("does not match"));
    }

    #[test]
    fn inject_customer_id_adds_authenticated_customer() {
        let body = inject_customer_id(json!({ "plan_id": "pro" }), "cus_123").unwrap();

        assert_eq!(body["customer_id"], "cus_123");
        assert_eq!(body["plan_id"], "pro");
    }
}
