import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getPricingPlans, type PricingPlan } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});

type Tier = {
  name: string;
  tagline: string;
  price: string;
  cadence: string;
  features: { label: string; included: boolean }[];
  cta: string;
  emphasized?: boolean;
};

const PRO_FALLBACK = { price: "€10", cadence: "/ month" } as const;

const PRO_FEATURES: Tier["features"] = [
  { label: "100 AI messages per day", included: true },
  { label: "No issues limit", included: true },
  { label: "10 active projects", included: true },
  { label: "Unlimited members", included: true },
  { label: "Bring your own Skills & MCP Servers", included: true },
];

const FREE_TIER: Tier = {
  name: "Free",
  tagline: "For getting a feel for it.",
  price: "€0",
  cadence: "/ month",
  features: [
    { label: "10 AI messages per day", included: true },
    { label: "Up to 50 issues", included: true },
    { label: "2 active projects", included: true },
    { label: "Up to 5 members", included: true },
    { label: "Bring your own Skills & MCP Servers", included: false },
  ],
  cta: "Get started",
};

function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount / 100);
  } catch {
    return `€${(amount / 100).toFixed(amount % 100 === 0 ? 0 : 2)}`;
  }
}

function PricingPage() {
  const session = useSession();
  const isLoggedIn = Boolean(session.data);
  const ctaTo = isLoggedIn ? "/issues" : "/login";

  const [pro, setPro] = useState<PricingPlan | null>(null);

  useEffect(() => {
    let mounted = true;
    void getPricingPlans()
      .then((response) => {
        if (mounted) setPro(response.plans[0] ?? null);
      })
      .catch(() => {
        // fall through to fallback values
      });
    return () => {
      mounted = false;
    };
  }, []);

  const proTier: Tier = {
    name: pro?.name ?? "Pro",
    tagline: "For real work.",
    price: pro ? formatPrice(pro.priceAmount, pro.currency) : PRO_FALLBACK.price,
    cadence: pro?.recurringInterval
      ? `/ ${pro.recurringInterval}`
      : PRO_FALLBACK.cadence,
    features: PRO_FEATURES,
    cta: "Get started",
    emphasized: true,
  };

  const tiers: Tier[] = [FREE_TIER, proTier];

  return (
    <main className="relative isolate flex min-h-screen flex-col overflow-hidden bg-bg">
      <div className="bg-dotgrid" aria-hidden />

      <header className="absolute inset-x-0 top-4 z-20 px-4">
        <nav
          className={cn(
            "mx-auto flex max-w-[680px] items-center justify-between rounded-full border border-white/10 bg-bg/40 px-5 py-2.5 backdrop-blur-xl",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
          )}
        >
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-6 place-items-center rounded-md bg-fg text-[11px] font-semibold tracking-tight text-bg">
              P
            </span>
            <span className="text-[13px] font-medium tracking-tight text-fg">
              Produktive
            </span>
          </Link>
          <Link
            to={ctaTo}
            className="text-[12.5px] text-fg/70 transition-colors hover:text-fg"
          >
            {isLoggedIn ? "Open app" : "Sign in"}
          </Link>
        </nav>
      </header>

      <section className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16 pt-32">
        <div className="mb-10 text-center">
          <h1
            className="animate-fade-up text-balance text-[clamp(36px,5.5vw,56px)] font-semibold leading-[1.04] tracking-[-0.035em] text-fg"
            style={{ animationDelay: "60ms" }}
          >
            Simple pricing.
          </h1>
          <p
            className="animate-fade-up mx-auto mt-3 max-w-[420px] text-[14.5px] leading-[1.55] text-fg-muted"
            style={{ animationDelay: "120ms" }}
          >
            Start free. Upgrade when you outgrow it.
          </p>
        </div>

        <div className="grid w-full max-w-[760px] grid-cols-1 gap-4 md:grid-cols-2">
          {tiers.map((tier, index) => (
            <PricingCard
              key={tier.name}
              tier={tier}
              ctaTo={ctaTo}
              delay={180 + index * 80}
            />
          ))}
        </div>

        <p
          className="animate-fade-up mt-8 text-[12px] text-fg-faint"
          style={{ animationDelay: "360ms" }}
        >
          Plans renew monthly. Cancel anytime.
        </p>
        <p
          className="animate-fade-up mt-1 text-[11px] text-fg-faint"
          style={{ animationDelay: "400ms" }}
        >
          Prices localize to your currency at checkout.
        </p>
      </section>

      <footer className="relative z-10 px-7 pb-4 text-center text-[11px] text-fg/40">
        © 2026 Produktive
      </footer>
    </main>
  );
}

function PricingCard({
  tier,
  ctaTo,
  delay,
}: {
  tier: Tier;
  ctaTo: string;
  delay: number;
}) {
  return (
    <div
      className={cn(
        "animate-fade-up relative flex flex-col rounded-[14px] border bg-bg/60 p-6 backdrop-blur-md",
        tier.emphasized
          ? "border-fg/20 shadow-[0_18px_60px_rgba(255,255,255,0.04)]"
          : "border-border-subtle",
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {tier.emphasized ? (
        <span className="absolute -top-2.5 left-6 inline-flex h-5 items-center rounded-full border border-white/15 bg-bg px-2 text-[10.5px] uppercase tracking-[0.08em] text-fg-muted">
          Recommended
        </span>
      ) : null}

      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-medium text-fg">{tier.name}</h2>
          <p className="mt-0.5 text-[12.5px] text-fg-muted">{tier.tagline}</p>
        </div>
      </header>

      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="text-[36px] font-semibold tracking-[-0.03em] text-fg">
          {tier.price}
        </span>
        <span className="text-[13px] text-fg-faint">{tier.cadence}</span>
      </div>

      <ul className="mt-6 flex flex-col gap-2.5">
        {tier.features.map((feature) => (
          <li
            key={feature.label}
            className={cn(
              "flex items-start gap-2.5 text-[13px]",
              feature.included ? "text-fg" : "text-fg-faint",
            )}
          >
            <span
              className={cn(
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
                feature.included
                  ? "bg-fg/10 text-fg"
                  : "bg-transparent text-fg-faint",
              )}
              aria-hidden
            >
              {feature.included ? <CheckIcon /> : <DashIcon />}
            </span>
            <span
              className={cn(
                "leading-snug",
                feature.included ? "" : "line-through decoration-fg-faint/40",
              )}
            >
              {feature.label}
            </span>
          </li>
        ))}
      </ul>

      <Link
        to={ctaTo}
        className={cn(
          "mt-8 inline-flex h-10 items-center justify-center rounded-md text-[13px] font-medium transition-colors",
          tier.emphasized
            ? "bg-fg text-bg hover:bg-white"
            : "border border-border-subtle bg-transparent text-fg-muted hover:border-border hover:text-fg",
        )}
      >
        {tier.cta}
      </Link>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2.5 6l2.4 2.4 4.6-5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DashIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M3 6h6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
