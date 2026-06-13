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
  return summaryPlanItem(plan, featureId) !== undefined;
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
    return `Switching from ${currentName} to ${nextName} may charge your active subscription immediately, including any prorated amount from Stripe.`;
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
