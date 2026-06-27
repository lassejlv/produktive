use std::collections::BTreeMap;

use axum::{extract::State, routing::get, Json, Router};
use chrono::{DateTime, Utc};
use serde::Serialize;
use utoipa::ToSchema;

use crate::{
    billing::{
        feature_display_name, feature_noun, format_thousands, overage_text, perk_label,
        trim_decimal, FeatureEntitlement, PolarCatalog, TierCatalog, HOURS_PER_MONTH,
        METERED_FEATURES, PERK_FEATURES, RESOURCE_METERED_FEATURES,
    },
    error::ApiResult,
    state::AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new().route("/public", get(public_pricing))
}

#[derive(Serialize, ToSchema)]
pub struct PublicPricingResponse {
    pub billing_enabled: bool,
    pub plans: Vec<PublicPricingPlan>,
    pub features: Vec<PublicPricingFeature>,
    pub generated_at: DateTime<chrono::FixedOffset>,
}

#[derive(Serialize, ToSchema)]
pub struct PublicPricingPlan {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub price: Option<PublicPlanPrice>,
    pub features: Vec<PublicPlanFeature>,
}

#[derive(Serialize, ToSchema)]
pub struct PublicPlanPrice {
    pub amount: Option<f64>,
    pub interval: Option<String>,
    pub primary_text: Option<String>,
    pub secondary_text: Option<String>,
}

#[derive(Serialize, ToSchema, Clone)]
pub struct PublicPlanFeature {
    pub feature_id: String,
    pub name: Option<String>,
    pub feature_type: Option<String>,
    pub included: Option<f64>,
    pub unlimited: bool,
    pub reset_interval: Option<String>,
    pub primary_text: Option<String>,
    pub secondary_text: Option<String>,
    pub usage_price: Option<PublicUsagePrice>,
}

#[derive(Serialize, ToSchema, Clone)]
pub struct PublicUsagePrice {
    pub amount: Option<f64>,
    pub billing_units: Option<f64>,
    pub interval: Option<String>,
    pub billing_method: Option<String>,
    pub max_purchase: Option<f64>,
    pub unit_amount: Option<f64>,
}

#[derive(Serialize, ToSchema)]
pub struct PublicPricingFeature {
    pub id: String,
    pub name: Option<String>,
    pub feature_type: Option<String>,
    pub consumable: bool,
    pub display_singular: Option<String>,
    pub display_plural: Option<String>,
}

#[utoipa::path(
    get,
    path = "/api/pricing/public",
    responses(
        (status = 200, body = PublicPricingResponse),
    ),
    tag = "pricing"
)]
pub async fn public_pricing(
    State(state): State<AppState>,
) -> ApiResult<Json<PublicPricingResponse>> {
    let Some(billing) = state.billing.as_ref() else {
        let features = build_public_features();
        return Ok(Json(PublicPricingResponse {
            billing_enabled: false,
            plans: vec![self_hosted_plan(&features)],
            features,
            generated_at: Utc::now().fixed_offset(),
        }));
    };
    let catalog = &billing.catalog;

    let mut plans: Vec<PublicPricingPlan> = catalog
        .tiers_ordered()
        .into_iter()
        .map(|tier| catalog_plan(catalog, tier))
        .collect();
    plans.sort_by_key(|plan| crate::billing::tier_order(&plan.id));

    let features = build_public_features();
    align_plan_features(&mut plans, &features);
    stack_lower_tier_features(&mut plans);

    Ok(Json(PublicPricingResponse {
        billing_enabled: true,
        plans,
        features,
        generated_at: Utc::now().fixed_offset(),
    }))
}

fn self_hosted_plan(features: &[PublicPricingFeature]) -> PublicPricingPlan {
    PublicPricingPlan {
        id: "self_hosted".to_owned(),
        name: "Self-hosted".to_owned(),
        description: Some("Billing is disabled when Polar is not configured.".to_owned()),
        price: Some(PublicPlanPrice {
            amount: Some(0.0),
            interval: None,
            primary_text: Some("Self-hosted".to_owned()),
            secondary_text: Some("no billing provider configured".to_owned()),
        }),
        features: features
            .iter()
            .map(|feature| {
                if feature.consumable {
                    PublicPlanFeature {
                        feature_id: feature.id.clone(),
                        name: feature.name.clone(),
                        feature_type: feature.feature_type.clone(),
                        included: None,
                        unlimited: true,
                        reset_interval: None,
                        primary_text: Some(format!(
                            "Unlimited {}",
                            feature.display_plural.as_deref().unwrap_or("usage")
                        )),
                        secondary_text: None,
                        usage_price: None,
                    }
                } else {
                    PublicPlanFeature {
                        feature_id: feature.id.clone(),
                        name: feature.name.clone(),
                        feature_type: feature.feature_type.clone(),
                        included: Some(1.0),
                        unlimited: false,
                        reset_interval: None,
                        primary_text: feature.name.clone(),
                        secondary_text: None,
                        usage_price: None,
                    }
                }
            })
            .collect(),
    }
}

// ---- build from catalog -----------------------------------------------------

fn catalog_plan(_catalog: &PolarCatalog, tier: &TierCatalog) -> PublicPricingPlan {
    let dollars = tier.price_cents as f64 / 100.0;
    let mut features = Vec::new();
    for feature in METERED_FEATURES {
        if let Some(ent) = tier.features.get(feature) {
            features.push(metered_plan_feature(feature, ent));
        } else if unlimited_when_missing(tier, feature) {
            features.push(unlimited_plan_feature(feature));
        }
    }
    for feature in RESOURCE_METERED_FEATURES {
        if let Some(ent) = tier.features.get(feature) {
            features.push(metered_plan_feature(feature, ent));
        }
    }
    for perk in PERK_FEATURES {
        features.push(perk_plan_feature(perk, tier.perks.contains(perk)));
    }

    PublicPricingPlan {
        id: tier.tier.clone(),
        name: tier.name.clone(),
        description: tier.description.clone(),
        price: Some(PublicPlanPrice {
            amount: Some(dollars),
            interval: Some(tier.interval.clone()),
            primary_text: Some(format!("${}", trim_decimal(dollars))),
            secondary_text: Some(format!("per {}", tier.interval)),
        }),
        features,
    }
}

fn unlimited_when_missing(tier: &TierCatalog, feature: &str) -> bool {
    tier.tier != "free" && feature == "members"
}

fn unlimited_plan_feature(feature: &str) -> PublicPlanFeature {
    PublicPlanFeature {
        feature_id: feature.to_owned(),
        name: Some(feature_display_name(feature).to_owned()),
        feature_type: Some("metered".into()),
        included: None,
        unlimited: true,
        reset_interval: None,
        primary_text: Some(format!("Unlimited {}", feature_noun(feature, 2.0))),
        secondary_text: None,
        usage_price: None,
    }
}

fn metered_plan_feature(feature: &str, ent: &FeatureEntitlement) -> PublicPlanFeature {
    let usage_price = ent.unit_amount_cents.map(|cents| {
        let (amount, billing_units) = match feature {
            "events" => (cents * 1000.0 / 100.0, 1000.0),
            // Hourly compute/storage meters: report the per-month dollar
            // equivalent (interval is "month"), mirroring `overage_text`.
            "deploy_memory" | "deploy_cpu" | "deploy_volume" | "object_storage" => {
                (cents * HOURS_PER_MONTH / 100.0, 1.0)
            }
            // deploy_egress and everything else are flat per-unit prices.
            _ => (cents / 100.0, 1.0),
        };
        PublicUsagePrice {
            amount: Some(amount),
            billing_units: Some(billing_units),
            interval: Some("month".into()),
            billing_method: Some("usage_based".into()),
            max_purchase: None,
            unit_amount: Some(amount / billing_units),
        }
    });

    PublicPlanFeature {
        feature_id: feature.to_owned(),
        name: Some(feature_display_name(feature).to_owned()),
        feature_type: Some("metered".into()),
        included: Some(ent.included),
        unlimited: false,
        reset_interval: Some("month".into()),
        primary_text: Some(if is_resource_meter(feature) {
            // Deploy meters bill from zero; show the overage rate as the headline.
            ent.unit_amount_cents
                .map(|c| overage_text(feature, c))
                .unwrap_or_else(|| format!("0 {}", feature_noun(feature, 0.0)))
        } else {
            format!(
                "{} {}",
                format_thousands(ent.included),
                feature_noun(feature, ent.included)
            )
        }),
        secondary_text: if is_resource_meter(feature) {
            None
        } else {
            ent.unit_amount_cents.map(|c| overage_text(feature, c))
        },
        usage_price,
    }
}

/// Resource meters are pure-overage from zero (no included credits), so
/// they render differently from allowance-based metered features.
fn is_resource_meter(feature: &str) -> bool {
    RESOURCE_METERED_FEATURES.contains(&feature)
}

fn perk_plan_feature(feature: &str, included: bool) -> PublicPlanFeature {
    PublicPlanFeature {
        feature_id: feature.to_owned(),
        name: Some(perk_label(feature).to_owned()),
        feature_type: Some("boolean".into()),
        included: Some(if included { 1.0 } else { 0.0 }),
        unlimited: false,
        reset_interval: None,
        primary_text: Some(perk_label(feature).to_owned()),
        secondary_text: (!included).then(|| "upgrade required".to_owned()),
        usage_price: None,
    }
}

fn build_public_features() -> Vec<PublicPricingFeature> {
    let mut features = Vec::new();
    for feature in METERED_FEATURES {
        features.push(PublicPricingFeature {
            id: feature.to_owned(),
            name: Some(feature_display_name(feature).to_owned()),
            feature_type: Some("metered".into()),
            consumable: true,
            display_singular: Some(feature_noun(feature, 1.0).to_owned()),
            display_plural: Some(feature_noun(feature, 2.0).to_owned()),
        });
    }
    for feature in RESOURCE_METERED_FEATURES {
        features.push(PublicPricingFeature {
            id: feature.to_owned(),
            name: Some(feature_display_name(feature).to_owned()),
            feature_type: Some("metered".into()),
            consumable: true,
            display_singular: Some(feature_noun(feature, 1.0).to_owned()),
            display_plural: Some(feature_noun(feature, 2.0).to_owned()),
        });
    }
    for perk in PERK_FEATURES {
        features.push(PublicPricingFeature {
            id: perk.to_owned(),
            name: Some(perk_label(perk).to_owned()),
            feature_type: Some("boolean".into()),
            consumable: false,
            display_singular: None,
            display_plural: None,
        });
    }
    features
}

// ---- ordering / stacking (data-source agnostic) -----------------------------

fn feature_order() -> Vec<String> {
    METERED_FEATURES
        .iter()
        .chain(RESOURCE_METERED_FEATURES.iter())
        .chain(PERK_FEATURES.iter())
        .map(|s| (*s).to_owned())
        .collect()
}

fn unsupported_feature(feature: &PublicPricingFeature) -> PublicPlanFeature {
    PublicPlanFeature {
        feature_id: feature.id.clone(),
        name: feature.name.clone(),
        feature_type: feature.feature_type.clone(),
        included: Some(0.0),
        unlimited: false,
        reset_interval: None,
        primary_text: None,
        secondary_text: Some("upgrade required".into()),
        usage_price: None,
    }
}

fn align_plan_features(plans: &mut [PublicPricingPlan], catalog: &[PublicPricingFeature]) {
    let order = feature_order();
    let catalog_by_id: BTreeMap<_, _> = catalog
        .iter()
        .map(|feature| (feature.id.as_str(), feature))
        .collect();

    for plan in plans.iter_mut() {
        let existing: BTreeMap<_, _> = plan
            .features
            .drain(..)
            .map(|feature| (feature.feature_id.clone(), feature))
            .collect();

        plan.features = order
            .iter()
            .filter_map(|feature_id| {
                existing.get(feature_id).cloned().or_else(|| {
                    catalog_by_id
                        .get(feature_id.as_str())
                        .map(|feature| unsupported_feature(feature))
                })
            })
            .collect();
    }
}

fn feature_supported(feature: &PublicPlanFeature) -> bool {
    if feature.unlimited {
        return true;
    }
    if feature.included.unwrap_or(0.0) > 0.0 {
        return true;
    }
    if feature.feature_type.as_deref() == Some("boolean") {
        let secondary = feature
            .secondary_text
            .as_deref()
            .unwrap_or("")
            .to_ascii_lowercase();
        return !secondary.contains("upgrade");
    }
    false
}

fn stack_lower_tier_features(plans: &mut [PublicPricingPlan]) {
    for idx in 1..plans.len() {
        let lower_features = plans[idx - 1].features.clone();
        let higher = &mut plans[idx];
        for lower in lower_features {
            if !feature_supported(&lower) {
                continue;
            }
            if let Some(slot) = higher
                .features
                .iter_mut()
                .find(|feature| feature.feature_id == lower.feature_id)
            {
                if !feature_supported(slot) {
                    *slot = lower;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use polar::{Meter, Product};

    fn catalog() -> PolarCatalog {
        let products: Vec<Product> = serde_json::from_value(serde_json::json!([
            {
                "id": "p_free", "name": "Free", "metadata": {"tier": "free"},
                "recurring_interval": "month",
                "prices": [{"amount_type": "free", "price_currency": "usd"}],
                "benefits": [
                    {"id": "b1", "type": "meter_credit", "metadata": {"feature": "monitors", "kind": "credit"},
                     "properties": {"units": 3, "meter_id": "m_mon"}}
                ]
            },
            {
                "id": "p_pro", "name": "Pro", "metadata": {"tier": "pro"},
                "recurring_interval": "month",
                "prices": [
                    {"amount_type": "fixed", "price_currency": "usd", "price_amount": 4900},
                    {"amount_type": "metered_unit", "price_currency": "usd", "unit_amount": "50.0", "meter_id": "m_mon"}
                ],
                "benefits": [
                    {"id": "b2", "type": "meter_credit", "metadata": {"feature": "monitors", "kind": "credit"},
                     "properties": {"units": 100, "meter_id": "m_mon"}},
                    {"id": "b3", "type": "custom", "metadata": {"feature": "custom_domain", "kind": "perk"}, "properties": {}}
                ]
            }
        ]))
        .unwrap();
        PolarCatalog::from_products(products)
    }

    fn deploy_catalog() -> PolarCatalog {
        let products: Vec<Product> = serde_json::from_value(serde_json::json!([
            {
                "id": "p_pro", "name": "Pro", "metadata": {"tier": "pro"},
                "recurring_interval": "month",
                "prices": [
                    {"amount_type": "fixed", "price_currency": "usd", "price_amount": 4900},
                    {"amount_type": "metered_unit", "price_currency": "usd", "unit_amount": "1.3896", "meter_id": "m_deploy_mem"},
                    {"amount_type": "metered_unit", "price_currency": "usd", "unit_amount": "2.7792", "meter_id": "m_deploy_cpu"},
                    {"amount_type": "metered_unit", "price_currency": "usd", "unit_amount": "0.0216", "meter_id": "m_deploy_vol"},
                    {"amount_type": "metered_unit", "price_currency": "usd", "unit_amount": "0.002777777777777778", "meter_id": "m_object_storage"}
                ],
                "benefits": []
            }
        ]))
        .unwrap();
        let meters: Vec<Meter> = serde_json::from_value(serde_json::json!([
            {"id": "m_deploy_mem", "name": "deploy_memory", "metadata": {"feature": "deploy_memory"}},
            {"id": "m_deploy_cpu", "name": "deploy_cpu", "metadata": {"feature": "deploy_cpu"}},
            {"id": "m_deploy_vol", "name": "deploy_volume", "metadata": {"feature": "deploy_volume"}},
            {"id": "m_object_storage", "name": "object_storage", "metadata": {"feature": "object_storage"}}
        ]))
        .unwrap();
        PolarCatalog::from_products_with_meters(products, meters)
    }

    #[test]
    fn free_plan_marks_paid_perks_as_upgrade() {
        let c = catalog();
        let plan = catalog_plan(&c, c.tier("free").unwrap());
        let domain = plan
            .features
            .iter()
            .find(|f| f.feature_id == "custom_domain")
            .unwrap();
        assert_eq!(domain.included, Some(0.0));
        assert_eq!(domain.secondary_text.as_deref(), Some("upgrade required"));
    }

    #[test]
    fn pro_plan_includes_overage_price_and_perk() {
        let c = catalog();
        let plan = catalog_plan(&c, c.tier("pro").unwrap());
        let monitors = plan
            .features
            .iter()
            .find(|f| f.feature_id == "monitors")
            .unwrap();
        assert_eq!(monitors.included, Some(100.0));
        assert_eq!(monitors.primary_text.as_deref(), Some("100 monitors"));
        assert!(monitors.usage_price.is_some());

        let domain = plan
            .features
            .iter()
            .find(|f| f.feature_id == "custom_domain")
            .unwrap();
        assert_eq!(domain.included, Some(1.0));
    }

    #[test]
    fn deploy_metered_plan_features_scale_hourly_prices_to_monthly_display() {
        let c = deploy_catalog();
        let plan = catalog_plan(&c, c.tier("pro").unwrap());

        for (feature, hourly_cents, primary_text) in [
            ("deploy_memory", 1.3896, "then $10.01 per GB-month"),
            ("deploy_cpu", 2.7792, "then $20.01 per vCPU-month"),
            ("deploy_volume", 0.0216, "then $0.16 per GB-month"),
            (
                "object_storage",
                0.002777777777777778,
                "then $0.02 per GB-month",
            ),
        ] {
            let plan_feature = plan
                .features
                .iter()
                .find(|f| f.feature_id == feature)
                .unwrap_or_else(|| panic!("missing {feature}"));
            assert_eq!(plan_feature.included, Some(0.0));
            assert_eq!(plan_feature.primary_text.as_deref(), Some(primary_text));
            assert_eq!(plan_feature.secondary_text, None);

            let usage_price = plan_feature.usage_price.as_ref().unwrap();
            let expected_monthly_dollars = hourly_cents * HOURS_PER_MONTH / 100.0;
            assert_eq!(usage_price.billing_units, Some(1.0));
            assert_eq!(usage_price.interval.as_deref(), Some("month"));
            assert!((usage_price.amount.unwrap() - expected_monthly_dollars).abs() < f64::EPSILON);
            assert!(
                (usage_price.unit_amount.unwrap() - expected_monthly_dollars).abs() < f64::EPSILON
            );
        }
    }

    #[test]
    fn paid_plan_without_member_credit_displays_unlimited_members() {
        let c = catalog();
        let plan = catalog_plan(&c, c.tier("pro").unwrap());
        let members = plan
            .features
            .iter()
            .find(|f| f.feature_id == "members")
            .unwrap();
        assert!(members.unlimited);
        assert_eq!(members.primary_text.as_deref(), Some("Unlimited members"));
    }

    #[test]
    fn align_fills_missing_features_in_order() {
        let c = catalog();
        let mut plans = vec![catalog_plan(&c, c.tier("free").unwrap())];
        align_plan_features(&mut plans, &build_public_features());
        let ids: Vec<&str> = plans[0]
            .features
            .iter()
            .map(|f| f.feature_id.as_str())
            .collect();
        assert_eq!(ids[0], "events"); // metered features first, in order
        assert!(ids.contains(&"remove_branding"));
    }
}
