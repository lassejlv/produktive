import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { EmptyState } from "../components/EmptyState";
import { MarketingShell } from "../components/marketing/MarketingShell";
import { auth } from "../lib/api";
import { cn } from "#/lib/cn";
import {
  formatPlanPrice,
  isFreePlan,
  planHeadlineBullets,
  type PublicPricingFeature,
  type PublicPricingPlan,
} from "../lib/pricing";
import { useMe, usePublicPricing, useWorkspaces } from "../lib/queries";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});

function PricingPage() {
  const pricing = usePublicPricing();

  return (
    <MarketingShell>
      <div className="mx-auto max-w-[720px] px-6 pb-20 pt-12 sm:pt-16">
        <h1 className="text-[28px] font-medium tracking-tight text-[var(--color-fg)]">Pricing</h1>
        <p className="mt-2 text-[14px] text-[var(--color-fg-muted)]">
          Start free. Upgrade when you need more monitors, checks, or team members.
        </p>
        <BillingLink />

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

function BillingLink() {
  const authed = !!auth.token;
  const me = useMe();
  const workspaces = useWorkspaces();
  const workspace =
    workspaces.data?.find((w) => w.is_personal) ?? workspaces.data?.[0] ?? null;

  if (!authed || !me.isSuccess || !workspace) return null;

  return (
    <p className="mt-3 text-[13px] text-[var(--color-fg-muted)]">
      <Link
        to="/$wid/settings/billing"
        params={{ wid: workspace.slug }}
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
}: {
  plan: PublicPricingPlan;
  catalog: PublicPricingFeature[];
}) {
  const nav = useNavigate();
  const cta = usePlanCta(plan);
  const bullets = planHeadlineBullets(plan, catalog, 4);
  const price = formatPlanPrice(plan.price);
  const free = isFreePlan(plan);

  return (
    <article className="flex flex-col rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-medium text-[var(--color-fg)]">{plan.name}</h2>
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
        variant={free ? "ghost" : "default"}
        size="sm"
        className="mt-4 w-full"
        onClick={() => {
          if (cta.to === "/$wid/settings/billing" && cta.params) {
            nav({ to: cta.to, params: cta.params, search: { checkout: undefined } });
          } else if (cta.params) {
            nav({ to: cta.to, params: cta.params });
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

function usePlanCta(plan: PublicPricingPlan): {
  label: string;
  to: "/signup" | "/$wid/monitors" | "/$wid/settings/billing";
  params?: { wid: string };
} {
  const authed = !!auth.token;
  const me = useMe();
  const workspaces = useWorkspaces();
  const workspace =
    workspaces.data?.find((w) => w.is_personal) ?? workspaces.data?.[0] ?? null;
  const signedIn = authed && me.isSuccess && workspace;
  const free = isFreePlan(plan);

  if (!signedIn) {
    return {
      label: free ? "Start free" : "Get started",
      to: "/signup",
    };
  }

  if (free) {
    return {
      label: "Open dashboard",
      to: "/$wid/monitors",
      params: { wid: workspace.slug },
    };
  }

  return {
    label: "Manage billing",
    to: "/$wid/settings/billing",
    params: { wid: workspace.slug },
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
