import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { createBillingCheckout, fetchPricing, type PricingPlan, type PricingResponse } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const PRICING_QUERY_KEY = ["pricing"] as const;

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});

function PricingPage() {
  const session = useSession();
  const isLoggedIn = Boolean(session.data);
  const pricingQuery = useQuery({
    queryKey: PRICING_QUERY_KEY,
    queryFn: fetchPricing,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <main className="relative min-h-screen bg-bg text-fg">
      <header className="absolute inset-x-0 top-4 z-20 px-4">
        <nav
          className={cn(
            "animate-fade-up mx-auto flex max-w-[680px] items-center justify-between rounded-full border border-white/10 bg-bg/40 px-5 py-2.5 backdrop-blur-xl",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
          )}
        >
          <Link to="/" className="flex items-center gap-2.5">
            <div className="grid size-6 place-items-center rounded-md bg-fg text-[11px] font-semibold tracking-tight text-bg">
              P
            </div>
            <span className="text-[13px] font-medium tracking-tight text-fg">Produktive</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link
              to={isLoggedIn ? "/" : "/login"}
              className="rounded-full px-3 py-1 text-[12.5px] text-fg/70 transition-colors hover:text-fg"
            >
              {isLoggedIn ? "Open app" : "Sign in"}
            </Link>
          </div>
        </nav>
      </header>

      <section className="mx-auto w-full max-w-[1100px] px-6 pb-28 pt-32">
        <div className="animate-fade-up max-w-[620px]">
          <p className="text-[12px] tracking-tight text-fg/55">Pricing</p>
          <h1 className="mt-3 text-balance text-[clamp(38px,5.4vw,60px)] font-light leading-[1.02] tracking-[-0.035em] text-fg">
            Plans that scale with your team.
          </h1>
          {pricingQuery.data ? (
            <p
              className="animate-fade-up mt-5 max-w-[520px] text-pretty text-[14px] leading-[1.65] text-fg/65"
              style={{ animationDelay: "80ms" }}
            >
              {pricingQuery.data.positioning}
            </p>
          ) : null}
        </div>

        {pricingQuery.isPending ? (
          <div className="flex items-center justify-center py-32 text-fg/55">
            <Spinner size={20} />
          </div>
        ) : pricingQuery.isError ? (
          <p className="mt-12 rounded-[6px] border border-danger/30 bg-danger/[0.06] px-4 py-3 text-[13px] text-danger">
            Failed to load pricing. Please try again later.
          </p>
        ) : pricingQuery.data ? (
          <PricingBody data={pricingQuery.data} isLoggedIn={isLoggedIn} />
        ) : null}
      </section>

      <footer className="border-t border-fg/[0.06] py-6 text-center text-[11px] text-fg/40">
        © 2026 Produktive
      </footer>
    </main>
  );
}

function PricingBody({ data, isLoggedIn }: { data: PricingResponse; isLoggedIn: boolean }) {
  const tiered = data.plans.filter((plan) => plan.id !== "enterprise");

  return (
    <>
      <div
        className="animate-fade-up mt-14 grid gap-4 md:grid-cols-2"
        style={{ animationDelay: "160ms" }}
      >
        {tiered.map((plan) => (
          <PricingCard key={plan.id} plan={plan} isLoggedIn={isLoggedIn} />
        ))}
      </div>

      <section className="animate-fade-up mt-24 max-w-[620px]" style={{ animationDelay: "260ms" }}>
        <SectionHeading eyebrow="AI usage" title="Predictable, never punitive" />
        <p className="mt-4 text-[13.5px] leading-[1.65] text-fg/70">
          {data.aiLimitPolicy.publicLanguage}
        </p>
        <p className="mt-3 text-[13px] leading-[1.6] text-fg-faint">
          {data.aiLimitPolicy.overagePolicy}
        </p>
      </section>
    </>
  );
}

const HIGHLIGHT_LIMIT = 5;

function PricingCard({ plan, isLoggedIn }: { plan: PricingPlan; isLoggedIn: boolean }) {
  const recommended = plan.recommended === true;
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const features = plan.features.slice(0, HIGHLIGHT_LIMIT);
  const ctaClassName = cn(
    "mt-8 inline-flex h-9 items-center justify-center rounded-[5px] text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55",
    recommended
      ? "bg-fg text-bg hover:bg-fg/90"
      : "border border-fg/[0.12] text-fg hover:bg-fg/[0.04]",
  );

  const startCheckout = async () => {
    if (plan.id !== "pro") return;

    setIsStartingCheckout(true);
    try {
      const checkout = await createBillingCheckout("pro");
      window.location.assign(checkout.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start checkout");
      setIsStartingCheckout(false);
    }
  };

  return (
    <article
      className={cn(
        "relative flex min-h-[420px] flex-col rounded-[10px] border bg-bg p-7 transition-colors",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        recommended ? "border-fg/[0.2] bg-fg/[0.018]" : "border-fg/[0.08] hover:border-fg/[0.14]",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13.5px] font-medium tracking-tight text-fg">{plan.name}</p>
        {recommended ? (
          <span className="text-[10.5px] tracking-tight text-fg/50">Recommended</span>
        ) : null}
      </div>

      <div className="mt-7 flex items-baseline gap-1.5">
        <span className="text-[46px] font-light leading-none tracking-[-0.04em] text-fg tabular-nums">
          {plan.price === null ? "Custom" : `$${plan.price}`}
        </span>
        <span className="pb-1 text-[12px] text-fg/50">{cadenceLabel(plan)}</span>
      </div>

      <p className="mt-3 text-[12.5px] leading-[1.55] text-fg/60">{plan.description}</p>

      <ul className="mt-7 flex-1 space-y-2.5">
        {features.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-2 text-[12.5px] leading-[1.45] text-fg/80"
          >
            <CheckGlyph />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {plan.id === "pro" && plan.checkoutEnabled ? (
        isLoggedIn ? (
          <button
            type="button"
            onClick={startCheckout}
            disabled={isStartingCheckout}
            className={ctaClassName}
          >
            {isStartingCheckout ? "Starting checkout..." : "Upgrade to Pro"}
          </button>
        ) : (
          <Link to="/login" className={ctaClassName}>
            Sign in to upgrade
          </Link>
        )
      ) : (
        <Link to={isLoggedIn ? "/" : "/login"} className={ctaClassName}>
          Start free
        </Link>
      )}
    </article>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <p className="text-[11.5px] tracking-tight text-fg/50">{eyebrow}</p>
      <h2 className="mt-2 text-[24px] font-light leading-tight tracking-[-0.025em] text-fg">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-2 max-w-[420px] text-[13px] leading-[1.6] text-fg-faint">{subtitle}</p>
      ) : null}
    </div>
  );
}

function CheckGlyph({ small = false }: { small?: boolean }) {
  const size = small ? 9 : 11;
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      className={cn("shrink-0 text-fg/40", !small && "mt-1")}
    >
      <path
        d="M2.5 6.2 4.8 8.5 9.5 3.7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function cadenceLabel(plan: PricingPlan): string {
  if (plan.id === "free") return "forever";
  if (plan.pricingModel === "perUser") return "per user / month";
  if (plan.pricingModel === "workspace") return "per workspace / month";
  if (plan.pricingModel === "custom") return "custom contract";
  return plan.cadence;
}
