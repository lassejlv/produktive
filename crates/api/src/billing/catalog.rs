//! In-memory view of the Polar product catalog, loaded once at startup and
//! used as the deterministic source of truth for entitlements (included
//! allowances, overage rules, perks) — Polar grants benefits asynchronously,
//! so we resolve limits from the customer's *tier* rather than from live
//! benefit grants.

use std::collections::{BTreeMap, BTreeSet};

use polar::{Meter, Product};
use serde_json::Value;

/// Metered features, in display order.
pub const METERED_FEATURES: [&str; 3] = ["events", "monitors", "members"];

/// Deployment resource meters — pure-overage (no included credits), billed from
/// zero. Tracked by the deploy usage sweep, not gated on creation.
pub const DEPLOY_METERED_FEATURES: [&str; 3] = ["deploy_memory", "deploy_cpu", "deploy_volume"];

#[derive(Debug, Clone, Default)]
pub struct PolarCatalog {
    tiers: BTreeMap<String, TierCatalog>,
    product_to_tier: BTreeMap<String, String>,
    /// feature -> meter id (shared across tiers)
    meter_ids: BTreeMap<String, String>,
    free_product_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct TierCatalog {
    pub tier: String,
    pub product_id: String,
    pub name: String,
    pub description: Option<String>,
    pub price_cents: i64,
    pub interval: String,
    /// metered feature -> entitlement
    pub features: BTreeMap<String, FeatureEntitlement>,
    /// boolean perks included on this tier
    pub perks: BTreeSet<String>,
}

#[derive(Debug, Clone)]
pub struct FeatureEntitlement {
    pub meter_id: String,
    /// included allowance (meter-credit units)
    pub included: f64,
    /// whether the tier permits paid overage beyond `included`
    pub overage_allowed: bool,
    /// overage price in cents per unit, if metered
    pub unit_amount_cents: Option<f64>,
}

impl PolarCatalog {
    /// Convenience for tests: build the catalog from products alone (no meters,
    /// so metered-only features won't resolve). Production code uses
    /// [`PolarCatalog::from_products_with_meters`].
    #[cfg(test)]
    pub fn from_products(products: Vec<Product>) -> Self {
        Self::from_products_with_meters(products, Vec::new())
    }

    /// Build the catalog from products plus the org's meters. Meters carry
    /// `metadata.feature`, so a `meter_id -> feature` map is derivable. This lets
    /// the catalog register metered features that have a `metered_unit` price but
    /// no `meter_credit` benefit (e.g. pure-overage deploy meters billed from
    /// zero) — otherwise their `meter_id` would never be recorded.
    pub fn from_products_with_meters(products: Vec<Product>, meters: Vec<Meter>) -> Self {
        let meter_to_feature: BTreeMap<String, String> = meters
            .into_iter()
            .filter(|meter| meter.archived_at.is_none())
            .filter_map(|meter| {
                meter
                    .metadata
                    .get("feature")
                    .and_then(Value::as_str)
                    .map(str::to_owned)
                    .map(|feature| (meter.id, feature))
            })
            .collect();

        let mut catalog = PolarCatalog::default();

        for product in products {
            let Some(tier) = product.tier().map(str::to_owned) else {
                continue;
            };
            catalog
                .product_to_tier
                .insert(product.id.clone(), tier.clone());
            if tier == "free" {
                catalog.free_product_id = Some(product.id.clone());
            }

            let mut features = BTreeMap::new();
            let mut perks = BTreeSet::new();
            for benefit in &product.benefits {
                let Some(feature) = benefit.feature().map(str::to_owned) else {
                    continue;
                };
                match benefit.metadata.get("kind").and_then(|v| v.as_str()) {
                    Some("credit") => {
                        let Some(meter_id) = benefit.properties.meter_id.clone() else {
                            continue;
                        };
                        let unit_amount_cents = product.metered_unit_cents(&meter_id);
                        catalog
                            .meter_ids
                            .entry(feature.clone())
                            .or_insert_with(|| meter_id.clone());
                        features.insert(
                            feature,
                            FeatureEntitlement {
                                meter_id,
                                included: benefit.properties.units.unwrap_or(0.0),
                                overage_allowed: unit_amount_cents.is_some(),
                                unit_amount_cents,
                            },
                        );
                    }
                    Some("perk") => {
                        perks.insert(feature);
                    }
                    _ => {}
                }
            }

            // Register metered features that have a `metered_unit` price but no
            // credit benefit — pure-overage meters billed from zero (e.g. the
            // deploy resource meters). Their `meter_id` is resolved to a feature
            // via the meters list. `included: 0`, `overage_allowed: true`.
            for price in &product.prices {
                if price.is_archived || price.amount_type != "metered_unit" {
                    continue;
                }
                let Some(meter_id) = price.meter_id.clone() else {
                    continue;
                };
                let Some(feature) = meter_to_feature.get(&meter_id).cloned() else {
                    continue;
                };
                if features.contains_key(&feature) {
                    continue;
                }
                let unit_amount_cents = price.unit_amount_cents();
                catalog
                    .meter_ids
                    .entry(feature.clone())
                    .or_insert_with(|| meter_id.clone());
                features.insert(
                    feature,
                    FeatureEntitlement {
                        meter_id,
                        included: 0.0,
                        overage_allowed: unit_amount_cents.is_some(),
                        unit_amount_cents,
                    },
                );
            }

            // Resolve borrow-based fields before moving owned fields out of `product`.
            let price_cents = product.fixed_amount_cents().unwrap_or(0);
            let interval = product
                .recurring_interval
                .clone()
                .unwrap_or_else(|| "month".into());

            catalog.tiers.insert(
                tier.clone(),
                TierCatalog {
                    tier,
                    product_id: product.id,
                    name: product.name,
                    description: product.description,
                    price_cents,
                    interval,
                    features,
                    perks,
                },
            );
        }

        catalog
    }

    pub fn is_empty(&self) -> bool {
        self.tiers.is_empty()
    }

    pub fn tier_for_product(&self, product_id: &str) -> Option<&str> {
        self.product_to_tier.get(product_id).map(String::as_str)
    }

    pub fn tier(&self, slug: &str) -> Option<&TierCatalog> {
        self.tiers.get(slug)
    }

    pub fn default_paid_tier(&self) -> Option<&TierCatalog> {
        ["usage_based", "usage-based", "usage"]
            .into_iter()
            .find_map(|tier| self.tiers.get(tier))
            .or_else(|| {
                self.tiers_ordered()
                    .into_iter()
                    .find(|tier| tier.tier != "free")
            })
    }

    pub fn free_product_id(&self) -> Option<&str> {
        self.free_product_id.as_deref()
    }

    pub fn meter_id(&self, feature: &str) -> Option<&str> {
        self.meter_ids.get(feature).map(String::as_str)
    }

    pub fn entitlement(&self, tier: &str, feature: &str) -> Option<&FeatureEntitlement> {
        self.tiers.get(tier)?.features.get(feature)
    }

    pub fn tier_has_perk(&self, tier: &str, feature: &str) -> bool {
        self.tiers
            .get(tier)
            .is_some_and(|t| t.perks.contains(feature))
    }

    /// Tiers ordered free → basic → pro for pricing/summary display.
    pub fn tiers_ordered(&self) -> Vec<&TierCatalog> {
        let mut tiers: Vec<&TierCatalog> = self.tiers.values().collect();
        tiers.sort_by_key(|t| tier_order(&t.tier));
        tiers
    }
}

pub fn tier_order(tier: &str) -> usize {
    match tier {
        "free" => 0,
        "basic" => 1,
        "pro" => 2,
        _ => 100,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn catalog() -> PolarCatalog {
        let products: Vec<Product> = serde_json::from_value(serde_json::json!([
            {
                "id": "prod_free", "name": "Free", "description": "Start here",
                "metadata": {"tier": "free"}, "recurring_interval": "month",
                "prices": [{"amount_type": "free", "price_currency": "usd"}],
                "benefits": [
                    {"id": "b1", "type": "meter_credit", "metadata": {"feature": "events", "kind": "credit"},
                     "properties": {"units": 10000, "meter_id": "m_events"}},
                    {"id": "b2", "type": "meter_credit", "metadata": {"feature": "monitors", "kind": "credit"},
                     "properties": {"units": 3, "meter_id": "m_monitors"}}
                ]
            },
            {
                "id": "prod_basic", "name": "Basic", "description": null,
                "metadata": {"tier": "basic"}, "recurring_interval": "month",
                "prices": [
                    {"amount_type": "fixed", "price_currency": "usd", "price_amount": 1500},
                    {"amount_type": "metered_unit", "price_currency": "usd", "unit_amount": "50.0", "meter_id": "m_monitors"}
                ],
                "benefits": [
                    {"id": "b3", "type": "meter_credit", "metadata": {"feature": "monitors", "kind": "credit"},
                     "properties": {"units": 25, "meter_id": "m_monitors"}},
                    {"id": "b4", "type": "custom", "metadata": {"feature": "custom_domain", "kind": "perk"},
                     "properties": {}}
                ]
            }
        ]))
        .unwrap();
        PolarCatalog::from_products(products)
    }

    #[test]
    fn maps_products_to_tiers_and_meters() {
        let c = catalog();
        assert_eq!(c.tier_for_product("prod_basic"), Some("basic"));
        assert_eq!(c.free_product_id(), Some("prod_free"));
        assert_eq!(c.meter_id("monitors"), Some("m_monitors"));
    }

    #[test]
    fn free_monitors_have_no_overage_but_basic_does() {
        let c = catalog();
        let free = c.entitlement("free", "monitors").unwrap();
        assert_eq!(free.included, 3.0);
        assert!(!free.overage_allowed);

        let basic = c.entitlement("basic", "monitors").unwrap();
        assert_eq!(basic.included, 25.0);
        assert!(basic.overage_allowed);
        assert_eq!(basic.unit_amount_cents, Some(50.0));
    }

    #[test]
    fn perks_resolve_by_tier() {
        let c = catalog();
        assert!(c.tier_has_perk("basic", "custom_domain"));
        assert!(!c.tier_has_perk("free", "custom_domain"));
    }

    fn meters() -> Vec<Meter> {
        serde_json::from_value(serde_json::json!([
            {"id": "m_deploy_mem", "name": "deploy_memory", "metadata": {"feature": "deploy_memory"}},
            {"id": "m_deploy_cpu", "name": "deploy_cpu", "metadata": {"feature": "deploy_cpu"}}
        ]))
        .unwrap()
    }

    #[test]
    fn metered_price_registers_overage_feature_without_credit_benefit() {
        let products: Vec<Product> = serde_json::from_value(serde_json::json!([
            {
                "id": "prod_basic", "name": "Basic", "metadata": {"tier": "basic"},
                "recurring_interval": "month",
                "prices": [
                    {"amount_type": "fixed", "price_currency": "usd", "price_amount": 500},
                    {"amount_type": "metered_unit", "price_currency": "usd", "unit_amount": "1.3896", "meter_id": "m_deploy_mem"}
                ],
                "benefits": []
            }
        ]))
        .unwrap();
        let c = PolarCatalog::from_products_with_meters(products, meters());

        // The deploy meter resolves to a feature via the meters list, even with
        // no credit benefit — pure overage from zero.
        assert_eq!(c.meter_id("deploy_memory"), Some("m_deploy_mem"));
        let ent = c.entitlement("basic", "deploy_memory").unwrap();
        assert_eq!(ent.included, 0.0);
        assert!(ent.overage_allowed);
        assert_eq!(ent.unit_amount_cents, Some(1.3896));
    }

    #[test]
    fn metered_price_skipped_when_meter_has_no_feature_metadata() {
        let products: Vec<Product> = serde_json::from_value(serde_json::json!([
            {
                "id": "prod_basic", "name": "Basic", "metadata": {"tier": "basic"},
                "recurring_interval": "month",
                "prices": [
                    {"amount_type": "metered_unit", "price_currency": "usd", "unit_amount": "1.0", "meter_id": "m_unknown"}
                ],
                "benefits": []
            }
        ]))
        .unwrap();
        let c = PolarCatalog::from_products_with_meters(products, meters());
        // m_unknown is not in the meters map, so no feature is registered.
        assert!(c.entitlement("basic", "deploy_memory").is_none());
        assert!(c.meter_id("deploy_memory").is_none());
    }

    #[test]
    fn archived_meters_are_ignored() {
        let products: Vec<Product> = serde_json::from_value(serde_json::json!([
            {
                "id": "prod_basic", "name": "Basic", "metadata": {"tier": "basic"},
                "recurring_interval": "month",
                "prices": [
                    {"amount_type": "metered_unit", "price_currency": "usd", "unit_amount": "1.0", "meter_id": "m_deploy_mem"}
                ],
                "benefits": []
            }
        ]))
        .unwrap();
        let archived: Vec<Meter> = serde_json::from_value(serde_json::json!([
            {"id": "m_deploy_mem", "name": "deploy_memory", "metadata": {"feature": "deploy_memory"}, "archived_at": "2026-06-01T00:00:00Z"}
        ]))
        .unwrap();
        let c = PolarCatalog::from_products_with_meters(products, archived);
        assert!(c.entitlement("basic", "deploy_memory").is_none());
    }
}
