//! Request and response shapes for the Polar API.
//!
//! These mirror the JSON structures Polar exchanges over the wire. Fields the
//! workspace doesn't currently consume are intentionally omitted — `serde` will
//! ignore unknown keys, so adding more later is non-breaking.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

/// `POST /v1/checkouts/` request body.
#[derive(Debug, Default, Clone, Serialize)]
pub struct CreateCheckoutRequest {
    /// IDs of products the customer is allowed to pick from. The first product
    /// is selected by default.
    pub products: Vec<String>,
    /// Pre-fill an existing Polar customer.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_id: Option<String>,
    /// Your system's customer identifier — Polar will create or update its
    /// own customer record keyed by this value.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_customer_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_name: Option<String>,
    /// Where to send the customer after a successful payment. Polar appends a
    /// `?checkout_id=...` query parameter automatically.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub success_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow_discount_codes: Option<bool>,
    /// Free-form metadata, copied through to subsequent webhooks.
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub metadata: HashMap<String, Value>,
}

/// `POST /v1/checkouts/` response.
#[derive(Debug, Clone, Deserialize)]
pub struct Checkout {
    pub id: String,
    /// URL to send the customer to.
    pub url: String,
    #[serde(default)]
    pub client_secret: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub customer_id: Option<String>,
    #[serde(default)]
    pub external_customer_id: Option<String>,
    #[serde(default)]
    pub product_id: Option<String>,
    #[serde(default)]
    pub expires_at: Option<String>,
}

// ---------------------------------------------------------------------------
// Customer session
// ---------------------------------------------------------------------------

/// `POST /v1/customer-sessions/` request body — accepts either an internal
/// Polar customer ID or your `external_customer_id` plus an optional return
/// URL.
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum CreateCustomerSessionRequest {
    /// Identify the customer by your system's external id.
    External {
        external_customer_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        return_url: Option<String>,
    },
    /// Identify the customer by Polar's internal UUID.
    Internal {
        customer_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        return_url: Option<String>,
    },
}

/// `POST /v1/customer-sessions/` response.
#[derive(Debug, Clone, Deserialize)]
pub struct CustomerSession {
    pub id: String,
    /// Single-use bearer token for the customer portal API.
    pub token: String,
    pub expires_at: String,
    /// Pre-authenticated URL to send the customer to.
    pub customer_portal_url: String,
    pub customer_id: String,
}

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

/// Subscription as returned by `/v1/subscriptions/{id}` and inside webhook
/// payloads.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Subscription {
    pub id: String,
    pub status: String,
    #[serde(default)]
    pub customer_id: Option<String>,
    #[serde(default)]
    pub product_id: Option<String>,
    #[serde(default)]
    pub current_period_start: Option<String>,
    #[serde(default)]
    pub current_period_end: Option<String>,
    #[serde(default)]
    pub cancel_at_period_end: bool,
    #[serde(default)]
    pub canceled_at: Option<String>,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(default)]
    pub ends_at: Option<String>,
    #[serde(default)]
    pub customer: Option<Customer>,
    #[serde(default)]
    pub metadata: HashMap<String, Value>,
}

/// Customer as embedded in a subscription or returned by customer webhook
/// events.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Customer {
    pub id: String,
    #[serde(default)]
    pub external_id: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub metadata: HashMap<String, Value>,
}

/// `PATCH /v1/subscriptions/{id}` request body.
///
/// The Polar API accepts either field but never both. Use the helpers on
/// [`Subscriptions`](crate::resources::Subscriptions) when you only need
/// cancel/uncancel/revoke semantics.
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum UpdateSubscriptionRequest {
    /// Schedule cancellation at period end (`true`) or roll back a pending
    /// cancellation (`false`).
    CancelAtPeriodEnd { cancel_at_period_end: bool },
    /// Cancel and revoke immediately.
    Revoke { revoke: bool },
}

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

/// Product as returned by `/v1/products/{id}`.
#[derive(Debug, Clone, Deserialize)]
pub struct Product {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub is_recurring: bool,
    #[serde(default)]
    pub is_archived: bool,
    /// Recurring interval at the product level (`month` / `year`). Individual
    /// prices may carry their own.
    #[serde(default)]
    pub recurring_interval: Option<String>,
    #[serde(default)]
    pub prices: Vec<ProductPrice>,
}

/// One price variant attached to a [`Product`].
#[derive(Debug, Clone, Deserialize)]
pub struct ProductPrice {
    pub id: String,
    /// `fixed`, `custom`, or `free`.
    #[serde(default)]
    pub amount_type: Option<String>,
    /// Amount in the smallest currency unit (e.g. cents).
    #[serde(default)]
    pub price_amount: Option<i64>,
    /// Three-letter currency code (lowercased by Polar, e.g. `eur`).
    #[serde(default)]
    pub price_currency: Option<String>,
    #[serde(default)]
    pub recurring_interval: Option<String>,
    #[serde(default)]
    pub is_archived: bool,
}
