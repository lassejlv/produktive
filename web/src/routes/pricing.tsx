import { Link, createFileRoute } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

type PricingPlan = {
  id: "free" | "basic";
  name: string;
  price: string;
  cadence: string;
  description: string;
  features: string[];
  cta: string;
  to: "/login";
  featured?: boolean;
  meta: string;
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
    meta: "No card",
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
    meta: "350 credits",
  },
];

export const Route = createFileRoute("/pricing")({
  loader: () => ({ plans }),
  component: PricingPage,
});

function PricingPage() {
  const { plans } = Route.useLoaderData();

  return (
    <main className="min-h-[100dvh] bg-[#fbfaf7] px-4 py-8 text-[#171412] sm:px-6 lg:px-8">
      <section className="mx-auto grid min-h-[calc(100dvh-4rem)] w-full max-w-5xl content-center gap-10">
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[#8a8378]">
            Produktive pricing
          </p>
          <h1 className="mt-4 text-[clamp(2.75rem,8vw,5.75rem)] font-semibold leading-[0.92] text-[#171412]">
            Simple plans.
            <br />
            No billing noise.
          </h1>
        </div>

        <div className="grid gap-3 md:grid-cols-2 md:gap-4">
          {plans.map((plan, index) => (
            <PricingCard key={plan.id} index={index} plan={plan} />
          ))}
        </div>
      </section>
    </main>
  );
}

function PricingCard({ index, plan }: { index: number; plan: PricingPlan }) {
  return (
    <article
      className={cn(
        "animate-fade-up flex min-h-[430px] flex-col rounded-[8px] border border-[#e8e3da] bg-white p-6 transition-[box-shadow,transform,border-color] duration-200 ease-out sm:p-8",
        "hover:-translate-y-0.5 hover:border-[#d8d1c5] hover:shadow-[0_2px_14px_rgba(23,20,18,0.045)]",
        plan.featured && "bg-[#fffdfa]",
      )}
      style={{ animationDelay: `${index * 90 + 80}ms` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-[#8a8378]">{plan.name}</p>
          <div className="mt-5 flex items-end gap-2">
            <span className="text-[54px] font-semibold leading-none tracking-[-0.055em] text-[#171412]">
              {plan.price}
            </span>
            <span className="pb-1.5 text-[13px] text-[#78716a]">{plan.cadence}</span>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em]",
            plan.featured ? "bg-[#edf3ec] text-[#346538]" : "bg-[#f7f4ee] text-[#82786a]",
          )}
        >
          {plan.meta}
        </span>
      </div>

      <p className="mt-7 max-w-[34ch] text-[15px] leading-6 text-[#5f5850]">{plan.description}</p>

      <div className="my-8 h-px bg-[#eee9e1]" />

      <ul className="space-y-3">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-3 text-[14px] text-[#34302b]">
            <span className="mt-2 block h-px w-4 shrink-0 bg-[#b8afa2]" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-10">
        <Link
          to={plan.to}
          className={cn(
            "inline-flex h-10 w-full items-center justify-center rounded-[6px] border px-4 text-[13px] font-medium transition-[background-color,color,transform,border-color] active:scale-[0.98]",
            plan.featured
              ? "border-[#171412] bg-[#171412] text-white hover:bg-[#34302b]"
              : "border-[#ded7cb] bg-[#fbfaf7] text-[#171412] hover:border-[#cfc6b8] hover:bg-white",
          )}
        >
          {plan.cta}
        </Link>
      </div>
    </article>
  );
}
