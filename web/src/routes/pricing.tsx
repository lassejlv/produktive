import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { EmptyState } from "../components/EmptyState";
import { MarketingShell } from "../components/marketing/MarketingShell";
import { auth } from "../lib/api";
import { planActionLabel, type BillingPlanSummary } from "../lib/billing";
import { cn } from "#/lib/cn";
import {
  formatPlanPrice,
  isFreePlan,
  planHeadlineBullets,
  type PublicPricingFeature,
  type PublicPricingPlan,
} from "../lib/pricing";
import { useMe, usePublicPricing, useWorkspaces, billingSummaryQuery } from "../lib/queries";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});

function useMarketingWorkspace() {
  const authed = !!auth.token;
  const me = useMe();
  const workspaces = useWorkspaces();
  const workspace =
    workspaces.data?.find((w) => w.is_personal) ?? workspaces.data?.[0] ?? null;
  const signedIn = authed && me.isSuccess && !!workspace;
  return { signedIn, workspace };
}

function PricingPage() {
  const pricing = usePublicPricing();
  const { signedIn, workspace } = useMarketingWorkspace();
  const billing = useQuery({
    ...billingSummaryQuery(workspace?.slug ?? ""),
    enabled: signedIn && !!workspace,
  });

  const currentPlanId = billing.data?.current_plan_id ?? null;
  const currentPlan =
    billing.data?.plans.find((p) => p.current) ??
    billing.data?.plans.find((p) => p.id === currentPlanId);
  const billingPlans = billing.data?.plans ?? [];

  return (
    <MarketingShell>
      <div className="mx-auto max-w-[720px] px-6 pb-20 pt-12 sm:pt-16">
        <h1 className="text-[28px] font-medium tracking-tight text-[var(--color-fg)]">Pricing</h1>
        <p className="mt-2 text-[14px] text-[var(--color-fg-muted)]">
          Start free. Upgrade when you need more monitors, checks, or team members.
        </p>
        <BillingLink signedIn={signedIn} workspaceSlug={workspace?.slug} />

        <section className="mt-10">
          {pricing.isLoading && <PricingSkeleton />}

          {pricing.isError && (
            <EmptyState
              title="Could not load pricing"
              description={(pricing.error as Error).message}
            />
          )}

          {pricing.data && (
            <div className="space-y-3">
              {!pricing.data.billing_enabled && (
                <p className="text-[13px] text-[var(--color-fg-muted)]">
                  Billing is not configured on this server.
                </p>
              )}

              <div
                className={cn(
                  "grid gap-3",
                  pricing.data.plans.length >= 2 && "sm:grid-cols-2",
                  pricing.data.plans.length >= 3 && "lg:grid-cols-3",
                )}
              >
                {pricing.data.plans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    catalog={pricing.data!.features}
                    currentPlanId={currentPlanId}
                    currentPlan={currentPlan}
                    billingPlan={billingPlans.find((p) => p.id === plan.id)}
                    billingEnabled={billing.data?.billing_enabled ?? pricing.data!.billing_enabled}
                    workspaceSlug={workspace?.slug}
                    signedIn={signedIn}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </MarketingShell>
  );
}

function BillingLink({
  signedIn,
  workspaceSlug,
}: {
  signedIn: boolean;
  workspaceSlug?: string;
}) {
  if (!signedIn || !workspaceSlug) return null;

  return (
    <p className="mt-3 text-[13px] text-[var(--color-fg-muted)]">
      <Link
        to="/$wid/settings/billing"
        params={{ wid: workspaceSlug }}
        search={{ checkout: undefined }}
        className="link"
      >
        Manage billing
      </Link>
    </p>
  );
}

function PlanCard({
  plan,
  catalog,
  currentPlanId,
  currentPlan,
  billingPlan,
  billingEnabled,
  workspaceSlug,
  signedIn,
}: {
  plan: PublicPricingPlan;
  catalog: PublicPricingFeature[];
  currentPlanId: string | null;
  currentPlan?: BillingPlanSummary;
  billingPlan?: BillingPlanSummary;
  billingEnabled: boolean;
  workspaceSlug?: string;
  signedIn: boolean;
}) {
  const nav = useNavigate();
  const cta = usePlanCta(plan, {
    signedIn,
    workspaceSlug,
    currentPlanId,
    currentPlan,
    billingPlan,
    billingEnabled,
  });
  const bullets = planHeadlineBullets(plan, catalog, 4);
  const price = formatPlanPrice(plan.price);
  const free = isFreePlan(plan);
  const isCurrent = signedIn && plan.id === currentPlanId;

  return (
    <article
      className={cn(
        "flex flex-col rounded-[var(--radius-md)] border p-4",
        isCurrent
          ? "border-[var(--color-accent)] shadow-[var(--shadow-sm)]"
          : "border-[var(--color-border)]",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-[15px] font-medium text-[var(--color-fg)]">{plan.name}</h2>
          {isCurrent && (
            <span className="rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-accent)]">
              Current
            </span>
          )}
        </div>
        <p className="tabular shrink-0 text-[15px] text-[var(--color-fg)]">
          {free || !price ? "$0" : price}
        </p>
      </div>

      {plan.description && (
        <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">{plan.description}</p>
      )}

      {bullets.length > 0 && (
        <ul className="mt-3 flex-1 space-y-1.5 text-[13px] text-[var(--color-fg-muted)]">
          {bullets.map((row) => (
            <li key={row.featureId}>{row.label}</li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant={cta.variant ?? (free ? "ghost" : "default")}
        size="sm"
        className="mt-4 w-full"
        disabled={cta.disabled}
        onClick={() => {
          if (cta.disabled) return;
          if (cta.to === "/$wid/settings/billing" && cta.params) {
            nav({ to: cta.to, params: cta.params, search: { checkout: undefined } });
          } else if (cta.params) {
            nav({
              to: cta.to,
              params: cta.params,
              search: cta.to === "/$wid" ? { q: undefined, status: undefined } : undefined,
            });
          } else {
            nav({ to: cta.to });
          }
        }}
      >
        {cta.label}
      </Button>
    </article>
  );
}

function usePlanCta(
  plan: PublicPricingPlan,
  ctx: {
    signedIn: boolean;
    workspaceSlug?: string;
    currentPlanId: string | null;
    currentPlan?: BillingPlanSummary;
    billingPlan?: BillingPlanSummary;
    billingEnabled: boolean;
  },
): {
  label: string;
  to: "/signup" | "/$wid" | "/$wid/settings/billing";
  params?: { wid: string };
  disabled?: boolean;
  variant?: "default" | "ghost" | "secondary";
} {
  const { signedIn, workspaceSlug, currentPlanId, currentPlan, billingPlan, billingEnabled } = ctx;
  const free = isFreePlan(plan);
  const isCurrent = signedIn && plan.id === currentPlanId;

  if (!signedIn || !workspaceSlug) {
    return {
      label: free ? "Start free" : "Get started",
      to: "/signup",
    };
  }

  if (isCurrent) {
    return {
      label: "Current plan",
      to: "/$wid/settings/billing",
      params: { wid: workspaceSlug },
      disabled: true,
      variant: "secondary",
    };
  }

  if (free) {
    return {
      label: "Open dashboard",
      to: "/$wid",
      params: { wid: workspaceSlug },
      variant: "ghost",
    };
  }

  if (billingEnabled && currentPlan && billingPlan) {
    return {
      label: planActionLabel(currentPlan, billingPlan),
      to: "/$wid/settings/billing",
      params: { wid: workspaceSlug },
    };
  }

  return {
    label: "View billing",
    to: "/$wid/settings/billing",
    params: { wid: workspaceSlug },
  };
}

function PricingSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="shimmer h-[160px] rounded-[var(--radius-md)]" />
      ))}
    </div>
  );
}
