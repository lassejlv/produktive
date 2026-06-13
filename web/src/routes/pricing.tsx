import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, X } from "lucide-react";
import { Button } from "../components/Button";
import { Spinner } from "../components/Spinner";
import { ThemeToggle } from "../components/ThemeToggle";
import { ApiError } from "../lib/api";
import { cn } from "../lib/cn";
import {
  buildPlanFeatureRows,
  formatPlanPrice,
  type PublicPlanPrice,
  type PublicPricingFeature,
  type PublicPricingPlan,
} from "../lib/pricing";
import { usePublicPricing } from "../lib/queries";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2 group">
      <span
        className="inline-block w-2 h-2 rounded-full transition-shadow duration-300 group-hover:shadow-[0_0_10px_color-mix(in_srgb,var(--color-accent)_55%,transparent)]"
        style={{ background: "var(--color-accent)" }}
      />
      <span className="text-[15px] font-semibold tracking-tight text-[var(--color-fg)]">
        unstatus
      </span>
    </Link>
  );
}

function featuredPlanIndex(plans: PublicPricingPlan[]): number {
  if (plans.length < 2) return -1;
  return 1;
}

function PricingPage() {
  const nav = useNavigate();
  const pricing = usePublicPricing();

  const unavailable = pricing.error instanceof ApiError && pricing.error.status === 503;
  const featured = pricing.data ? featuredPlanIndex(pricing.data.plans) : -1;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-bg)] relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.35]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0 31px, color-mix(in srgb, var(--color-border) 60%, transparent) 31px 32px), repeating-linear-gradient(90deg, transparent 0 31px, color-mix(in srgb, var(--color-border) 60%, transparent) 31px 32px)",
          maskImage: "radial-gradient(65% 50% at 50% 0%, black, transparent 82%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(50% 40% at 50% -5%, color-mix(in srgb, var(--color-accent) 14%, transparent), transparent 70%)",
        }}
      />

      <header className="relative z-10">
        <div className="max-w-[1080px] mx-auto px-6 h-16 flex items-center justify-between">
          <Wordmark />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => nav({ to: "/login" })}>
              Sign in
            </Button>
            <Button variant="primary" size="sm" onClick={() => nav({ to: "/signup" })}>
              Get started
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <section className="max-w-[1080px] mx-auto px-6 pt-20 pb-14 sm:pt-24 flex flex-col items-center text-center">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)] mb-4">
            Plans
          </p>
          <h1 className="text-[36px] sm:text-[48px] leading-[1.05] tracking-[-0.03em] font-medium text-[var(--color-fg)] max-w-[640px]">
            Pay for what you monitor.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[var(--color-fg-muted)] max-w-[520px]">
            Start free, scale when your stack grows. Every plan includes status pages, probe types,
            and the monitor DSL.
          </p>
        </section>

        <section className="max-w-[1080px] mx-auto px-6 pb-28">
          {pricing.isLoading && (
            <div className="flex items-center justify-center h-48 text-[13px] text-[var(--color-fg-muted)]">
              <Spinner size={16} />
              <span className="ml-2">Loading plans...</span>
            </div>
          )}

          {unavailable && (
            <EmptyPanel
              title="Pricing unavailable"
              body="Plans are not configured on this server yet."
            />
          )}

          {pricing.isError && !unavailable && (
            <EmptyPanel title="Could not load pricing" body={(pricing.error as Error).message} />
          )}

          {pricing.data && (
            <div
              className={cn(
                "grid gap-5 fade-in",
                pricing.data.plans.length === 1 && "max-w-[380px] mx-auto",
                pricing.data.plans.length === 2 && "sm:grid-cols-2 max-w-[760px] mx-auto",
                pricing.data.plans.length >= 3 && "sm:grid-cols-2 lg:grid-cols-3",
              )}
            >
              {pricing.data.plans.map((plan, index) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  catalog={pricing.data!.features}
                  featured={index === featured}
                  onGetStarted={() => nav({ to: "/signup" })}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="relative z-10 border-t border-[var(--color-border)]">
        <div className="max-w-[1080px] mx-auto px-6 h-14 flex items-center justify-between text-[12px] text-[var(--color-fg-dim)]">
          <Wordmark />
          <Link to="/" className="link">
            Back to home
          </Link>
        </div>
      </footer>
    </div>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-[480px] mx-auto rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-8 py-12 text-center shadow-[var(--shadow-md)]">
      <p className="text-[16px] font-medium text-[var(--color-fg)]">{title}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">{body}</p>
    </div>
  );
}

function PlanCard({
  plan,
  catalog,
  featured,
  onGetStarted,
}: {
  plan: PublicPricingPlan;
  catalog: PublicPricingFeature[];
  featured: boolean;
  onGetStarted: () => void;
}) {
  const price = formatPlanPrice(plan.price);
  const secondary = plan.price?.secondary_text;
  const rows = buildPlanFeatureRows(plan, catalog);

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-[var(--radius-xl)] border p-6 sm:p-7 transition-all duration-300",
        featured
          ? cn(
              "border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-border-hi))]",
              "bg-[color-mix(in_srgb,var(--color-accent)_5%,var(--color-bg-elev))]",
              "shadow-[var(--shadow-lg),0_0_0_1px_color-mix(in_srgb,var(--color-accent)_12%,transparent),0_20px_40px_-20px_color-mix(in_srgb,var(--color-accent)_25%,transparent)]",
              "lg:-translate-y-1",
            )
          : cn(
              "border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]",
              "hover:border-[var(--color-border-hi)] hover:shadow-[var(--shadow-md)]",
            ),
      )}
    >
      {featured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border-hi))] bg-[var(--color-bg-elev)] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-accent)] shadow-[var(--shadow-sm)]">
            Popular
          </span>
        </div>
      )}

      <div className="mb-6">
        <h2 className="text-[17px] font-medium text-[var(--color-fg)]">{plan.name}</h2>
        {plan.description && (
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-fg-muted)] min-h-[2.5rem]">
            {plan.description}
          </p>
        )}
      </div>

      <PriceBlock price={plan.price} formatted={price} secondary={secondary} featured={featured} />

      {rows.length > 0 && (
        <>
          <div className="my-6 h-px bg-[var(--color-border)]" />
          <ul className="space-y-3 flex-1">
            {rows.map((row) => (
              <li key={row.featureId} className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                    row.supported
                      ? featured
                        ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                        : "bg-[var(--color-bg-row)] text-[var(--color-fg-dim)]"
                      : "bg-[color-mix(in_srgb,var(--color-fg-dim)_12%,transparent)] text-[var(--color-fg-dim)]",
                  )}
                >
                  {row.supported ? (
                    <Check size={10} strokeWidth={2.5} />
                  ) : (
                    <X size={10} strokeWidth={2.5} />
                  )}
                </span>
                <span
                  className={cn(
                    "text-[13px] leading-snug",
                    row.supported ? "text-[var(--color-fg-muted)]" : "text-[var(--color-fg-dim)]",
                  )}
                >
                  <span className={row.supported ? "text-[var(--color-fg)]" : undefined}>
                    {row.label}
                  </span>
                  {row.supported && row.planFeature.secondary_text && (
                    <span className="text-[var(--color-fg-dim)]">
                      {" "}
                      {row.planFeature.secondary_text}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <Button
        type="button"
        variant={featured ? "primary" : "secondary"}
        size="md"
        onClick={onGetStarted}
        className={cn("mt-8 w-full", featured && "gap-2")}
      >
        Get started
        {featured && <ArrowRight size={14} />}
      </Button>
    </div>
  );
}

function PriceBlock({
  price,
  formatted,
  secondary,
  featured,
}: {
  price?: PublicPlanPrice | null;
  formatted: string | null;
  secondary?: string | null;
  featured: boolean;
}) {
  if (!formatted && !price?.amount) {
    return (
      <div>
        <div className="text-[34px] leading-none font-medium tracking-[-0.03em] text-[var(--color-fg)]">
          Free
        </div>
        <div className="mt-1.5 text-[12px] text-[var(--color-fg-dim)]">No credit card required</div>
      </div>
    );
  }

  if (price?.amount != null && !price.primary_text) {
    return (
      <div>
        <div className="flex items-end gap-1">
          <span
            className={cn(
              "tabular leading-none font-medium tracking-[-0.04em] text-[var(--color-fg)]",
              featured ? "text-[42px]" : "text-[36px]",
            )}
          >
            ${Number.isInteger(price.amount) ? price.amount : price.amount.toFixed(2)}
          </span>
          {price.interval && (
            <span className="mb-1 text-[13px] text-[var(--color-fg-dim)]">/ {price.interval}</span>
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
      <div
        className={cn(
          "tabular leading-none font-medium tracking-[-0.03em] text-[var(--color-fg)]",
          featured ? "text-[34px]" : "text-[28px]",
        )}
      >
        {formatted}
      </div>
      {secondary && (
        <div className="mt-1.5 text-[12px] text-[var(--color-fg-dim)]">{secondary}</div>
      )}
    </div>
  );
}
