use serde::{Deserialize, Serialize};

use crate::{Polar, Result};

#[derive(Clone, Debug)]
pub struct CheckoutsClient {
    polar: Polar,
}

impl CheckoutsClient {
    pub(crate) fn new(polar: Polar) -> Self {
        Self { polar }
    }

    /// `POST /v1/checkouts/` — start a hosted checkout. Returns a `url` to
    /// redirect the customer to.
    pub async fn create(&self, body: CheckoutCreate) -> Result<Checkout> {
        self.polar.post("/v1/checkouts/", body).await
    }
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct CheckoutCreate {
    pub products: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_customer_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub success_url: Option<String>,
    /// A free subscription to upgrade in place (Polar requires it be on free pricing).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription_id: Option<String>,
}

impl CheckoutCreate {
    pub fn new(product_id: impl Into<String>, external_customer_id: impl Into<String>) -> Self {
        Self {
            products: vec![product_id.into()],
            external_customer_id: Some(external_customer_id.into()),
            success_url: None,
            subscription_id: None,
        }
    }

    pub fn success_url(mut self, success_url: Option<String>) -> Self {
        self.success_url = success_url;
        self
    }

    pub fn subscription_id(mut self, subscription_id: Option<String>) -> Self {
        self.subscription_id = subscription_id;
        self
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Checkout {
    pub id: String,
    pub url: String,
    #[serde(default)]
    pub status: Option<String>,
}
