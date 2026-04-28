import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LoadingTip } from "@/components/ui/loading-tip";
import {
  type BillingStatus,
  getBillingStatus,
  openBillingPortal,
  startBillingCheckout,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export function BillingSettings() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<"checkout" | "portal" | null>(
    null,
  );

  useEffect(() => {
    let mounted = true;
    void getBillingStatus()
      .then((response) => {
        if (mounted) setBilling(response);
      })
      .catch((error) => {
        toast.error(
          error instanceof Error ? error.message : "Failed to load billing",
        );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const redirectTo = async (
    action: "checkout" | "portal",
    loadUrl: () => Promise<{ url: string }>,
  ) => {
    setBusyAction(action);
    try {
      const response = await loadUrl();
      window.location.assign(response.url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to open billing",
      );
      setBusyAction(null);
    }
  };

  const activeSubscription = billing?.subscriptions.find(
    (subscription) => subscription.planId === billing.proPlanId,
  );

  if (loading || !billing) {
    return <LoadingTip compact />;
  }

  return (
    <div className="border-t border-border-subtle">
      <BillingRow
        label="Plan"
        value={
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] text-fg">
                {billing.isPro ? "Pro" : "Free"}
              </div>
              <div className="mt-0.5 text-[12px] text-fg-muted">
                {billing.isPro
                  ? billingDescription(activeSubscription)
                  : "This workspace is on the free plan."}
              </div>
            </div>
            <StatusMark active={billing.isPro} />
          </div>
        }
      />
      <BillingRow
        label="Customer"
        value={
          <span className="block truncate font-mono text-[12px] text-fg">
            {billing.customerId}
          </span>
        }
      />
      <BillingRow
        label="Pro plan id"
        value={
          <span className="font-mono text-[12px] text-fg">
            {billing.proPlanId}
          </span>
        }
      />
      <BillingRow
        label="Access"
        value={
          <span className="text-[13px] text-fg-muted">
            {billing.canManage
              ? "You can manage billing for this workspace."
              : "Only workspace owners can manage billing."}
          </span>
        }
      />

      {billing.canManage ? (
        <div className="flex flex-wrap justify-end gap-2 border-b border-border-subtle py-4">
          {!billing.isPro ? (
            <Button
              type="button"
              size="sm"
              disabled={busyAction !== null}
              onClick={() => void redirectTo("checkout", startBillingCheckout)}
            >
              {busyAction === "checkout" ? "Opening..." : "Upgrade to Pro"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busyAction !== null}
            onClick={() => void redirectTo("portal", openBillingPortal)}
          >
            {busyAction === "portal" ? "Opening..." : "Manage billing"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function BillingRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid gap-2 border-b border-border-subtle py-3 md:grid-cols-[140px_minmax(0,1fr)]">
      <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-fg-faint">
        {label}
      </div>
      <div className="min-w-0">{value}</div>
    </div>
  );
}

function StatusMark({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-[4px] border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em]",
        active
          ? "border-success/30 bg-success/10 text-success"
          : "border-border-subtle bg-surface text-fg-muted",
      )}
    >
      {active ? "Active" : "Free"}
    </span>
  );
}

function billingDescription(subscription?: {
  currentPeriodEnd: number | null;
  canceledAt: number | null;
}) {
  if (!subscription) return "Your workspace is on Pro.";
  if (subscription.canceledAt) {
    return "Pro is scheduled to cancel.";
  }
  if (!subscription.currentPeriodEnd) {
    return "Your workspace is on Pro.";
  }
  return `Renews ${new Date(subscription.currentPeriodEnd * 1000).toLocaleDateString(
    "en",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  )}`;
}
