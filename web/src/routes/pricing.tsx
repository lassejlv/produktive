import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type PricingPlan = {
  id: string;
  name: string;
  price: number | null;
  pricingModel: string;
  cadence: string;
  description: string;
  recommended?: boolean;
  features: string[];
  ai?: {
    usageLimit: string;
    modelAccess: string;
    models: string[];
  };
};

type OverageTier = {
  id: string;
  name: string;
  price: number;
  pricingModel: string;
  description: string;
  appliesTo: string[];
  renews: boolean;
};

type AiPolicy = {
  publicLanguage: string;
  overagePolicy: string;
};

type ModelTier = {
  id: string;
  label: string;
  includedIn: string[];
  intendedUse: string;
};

type PricingResponse = {
  currency: string;
  positioning: string;
  plans: PricingPlan[];
  overageTiers: OverageTier[];
  aiLimitPolicy: AiPolicy;
  modelTiers: ModelTier[];
};

const PRICING_QUERY_KEY = ["pricing"] as const;

async function fetchPricing(): Promise<PricingResponse> {
  const response = await fetch("/api/pricing");
  if (!response.ok) {
    throw new Error("Failed to load pricing");
  }
  return response.json();
}

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
    <main className="relative isolate flex min-h-screen flex-col overflow-hidden bg-bg">
      <div aria-hidden className="absolute inset-0 -z-10">
        <img
          src="https://cdn.produktive.app/assets/landing.webp"
          alt=""
          decoding="async"
          fetchPriority="high"
          className="animate-ken-burns absolute inset-0 h-full w-full object-cover object-[center_65%] opacity-65"
        />
        <div className="absolute inset-0 bg-linear-to-b from-bg/30 via-bg/55 to-bg" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 30%, transparent 0%, rgba(0,0,0,0.55) 100%)",
          }}
        />
      </div>

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

      <section className="relative z-10 mx-auto w-full max-w-[1180px] flex-1 px-5 pb-24 pt-32 sm:px-8">
        <div className="animate-fade-up max-w-[640px]">
          <p className="text-[11.5px] font-medium tracking-tight text-fg/55">
            Pricing
          </p>
          <h1 className="mt-3 text-balance text-[clamp(40px,6.4vw,76px)] font-light leading-[0.98] tracking-[-0.04em] text-fg">
            Built for teams. Priced for growth.
          </h1>
          {pricingQuery.data ? (
            <p
              className="mt-5 max-w-[540px] text-pretty text-[14.5px] leading-[1.6] text-fg/70 animate-fade-up"
              style={{ animationDelay: "100ms" }}
            >
              {pricingQuery.data.positioning}
            </p>
          ) : null}
        </div>

        {pricingQuery.isPending ? (
          <div className="flex items-center justify-center py-32 text-fg/60">
            <Spinner size={20} />
          </div>
        ) : pricingQuery.isError ? (
          <p className="mt-12 rounded-[10px] border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] text-danger">
            Failed to load pricing. Please try again later.
          </p>
        ) : pricingQuery.data ? (
          <PricingBody data={pricingQuery.data} isLoggedIn={isLoggedIn} />
        ) : null}
      </section>

      <footer className="relative z-10 px-7 pb-5 text-center text-[11px] text-fg/40">
        © 2026 Produktive
      </footer>
    </main>
  );
}

function PricingBody({
  data,
  isLoggedIn,
}: {
  data: PricingResponse;
  isLoggedIn: boolean;
}) {
  const enterprise = data.plans.find((plan) => plan.id === "enterprise") ?? null;
  const tiered = data.plans.filter((plan) => plan.id !== "enterprise");

  return (
    <>
      <div
        className="animate-fade-up mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4"
        style={{ animationDelay: "180ms" }}
      >
        {tiered.map((plan) => (
          <PricingCard key={plan.id} plan={plan} isLoggedIn={isLoggedIn} />
        ))}
      </div>

      {enterprise ? (
        <div
          className="animate-fade-up mt-4"
          style={{ animationDelay: "260ms" }}
        >
          <EnterpriseCard plan={enterprise} />
        </div>
      ) : null}

      {data.overageTiers.length ? (
        <section
          className="animate-fade-up mt-20"
          style={{ animationDelay: "340ms" }}
        >
          <SectionHeading
            eyebrow="Boosts"
            title="When you need more"
            subtitle="Buy capacity explicitly. No surprise bills."
          />
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {data.overageTiers.map((tier) => (
              <BoostCard key={tier.id} tier={tier} />
            ))}
          </div>
        </section>
      ) : null}

      <section
        className="animate-fade-up mt-20 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
        style={{ animationDelay: "420ms" }}
      >
        <div>
          <SectionHeading eyebrow="AI usage" title="Predictable, never punitive" />
          <p className="mt-4 max-w-[420px] text-[13.5px] leading-[1.65] text-fg/70">
            {data.aiLimitPolicy.publicLanguage}
          </p>
          <p className="mt-3 max-w-[420px] text-[13px] leading-[1.6] text-fg-faint">
            {data.aiLimitPolicy.overagePolicy}
          </p>
        </div>

        <ModelTiers tiers={data.modelTiers} />
      </section>
    </>
  );
}

function PricingCard({
  plan,
  isLoggedIn,
}: {
  plan: PricingPlan;
  isLoggedIn: boolean;
}) {
  const recommended = plan.recommended === true;
  const ctaTo = isLoggedIn ? "/" : "/login";
  const ctaLabel = plan.id === "free" ? "Start free" : `Choose ${plan.name}`;

  return (
    <article
      className={cn(
        "relative flex min-h-[460px] flex-col overflow-hidden rounded-[14px] border bg-bg/70 p-5 text-fg backdrop-blur-2xl",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_36px_-20px_rgba(0,0,0,0.6)]",
        recommended ? "border-fg/30 bg-bg/85" : "border-white/10",
      )}
    >
      {recommended ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-fg/55 to-transparent"
        />
      ) : null}

      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-medium text-fg">{plan.name}</p>
        {recommended ? (
          <span className="rounded-full border border-fg/25 bg-fg/10 px-2 py-0.5 text-[10px] text-fg/80">
            Recommended
          </span>
        ) : null}
      </div>

      <div className="mt-5 flex items-end gap-1.5">
        <span className="text-[44px] font-light leading-none tracking-[-0.04em] text-fg">
          {plan.price === null ? "Custom" : `$${plan.price}`}
        </span>
        <span className="pb-1 text-[12px] text-fg/55">{cadenceLabel(plan)}</span>
      </div>

      <p className="mt-4 text-[13px] leading-[1.55] text-fg/70">{plan.description}</p>

      <div
        aria-hidden
        className="my-5 h-px bg-gradient-to-r from-white/15 via-white/5 to-transparent"
      />

      <ul className="space-y-2.5">
        {plan.features.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-2.5 text-[12.5px] leading-[1.5] text-fg/80"
          >
            <CheckGlyph />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {plan.ai ? (
        <p className="mt-5 text-[11.5px] leading-[1.5] text-fg-faint">
          <span className="text-fg/70">AI: </span>
          {plan.ai.modelAccess}
        </p>
      ) : null}

      <div className="mt-auto pt-6">
        <Link
          to={ctaTo}
          className={cn(
            "inline-flex h-9 w-full items-center justify-center rounded-[9px] px-4 text-[12.5px] font-medium transition-all duration-150",
            "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.4)]",
            recommended
              ? "bg-fg text-bg hover:bg-fg/90"
              : "border border-white/10 bg-fg/95 text-bg hover:bg-fg",
          )}
        >
          {ctaLabel}
        </Link>
      </div>
    </article>
  );
}

function EnterpriseCard({ plan }: { plan: PricingPlan }) {
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-[14px] border border-white/10 bg-bg/65 p-6 text-fg backdrop-blur-2xl",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_36px_-20px_rgba(0,0,0,0.6)]",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"
      />
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-fg">{plan.name}</p>
          <h3 className="mt-2 max-w-[640px] text-[20px] leading-[1.3] tracking-tight text-fg">
            {plan.description}
          </h3>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-fg/70">
            {plan.features.slice(0, 6).map((feature) => (
              <li key={feature} className="flex items-center gap-1.5">
                <CheckGlyph />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
        <a
          href="mailto:hello@produktive.app?subject=Enterprise%20inquiry"
          className={cn(
            "inline-flex h-10 items-center justify-center rounded-[9px] border border-white/15 px-5 text-[12.5px] font-medium text-fg transition-colors",
            "hover:border-white/30 hover:bg-white/5",
          )}
        >
          Talk to us →
        </a>
      </div>
    </article>
  );
}

function BoostCard({ tier }: { tier: OverageTier }) {
  return (
    <article
      className={cn(
        "relative flex flex-col gap-3 rounded-[12px] border border-white/10 bg-bg/55 p-4 backdrop-blur-2xl",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[12.5px] font-medium text-fg">{tier.name}</p>
        <span className="font-mono text-[11px] tabular-nums text-fg/55">
          {tier.renews ? "Recurring" : "One-time"}
        </span>
      </div>
      <div className="flex items-end gap-1.5">
        <span className="text-[28px] font-light leading-none tracking-[-0.03em] text-fg">
          ${tier.price}
        </span>
        <span className="pb-0.5 text-[11.5px] text-fg/55">{boostUnit(tier)}</span>
      </div>
      <p className="text-[12.5px] leading-[1.55] text-fg/70">{tier.description}</p>
      <p className="mt-auto text-[11px] text-fg-faint">
        For {humanList(tier.appliesTo)}
      </p>
    </article>
  );
}

function ModelTiers({ tiers }: { tiers: ModelTier[] }) {
  return (
    <div className="rounded-[12px] border border-white/10 bg-bg/55 p-5 backdrop-blur-2xl">
      <p className="text-[11.5px] font-medium text-fg-muted">Models by plan</p>
      <ul className="mt-3 divide-y divide-white/5">
        {tiers.map((tier) => (
          <li key={tier.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
            <span className="text-[12.5px] font-medium text-fg">{tier.label}</span>
            <span className="font-mono text-[10.5px] tabular-nums text-fg-faint">
              {tier.includedIn.map((p) => prettyPlanName(p)).join(" · ")}
            </span>
            <p className="basis-full text-[11.5px] leading-[1.5] text-fg/65">
              {tier.intendedUse}
            </p>
          </li>
        ))}
      </ul>
    </div>
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
      <p className="text-[11.5px] font-medium tracking-tight text-fg/55">{eyebrow}</p>
      <h2 className="mt-2 text-[24px] font-light leading-tight tracking-[-0.02em] text-fg">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-2 max-w-[420px] text-[13px] leading-[1.6] text-fg-faint">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg
      aria-hidden
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      className="mt-1 shrink-0 text-fg/45"
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

function boostUnit(tier: OverageTier): string {
  if (tier.pricingModel === "perUserAddOn") return "per user / month";
  if (tier.id === "weekly-boost") return "for 7 days";
  return "per month";
}

function humanList(values: string[]): string {
  if (values.length === 0) return "every plan";
  const named = values.map(prettyPlanName);
  if (named.length === 1) return named[0];
  if (named.length === 2) return `${named[0]} and ${named[1]}`;
  return `${named.slice(0, -1).join(", ")}, and ${named[named.length - 1]}`;
}

function prettyPlanName(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}
