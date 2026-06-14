use serde::Deserialize;
use serde_json::Value;

use crate::{ListResource, Metadata, Polar, Result};

#[derive(Clone, Debug)]
pub struct CatalogClient {
    polar: Polar,
}

impl CatalogClient {
    pub(crate) fn new(polar: Polar) -> Self {
        Self { polar }
    }

    /// `GET /v1/products/` — every active product with its prices and attached
    /// benefits expanded. The API layer joins these (by `metadata`) into its
    /// pricing/entitlement catalog.
    pub async fn list_products(&self) -> Result<Vec<Product>> {
        let resp: ListResource<Product> = self
            .polar
            .get("/v1/products/?limit=100&is_archived=false&is_recurring=true")
            .await?;
        Ok(resp.items)
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Product {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub metadata: Metadata,
    #[serde(default)]
    pub is_archived: bool,
    #[serde(default)]
    pub recurring_interval: Option<String>,
    #[serde(default)]
    pub prices: Vec<ProductPrice>,
    #[serde(default)]
    pub benefits: Vec<Benefit>,
}

impl Product {
    /// Stable tier slug from `metadata.tier` (`free` / `basic` / `pro`).
    pub fn tier(&self) -> Option<&str> {
        self.metadata.get("tier").and_then(Value::as_str)
    }

    /// The flat recurring price in cents, if this product has a fixed price.
    pub fn fixed_amount_cents(&self) -> Option<i64> {
        self.prices
            .iter()
            .filter(|p| !p.is_archived)
            .find(|p| p.amount_type == "fixed")
            .and_then(|p| p.price_amount)
    }

    /// The metered overage price (cents per unit) bound to `meter_id`, if any.
    pub fn metered_unit_cents(&self, meter_id: &str) -> Option<f64> {
        self.prices
            .iter()
            .filter(|p| !p.is_archived && p.amount_type == "metered_unit")
            .filter(|p| p.meter_id.as_deref() == Some(meter_id))
            .find_map(|p| p.unit_amount_cents())
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProductPrice {
    pub amount_type: String,
    #[serde(default)]
    pub price_amount: Option<i64>,
    #[serde(default)]
    pub price_currency: Option<String>,
    /// Cents per metered unit. Polar serializes this as a decimal string.
    #[serde(default)]
    pub unit_amount: Option<Value>,
    #[serde(default)]
    pub meter_id: Option<String>,
    #[serde(default)]
    pub recurring_interval: Option<String>,
    #[serde(default)]
    pub is_archived: bool,
}

impl ProductPrice {
    pub fn unit_amount_cents(&self) -> Option<f64> {
        match self.unit_amount.as_ref()? {
            Value::String(s) => s.parse::<f64>().ok(),
            Value::Number(n) => n.as_f64(),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Benefit {
    pub id: String,
    #[serde(rename = "type")]
    pub benefit_type: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub metadata: Metadata,
    #[serde(default)]
    pub properties: BenefitProperties,
}

impl Benefit {
    /// Stable feature key from `metadata.feature`
    /// (`events` / `monitors` / `members` / `custom_domain` / ...).
    pub fn feature(&self) -> Option<&str> {
        self.metadata.get("feature").and_then(Value::as_str)
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct BenefitProperties {
    /// Granted allowance for `meter_credit` benefits.
    #[serde(default)]
    pub units: Option<f64>,
    #[serde(default)]
    pub meter_id: Option<String>,
}
