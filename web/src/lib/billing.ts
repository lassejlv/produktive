import { toast } from "sonner";
import { ApiError } from "./api";

export interface BillingPlanPriceSummary {
  amount?: number | null;
  interval?: string | null;
  primary_text?: string | null;
  secondary_text?: string | null;
}

export interface BillingPlanItemSummary {
  feature_id: string;
  included?: number | null;
  unlimited: boolean;
  primary_text?: string | null;
  secondary_text?: string | null;
}

export interface BillingPlanSummary {
  id: string;
  name: string;
  description?: string | null;
  price?: BillingPlanPriceSummary | null;
  current: boolean;
  items: BillingPlanItemSummary[];
}

export interface BillingBalanceSummary {
  feature_id: string;
  granted?: number | null;
  remaining?: number | null;
  usage?: number | null;
  unlimited: boolean;
  next_reset_at?: number | null;
}

export interface BillingSummary {
  billing_enabled: boolean;
  customer_id: string;
  current_plan_id?: string | null;
  current_plan_name?: string | null;
  subscription_status?: string | null;
  subscription_canceled_at?: number | null;
  subscription_current_period_end?: number | null;
  scheduled_plan_id?: string | null;
  scheduled_plan_name?: string | null;
  stripe_customer_id?: string | null;
  portal_available: boolean;
  plans: BillingPlanSummary[];
  balances: Record<string, BillingBalanceSummary | null>;
}

export interface BillingCheckoutResponse {
  payment_url?: string;
  url?: string;
  required_action?: { code?: string; reason?: string };
}

export interface BillingPortalResponse {
  url: string;
}

export interface BillingSetupPaymentResponse {
  url: string;
  payment_url?: string;
}

export type PlanChangeKind = "upgrade" | "downgrade" | "change";
export type BillingAction = "cancel" | "renew" | "cancel-downgrade";

export function isPaymentRequired(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 402;
}

export function showPlanLimitToast(message: string, wid: string) {
  toast.error(message, {
    action: {
      label: "Upgrade",
      onClick: () => {
        window.location.assign(`/${wid}/settings/billing`);
      },
    },
  });
}

export function handleMutationError(err: unknown, wid: string) {
  if (isPaymentRequired(err)) {
    showPlanLimitToast(err.message, wid);
    return;
  }
  toast.error(err instanceof Error ? err.message : "Something went wrong");
}

export function redirectCheckout(res: BillingCheckoutResponse) {
  const target = res.payment_url ?? res.url;
  if (target) window.location.assign(target);
}

export function redirectBillingUrl(res: { payment_url?: string; url?: string }) {
  const target = res.payment_url ?? res.url;
  if (target) window.location.assign(target);
}

export function summaryPlanItem(plan: BillingPlanSummary | undefined, featureId: string) {
  return plan?.items?.find((item) => item.feature_id === featureId);
}

export function summaryPlanItemText(
  plan: BillingPlanSummary | undefined,
  featureId: string,
): string {
  const item = summaryPlanItem(plan, featureId);
  if (!item) return "Not included";
  if (item.primary_text) return item.primary_text;
  if (item.unlimited) return "Unlimited";
  if (item.included != null && item.included > 0) return String(item.included);
  return "Included";
}

export function planIncludesFeature(
  plan: BillingPlanSummary | undefined,
  featureId: string,
): boolean {
  const item = summaryPlanItem(plan, featureId);
  if (!item) return false;
  if (item.unlimited) return true;
  if (item.included != null && item.included > 0) return true;
  const secondary = item.secondary_text?.toLowerCase() ?? "";
  return !secondary.includes("upgrade");
}

export function formatPlanPrice(price: BillingPlanPriceSummary | null | undefined): string {
  if (!price) return "Free";
  if (price.primary_text) return price.primary_text;
  if (price.amount == null) return "Free";
  const amount = Number.isInteger(price.amount) ? price.amount : price.amount.toFixed(2);
  return `$${amount}`;
}

export function planPriceAmount(plan: BillingPlanSummary): number {
  return plan.price?.amount ?? 0;
}

export function planChangeKind(
  currentPlan: BillingPlanSummary,
  nextPlan: BillingPlanSummary,
): PlanChangeKind {
  const currentPrice = planPriceAmount(currentPlan);
  const nextPrice = planPriceAmount(nextPlan);
  if (nextPrice > currentPrice) return "upgrade";
  if (nextPrice < currentPrice) return "downgrade";
  return "change";
}

export function planActionLabel(
  currentPlan: BillingPlanSummary,
  nextPlan: BillingPlanSummary,
): string {
  const kind = planChangeKind(currentPlan, nextPlan);
  if (kind === "upgrade") return "Upgrade";
  if (kind === "downgrade") return "Downgrade";
  return "Change plan";
}

export function hasActivePaidSubscription(billing: BillingSummary): boolean {
  return (
    billing.current_plan_id !== "free" &&
    ["active", "trialing", "past_due"].includes(billing.subscription_status ?? "") &&
    Boolean(billing.stripe_customer_id)
  );
}

export function planChangeDescription(
  kind: PlanChangeKind,
  currentName: string,
  nextName: string,
  activePaid: boolean,
): string {
  if (kind === "downgrade") {
    return `Switching from ${currentName} to ${nextName} will take effect at the end of the current billing month. Your current plan stays active until then.`;
  }
  if (activePaid) {
    return `Switching from ${currentName} to ${nextName} may charge your active subscription immediately, including any prorated amount.`;
  }
  return `Switching to ${nextName} will open checkout if payment is required before the plan is activated.`;
}

export function minimumIntervalLabel(plan: BillingPlanSummary | undefined): string {
  if (planIncludesFeature(plan, "one_min_checks")) return "1 minute";
  if (planIncludesFeature(plan, "five_min_checks")) return "5 minutes";
  return "15 minutes";
}

export interface UsageNumbers {
  primaryText: string;
  remainingText: string;
  percent: number | null;
}

export function usageNumbers(balance: BillingBalanceSummary | null | undefined): UsageNumbers {
  if (!balance) {
    return {
      primaryText: "—",
      remainingText: "No usage data",
      percent: null,
    };
  }
  if (balance.unlimited) {
    return {
      primaryText: "Unlimited",
      remainingText: "No plan limit",
      percent: 100,
    };
  }

  const used = balance.usage ?? null;
  const granted = balance.granted ?? null;
  const remaining = balance.remaining ?? null;
  const percent = used != null && granted != null && granted > 0 ? (used / granted) * 100 : null;

  return {
    primaryText:
      used != null && granted != null
        ? `${formatUsageNumber(used)} / ${formatUsageNumber(granted)}`
        : remaining != null && granted != null
          ? `${formatUsageNumber(Math.max(0, granted - remaining))} / ${formatUsageNumber(granted)}`
          : "—",
    remainingText:
      remaining != null
        ? `${formatUsageNumber(Math.max(0, remaining))} remaining`
        : "Usage available after first report",
    percent,
  };
}

export function nextResetText(balance: BillingBalanceSummary | null | undefined): string {
  const raw = balance?.next_reset_at;
  if (!raw) return "Current period";
  const date = new Date(raw > 10_000_000_000 ? raw : raw * 1000);
  if (Number.isNaN(date.getTime())) return "Current period";
  return `Resets ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

export function formatUsageNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}

/** Matches backend `EVENT_UNITS_PER_CHECK` in `crates/api/src/billing/usage.rs`. */
export const EVENT_UNITS_PER_CHECK = 2;

const SECONDS_PER_MONTH = 86400 * 30;

export function estimateMonthlyChecks(intervalSeconds: number, regionCount: number): number {
  if (intervalSeconds <= 0 || regionCount <= 0) return 0;
  return Math.floor(SECONDS_PER_MONTH / intervalSeconds) * regionCount;
}

export function estimateMonthlyEventUnits(checks: number): number {
  return checks * EVENT_UNITS_PER_CHECK;
}

export type UsageLimitStatus = "ok" | "warning" | "blocked";

export interface MeterCostLine {
  label: string;
  currentText: string;
  projectedText: string;
  deltaText: string | null;
  limitText: string | null;
  usagePercent: number | null;
  status: UsageLimitStatus;
  note: string | null;
}

export interface MonitorCreateCostEstimate {
  billingEnabled: boolean;
  planName: string | null;
  intervalSeconds: number | null;
  regionCount: number;
  monitors: MeterCostLine;
  events: MeterCostLine;
  multiRegionBlocked: boolean;
}

function usageStatus(used: number, limit: number | null, unlimited: boolean): UsageLimitStatus {
  if (unlimited || limit == null || limit <= 0) return "ok";
  const projected = used;
  if (projected > limit) return "blocked";
  if (projected / limit >= 0.85) return "warning";
  return "ok";
}

function formatMeterValue(value: number | null | undefined, unlimited: boolean): string {
  if (unlimited) return "Unlimited";
  if (value == null) return "—";
  return formatUsageNumber(value);
}

export function buildMonitorCreateCostEstimate(input: {
  billing: BillingSummary | undefined;
  currentPlan: BillingPlanSummary | undefined;
  intervalSeconds: number | null;
  regionCount: number;
}): MonitorCreateCostEstimate {
  const { billing, currentPlan, intervalSeconds, regionCount } = input;
  const billingEnabled = billing?.billing_enabled ?? false;
  const planName = billing?.current_plan_name ?? currentPlan?.name ?? null;

  const monitorsBalance = billing?.balances.monitors;
  const eventsBalance = billing?.balances.events;
  const monitorsItem = summaryPlanItem(currentPlan, "monitors");
  const eventsItem = summaryPlanItem(currentPlan, "events");

  const monitorsUnlimited = Boolean(monitorsBalance?.unlimited || monitorsItem?.unlimited);
  const eventsUnlimited = Boolean(eventsBalance?.unlimited || eventsItem?.unlimited);

  const currentMonitors = monitorsBalance?.usage ?? null;
  const projectedMonitors = (currentMonitors ?? 0) + 1;
  const monitorLimit = monitorsBalance?.granted ?? monitorsItem?.included ?? null;

  const monthlyChecks =
    intervalSeconds != null ? estimateMonthlyChecks(intervalSeconds, regionCount) : 0;
  const monthlyEventUnits = estimateMonthlyEventUnits(monthlyChecks);
  const currentEvents = eventsBalance?.usage ?? null;
  const eventLimit = eventsBalance?.granted ?? eventsItem?.included ?? null;

  const monitorOverLimit =
    !monitorsUnlimited && monitorLimit != null && projectedMonitors > monitorLimit;
  const monitorStatus: UsageLimitStatus = monitorOverLimit
    ? monitorsItem?.secondary_text
      ? "warning"
      : "blocked"
    : usageStatus(projectedMonitors, monitorLimit, monitorsUnlimited);

  const eventsMayExceed =
    currentEvents != null &&
    eventLimit != null &&
    !eventsUnlimited &&
    intervalSeconds != null &&
    currentEvents + monthlyEventUnits > eventLimit;

  const eventStatus: UsageLimitStatus = !intervalSeconds
    ? "ok"
    : eventsMayExceed
      ? eventsItem?.secondary_text
        ? "warning"
        : "blocked"
      : currentEvents != null && eventLimit != null && !eventsUnlimited
        ? usageStatus(currentEvents + monthlyEventUnits, eventLimit, eventsUnlimited)
        : "ok";

  const multiRegionBlocked =
    billingEnabled &&
    regionCount > 1 &&
    !planIncludesFeature(currentPlan, "multi_region");

  let monitorNote: string | null = null;
  if (!billingEnabled) {
    monitorNote = "Billing is not configured on this server.";
  } else if (monitorOverLimit && monitorsItem?.secondary_text) {
    monitorNote = monitorsItem.secondary_text;
  } else if (monitorStatus === "blocked") {
    monitorNote = "You are at the monitor limit for this plan.";
  }

  let eventsNote: string | null = null;
  if (intervalSeconds == null) {
    eventsNote = "Set a check interval to estimate event usage.";
  } else if (!billingEnabled) {
    eventsNote = "Event metering is disabled in self-hosted mode.";
  } else {
    eventsNote = `${formatUsageNumber(monthlyChecks)} checks/month × ${EVENT_UNITS_PER_CHECK} event units per check. ${nextResetText(eventsBalance)}.`;
    if (eventStatus === "blocked" && eventsItem?.secondary_text) {
      eventsNote = `${eventsNote} ${eventsItem.secondary_text}`;
    }
  }

  return {
    billingEnabled,
    planName,
    intervalSeconds,
    regionCount,
    multiRegionBlocked,
    monitors: {
      label: "Monitors",
      currentText: formatMeterValue(currentMonitors, monitorsUnlimited),
      projectedText: formatMeterValue(projectedMonitors, monitorsUnlimited),
      deltaText: monitorsUnlimited ? null : "+1 monitor",
      limitText:
        monitorsUnlimited || monitorLimit == null
          ? null
          : `${formatUsageNumber(monitorLimit)} included`,
      usagePercent:
        monitorsUnlimited || monitorLimit == null
          ? null
          : Math.min(100, (projectedMonitors / monitorLimit) * 100),
      status: monitorStatus,
      note: monitorNote,
    },
    events: {
      label: "Events (est.)",
      currentText: formatMeterValue(currentEvents, eventsUnlimited),
      projectedText:
        intervalSeconds != null
          ? `+${formatUsageNumber(monthlyEventUnits)}`
          : "—",
      deltaText: intervalSeconds != null ? "per month" : null,
      limitText:
        eventsUnlimited || eventLimit == null
          ? null
          : `${formatUsageNumber(eventLimit)} this period`,
      usagePercent:
        eventsUnlimited ||
        eventLimit == null ||
        currentEvents == null ||
        intervalSeconds == null
          ? null
          : Math.min(100, ((currentEvents + monthlyEventUnits) / eventLimit) * 100),
      status: eventStatus,
      note: eventsNote,
    },
  };
}

export function parseDslIntervalSeconds(source: string): number | null {
  const match = source.match(/set\s+schedule\.interval\s+(\d+)\s*s/i);
  if (!match) return null;
  const seconds = parseInt(match[1], 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}
