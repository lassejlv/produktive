use serde::{Deserialize, Serialize};

use crate::{Metadata, Polar, Result};

#[derive(Clone, Debug)]
pub struct CustomersClient {
    polar: Polar,
}

impl CustomersClient {
    pub(crate) fn new(polar: Polar) -> Self {
        Self { polar }
    }

    /// `GET /v1/customers/external/{external_id}` — `None` if the customer
    /// doesn't exist yet.
    pub async fn get_by_external(&self, external_id: &str) -> Result<Option<Customer>> {
        self.polar
            .get_optional(&format!("/v1/customers/external/{external_id}"))
            .await
    }

    /// `POST /v1/customers/` — creates an individual customer.
    pub async fn create(&self, body: CustomerCreate) -> Result<Customer> {
        self.polar.post("/v1/customers/", body).await
    }

    /// `GET /v1/customers/external/{external_id}/state` — the customer's active
    /// subscriptions, granted benefits, and meter balances in one shot.
    pub async fn state_by_external(&self, external_id: &str) -> Result<CustomerState> {
        self.polar
            .get(&format!("/v1/customers/external/{external_id}/state"))
            .await
    }

    /// `GET /v1/customers/{id}/state` — the customer's active subscriptions,
    /// granted benefits, and meter balances in one shot.
    pub async fn state_by_id(&self, id: &str) -> Result<CustomerState> {
        self.polar.get(&format!("/v1/customers/{id}/state")).await
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Customer {
    pub id: String,
    #[serde(default)]
    pub external_id: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct CustomerCreate {
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Metadata::is_empty")]
    pub metadata: Metadata,
}

impl CustomerCreate {
    pub fn new(email: impl Into<String>) -> Self {
        Self {
            email: email.into(),
            ..Default::default()
        }
    }

    pub fn external_id(mut self, external_id: impl Into<String>) -> Self {
        self.external_id = Some(external_id.into());
        self
    }

    pub fn name(mut self, name: impl Into<String>) -> Self {
        self.name = Some(name.into());
        self
    }
}

/// Customer state. Polar returns an individual- or team-shaped object; the
/// fields below are common to both, so one struct deserializes either.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomerState {
    pub id: String,
    #[serde(default)]
    pub external_id: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub active_subscriptions: Vec<StateSubscription>,
    #[serde(default)]
    pub granted_benefits: Vec<StateBenefitGrant>,
    #[serde(default)]
    pub active_meters: Vec<StateMeter>,
}

impl CustomerState {
    /// The active (or trialing/past-due) subscription, if any.
    pub fn active_subscription(&self) -> Option<&StateSubscription> {
        self.active_subscriptions
            .iter()
            .find(|s| matches!(s.status.as_str(), "active" | "trialing" | "past_due"))
            .or_else(|| self.active_subscriptions.first())
    }

    pub fn meter(&self, meter_id: &str) -> Option<&StateMeter> {
        self.active_meters.iter().find(|m| m.meter_id == meter_id)
    }

    pub fn has_benefit(&self, benefit_id: &str) -> bool {
        self.granted_benefits
            .iter()
            .any(|g| g.benefit_id == benefit_id)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateSubscription {
    pub id: String,
    pub status: String,
    pub product_id: String,
    #[serde(default)]
    pub cancel_at_period_end: bool,
    #[serde(default)]
    pub canceled_at: Option<String>,
    #[serde(default)]
    pub current_period_start: Option<String>,
    #[serde(default)]
    pub current_period_end: Option<String>,
    #[serde(default)]
    pub amount: i64,
    #[serde(default)]
    pub currency: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateMeter {
    pub meter_id: String,
    #[serde(default)]
    pub consumed_units: f64,
    #[serde(default)]
    pub credited_units: f64,
    #[serde(default)]
    pub balance: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateBenefitGrant {
    pub benefit_id: String,
    #[serde(default)]
    pub benefit_type: Option<String>,
}
