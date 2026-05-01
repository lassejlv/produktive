import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  SettingRow,
  SettingsSkeleton,
} from "@/components/workspace/setting-row";
import {
  type BillingStatus,
  cancelSubscription,
  changeBillingPlan,
  getBillingStatus,
  openBillingPortal,
  resumeSubscription,
  startBillingCheckout,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export function BillingSettings() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<
    "pro-checkout" | "team-checkout" | "team-plan" | "portal" | "cancel" | "resume" | null
  >(null);
  const { confirm, dialog } = useConfirmDialog();

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
    action: "pro-checkout" | "team-checkout" | "portal",
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

  const onCancel = () => {
    confirm({
      title: "Cancel plan?",
      description:
        "You'll keep access until the end of the current billing period. You can resume anytime before then.",
      confirmLabel: "Cancel plan",
      cancelLabel: "Keep plan",
      destructive: true,
      onConfirm: async () => {
        setBusyAction("cancel");
        try {
          const next = await cancelSubscription();
          setBilling(next);
          toast.success("Plan is scheduled to cancel.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to cancel subscription",
          );
        } finally {
          setBusyAction(null);
        }
      },
    });
  };

  const onResume = async () => {
    setBusyAction("resume");
    try {
      const next = await resumeSubscription();
      setBilling(next);
      toast.success("Plan will renew as scheduled.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to resume subscription",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const onTeamUpgrade = async () => {
    setBusyAction("team-plan");
    try {
      const next = await changeBillingPlan("team");
      setBilling(next);
      toast.success("Workspace upgraded to Team.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to upgrade to Team",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const activeSubscription = billing?.subscriptions.find((subscription) =>
    isActiveSubscription(subscription),
  );
  const isTeam = Boolean(
    billing?.teamPlanId && activeSubscription?.planId === billing.teamPlanId,
  );
  const planName = billing?.isPro ? (isTeam ? "Team" : "Pro") : "Free";

  if (loading || !billing) {
    return <SettingsSkeleton rows={3} />;
  }

  return (
    <div>
      {dialog}
      <SettingRow label="Plan">
        <div className="flex items-center gap-2">
          <span className="text-fg">{planName}</span>
          <span
            aria-hidden
            className={cn(
              "inline-block size-1.5 rounded-full",
              billing.isPro ? "bg-success" : "bg-border",
            )}
          />
        </div>
        <div className="mt-0.5 text-[12px] text-fg-muted">
          {billing.isPro
            ? billingDescription(planName, activeSubscription)
            : "This workspace is on the free plan."}
        </div>
      </SettingRow>
      <SettingRow label="Access">
        <span className="text-fg-muted">
          {billing.canManage
            ? "You can manage billing for this workspace."
            : "Only workspace owners can manage billing."}
        </span>
      </SettingRow>

      {billing.canManage ? (
        <div className="flex flex-wrap justify-end gap-2 pt-4">
          {!billing.isPro ? (
            <>
              <Button
                type="button"
                size="sm"
                disabled={busyAction !== null}
                onClick={() =>
                  void redirectTo("pro-checkout", () =>
                    startBillingCheckout("pro"),
                  )
                }
              >
                {busyAction === "pro-checkout" ? "Opening..." : "Upgrade to Pro"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busyAction !== null}
                onClick={() =>
                  void redirectTo("team-checkout", () =>
                    startBillingCheckout("team"),
                  )
                }
              >
                {busyAction === "team-checkout"
                  ? "Opening..."
                  : "Upgrade to Team"}
              </Button>
            </>
          ) : !isTeam ? (
            <Button
              type="button"
              size="sm"
              disabled={busyAction !== null}
              onClick={() => void onTeamUpgrade()}
            >
              {busyAction === "team-plan" ? "Upgrading..." : "Upgrade to Team"}
            </Button>
          ) : activeSubscription?.canceledAt ? (
            <Button
              type="button"
              size="sm"
              disabled={busyAction !== null}
              onClick={() => void onResume()}
            >
              {busyAction === "resume" ? "Resuming…" : "Resume plan"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busyAction !== null}
              onClick={onCancel}
            >
              {busyAction === "cancel" ? "Canceling…" : "Cancel plan"}
            </Button>
          )}
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

function isActiveSubscription(subscription: {
  status: string;
  currentPeriodEnd: number | null;
}) {
  const now = Date.now() / 1000;
  return (
    (subscription.status === "active" || subscription.status === "trialing") &&
    (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > now)
  );
}

function billingDescription(
  planName: string,
  subscription?: {
    currentPeriodEnd: number | null;
    canceledAt: number | null;
  },
) {
  if (!subscription) return `Your workspace is on ${planName}.`;
  if (subscription.canceledAt) {
    return `${planName} is scheduled to cancel.`;
  }
  if (!subscription.currentPeriodEnd) {
    return `Your workspace is on ${planName}.`;
  }
  return `Renews ${new Date(
    subscription.currentPeriodEnd * 1000,
  ).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}
