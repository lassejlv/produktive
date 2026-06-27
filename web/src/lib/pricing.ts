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

/** Pure-overage cloud resource meters, in display order. */
export const DEPLOY_FEATURE_IDS = [
  "deploy_memory",
  "deploy_cpu",
  "deploy_volume",
  "object_storage",
] as const;

export interface DeployPricingRow {
  featureId: string;
  name: string;
  /** Metered rate, e.g. `$10.01 per GB-month`. */
  rateText: string;
  /** Monthly dollar rate per allocated unit (GB or vCPU). */
  unitAmount: number;
}

/** Per-unit labels for the public pricing calculator inputs. */
export const DEPLOY_METER_UNITS: Record<(typeof DEPLOY_FEATURE_IDS)[number], string> = {
  deploy_memory: "GB",
  deploy_cpu: "vCPU",
  deploy_volume: "GB",
  object_storage: "GB",
};

/** Matches `SANDBOX_USAGE_MULTIPLIER` in `crates/api/src/billing/deploy_usage.rs`. */
export const SANDBOX_USAGE_MULTIPLIER = 1.3;

/** Deploy meters that sandboxes bill through, at a premium multiplier. */
export const SANDBOX_METER_IDS = ["deploy_memory", "deploy_cpu", "deploy_volume"] as const;

export interface CloudUsageCalculatorDefaults {
  memoryGb: number;
  cpuVcpu: number;
  volumeGb: number;
  objectStorageGb: number;
  sandboxMemoryGb: number;
  sandboxCpuVcpu: number;
  sandboxVolumeGb: number;
}

/** Sensible starting values for the public cloud usage calculator. */
export const CLOUD_USAGE_CALCULATOR_DEFAULTS: CloudUsageCalculatorDefaults = {
  memoryGb: 1,
  cpuVcpu: 0.5,
  volumeGb: 1,
  objectStorageGb: 10,
  sandboxMemoryGb: 0.5,
  sandboxCpuVcpu: 0.25,
  sandboxVolumeGb: 1,
};

export type CloudUsageSection = "deployment" | "sandbox";

export interface CloudUsageEstimateLine {
  section: CloudUsageSection;
  featureId: (typeof DEPLOY_FEATURE_IDS)[number];
  label: string;
  quantity: number;
  unit: string;
  rateText: string;
  unitAmount: number;
  cost: number;
}

export interface CloudUsageEstimateSection {
  title: string;
  note?: string;
  lines: CloudUsageEstimateLine[];
  total: number;
}

export interface CloudUsageEstimate {
  deployment: CloudUsageEstimateSection;
  sandbox: CloudUsageEstimateSection;
  total: number;
}

function deployMeterFeaturesById(plans: PublicPricingPlan[]): Map<string, PublicPlanFeature> {
  const byFeature = new Map<string, PublicPlanFeature>();

  for (const plan of plans) {
    for (const feature of plan.features) {
      if (!(DEPLOY_FEATURE_IDS as readonly string[]).includes(feature.feature_id)) continue;
      if (byFeature.has(feature.feature_id)) continue;
      // Only real metered rates carry a usage price; the self-hosted fallback
      // marks them "Unlimited" with no price, which we skip.
      if (feature.usage_price?.amount == null) continue;
      byFeature.set(feature.feature_id, feature);
    }
  }

  return byFeature;
}

/**
 * Cloud resource meters are usage-based and identical across paid plans, so
 * they render as one shared "pay as you go" panel rather than per-plan bullets.
 * Pulls the rate from the first plan that prices each meter.
 */
export function deployPricingRows(
  plans: PublicPricingPlan[],
  catalog: PublicPricingFeature[],
): DeployPricingRow[] {
  const nameById = new Map(catalog.map((f) => [f.id, f.name ?? f.id]));
  const byFeature = deployMeterFeaturesById(plans);

  return DEPLOY_FEATURE_IDS.flatMap((id) => {
    const feature = byFeature.get(id);
    if (!feature) return [];
    const unitAmount = feature.usage_price?.unit_amount;
    if (unitAmount == null) return [];
    return [
      {
        featureId: id,
        name: nameById.get(id) ?? feature.name ?? id,
        rateText: (feature.primary_text ?? "").replace(/^then\s+/i, ""),
        unitAmount,
      },
    ];
  });
}

/** Estimate monthly cloud usage from allocated resources and public meter rates. */
export function estimateCloudUsageCost(
  rows: DeployPricingRow[],
  input: CloudUsageCalculatorDefaults,
): CloudUsageEstimate | null {
  if (rows.length === 0) return null;

  const rowByFeature = new Map(rows.map((row) => [row.featureId, row]));

  const deploymentQuantities: Record<(typeof DEPLOY_FEATURE_IDS)[number], number> = {
    deploy_memory: input.memoryGb,
    deploy_cpu: input.cpuVcpu,
    deploy_volume: input.volumeGb,
    object_storage: input.objectStorageGb,
  };

  const sandboxQuantities: Record<(typeof SANDBOX_METER_IDS)[number], number> = {
    deploy_memory: input.sandboxMemoryGb,
    deploy_cpu: input.sandboxCpuVcpu,
    deploy_volume: input.sandboxVolumeGb,
  };

  const deploymentLines = DEPLOY_FEATURE_IDS.flatMap((featureId) => {
    const row = rowByFeature.get(featureId);
    if (!row) return [];
    const quantity = Math.max(0, deploymentQuantities[featureId] ?? 0);
    return [buildEstimateLine("deployment", featureId, row, quantity, row.unitAmount)];
  });

  const sandboxLines = SANDBOX_METER_IDS.flatMap((featureId) => {
    const row = rowByFeature.get(featureId);
    if (!row) return [];
    const quantity = Math.max(0, sandboxQuantities[featureId] ?? 0);
    const unitAmount = row.unitAmount * SANDBOX_USAGE_MULTIPLIER;
    return [
      buildEstimateLine(
        "sandbox",
        featureId,
        row,
        quantity,
        unitAmount,
        sandboxRateText(featureId, row.unitAmount),
        sandboxLineLabel(featureId),
      ),
    ];
  });

  const deploymentTotal = deploymentLines.reduce((sum, line) => sum + line.cost, 0);
  const sandboxTotal = sandboxLines.reduce((sum, line) => sum + line.cost, 0);

  return {
    deployment: {
      title: "Deployments",
      lines: deploymentLines,
      total: deploymentTotal,
    },
    sandbox: {
      title: "Sandboxes",
      note: "Billed at 30% above deployment rates for memory, CPU, and disk.",
      lines: sandboxLines,
      total: sandboxTotal,
    },
    total: deploymentTotal + sandboxTotal,
  };
}

function buildEstimateLine(
  section: CloudUsageSection,
  featureId: (typeof DEPLOY_FEATURE_IDS)[number],
  row: DeployPricingRow,
  quantity: number,
  unitAmount: number,
  rateText = row.rateText,
  label = row.name,
): CloudUsageEstimateLine {
  return {
    section,
    featureId,
    label,
    quantity,
    unit: DEPLOY_METER_UNITS[featureId],
    rateText,
    unitAmount,
    cost: quantity * unitAmount,
  };
}

function sandboxLineLabel(featureId: (typeof SANDBOX_METER_IDS)[number]): string {
  switch (featureId) {
    case "deploy_memory":
      return "Sandbox memory";
    case "deploy_cpu":
      return "Sandbox CPU";
    case "deploy_volume":
      return "Sandbox disk";
  }
}

export function sandboxRateText(
  featureId: (typeof SANDBOX_METER_IDS)[number],
  baseUnitAmount: number,
): string {
  return `${formatResourceRateText(featureId, baseUnitAmount * SANDBOX_USAGE_MULTIPLIER)} · 30% premium`;
}

function formatResourceRateText(
  featureId: (typeof SANDBOX_METER_IDS)[number],
  unitAmount: number,
): string {
  const amount = formatRateAmount(unitAmount);
  if (featureId === "deploy_cpu") {
    return `$${amount} per vCPU-month`;
  }
  return `$${amount} per GB-month`;
}

function formatRateAmount(value: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}
