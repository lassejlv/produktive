export interface PublicPlanPrice {
  amount?: number | null;
  interval?: string | null;
  primary_text?: string | null;
  secondary_text?: string | null;
}

export interface PublicUsagePrice {
  amount?: number | null;
  billing_units?: number | null;
  interval?: string | null;
  billing_method?: string | null;
  max_purchase?: number | null;
  unit_amount?: number | null;
}

export interface PublicPlanFeature {
  feature_id: string;
  name?: string | null;
  feature_type?: string | null;
  included?: number | null;
  unlimited: boolean;
  reset_interval?: string | null;
  primary_text?: string | null;
  secondary_text?: string | null;
  usage_price?: PublicUsagePrice | null;
}

export interface PublicPricingPlan {
  id: string;
  name: string;
  description?: string | null;
  price?: PublicPlanPrice | null;
  features: PublicPlanFeature[];
}

export interface PublicPricingFeature {
  id: string;
  name?: string | null;
  feature_type?: string | null;
  consumable: boolean;
  display_singular?: string | null;
  display_plural?: string | null;
}

export interface PublicPricingResponse {
  billing_enabled: boolean;
  plans: PublicPricingPlan[];
  features: PublicPricingFeature[];
  generated_at: string;
}

export function formatPlanPrice(price: PublicPlanPrice | null | undefined): string | null {
  if (!price) return null;
  if (price.primary_text) return price.primary_text;
  if (price.amount == null) return null;
  const interval = price.interval ? ` / ${price.interval}` : "";
  return `$${price.amount}${interval}`;
}

export function featureLabel(feature: PublicPlanFeature): string {
  if (feature.primary_text) return feature.primary_text;
  if (feature.unlimited) return feature.name ?? feature.feature_id;
  if (feature.included != null && feature.included > 0) {
    const name = feature.name ?? feature.feature_id;
    return `${Math.round(feature.included)} ${name}`;
  }
  return feature.name ?? feature.feature_id;
}

export function isFeatureSupported(
  planFeature: PublicPlanFeature | undefined,
  catalogFeature?: PublicPricingFeature,
): boolean {
  if (!planFeature) return false;
  if (planFeature.unlimited) return true;
  if (planFeature.included != null && planFeature.included > 0) return true;

  const isBoolean =
    planFeature.feature_type === "boolean" || catalogFeature?.feature_type === "boolean";

  if (isBoolean) {
    const secondary = planFeature.secondary_text?.toLowerCase() ?? "";
    return !secondary.includes("upgrade");
  }

  return false;
}

export interface PlanFeatureRow {
  featureId: string;
  planFeature: PublicPlanFeature;
  catalogFeature?: PublicPricingFeature;
  supported: boolean;
  label: string;
}

export function buildPlanFeatureRows(
  plan: PublicPricingPlan,
  catalog: PublicPricingFeature[],
): PlanFeatureRow[] {
  const catalogById = new Map(catalog.map((feature) => [feature.id, feature]));

  return plan.features.map((planFeature) => {
    const catalogFeature = catalogById.get(planFeature.feature_id);
    const supported = isFeatureSupported(planFeature, catalogFeature);

    return {
      featureId: planFeature.feature_id,
      planFeature,
      catalogFeature,
      supported,
      label: rowLabel(planFeature, catalogFeature, supported),
    };
  });
}

function rowLabel(
  planFeature: PublicPlanFeature,
  catalogFeature: PublicPricingFeature | undefined,
  supported: boolean,
): string {
  if (supported) return featureLabel(planFeature);
  return catalogFeature?.name ?? planFeature.name ?? planFeature.feature_id;
}

/** First paid tier, else middle plan when 3+ tiers exist. */
export function resolveFeaturedPlanIndex(plans: PublicPricingPlan[]): number {
  if (plans.length === 0) return -1;
  const paid = plans.findIndex((p) => (p.price?.amount ?? 0) > 0);
  if (paid >= 0) return paid;
  if (plans.length >= 3) return 1;
  return -1;
}

const HEADLINE_FEATURE_ORDER = [
  "monitors",
  "events",
  "one_min_checks",
  "five_min_checks",
  "custom_domain",
  "multi_region",
  "remove_branding",
  "priority_support",
] as const;

/** Short bullet list for compact plan cards. */
export function planHeadlineBullets(
  plan: PublicPricingPlan,
  catalog: PublicPricingFeature[],
  max = 4,
): PlanFeatureRow[] {
  const rows = buildPlanFeatureRows(plan, catalog);
  const byId = new Map(rows.map((r) => [r.featureId, r]));
  const picked: PlanFeatureRow[] = [];

  for (const id of HEADLINE_FEATURE_ORDER) {
    const row = byId.get(id);
    if (row?.supported) picked.push(row);
    if (picked.length >= max) break;
  }

  if (picked.length < max) {
    for (const row of rows) {
      if (picked.some((p) => p.featureId === row.featureId)) continue;
      if (!row.supported) continue;
      picked.push(row);
      if (picked.length >= max) break;
    }
  }

  return picked;
}

export interface ComparisonCell {
  supported: boolean;
  text: string;
}

export interface ComparisonRow {
  featureId: string;
  label: string;
  cells: ComparisonCell[];
}

export function buildComparisonMatrix(
  plans: PublicPricingPlan[],
  catalog: PublicPricingFeature[],
): ComparisonRow[] {
  return catalog.map((catalogFeature) => {
    const cells = plans.map((plan) => {
      const row = buildPlanFeatureRows(plan, catalog).find(
        (r) => r.featureId === catalogFeature.id,
      );
      if (!row) return { supported: false, text: "—" };
      if (!row.supported) return { supported: false, text: "—" };
      return {
        supported: true,
        text: cellText(row),
      };
    });
    return {
      featureId: catalogFeature.id,
      label: catalogFeature.name ?? catalogFeature.id,
      cells,
    };
  });
}

function cellText(row: PlanFeatureRow): string {
  if (row.planFeature.unlimited) return "Unlimited";
  if (row.planFeature.primary_text) return row.planFeature.primary_text;
  return row.label;
}

export function isFreePlan(plan: PublicPricingPlan): boolean {
  return plan.id === "free" || (plan.price?.amount ?? 0) === 0;
}
