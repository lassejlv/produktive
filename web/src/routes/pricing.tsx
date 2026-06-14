import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Code2, Globe2, Layers, Radio } from "lucide-react";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { MarketingShell } from "../components/marketing/MarketingShell";
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

const INCLUDED = [
  {
    icon: Layers,
    title: "Status pages",
    body: "Custom grouping, theming, and public slugs on every tier.",
  },
  {
    icon: Radio,
    title: "Six probe types",
    body: "HTTP, TCP, ICMP, Postgres, Redis, and SSH from regional workers.",
  },
  {
    icon: Code2,
    title: "Monitor-as-code",
    body: "DSL for probe config, schedules, and up / warn / down rules.",
  },
  {
    icon: Globe2,
    title: "Multi-region",
    body: "Run checks from distributed regions when your plan allows it.",
  },
];

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
  const nav = useNavigate();
  const authed = !!auth.token;

  return (
    <MarketingShell gridMask="pricing">
      <section className="mx-auto max-w-[1080px] px-6 pb-10 pt-14 sm:pt-20">
        <div className="pricing-rise max-w-[760px]">
          <p className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-accent)]">
            Pricing
          </p>
          <h1 className="mt-4 text-[40px] font-medium leading-[0.98] tracking-[-0.045em] text-[var(--color-fg)] sm:text-[56px]">
            Pay for what
            <span className="block text-[color-mix(in_srgb,var(--color-fg)_52%,var(--color-fg-muted))]">
              you monitor.
            </span>
          </h1>
          <p className="mt-5 max-w-[520px] text-[15px] leading-relaxed text-[var(--color-fg-muted)]">
            Start free, scale when your stack grows. Every tier ships status pages, probe types, and
            the monitor DSL — no separate alert builder required.
          </p>
          <PricingHeroActions />
        </div>
      </section>

      <section className="border-y border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-bg-elev)_72%,var(--color-bg))]">
        <div className="mx-auto max-w-[1080px] px-6 py-10 sm:py-12">
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
                <div className="pricing-rise mb-6 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-5 py-4 shadow-[var(--shadow-xs)]">
                  <div className="mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-warn)]">
                    Self-hosted mode
                  </div>
                  <p className="mt-2 max-w-[640px] text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
                    This server has no Polar billing configured, so billing and plan limits are
                    disabled.
                  </p>
                </div>
              )}

              <div
                className={cn(
                  "grid items-stretch gap-4 lg:gap-5",
                  pricing.data.plans.length === 1 && "mx-auto max-w-[380px]",
                  pricing.data.plans.length === 2 && "mx-auto max-w-[820px] sm:grid-cols-2",
                  pricing.data.plans.length >= 3 && "lg:grid-cols-3",
                )}
              >
                {pricing.data.plans.map((plan, index) => (
                  <PlanTierCard
                    key={plan.id}
                    plan={plan}
                    catalog={pricing.data!.features}
                    featured={index === resolveFeaturedPlanIndex(pricing.data!.plans)}
                    className={cn(
                      "pricing-rise",
                      index === 0 && "pricing-rise-1",
                      index === 1 && "pricing-rise-2",
                      index === 2 && "pricing-rise-3",
                    )}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {pricing.data && (
        <div className="pricing-rise pricing-rise-2 mx-auto max-w-[1080px] space-y-20 px-6 py-16 sm:py-20">
          <section>
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-[22px] font-medium tracking-tight text-[var(--color-fg)]">
                  Every plan includes
                </h2>
                <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">
                  Core monitoring primitives ship on every tier.
                </p>
              </div>
            </div>
            <div className="grid gap-px overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-2 lg:grid-cols-4">
              {INCLUDED.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="bg-[var(--color-bg-elev)] p-5 transition-colors hover:bg-[color-mix(in_srgb,var(--color-bg-row)_45%,var(--color-bg-elev))]"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                      <Icon size={16} />
                    </span>
                    <h3 className="mt-4 text-[14px] font-medium text-[var(--color-fg)]">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-fg-muted)]">
                      {item.body}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-6">
              <h2 className="text-[22px] font-medium tracking-tight text-[var(--color-fg)]">
                Compare plans
              </h2>
              <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">
                Limits, intervals, and perks side by side.
              </p>
            </div>
            <PricingComparisonTable
              plans={pricing.data.plans}
              rows={buildComparisonMatrix(pricing.data.plans, pricing.data.features)}
              featuredIndex={resolveFeaturedPlanIndex(pricing.data.plans)}
            />
          </section>

          <section className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
            <div>
              <h2 className="text-[22px] font-medium tracking-tight text-[var(--color-fg)]">
                Questions
              </h2>
              <p className="mt-2 max-w-[320px] text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
                Billing is workspace-scoped. Owners manage plans from Settings → Billing.
              </p>
              {!authed && (
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  className="mt-6 gap-2"
                  onClick={() => nav({ to: "/signup" })}
                >
                  Start free
                  <ArrowRight size={14} />
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {FAQ.map((item) => (
                <article
                  key={item.q}
                  className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 shadow-[var(--shadow-xs)]"
                >
                  <h3 className="text-[13px] font-medium leading-snug text-[var(--color-fg)]">
                    {item.q}
                  </h3>
                  <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-fg-muted)]">
                    {item.a}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </MarketingShell>
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
    <p className="mt-6 text-[13px] text-[var(--color-fg-muted)]">
      Already on a plan?{" "}
      <Link
        to="/$wid/settings/billing"
        params={{ wid: workspace.slug }}
        search={{ checkout: undefined }}
        className="text-[var(--color-link)] no-underline hover:underline"
      >
        Manage billing
      </Link>
    </p>
  );
}

function PlanTierCard({
  plan,
  catalog,
  featured,
  className,
}: {
  plan: PublicPricingPlan;
  catalog: PublicPricingFeature[];
  featured: boolean;
  className?: string;
}) {
  const nav = useNavigate();
  const cta = usePlanCta(plan);
  const bullets = planHeadlineBullets(plan, catalog, 5);
  const price = formatPlanPrice(plan.price);
  const secondary = plan.price?.secondary_text;
  const free = isFreePlan(plan);

  return (
    <article
      className={cn(
        "relative flex flex-col rounded-[var(--radius-xl)] border p-5 sm:p-6",
        featured
          ? "z-[1] border-[color-mix(in_srgb,var(--color-accent)_42%,var(--color-border-hi))] bg-[var(--color-bg-elev)] shadow-[var(--shadow-lg)] glow-up lg:-translate-y-1 lg:scale-[1.02]"
          : "border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      {featured && (
        <div className="absolute -top-3 left-5">
          <span className="mono rounded-full border border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border-hi))] bg-[var(--color-bg)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-accent)]">
            Recommended
          </span>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[18px] font-medium tracking-tight text-[var(--color-fg)]">
            {plan.name}
          </h2>
          {plan.description && (
            <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-[var(--color-fg-muted)]">
              {plan.description}
            </p>
          )}
        </div>
        {free && (
          <span className="mono shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-bg-row)] px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
            Free
          </span>
        )}
      </div>

      <div className="mt-6 border-b border-[var(--color-border)] pb-6">
        <PriceBlock
          free={free}
          price={plan.price}
          formatted={price}
          secondary={secondary}
          featured={featured}
        />
      </div>

      {bullets.length > 0 && (
        <ul className="mt-5 flex-1 space-y-2.5">
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
        variant={featured ? "primary" : "secondary"}
        size="md"
        className={cn("mt-7 w-full", featured && "gap-2")}
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
        {featured && cta.showArrow && <ArrowRight size={14} />}
      </Button>
    </article>
  );
}

function usePlanCta(plan: PublicPricingPlan): {
  label: string;
  to: "/signup" | "/$wid/monitors" | "/$wid/settings/billing";
  params?: { wid: string };
  showArrow: boolean;
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
      showArrow: !free,
    };
  }

  if (free) {
    return {
      label: "Open dashboard",
      to: "/$wid/monitors",
      params: { wid: workspace.slug },
      showArrow: false,
    };
  }

  return {
    label: "Manage billing",
    to: "/$wid/settings/billing",
    params: { wid: workspace.slug },
    showArrow: false,
  };
}

function PriceBlock({
  free,
  price,
  formatted,
  secondary,
  featured,
}: {
  free: boolean;
  price?: PublicPlanPrice | null;
  formatted: string | null;
  secondary?: string | null;
  featured: boolean;
}) {
  if (free || (!formatted && (price?.amount ?? 0) === 0)) {
    return (
      <div>
        <div
          className={cn(
            "tabular font-medium leading-none tracking-[-0.04em] text-[var(--color-fg)]",
            featured ? "text-[44px]" : "text-[38px]",
          )}
        >
          $0
        </div>
        <div className="mt-2 text-[12px] text-[var(--color-fg-dim)]">No credit card required</div>
      </div>
    );
  }

  if (price?.amount != null && !price.primary_text) {
    return (
      <div>
        <div className="flex items-end gap-1.5">
          <span
            className={cn(
              "tabular font-medium leading-none tracking-[-0.05em] text-[var(--color-fg)]",
              featured ? "text-[44px]" : "text-[38px]",
            )}
          >
            ${Number.isInteger(price.amount) ? price.amount : price.amount.toFixed(2)}
          </span>
          {price.interval && (
            <span className="mono mb-1.5 text-[12px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
              / {price.interval}
            </span>
          )}
        </div>
        {secondary && (
          <div className="mt-2 text-[12px] text-[var(--color-fg-dim)]">{secondary}</div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        className={cn(
          "tabular font-medium leading-none tracking-[-0.04em] text-[var(--color-fg)]",
          featured ? "text-[40px]" : "text-[34px]",
        )}
      >
        {formatted}
      </div>
      {secondary && <div className="mt-2 text-[12px] text-[var(--color-fg-dim)]">{secondary}</div>}
    </div>
  );
}

function PricingSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="shimmer h-[340px] rounded-[var(--radius-xl)]" />
      ))}
    </div>
  );
}
