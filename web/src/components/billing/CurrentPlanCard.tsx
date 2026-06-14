import { Button } from "../Button";
import {
  formatPlanPrice,
  minimumIntervalLabel,
  summaryPlanItemText,
  type BillingPlanSummary,
  type BillingSummary,
} from "../../lib/billing";

export function CurrentPlanCard({
  planId,
  billing,
  plan,
  isOwner,
  actionPending,
  onCancel,
  onRenew,
  onCancelDowngrade,
}: {
  planId: string | null;
  billing: BillingSummary;
  plan?: BillingPlanSummary;
  isOwner: boolean;
  actionPending: boolean;
  onCancel: () => void;
  onRenew: () => void;
  onCancelDowngrade: () => void;
}) {
  const label = plan?.name ?? billing.current_plan_name ?? planId ?? "Free";
  const status = billing.subscription_status ?? (planId === "free" ? "included" : "active");
  const isPaidPlan = Boolean(planId && planId !== "free" && billing.stripe_customer_id);
  const hasScheduledCancellation = Boolean(billing.subscription_canceled_at);
  const hasScheduledChange = Boolean(billing.scheduled_plan_id);
  const statusOk = ["active", "trialing", "included"].includes(status);

  const meta = [
    formatPlanPrice(plan?.price),
    `${minimumIntervalLabel(plan)} checks`,
    summaryPlanItemText(plan, "custom_domain") !== "Not included" ? "Custom domain" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const notice = hasScheduledCancellation
    ? "Cancels at period end"
    : hasScheduledChange && billing.scheduled_plan_name
      ? `Downgrades to ${billing.scheduled_plan_name}`
      : null;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3.5 shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
            Current plan
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-[18px] font-medium tracking-tight text-[var(--color-fg)]">
              {label}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
              style={{
                color: statusOk ? "var(--color-accent)" : "var(--color-warn)",
                background: `color-mix(in srgb, ${statusOk ? "var(--color-accent)" : "var(--color-warn)"} 11%, transparent)`,
              }}
            >
              {status}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-[var(--color-fg-muted)]">{meta}</p>
          {notice && (
            <p className="mt-1 text-[11px] text-[var(--color-warn)]">{notice}</p>
          )}
        </div>

        {isOwner && (hasScheduledChange || isPaidPlan) && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {hasScheduledChange && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={actionPending}
                onClick={onCancelDowngrade}
              >
                Cancel downgrade
              </Button>
            )}
            {isPaidPlan && hasScheduledCancellation && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={actionPending}
                onClick={onRenew}
              >
                Renew
              </Button>
            )}
            {isPaidPlan && !hasScheduledCancellation && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={actionPending}
                onClick={onCancel}
                className="text-[var(--color-err)] hover:text-[var(--color-err)]"
              >
                Cancel plan
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
