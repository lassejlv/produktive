import { createFileRoute, useSearch } from "@tanstack/react-router";
import { CreditCard, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "#/lib/toast";
import { BillingActionDialog } from "../components/billing/BillingActionDialog";
import { CurrentPlanCard } from "../components/billing/CurrentPlanCard";
import { PlanChangeDialog } from "../components/billing/PlanChangeDialog";
import { PlanTable } from "../components/billing/PlanTable";
import { Button } from "#/components/ui/button";
import { EmptyState } from "../components/EmptyState";
import { PageActions } from "../components/PageLayout";
import { Spinner } from "#/components/ui/spinner";
import {
  hasActivePaidSubscription,
  nextResetText,
  planChangeKind,
  usageNumbers,
  type BillingAction,
  type BillingPlanSummary,
} from "../lib/billing";
import { usePolarCheckout } from "../hooks/use-polar-checkout";
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

  const summary = useBillingSummary(wid);
  const attach = useBillingAttach(wid);
  const cancelSubscription = useBillingCancel(wid);
  const renewSubscription = useBillingRenew(wid);
  const cancelDowngrade = useBillingCancelDowngrade(wid);
  const portal = useBillingPortal(wid);
  const setupPayment = useBillingSetupPayment(wid);
  const polarCheckout = usePolarCheckout();

  const checkoutComplete = useCallback(() => {
    toast.success("Checkout completed — your plan may take a moment to update.");
    void summary.refetch();
  }, [summary]);

  useEffect(() => {
    if (checkout === "success") checkoutComplete();
  }, [checkout, checkoutComplete]);

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
      <div className="flex flex-col gap-6">
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

        <UsageCard monitors={monitors} members={members} events={events} eventsSub="Unlimited" />

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
      onSuccess: async (res) => {
        const opened = await polarCheckout.openFromResponse(res, { onSuccess: checkoutComplete });
        if (!opened) toast.error("No checkout URL returned");
      },
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

      <div className="flex flex-col gap-6">
        <UsageCard
          monitors={monitors}
          members={members}
          events={events}
          eventsSub={nextResetText(billing.balances.events)}
        />

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
            onSuccess: async (res) => {
              setSelectedPlan(null);
              if (res.payment_url || res.url) {
                const opened = await polarCheckout.openFromResponse(res, {
                  onSuccess: checkoutComplete,
                });
                if (!opened) toast.error("No checkout URL returned");
              } else {
                toast.success("Plan updated");
              }
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

function UsageCard({
  monitors,
  members,
  events,
  eventsSub,
}: {
  monitors: ReturnType<typeof usageNumbers>;
  members: ReturnType<typeof usageNumbers>;
  events: ReturnType<typeof usageNumbers>;
  eventsSub?: string;
}) {
  return (
    <div className="divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-xs)]">
      <UsageRow label="Monitors" usage={monitors} />
      <UsageRow label="Members" usage={members} />
      <UsageRow label="Events" usage={events} sub={eventsSub} />
    </div>
  );
}

function UsageRow({
  label,
  usage,
  sub,
}: {
  label: string;
  usage: ReturnType<typeof usageNumbers>;
  sub?: string;
}) {
  const showBar = usage.percent != null && usage.primaryText !== "Unlimited";
  const width = Math.min(100, Math.max(0, usage.percent ?? 0));
  const barColor =
    width >= 90 ? "var(--color-err)" : width >= 70 ? "var(--color-warn)" : "var(--color-accent)";

  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-[var(--color-fg)]">{label}</span>
        <span className="tabular text-[12px] text-[var(--color-fg-muted)]">{usage.primaryText}</span>
      </div>
      {showBar && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-sunken)]">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${width}%`, background: barColor }}
          />
        </div>
      )}
      {sub && <div className="mt-1.5 text-[11px] text-[var(--color-fg-dim)]">{sub}</div>}
    </div>
  );
}
