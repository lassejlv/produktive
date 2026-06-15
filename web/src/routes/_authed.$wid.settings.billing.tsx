import { createFileRoute, useSearch } from "@tanstack/react-router";
import { CreditCard, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "#/lib/toast";
import { BillingActionDialog } from "../components/billing/BillingActionDialog";
import { CurrentPlanCard } from "../components/billing/CurrentPlanCard";
import { PlanChangeDialog } from "../components/billing/PlanChangeDialog";
import { PlanTable } from "../components/billing/PlanTable";
import { Button } from "#/components/ui/button";
import { EmptyState } from "../components/EmptyState";
import { PageActions } from "../components/PageLayout";
import { Spinner } from "#/components/ui/spinner";
import { StatTile } from "../components/StatTile";
import {
  hasActivePaidSubscription,
  nextResetText,
  planChangeKind,
  redirectBillingUrl,
  redirectCheckout,
  usageNumbers,
  type BillingAction,
  type BillingBalanceSummary,
  type BillingPlanSummary,
} from "../lib/billing";
import { cn } from "#/lib/cn";
import {
  useBillingAttach,
  useBillingCancel,
  useBillingCancelDowngrade,
  useBillingPortal,
  useBillingRenew,
  useBillingSetupPayment,
  useBillingSummary,
  useWorkspaces,
} from "../lib/queries";

export const Route = createFileRoute("/_authed/$wid/settings/billing")({
  staticData: {
    title: "Settings",
    description: "Plan, usage, and payment.",
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
  const [expandedUsage, setExpandedUsage] = useState<"monitors" | "members" | "events" | null>(
    null,
  );

  const summary = useBillingSummary(wid);
  const attach = useBillingAttach(wid);
  const cancelSubscription = useBillingCancel(wid);
  const renewSubscription = useBillingRenew(wid);
  const cancelDowngrade = useBillingCancelDowngrade(wid);
  const portal = useBillingPortal(wid);
  const setupPayment = useBillingSetupPayment(wid);

  useEffect(() => {
    if (checkout === "success") {
      toast.success("Checkout completed — your plan may take a moment to update.");
    }
  }, [checkout]);

  if (summary.isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-[12px] text-[var(--color-fg-muted)]">
        <Spinner className="size-4" /> <span className="ml-2">Loading billing…</span>
      </div>
    );
  }

  if (summary.isError) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Could not load billing"
        description={(summary.error as Error).message}
      />
    );
  }

  const billing = summary.data!;
  const currentPlanId = billing.current_plan_id ?? null;
  const planList = billing.plans;
  const currentPlan =
    planList.find((p) => p.current) ?? planList.find((p) => p.id === currentPlanId);
  const selectedPlanChange =
    selectedPlan && currentPlan ? planChangeKind(currentPlan, selectedPlan) : "change";

  const monitors = usageNumbers(billing.balances.monitors);
  const members = usageNumbers(billing.balances.members);
  const events = usageNumbers(billing.balances.events);
  const actionPending =
    cancelSubscription.isPending || renewSubscription.isPending || cancelDowngrade.isPending;

  if (!billing.billing_enabled) {
    return (
      <div className="flex flex-col gap-7">
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5 shadow-[var(--shadow-xs)]">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] text-[var(--color-fg-muted)]">
              <CreditCard size={16} />
            </div>
            <div>
              <h2 className="text-[15px] font-medium tracking-tight text-[var(--color-fg)]">
                Billing disabled
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
                This server is running without Polar. Plan limits, usage billing, checkout, and the
                customer portal are disabled for self-hosted workspaces.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <UsageStatTile label="Monitors" usage={monitors} />
          <UsageStatTile label="Members" usage={members} />
          <UsageStatTile label="Events" usage={events} sub="Unlimited" />
        </div>

        <CurrentPlanCard
          planId={currentPlanId}
          billing={billing}
          plan={currentPlan}
          isOwner={false}
          actionPending={false}
          onCancel={() => {}}
          onRenew={() => {}}
          onCancelDowngrade={() => {}}
        />
      </div>
    );
  }

  function openPortal() {
    portal.mutate(undefined, {
      onSuccess: (res) => window.location.assign(res.url),
      onError: (err) => toast.error((err as Error).message),
    });
  }

  function openSetupPayment() {
    setupPayment.mutate(undefined, {
      onSuccess: (res) => redirectBillingUrl(res),
      onError: (err) => toast.error((err as Error).message),
    });
  }

  return (
    <>
      <PageActions>
        {isOwner && billing.portal_available && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={portal.isPending}
            onClick={openPortal}
          >
            {portal.isPending && <Spinner className="size-3" />}
            <ExternalLink size={13} />
            Manage billing
          </Button>
        )}
        {isOwner && !billing.portal_available && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={setupPayment.isPending}
            onClick={openSetupPayment}
          >
            {setupPayment.isPending && <Spinner className="size-3" />}
            <ExternalLink size={13} />
            Set up payment
          </Button>
        )}
      </PageActions>

      <div className="flex flex-col gap-7">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <UsageStatTile
            label="Monitors"
            usage={monitors}
            expanded={expandedUsage === "monitors"}
            onToggle={() => setExpandedUsage((v) => (v === "monitors" ? null : "monitors"))}
          />
          <UsageStatTile
            label="Members"
            usage={members}
            expanded={expandedUsage === "members"}
            onToggle={() => setExpandedUsage((v) => (v === "members" ? null : "members"))}
          />
          <UsageStatTile
            label="Events"
            usage={events}
            sub={nextResetText(billing.balances.events)}
            hint="2 units per check"
            expanded={expandedUsage === "events"}
            onToggle={() => setExpandedUsage((v) => (v === "events" ? null : "events"))}
          />
        </div>

        {expandedUsage && (
          <UsageDetailPanel
            label={expandedUsage.charAt(0).toUpperCase() + expandedUsage.slice(1)}
            usage={
              expandedUsage === "monitors"
                ? monitors
                : expandedUsage === "members"
                  ? members
                  : events
            }
            balance={billing.balances[expandedUsage]}
            hint={expandedUsage === "events" ? "1 recorded check = 2 event units" : undefined}
          />
        )}

        <CurrentPlanCard
          planId={currentPlanId}
          billing={billing}
          plan={currentPlan}
          isOwner={isOwner}
          actionPending={actionPending}
          onCancel={() => setBillingAction("cancel")}
          onRenew={() => setBillingAction("renew")}
          onCancelDowngrade={() => setBillingAction("cancel-downgrade")}
        />

        <section>
          <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
            Plans
          </h3>
          <PlanTable
            plans={planList}
            currentPlanId={currentPlanId}
            currentPlan={currentPlan}
            isOwner={isOwner}
            pendingPlanId={attach.isPending ? attach.variables : undefined}
            onSelect={setSelectedPlan}
          />
          {!isOwner && (
            <p className="mt-3 text-[12px] text-[var(--color-fg-muted)]">
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
        hasActivePaidSubscription={hasActivePaidSubscription(billing)}
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
        pending={actionPending}
        onOpenChange={(open) => {
          if (!open && !actionPending) setBillingAction(null);
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

function UsageStatTile({
  label,
  usage,
  sub,
  hint,
  expanded,
  onToggle,
}: {
  label: string;
  usage: ReturnType<typeof usageNumbers>;
  sub?: string;
  hint?: string;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const percent = usage.percent ?? 0;
  const accent =
    percent >= 90
      ? "var(--color-err)"
      : percent >= 70
        ? "var(--color-warn)"
        : usage.primaryText === "Unlimited"
          ? undefined
          : "var(--color-accent)";

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onToggle}
      className={cn(
        "h-auto w-full justify-start border-0 p-0 text-left shadow-none transition-[box-shadow,border-color] duration-150",
        onToggle && "cursor-pointer hover:shadow-[var(--shadow-sm)]",
        expanded && "ring-1 ring-[color-mix(in_srgb,var(--color-accent)_35%,transparent)]",
      )}
    >
      <StatTile
        label={label}
        value={usage.primaryText}
        sub={sub ?? hint ?? usage.remainingText}
        accent={accent}
        className="h-full"
      />
    </Button>
  );
}

function UsageDetailPanel({
  label,
  usage,
  balance,
  hint,
}: {
  label: string;
  usage: ReturnType<typeof usageNumbers>;
  balance: BillingBalanceSummary | null | undefined;
  hint?: string;
}) {
  const width = usage.percent == null ? 0 : Math.min(100, Math.max(0, usage.percent));
  const barColor =
    width >= 90 ? "var(--color-err)" : width >= 70 ? "var(--color-warn)" : "var(--color-accent)";

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3.5 shadow-[var(--shadow-xs)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[13px] font-medium text-[var(--color-fg)]">{label} usage</div>
        <div className="tabular text-[13px] text-[var(--color-fg-muted)]">{usage.primaryText}</div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-bg-sunken)]">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${width}%`, background: barColor }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--color-fg-dim)]">
        <span>{hint ?? usage.remainingText}</span>
        {balance?.next_reset_at != null && <span>{nextResetText(balance)}</span>}
      </div>
    </div>
  );
}
