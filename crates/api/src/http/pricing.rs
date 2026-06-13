use std::collections::BTreeMap;

use autumn::ListPlansParams;
use axum::{extract::State, routing::get, Json, Router};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use utoipa::ToSchema;

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new().route("/public", get(public_pricing))
}

#[derive(Serialize, ToSchema)]
pub struct PublicPricingResponse {
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
        (status = 503, description = "Billing is not configured"),
    ),
    tag = "pricing"
)]
pub async fn public_pricing(
    State(state): State<AppState>,
) -> ApiResult<Json<PublicPricingResponse>> {
    let autumn = state
        .autumn
        .as_ref()
        .ok_or_else(|| ApiError::service_unavailable("billing is not configured"))?;

    let features = autumn.features().list().await?.list;
    let feature_lookup = features
        .iter()
        .map(|feature| (feature.id.as_str(), feature))
        .collect::<BTreeMap<_, _>>();
    let plans = autumn
        .plans()
        .list(ListPlansParams {
            customer_id: None,
            entity_id: None,
            include_archived: Some(false),
        })
        .await?
        .list;

    let mut public_plans = plans
        .into_iter()
        .filter(|plan| !plan.add_on.unwrap_or(false))
        .map(|plan| normalize_plan(plan, &feature_lookup))
        .collect::<Vec<_>>();
    if !public_plans.iter().any(|plan| plan.id == "free") {
        public_plans.insert(0, free_plan(&feature_lookup));
    }
    public_plans.sort_by_key(|plan| plan_order(&plan.id));

    let public_features: Vec<PublicPricingFeature> =
        features.into_iter().map(normalize_feature).collect();
    align_plan_features(&mut public_plans, &public_features);
    stack_lower_tier_features(&mut public_plans);

    Ok(Json(PublicPricingResponse {
        plans: public_plans,
        features: public_features,
        generated_at: Utc::now().fixed_offset(),
    }))
}

fn normalize_feature(feature: autumn::Feature) -> PublicPricingFeature {
    PublicPricingFeature {
        id: feature.id,
        name: feature.name,
        feature_type: feature.feature_type.and_then(json_string),
        consumable: feature.consumable.unwrap_or(false),
        display_singular: feature.display.as_ref().and_then(|d| d.singular.clone()),
        display_plural: feature.display.as_ref().and_then(|d| d.plural.clone()),
    }
}

fn normalize_plan(
    plan: autumn::Plan,
    features: &BTreeMap<&str, &autumn::Feature>,
) -> PublicPricingPlan {
    PublicPricingPlan {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        price: plan.price.map(normalize_plan_price),
        features: plan
            .items
            .unwrap_or_default()
            .into_iter()
            .map(|item| normalize_plan_feature(item, features))
            .collect(),
    }
}

fn plan_order(id: &str) -> usize {
    match id {
        "free" => 0,
        "basic" => 1,
        "pro" => 2,
        _ => 100,
    }
}

const METERED_FEATURE_ORDER: &[&str] = &["events", "monitors", "members"];
const BOOLEAN_FEATURE_ORDER: &[&str] = &[
    "five_min_checks",
    "one_min_checks",
    "custom_domain",
    "multi_region",
    "priority_support",
    "remove_branding",
];

fn feature_order(_plans: &[PublicPricingPlan], catalog: &[PublicPricingFeature]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut order = Vec::new();

    let mut add = |id: &str| {
        if seen.insert(id.to_owned()) {
            order.push(id.to_owned());
        }
    };

    for id in METERED_FEATURE_ORDER {
        add(id);
    }
    for id in BOOLEAN_FEATURE_ORDER {
        add(id);
    }
    for feature in catalog {
        add(&feature.id);
    }

    order
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
    let order = feature_order(plans, catalog);
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

fn free_plan(features: &BTreeMap<&str, &autumn::Feature>) -> PublicPricingPlan {
    PublicPricingPlan {
        id: "free".into(),
        name: "Free".into(),
        description: Some("Start monitoring with basic limits, no billing setup required.".into()),
        price: Some(PublicPlanPrice {
            amount: Some(0.0),
            interval: Some("month".into()),
            primary_text: Some("$0".into()),
            secondary_text: Some("per month".into()),
        }),
        features: [
            free_metered_feature("events", 10_000.0, "10,000 events", features),
            free_metered_feature("monitors", 3.0, "3 monitors", features),
            free_metered_feature("members", 1.0, "1 member", features),
            free_boolean_feature(
                "five_min_checks",
                false,
                "15 min checks",
                "upgrade for 5 min checks",
                features,
            ),
            free_boolean_feature(
                "one_min_checks",
                false,
                "1 min checks",
                "upgrade for 1 min checks",
                features,
            ),
            free_boolean_feature(
                "custom_domain",
                false,
                "Custom domain",
                "upgrade for custom domains",
                features,
            ),
            free_boolean_feature(
                "multi_region",
                false,
                "Multi Region",
                "upgrade for multi-region checks",
                features,
            ),
            free_boolean_feature(
                "priority_support",
                false,
                "Priority support",
                "upgrade for priority support",
                features,
            ),
            free_boolean_feature(
                "remove_branding",
                false,
                "Remove branding",
                "upgrade to remove branding",
                features,
            ),
        ]
        .into(),
    }
}

fn free_metered_feature(
    feature_id: &str,
    included: f64,
    primary_text: &str,
    features: &BTreeMap<&str, &autumn::Feature>,
) -> PublicPlanFeature {
    let feature = features.get(feature_id).copied();
    PublicPlanFeature {
        feature_id: feature_id.into(),
        name: feature.and_then(|feature| feature.name.clone()),
        feature_type: feature
            .and_then(|feature| feature.feature_type.clone().and_then(json_string)),
        included: Some(included),
        unlimited: false,
        reset_interval: Some("month".into()),
        primary_text: Some(primary_text.into()),
        secondary_text: None,
        usage_price: None,
    }
}

fn free_boolean_feature(
    feature_id: &str,
    included: bool,
    primary_text: &str,
    secondary_text: &str,
    features: &BTreeMap<&str, &autumn::Feature>,
) -> PublicPlanFeature {
    let feature = features.get(feature_id).copied();
    PublicPlanFeature {
        feature_id: feature_id.into(),
        name: feature.and_then(|feature| feature.name.clone()),
        feature_type: feature
            .and_then(|feature| feature.feature_type.clone().and_then(json_string)),
        included: Some(if included { 1.0 } else { 0.0 }),
        unlimited: false,
        reset_interval: None,
        primary_text: Some(primary_text.into()),
        secondary_text: Some(secondary_text.into()),
        usage_price: None,
    }
}

fn normalize_plan_price(price: autumn::Price) -> PublicPlanPrice {
    let (primary_text, secondary_text) = display_text(price.display.as_ref());
    PublicPlanPrice {
        amount: price.amount,
        interval: price.interval.and_then(json_string),
        primary_text,
        secondary_text,
    }
}

fn normalize_plan_feature(
    item: Value,
    features: &BTreeMap<&str, &autumn::Feature>,
) -> PublicPlanFeature {
    let feature_id = string_field(&item, "feature_id").unwrap_or_default();
    let feature = features.get(feature_id.as_str()).copied();
    let reset_interval = item
        .get("reset")
        .and_then(|reset| string_field(reset, "interval"));
    let mut included = included_field(&item);
    let unlimited = bool_field(&item, "unlimited").unwrap_or(false);
    let (primary_text, secondary_text) = display_text(item.get("display"));

    let is_boolean = feature
        .and_then(|feature| feature.feature_type.as_ref())
        .is_some_and(|feature_type| matches!(feature_type, autumn::FeatureType::Boolean));

    if is_boolean {
        let upgrade_hint = secondary_text
            .as_deref()
            .is_some_and(|text| text.to_ascii_lowercase().contains("upgrade"));
        if upgrade_hint {
            included = Some(0.0);
        } else {
            included = Some(1.0);
        }
    }

    PublicPlanFeature {
        feature_id,
        name: feature.and_then(|feature| feature.name.clone()),
        feature_type: feature
            .and_then(|feature| feature.feature_type.clone().and_then(json_string)),
        included,
        unlimited,
        reset_interval,
        primary_text,
        secondary_text,
        usage_price: item.get("price").and_then(normalize_usage_price),
    }
}

fn included_field(value: &Value) -> Option<f64> {
    number_field(value, "included")
}

fn normalize_usage_price(value: &Value) -> Option<PublicUsagePrice> {
    if value.is_null() {
        return None;
    }

    let amount = number_field(value, "amount");
    let billing_units = number_field(value, "billing_units");
    Some(PublicUsagePrice {
        amount,
        billing_units,
        interval: string_field(value, "interval"),
        billing_method: string_field(value, "billing_method"),
        max_purchase: number_field(value, "max_purchase"),
        unit_amount: match (amount, billing_units) {
            (Some(amount), Some(units)) if units > 0.0 => Some(amount / units),
            _ => None,
        },
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

fn bool_field(value: &Value, key: &str) -> Option<bool> {
    value.get(key).and_then(Value::as_bool)
}

fn json_string<T: Serialize>(value: T) -> Option<String> {
    serde_json::to_value(value)
        .ok()
        .and_then(|value| value.as_str().map(ToOwned::to_owned))
}

#[cfg(test)]
mod tests {
    use super::*;
    use autumn::FeatureType;
    use serde_json::json;

    fn boolean_feature(id: &str) -> autumn::Feature {
        autumn::Feature {
            id: id.into(),
            name: Some(id.into()),
            feature_type: Some(FeatureType::Boolean),
            consumable: None,
            event_names: None,
            credit_schema: None,
            display: None,
            archived: None,
            extra: Default::default(),
        }
    }

    #[test]
    fn autumn_boolean_plan_items_are_treated_as_included() {
        let stored = [boolean_feature("five_min_checks")];
        let features = stored
            .iter()
            .map(|feature| (feature.id.as_str(), feature))
            .collect::<BTreeMap<_, _>>();

        let item = json!({
            "feature_id": "five_min_checks",
            "included": 0,
            "display": { "primary_text": "5 min checks" }
        });

        let normalized = normalize_plan_feature(item, &features);
        assert_eq!(normalized.included, Some(1.0));
    }

    #[test]
    fn free_plan_upgrade_hints_stay_excluded() {
        let stored = [boolean_feature("custom_domain")];
        let features = stored
            .iter()
            .map(|feature| (feature.id.as_str(), feature))
            .collect::<BTreeMap<_, _>>();

        let item = json!({
            "feature_id": "custom_domain",
            "included": 0,
            "display": {
                "primary_text": "Custom domain",
                "secondary_text": "upgrade for custom domains"
            }
        });

        let normalized = normalize_plan_feature(item, &features);
        assert_eq!(normalized.included, Some(0.0));
    }

    #[test]
    fn metered_members_keep_included_grant() {
        let stored = [autumn::Feature {
            id: "members".into(),
            name: Some("Members".into()),
            feature_type: Some(FeatureType::Metered),
            consumable: Some(true),
            event_names: None,
            credit_schema: None,
            display: None,
            archived: None,
            extra: Default::default(),
        }];
        let features = stored
            .iter()
            .map(|feature| (feature.id.as_str(), feature))
            .collect::<BTreeMap<_, _>>();

        let item = json!({
            "feature_id": "members",
            "included": 3,
            "display": { "primary_text": "3 members" },
            "reset": { "interval": "month" }
        });

        let normalized = normalize_plan_feature(item, &features);
        assert_eq!(normalized.included, Some(3.0));
        assert_eq!(normalized.primary_text.as_deref(), Some("3 members"));
    }

    #[test]
    fn align_plan_features_preserves_basic_members() {
        let catalog = vec![
            PublicPricingFeature {
                id: "members".into(),
                name: Some("Members".into()),
                feature_type: Some("metered".into()),
                consumable: true,
                display_singular: Some("member".into()),
                display_plural: Some("members".into()),
            },
            PublicPricingFeature {
                id: "one_min_checks".into(),
                name: Some("1 min checks".into()),
                feature_type: Some("boolean".into()),
                consumable: false,
                display_singular: None,
                display_plural: None,
            },
        ];

        let mut plans = vec![PublicPricingPlan {
            id: "basic".into(),
            name: "Basic".into(),
            description: None,
            price: None,
            features: vec![PublicPlanFeature {
                feature_id: "members".into(),
                name: Some("Members".into()),
                feature_type: Some("metered".into()),
                included: Some(3.0),
                unlimited: false,
                reset_interval: Some("month".into()),
                primary_text: Some("3 members".into()),
                secondary_text: None,
                usage_price: None,
            }],
        }];

        align_plan_features(&mut plans, &catalog);

        let members = plans[0]
            .features
            .iter()
            .find(|feature| feature.feature_id == "members")
            .expect("members row");
        assert_eq!(members.included, Some(3.0));
        assert_eq!(members.primary_text.as_deref(), Some("3 members"));

        let one_min = plans[0]
            .features
            .iter()
            .find(|feature| feature.feature_id == "one_min_checks")
            .expect("one min row");
        assert_eq!(one_min.included, Some(0.0));
        assert_eq!(one_min.secondary_text.as_deref(), Some("upgrade required"));
    }

    #[test]
    fn pro_inherits_basic_features_for_display() {
        let catalog = vec![
            PublicPricingFeature {
                id: "members".into(),
                name: Some("Members".into()),
                feature_type: Some("metered".into()),
                consumable: true,
                display_singular: Some("member".into()),
                display_plural: Some("members".into()),
            },
            PublicPricingFeature {
                id: "five_min_checks".into(),
                name: Some("5 min checks".into()),
                feature_type: Some("boolean".into()),
                consumable: false,
                display_singular: None,
                display_plural: None,
            },
            PublicPricingFeature {
                id: "multi_region".into(),
                name: Some("Multi Region".into()),
                feature_type: Some("boolean".into()),
                consumable: false,
                display_singular: None,
                display_plural: None,
            },
            PublicPricingFeature {
                id: "one_min_checks".into(),
                name: Some("1 min checks".into()),
                feature_type: Some("boolean".into()),
                consumable: false,
                display_singular: None,
                display_plural: None,
            },
        ];

        let mut plans = vec![
            PublicPricingPlan {
                id: "basic".into(),
                name: "Basic".into(),
                description: None,
                price: None,
                features: vec![
                    supported_metered("members", 3.0, "3 members"),
                    supported_boolean("five_min_checks", "5 min checks"),
                    supported_boolean("multi_region", "Multi Region"),
                ],
            },
            PublicPricingPlan {
                id: "pro".into(),
                name: "Pro".into(),
                description: None,
                price: None,
                features: vec![supported_boolean("one_min_checks", "1 min checks")],
            },
        ];

        align_plan_features(&mut plans, &catalog);
        stack_lower_tier_features(&mut plans);

        assert_eq!(plans[1].features.len(), catalog.len());

        let members = plans[1]
            .features
            .iter()
            .find(|feature| feature.feature_id == "members")
            .expect("members row");
        assert!(feature_supported(members));
        assert_eq!(members.primary_text.as_deref(), Some("3 members"));

        let five_min = plans[1]
            .features
            .iter()
            .find(|feature| feature.feature_id == "five_min_checks")
            .expect("five min row");
        assert!(feature_supported(five_min));

        let one_min = plans[1]
            .features
            .iter()
            .find(|feature| feature.feature_id == "one_min_checks")
            .expect("one min row");
        assert!(feature_supported(one_min));
    }

    #[test]
    fn free_plan_fallback_uses_activation_limits() {
        let stored = [
            metered_feature("events"),
            metered_feature("monitors"),
            metered_feature("members"),
        ];
        let features = stored
            .iter()
            .map(|feature| (feature.id.as_str(), feature))
            .collect::<BTreeMap<_, _>>();

        let plan = free_plan(&features);

        let events = plan
            .features
            .iter()
            .find(|feature| feature.feature_id == "events")
            .expect("events row");
        assert_eq!(events.included, Some(10_000.0));
        assert_eq!(events.primary_text.as_deref(), Some("10,000 events"));

        let monitors = plan
            .features
            .iter()
            .find(|feature| feature.feature_id == "monitors")
            .expect("monitors row");
        assert_eq!(monitors.included, Some(3.0));
        assert_eq!(monitors.primary_text.as_deref(), Some("3 monitors"));
    }

    #[test]
    fn known_plan_ids_are_ordered_for_pricing_display() {
        assert!(plan_order("free") < plan_order("basic"));
        assert!(plan_order("basic") < plan_order("pro"));
        assert!(plan_order("pro") < plan_order("enterprise"));
    }

    fn supported_metered(feature_id: &str, included: f64, primary_text: &str) -> PublicPlanFeature {
        PublicPlanFeature {
            feature_id: feature_id.into(),
            name: Some(feature_id.into()),
            feature_type: Some("metered".into()),
            included: Some(included),
            unlimited: false,
            reset_interval: Some("month".into()),
            primary_text: Some(primary_text.into()),
            secondary_text: None,
            usage_price: None,
        }
    }

    fn supported_boolean(feature_id: &str, primary_text: &str) -> PublicPlanFeature {
        PublicPlanFeature {
            feature_id: feature_id.into(),
            name: Some(feature_id.into()),
            feature_type: Some("boolean".into()),
            included: Some(1.0),
            unlimited: false,
            reset_interval: None,
            primary_text: Some(primary_text.into()),
            secondary_text: None,
            usage_price: None,
        }
    }

    fn metered_feature(id: &str) -> autumn::Feature {
        autumn::Feature {
            id: id.into(),
            name: Some(id.into()),
            feature_type: Some(FeatureType::Metered),
            consumable: Some(true),
            event_names: None,
            credit_schema: None,
            display: None,
            archived: None,
            extra: Default::default(),
        }
    }

    #[test]
    fn included_field_accepts_booleans_and_numbers() {
        assert_eq!(included_field(&json!({ "included": 15 })), Some(15.0));
        assert_eq!(included_field(&json!({ "included": true })), Some(1.0));
        assert_eq!(included_field(&json!({ "included": false })), Some(0.0));
    }
}
