import { createFileRoute, useSearch } from "@tanstack/react-router";
import { Check, CreditCard, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../components/Button";
import { Dialog, DialogClose, DialogContent } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { Spinner } from "../components/Spinner";
import {
  formatPlanPrice,
  planIncludesFeature,
  redirectCheckout,
  summaryPlanItemText,
  type BillingBalanceSummary,
  type BillingPlanSummary,
  type BillingSummary,
} from "../lib/billing";
import { ApiError } from "../lib/api";
import {
  useBillingAttach,
  useBillingCancel,
  useBillingCancelDowngrade,
  useBillingPortal,
  useBillingRenew,
  useBillingSummary,
  useWorkspaces,
} from "../lib/queries";

export const Route = createFileRoute("/_authed/$wid/settings/billing")({
  staticData: {
    title: "Settings",
    description: "Plan, invoices and payment methods.",
  },
  validateSearch: (search: Record<string, unknown>) => ({
    checkout: typeof search.checkout === "string" ? search.checkout : undefined,
  }),
  component: BillingPage,
});

function BillingPage() {
  const { wid } = Route.useParams();
  const { checkout } = useSearch({ from: "/_authed/$wid/settings/billing" });
  const workspaces = useWorkspaces();
  const current = workspaces.data?.find((w) => w.id === wid || w.slug === wid);
  const isOwner = current?.role === "owner";
  const [selectedPlan, setSelectedPlan] = useState<BillingPlanSummary | null>(null);
  const [billingAction, setBillingAction] = useState<BillingAction | null>(null);

  const summary = useBillingSummary(wid);
  const attach = useBillingAttach(wid);
  const cancelSubscription = useBillingCancel(wid);
  const renewSubscription = useBillingRenew(wid);
  const cancelDowngrade = useBillingCancelDowngrade(wid);
  const portal = useBillingPortal(wid);

  useEffect(() => {
    if (checkout === "success") {
      toast.success("Checkout completed — your plan may take a moment to update.");
    }
  }, [checkout]);

  const billingUnavailable = summary.error instanceof ApiError && summary.error.status === 503;

  if (billingUnavailable) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Billing unavailable"
        description="Billing is not configured on this server. Set POLAR_SECRET_KEY to enable plans and usage limits."
      />
    );
  }

  if (summary.isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-[12px] text-[var(--color-fg-muted)]">
        <Spinner size={16} /> <span className="ml-2">Loading billing…</span>
      </div>
    );
  }

  if (summary.isError) {
    const err = summary.error as Error;
    return (
      <EmptyState icon={CreditCard} title="Could not load billing" description={err.message} />
    );
  }

  const billing = summary.data!;
  const currentPlanId = billing.current_plan_id ?? null;
  const planList = billing.plans;
  const currentPlan =
    planList.find((p) => p.current) ?? planList.find((p) => p.id === currentPlanId);
  const selectedPlanChange =
    selectedPlan && currentPlan ? planChangeKind(currentPlan, selectedPlan) : "change";

  return (
    <>
      <div className="flex flex-col gap-7">
        <CurrentPlanCard
          planId={currentPlanId}
          billing={billing}
          plan={currentPlan}
          isOwner={isOwner}
          portalPending={portal.isPending}
          actionPending={
            cancelSubscription.isPending || renewSubscription.isPending || cancelDowngrade.isPending
          }
          onCancel={() => setBillingAction("cancel")}
          onRenew={() => setBillingAction("renew")}
          onCancelDowngrade={() => setBillingAction("cancel-downgrade")}
          onPortal={() => {
            portal.mutate(undefined, {
              onSuccess: (res) => {
                window.location.assign(res.url);
              },
              onError: (err) => toast.error((err as Error).message),
            });
          }}
        />

        <section>
          <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
            Plans
          </h3>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {planList.map((plan) => {
              const isCurrentPlan = plan.id === currentPlanId;
              return (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  current={isCurrentPlan}
                  isOwner={isOwner}
                  pending={attach.isPending && attach.variables === plan.id}
                  actionLabel={currentPlan ? planActionLabel(currentPlan, plan) : "Change plan"}
                  onSelect={() => setSelectedPlan(plan)}
                />
              );
            })}
          </div>
          {!isOwner && (
            <p className="mt-4 text-[12px] text-[var(--color-fg-muted)]">
              Contact the workspace owner to change plans or manage payment methods.
            </p>
          )}
        </section>
      </div>

      <PlanChangeDialog
        open={selectedPlan !== null}
        plan={selectedPlan}
        currentPlan={currentPlan}
        changeKind={selectedPlanChange}
        activePaidSubscription={hasActivePaidSubscription(billing)}
        pending={attach.isPending}
        onOpenChange={(open) => {
          if (!open && !attach.isPending) setSelectedPlan(null);
        }}
        onConfirm={() => {
          if (!selectedPlan) return;
          attach.mutate(selectedPlan.id, {
            onSuccess: (res) => {
              setSelectedPlan(null);
              if (res.payment_url || res.url) redirectCheckout(res);
              else toast.success("Plan updated");
            },
            onError: (err) => toast.error((err as Error).message),
          });
        }}
      />

      <BillingActionDialog
        action={billingAction}
        billing={billing}
        pending={
          cancelSubscription.isPending || renewSubscription.isPending || cancelDowngrade.isPending
        }
        onOpenChange={(open) => {
          if (
            !open &&
            !cancelSubscription.isPending &&
            !renewSubscription.isPending &&
            !cancelDowngrade.isPending
          ) {
            setBillingAction(null);
          }
        }}
        onConfirm={() => {
          if (billingAction === "cancel") {
            cancelSubscription.mutate(undefined, {
              onSuccess: () => {
                setBillingAction(null);
                toast.success("Subscription cancellation scheduled");
              },
              onError: (err) => toast.error((err as Error).message),
            });
          } else if (billingAction === "renew") {
            renewSubscription.mutate(undefined, {
              onSuccess: () => {
                setBillingAction(null);
                toast.success("Subscription renewed");
              },
              onError: (err) => toast.error((err as Error).message),
            });
          } else if (billingAction === "cancel-downgrade") {
            cancelDowngrade.mutate(undefined, {
              onSuccess: () => {
                setBillingAction(null);
                toast.success("Scheduled downgrade cancelled");
              },
              onError: (err) => toast.error((err as Error).message),
            });
          }
        }}
      />
    </>
  );
}

function CurrentPlanCard({
  planId,
  billing,
  plan,
  isOwner,
  portalPending,
  actionPending,
  onPortal,
  onCancel,
  onRenew,
  onCancelDowngrade,
}: {
  planId: string | null;
  billing: BillingSummary;
  plan?: BillingPlanSummary;
  isOwner: boolean;
  portalPending: boolean;
  actionPending: boolean;
  onPortal: () => void;
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

  const metaParts = [formatPlanPrice(plan?.price)];
  if (hasScheduledCancellation) metaParts.push("cancels at period end");
  if (hasScheduledChange && billing.scheduled_plan_name)
    metaParts.push(`downgrades to ${billing.scheduled_plan_name}`);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
            Current plan
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="text-[22px] font-medium tracking-tight text-[var(--color-fg)]">
              {label}
            </span>
            <span
              className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
              style={{
                color: statusOk ? "var(--color-accent)" : "var(--color-warn)",
                background: `color-mix(in srgb, ${statusOk ? "var(--color-accent)" : "var(--color-warn)"} 11%, transparent)`,
                borderColor: `color-mix(in srgb, ${statusOk ? "var(--color-accent)" : "var(--color-warn)"} 30%, transparent)`,
              }}
            >
              {status}
            </span>
          </div>
          <div className="mt-1.5 text-[12.5px] text-[var(--color-fg-muted)]">
            {metaParts.join(" · ")}
          </div>
        </div>
        {isOwner && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {hasScheduledChange && (
              <Button
                type="button"
                variant="secondary"
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
                variant="danger"
                size="sm"
                disabled={actionPending}
                onClick={onCancel}
              >
                Cancel plan
              </Button>
            )}
            {billing.portal_available && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={portalPending}
                onClick={onPortal}
              >
                {portalPending && <Spinner size={12} thickness={2} />}
                <ExternalLink size={13} />
                Manage billing
              </Button>
            )}
          </div>
        )}
      </div>

      {/* usage lives with the plan it's measured against */}
      <div className="my-5 h-px bg-[var(--color-border)]" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <MeteredUsageRow label="Monitors" balance={billing.balances.monitors} />
        <MeteredUsageRow label="Members" balance={billing.balances.members} />
        <MeteredUsageRow
          label="Events"
          balance={billing.balances.events}
          hint="1 recorded check = 2 event units"
        />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-2">
        <CapabilityRow label="Custom domain" value={summaryPlanItemText(plan, "custom_domain")} />
        <CapabilityRow label="Minimum check interval" value={minimumIntervalText(plan)} />
        <span className="ml-auto text-[11px] tabular text-[var(--color-fg-dim)]">
          {nextResetText(billing.balances.events)}
        </span>
      </div>
    </div>
  );
}

function minimumIntervalText(plan?: BillingPlanSummary): string {
  return planIncludesFeature(plan, "one_min_checks")
    ? "1 minute"
    : planIncludesFeature(plan, "five_min_checks")
      ? "5 minutes"
      : "15 minutes";
}

type BillingAction = "cancel" | "renew" | "cancel-downgrade";

function BillingActionDialog({
  action,
  billing,
  pending,
  onOpenChange,
  onConfirm,
}: {
  action: BillingAction | null;
  billing: BillingSummary;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const title =
    action === "cancel"
      ? "Cancel subscription?"
      : action === "renew"
        ? "Renew subscription?"
        : "Cancel scheduled downgrade?";
  const description =
    action === "cancel"
      ? "Your current paid plan will stay active until the end of the current billing month, then the workspace will return to the free plan."
      : action === "renew"
        ? "This removes the pending cancellation and keeps your current paid plan active."
        : `This removes the scheduled downgrade${billing.scheduled_plan_name ? ` to ${billing.scheduled_plan_name}` : ""} and keeps your current plan active.`;
  const confirmLabel =
    action === "cancel"
      ? "Cancel at period end"
      : action === "renew"
        ? "Renew plan"
        : "Cancel downgrade";

  return (
    <Dialog open={action !== null} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={description}
        footer={
          <>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={pending}>
                Back
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant={action === "cancel" ? "danger" : "primary"}
              disabled={pending || !action}
              onClick={onConfirm}
            >
              {pending && <Spinner size={12} thickness={2} />}
              {confirmLabel}
            </Button>
          </>
        }
      />
    </Dialog>
  );
}

function PlanCard({
  plan,
  current,
  isOwner,
  pending,
  actionLabel,
  onSelect,
}: {
  plan: BillingPlanSummary;
  current: boolean;
  isOwner: boolean;
  pending: boolean;
  actionLabel: string;
  onSelect: () => void;
}) {
  const price = formatPlanPrice(plan.price);
  const interval =
    plan.price?.secondary_text ?? (plan.price?.interval ? `per ${plan.price.interval}` : "");

  return (
    <div
      className="flex flex-col gap-3.5 rounded-[var(--radius-lg)] border bg-[var(--color-bg-elev)] p-5"
      style={{
        borderColor: current
          ? "color-mix(in srgb, var(--color-accent) 40%, var(--color-border))"
          : "var(--color-border)",
        boxShadow: current
          ? "var(--shadow-sm), 0 0 0 1px color-mix(in srgb, var(--color-accent) 22%, transparent)"
          : "var(--shadow-xs)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[14px] font-semibold text-[var(--color-fg)]">{plan.name}</span>
        {current && (
          <span className="rounded-full border border-[color-mix(in_srgb,var(--color-accent)_30%,transparent)] bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-accent)]">
            current
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="tabular text-[26px] font-medium tracking-tight text-[var(--color-fg)]">
          {price}
        </span>
        {interval && <span className="text-[12px] text-[var(--color-fg-dim)]">{interval}</span>}
      </div>
      {plan.description && (
        <p className="text-[12px] text-[var(--color-fg-muted)] line-clamp-2">{plan.description}</p>
      )}
      {plan.items && plan.items.length > 0 && (
        <div className="flex flex-col gap-2">
          {plan.items.slice(0, 6).map((item) => (
            <div
              key={item.feature_id}
              className="flex items-start gap-2 text-[12.5px] text-[var(--color-fg-muted)]"
            >
              <Check size={13} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
              <span>
                {item.primary_text ?? item.feature_id}
                {item.secondary_text && (
                  <span className="text-[var(--color-fg-dim)]">, {item.secondary_text}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {isOwner && (
        <Button
          type="button"
          variant={current ? "secondary" : "subtle"}
          size="sm"
          disabled={pending || current}
          onClick={onSelect}
          className="mt-auto w-full"
        >
          {pending && <Spinner size={12} thickness={2} />}
          {current ? "Current plan" : actionLabel}
        </Button>
      )}
    </div>
  );
}

function PlanChangeDialog({
  open,
  plan,
  currentPlan,
  changeKind,
  activePaidSubscription,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  plan: BillingPlanSummary | null;
  currentPlan?: BillingPlanSummary;
  changeKind: PlanChangeKind;
  activePaidSubscription: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const title =
    changeKind === "downgrade"
      ? "Confirm downgrade"
      : changeKind === "upgrade"
        ? "Confirm upgrade"
        : "Confirm plan change";
  const currentName = currentPlan?.name ?? "your current plan";
  const nextName = plan?.name ?? "this plan";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={planChangeDescription(
          changeKind,
          currentName,
          nextName,
          activePaidSubscription,
        )}
        footer={
          <>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" variant="primary" disabled={pending || !plan} onClick={onConfirm}>
              {pending && <Spinner size={12} thickness={2} />}
              {changeKind === "downgrade" ? "Confirm downgrade" : "Confirm change"}
            </Button>
          </>
        }
      >
        {plan && (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] text-[var(--color-fg-muted)]">New plan</span>
              <span className="text-[13px] font-medium text-[var(--color-fg)]">{plan.name}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[12px] text-[var(--color-fg-muted)]">Price</span>
              <span className="text-[13px] font-medium text-[var(--color-fg)] tabular">
                {formatPlanPrice(plan.price)}
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type PlanChangeKind = "upgrade" | "downgrade" | "change";

function planChangeKind(
  currentPlan: BillingPlanSummary,
  nextPlan: BillingPlanSummary,
): PlanChangeKind {
  const currentPrice = planPriceAmount(currentPlan);
  const nextPrice = planPriceAmount(nextPlan);
  if (nextPrice > currentPrice) return "upgrade";
  if (nextPrice < currentPrice) return "downgrade";
  return "change";
}

function planActionLabel(currentPlan: BillingPlanSummary, nextPlan: BillingPlanSummary): string {
  const kind = planChangeKind(currentPlan, nextPlan);
  if (kind === "upgrade") return "Upgrade";
  if (kind === "downgrade") return "Downgrade";
  return "Change plan";
}

function planPriceAmount(plan: BillingPlanSummary): number {
  return plan.price?.amount ?? 0;
}

function hasActivePaidSubscription(billing: BillingSummary): boolean {
  return (
    billing.current_plan_id !== "free" &&
    ["active", "trialing", "past_due"].includes(billing.subscription_status ?? "") &&
    Boolean(billing.stripe_customer_id)
  );
}

function planChangeDescription(
  kind: PlanChangeKind,
  currentName: string,
  nextName: string,
  activePaidSubscription: boolean,
): string {
  if (kind === "downgrade") {
    return `Switching from ${currentName} to ${nextName} will take effect at the end of the current billing month. Your current plan stays active until then.`;
  }
  if (activePaidSubscription) {
    return `Switching from ${currentName} to ${nextName} may charge your active subscription immediately, including any prorated amount.`;
  }
  return `Switching to ${nextName} will open checkout if payment is required before the plan is activated.`;
}

function MeteredUsageRow({
  label,
  balance,
  hint,
}: {
  label: string;
  balance: BillingBalanceSummary | null | undefined;
  hint?: string;
}) {
  const usage = usageNumbers(balance);
  const width = usage.percent == null ? 0 : Math.min(100, Math.max(0, usage.percent));
  const barColor =
    width >= 90 ? "var(--color-err)" : width >= 70 ? "var(--color-warn)" : "var(--color-accent)";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
          {label}
        </span>
        <span className="mono tabular text-[12px] text-[var(--color-fg)]">{usage.primaryText}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg-row)]">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${width}%`, background: barColor }}
        />
      </div>
      <div className="text-[11px] text-[var(--color-fg-dim)]">{hint ?? usage.remainingText}</div>
    </div>
  );
}

function CapabilityRow({ label, value }: { label: string; value: string }) {
  const supported = value !== "Not included";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12px] text-[var(--color-fg-muted)]">{label}</span>
      <span
        className={[
          "rounded-full px-2 py-1 text-[11px] font-medium",
          supported
            ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
            : "bg-[var(--color-bg-row)] text-[var(--color-fg-dim)]",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function usageNumbers(balance: BillingBalanceSummary | null | undefined) {
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

function nextResetText(balance: BillingBalanceSummary | null | undefined): string {
  const raw = balance?.next_reset_at;
  if (!raw) return "Current period";
  const date = new Date(raw > 10_000_000_000 ? raw : raw * 1000);
  if (Number.isNaN(date.getTime())) return "Current period";
  return `Resets ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

function formatUsageNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}
