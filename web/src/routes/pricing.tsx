import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "#/components/ui/button";
import { EmptyState } from "../components/EmptyState";
import { ThemeToggle } from "../components/ThemeToggle";
import { PricingComparisonTable } from "../components/marketing/PricingComparisonTable";
import { auth } from "../lib/api";
import { cn } from "#/lib/cn";
import {
  buildComparisonMatrix,
  formatPlanPrice,
  isFreePlan,
  planHeadlineBullets,
  resolveFeaturedPlanIndex,
  type PublicPlanPrice,
  type PublicPricingFeature,
  type PublicPricingPlan,
} from "../lib/pricing";
import { useMe, usePublicPricing, useWorkspaces } from "../lib/queries";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});

const FAQ = [
  {
    q: "What counts as an event?",
    a: "Each recorded check consumes 2 event units. Usage resets monthly on metered plans.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes. Upgrades take effect immediately; downgrades apply at the end of the billing period.",
  },
  {
    q: "Do I need a card for the free plan?",
    a: "No. Start on the free tier and upgrade from workspace billing when you need more capacity.",
  },
  {
    q: "What happens if billing is disabled?",
    a: "Self-hosted deployments can run without Polar. Limits are not enforced until billing is configured.",
  },
];

function PricingPage() {
  const pricing = usePublicPricing();

  return (
    <PricingLayout>
      <div className="pt-10 sm:pt-16">
        <h1 className="text-[28px] font-semibold tracking-tight text-[var(--color-fg)]">Pricing</h1>
        <p className="mt-2 max-w-[480px] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Start free. Upgrade from workspace billing when you need more capacity.
        </p>
        <PricingHeroActions />
      </div>

      <section className="mt-10 sm:mt-12">
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
              <p className="mb-6 text-[13px] text-[var(--color-fg-muted)]">
                Billing is not configured on this server, so plan limits are not enforced.
              </p>
            )}

            <div
              className={cn(
                "grid items-stretch gap-4",
                pricing.data.plans.length === 1 && "mx-auto max-w-[360px]",
                pricing.data.plans.length === 2 && "mx-auto max-w-[760px] sm:grid-cols-2",
                pricing.data.plans.length >= 3 && "lg:grid-cols-3",
              )}
            >
              {pricing.data.plans.map((plan) => (
                <PlanTierCard
                  key={plan.id}
                  plan={plan}
                  catalog={pricing.data!.features}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {pricing.data && (
        <>
          <section className="mt-16 border-t border-[var(--color-border)] pt-12">
            <h2 className="text-[15px] font-medium text-[var(--color-fg)]">Compare plans</h2>
            <div className="mt-5">
              <PricingComparisonTable
                plans={pricing.data.plans}
                rows={buildComparisonMatrix(pricing.data.plans, pricing.data.features)}
                featuredIndex={resolveFeaturedPlanIndex(pricing.data.plans)}
              />
            </div>
          </section>

          <section className="mt-16 border-t border-[var(--color-border)] pt-12">
            <h2 className="text-[15px] font-medium text-[var(--color-fg)]">FAQ</h2>
            <dl className="mt-5 divide-y divide-[var(--color-border)]">
              {FAQ.map((item) => (
                <div key={item.q} className="py-4 first:pt-0 last:pb-0">
                  <dt className="text-[13px] font-medium text-[var(--color-fg)]">{item.q}</dt>
                  <dd className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
                    {item.a}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}
    </PricingLayout>
  );
}

function PricingLayout({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const authed = !!auth.token;
  const me = useMe();
  const workspaces = useWorkspaces();
  const workspace =
    workspaces.data?.find((w) => w.is_personal) ?? workspaces.data?.[0] ?? null;
  const signedIn = authed && me.isSuccess;

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="border-b border-[var(--color-border)]">
        <div className="mx-auto flex h-14 max-w-[960px] items-center justify-between px-6">
          <Link
            to="/"
            className="text-[13px] text-[var(--color-fg-muted)] no-underline hover:text-[var(--color-fg)]"
          >
            Home
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {signedIn && workspace ? (
              <Button
                variant="default"
                size="sm"
                onClick={() => nav({ to: "/$wid/monitors", params: { wid: workspace.slug } })}
              >
                Dashboard
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => nav({ to: "/login" })}>
                  Sign in
                </Button>
                <Button variant="default" size="sm" onClick={() => nav({ to: "/signup" })}>
                  Get started
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[960px] px-6 pb-20">{children}</main>
    </div>
  );
}

function PricingHeroActions() {
  const authed = !!auth.token;
  const me = useMe();
  const workspaces = useWorkspaces();
  const workspace = workspaces.data?.find((w) => w.is_personal) ?? workspaces.data?.[0] ?? null;
  const signedIn = authed && me.isSuccess && workspace;

  if (!signedIn) return null;

  return (
    <p className="mt-4 text-[13px] text-[var(--color-fg-muted)]">
      Already on a plan?{" "}
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

function PlanTierCard({
  plan,
  catalog,
}: {
  plan: PublicPricingPlan;
  catalog: PublicPricingFeature[];
}) {
  const nav = useNavigate();
  const cta = usePlanCta(plan);
  const bullets = planHeadlineBullets(plan, catalog, 5);
  const price = formatPlanPrice(plan.price);
  const secondary = plan.price?.secondary_text;
  const free = isFreePlan(plan);

  return (
    <article className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[16px] font-medium tracking-tight text-[var(--color-fg)]">
            {plan.name}
          </h2>
          {plan.description && (
            <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--color-fg-muted)]">
              {plan.description}
            </p>
          )}
        </div>
        {free && (
          <span className="mono shrink-0 text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
            Free
          </span>
        )}
      </div>

      <div className="mt-5 border-b border-[var(--color-border)] pb-5">
        <PriceBlock
          free={free}
          price={plan.price}
          formatted={price}
          secondary={secondary}
        />
      </div>

      {bullets.length > 0 && (
        <ul className="mt-4 flex-1 space-y-2">
          {bullets.map((row) => (
            <li
              key={row.featureId}
              className="flex items-start justify-between gap-3 text-[12px]"
            >
              <span className="flex min-w-0 items-start gap-2 text-[var(--color-fg-muted)]">
                <Check size={12} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
                <span>{row.label}</span>
              </span>
              {row.planFeature.secondary_text && (
                <span className="mono shrink-0 text-[10px] uppercase tracking-[0.06em] text-[var(--color-fg-dim)]">
                  {row.planFeature.secondary_text}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="default"
        size="default"
        className="mt-6 w-full"
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
  const workspace = workspaces.data?.find((w) => w.is_personal) ?? workspaces.data?.[0] ?? null;
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

function PriceBlock({
  free,
  price,
  formatted,
  secondary,
}: {
  free: boolean;
  price?: PublicPlanPrice | null;
  formatted: string | null;
  secondary?: string | null;
}) {
  if (free || (!formatted && (price?.amount ?? 0) === 0)) {
    return (
      <div>
        <div className="tabular text-[32px] font-medium leading-none tracking-tight text-[var(--color-fg)]">
          $0
        </div>
        <div className="mt-1.5 text-[12px] text-[var(--color-fg-dim)]">No credit card required</div>
      </div>
    );
  }

  if (price?.amount != null && !price.primary_text) {
    return (
      <div>
        <div className="flex items-end gap-1.5">
          <span className="tabular text-[32px] font-medium leading-none tracking-tight text-[var(--color-fg)]">
            ${Number.isInteger(price.amount) ? price.amount : price.amount.toFixed(2)}
          </span>
          {price.interval && (
            <span className="mono mb-1 text-[11px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
              / {price.interval}
            </span>
          )}
        </div>
        {secondary && (
          <div className="mt-1.5 text-[12px] text-[var(--color-fg-dim)]">{secondary}</div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="tabular text-[32px] font-medium leading-none tracking-tight text-[var(--color-fg)]">
        {formatted}
      </div>
      {secondary && <div className="mt-1.5 text-[12px] text-[var(--color-fg-dim)]">{secondary}</div>}
    </div>
  );
}

function PricingSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="shimmer h-[280px] rounded-[var(--radius-lg)]" />
      ))}
    </div>
  );
}
