import { ExternalLink } from "lucide-react";
import { Button } from "../Button";
import { Spinner } from "../Spinner";
import { formatPlanPrice, type BillingPlanSummary, type BillingSummary } from "../../lib/billing";

export function CurrentPlanCard({
  planId,
  billing,
  plan,
  isOwner,
  portalPending,
  setupPaymentPending,
  actionPending,
  onPortal,
  onSetupPayment,
  onCancel,
  onRenew,
  onCancelDowngrade,
}: {
  planId: string | null;
  billing: BillingSummary;
  plan?: BillingPlanSummary;
  isOwner: boolean;
  portalPending: boolean;
  setupPaymentPending: boolean;
  actionPending: boolean;
  onPortal: () => void;
  onSetupPayment: () => void;
  onCancel: () => void;
  onRenew: () => void;
  onCancelDowngrade: () => void;
}) {
  const label = plan?.name ?? billing.current_plan_name ?? planId ?? "Free";
  const status = billing.subscription_status ?? (planId === "free" ? "included" : "active");
  const isPaidPlan = Boolean(planId && planId !== "free" && billing.stripe_customer_id);
  const hasScheduledCancellation = Boolean(billing.subscription_canceled_at);
  const hasScheduledChange = Boolean(billing.scheduled_plan_id);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)] mb-1">
            Current plan
          </div>
          <div className="text-[20px] font-medium text-[var(--color-fg)]">{label}</div>
          {plan?.description && (
            <p className="mt-2 text-[13px] text-[var(--color-fg-muted)] max-w-lg">
              {plan.description}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-fg-muted)]">
            <span className="rounded-full bg-[var(--color-bg-row)] px-2 py-1">
              {formatPlanPrice(plan?.price)}
            </span>
            <span className="rounded-full bg-[var(--color-bg-row)] px-2 py-1">{status}</span>
            {billing.stripe_customer_id && (
              <span className="rounded-full bg-[var(--color-bg-row)] px-2 py-1">
                Stripe connected
              </span>
            )}
          </div>
        </div>
        {isOwner && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {hasScheduledChange && (
              <Button
                type="button"
                variant="secondary"
                disabled={actionPending}
                onClick={onCancelDowngrade}
              >
                Cancel downgrade
              </Button>
            )}
            {isPaidPlan && hasScheduledCancellation && (
              <Button type="button" variant="primary" disabled={actionPending} onClick={onRenew}>
                Renew
              </Button>
            )}
            {isPaidPlan && !hasScheduledCancellation && (
              <Button type="button" variant="danger" disabled={actionPending} onClick={onCancel}>
                Cancel plan
              </Button>
            )}
            {billing.portal_available && (
              <Button type="button" variant="secondary" disabled={portalPending} onClick={onPortal}>
                {portalPending && <Spinner size={12} thickness={2} />}
                <ExternalLink size={13} />
                Manage in Stripe
              </Button>
            )}
            {!billing.portal_available && (
              <Button
                type="button"
                variant="secondary"
                disabled={setupPaymentPending}
                onClick={onSetupPayment}
              >
                {setupPaymentPending && <Spinner size={12} thickness={2} />}
                <ExternalLink size={13} />
                Set up payment
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
