//! Entity types.
//!
//! Entities are sub-customers used to model per-seat or per-workspace usage.
//! Each entity is anchored to a customer + a `feature_id` (the seat/workspace
//! counter). The shape mirrors [`Customer`](super::customer::Customer):
//! `subscriptions[]`, `purchases[]`, `balances{}`, `flags{}`.
//!
//! Entity-level [`BillingControls`](super::shared::BillingControls) cannot
//! configure auto top-ups — that lives on the parent customer. Entity-level
//! controls use [`EntityBillingControls`].

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::balance::{Balance, Flag};
use super::customer::{CustomerData, Purchase, Subscription};
use super::shared::{EntityBillingControls, Environment, Extra};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Entity {
    pub id: Option<String>,
    pub name: Option<String>,
    #[serde(default)]
    pub customer_id: Option<String>,
    #[serde(default)]
    pub feature_id: Option<String>,
    pub created_at: i64,
    pub env: Environment,
    #[serde(default)]
    pub subscriptions: Vec<Subscription>,
    #[serde(default)]
    pub purchases: Vec<Purchase>,
    #[serde(default)]
    pub balances: HashMap<String, Balance>,
    #[serde(default)]
    pub flags: HashMap<String, Flag>,
    #[serde(default)]
    pub billing_controls: Option<EntityBillingControls>,
    #[serde(default)]
    pub invoices: Vec<EntityInvoice>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct EntityInvoice {
    #[serde(default)]
    pub plan_ids: Vec<String>,
    pub stripe_id: String,
    pub status: String,
    pub total: f64,
    pub currency: String,
    pub created_at: i64,
    #[serde(default)]
    pub hosted_invoice_url: Option<String>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct CreateEntityRequest {
    pub feature_id: String,
    pub customer_id: String,
    pub entity_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_controls: Option<EntityBillingControls>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_data: Option<CustomerData>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct GetEntityRequest {
    pub entity_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_id: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct UpdateEntityRequest {
    pub entity_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_controls: Option<EntityBillingControls>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct DeleteEntityRequest {
    pub entity_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_id: Option<String>,
}
