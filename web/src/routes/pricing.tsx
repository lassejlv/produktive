import { Link, createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type PricingPlan = {
  id: "free" | "basic";
  name: string;
  price: string;
  cadence: string;
  description: string;
  features: string[];
  cta: string;
  to: "/login" | "/workspace";
  featured?: boolean;
};

const plans: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    description: "For trying Produktive with the core workspace flow.",
    features: ["Issue tracking", "Workspace members", "Project views"],
    cta: "Start free",
    to: "/login",
  },
  {
    id: "basic",
    name: "Basic",
    price: "$5",
    cadence: "per month",
    description: "For small teams that want AI help without usage surprises.",
    features: ["Everything in Free", "350 AI credits monthly", "No overage billing"],
    cta: "Choose Basic",
    to: "/login",
    featured: true,
  },
];

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});

function PricingPage() {
  const session = useSession();
  const isLoggedIn = Boolean(session.data);

  return (
    <main className="relative isolate flex min-h-screen flex-col overflow-hidden bg-bg">
      <div aria-hidden className="absolute inset-0 -z-10">
        <img
          src="https://cdn.produktive.app/assets/landing.webp"
          alt=""
          decoding="async"
          fetchPriority="high"
          className="animate-ken-burns absolute inset-0 h-full w-full object-cover object-[center_65%]"
        />
        <div className="absolute inset-0 bg-linear-to-b from-bg/0 via-bg/15 to-bg" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 50%, transparent 0%, rgba(13,13,15,0.55) 100%)",
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
              to={isLoggedIn ? "/workspace" : "/login"}
              className="rounded-full px-3 py-1 text-[12.5px] text-fg/70 transition-colors hover:text-fg"
            >
              {isLoggedIn ? "Open app" : "Sign in"}
            </Link>
          </div>
        </nav>
      </header>

      <section className="relative z-10 flex flex-1 items-center justify-center px-6 pb-12 pt-24">
        <div className="w-full max-w-[760px] lg:-translate-y-[3%]">
          <div className="text-center">
            <h1 className="animate-fade-up text-balance text-[clamp(42px,7vw,84px)] font-semibold leading-[0.95] tracking-[-0.04em] text-fg">
              Pricing
            </h1>
            <p
              className="animate-fade-up mx-auto mt-4 max-w-[420px] text-pretty text-[16px] leading-[1.55] text-fg/80"
              style={{ animationDelay: "80ms" }}
            >
              Two plans. Basic includes 350 AI credits each month. No overage.
            </p>
          </div>

          <div
            className="animate-fade-up mt-8 grid gap-3 md:grid-cols-2"
            style={{ animationDelay: "160ms" }}
          >
            {plans.map((plan) => (
              <PricingCard
                key={plan.id}
                plan={{ ...plan, to: isLoggedIn ? "/workspace" : plan.to }}
              />
            ))}
          </div>
        </div>
      </section>

      <footer className="relative z-10 px-7 pb-4 text-center text-[11px] text-fg/40">
        © 2026 Produktive
      </footer>
    </main>
  );
}

function PricingCard({ plan }: { plan: PricingPlan }) {
  return (
    <article
      className={cn(
        "flex min-h-[300px] flex-col rounded-[10px] border border-white/10 bg-bg/55 p-5 text-fg backdrop-blur-xl",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
        plan.featured && "border-fg/20 bg-fg text-bg",
      )}
    >
      <div>
        <p className={cn("text-[13px] font-medium", plan.featured ? "text-bg/65" : "text-fg/60")}>
          {plan.name}
        </p>
        <div className="mt-4 flex items-end gap-2">
          <span className="text-[46px] font-semibold leading-none tracking-[-0.04em]">
            {plan.price}
          </span>
          <span className={cn("pb-1 text-[13px]", plan.featured ? "text-bg/60" : "text-fg/55")}>
            {plan.cadence}
          </span>
        </div>
      </div>

      <p className={cn("mt-4 text-[14px] leading-6", plan.featured ? "text-bg/70" : "text-fg/70")}>
        {plan.description}
      </p>

      <div className={cn("my-6 h-px", plan.featured ? "bg-bg/15" : "bg-white/10")} />

      <ul className="space-y-3">
        {plan.features.map((feature) => (
          <li
            key={feature}
            className={cn(
              "flex items-start gap-3 text-[13px]",
              plan.featured ? "text-bg/80" : "text-fg/75",
            )}
          >
            <span
              className={cn(
                "mt-2 block h-px w-4 shrink-0",
                plan.featured ? "bg-bg/35" : "bg-fg/35",
              )}
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-10">
        <Link
          to={plan.to}
          className={cn(
            "inline-flex h-10 w-full items-center justify-center rounded-[10px] border px-4 text-[13px] font-medium transition-colors",
            plan.featured
              ? "border-bg bg-bg text-fg hover:bg-bg/90"
              : "border-white/10 bg-fg text-bg hover:bg-white",
          )}
        >
          {plan.cta}
        </Link>
      </div>
    </article>
  );
}
