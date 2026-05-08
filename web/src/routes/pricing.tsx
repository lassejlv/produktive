import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { createBillingCheckout } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type PricingPlan = {
  id: string;
  name: string;
  price: number | null;
  pricingModel: string;
  cadence: string;
  checkoutEnabled?: boolean;
  description: string;
  recommended?: boolean;
  features: string[];
  limits: Record<string, string | number | boolean>;
  ai?: {
    usageLimit: string;
    modelAccess: string;
    models: string[];
  };
  integrations?: Record<string, string | boolean>;
  security?: Record<string, string | boolean>;
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
            <span className="text-[13px] font-medium tracking-tight text-fg">
              Produktive
            </span>
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

function PricingBody({
  data,
  isLoggedIn,
}: {
  data: PricingResponse;
  isLoggedIn: boolean;
}) {
  const tiered = data.plans.filter((plan) => plan.id !== "enterprise");

  return (
    <>
      <div
        className="animate-fade-up mt-14 grid gap-4 md:grid-cols-3"
        style={{ animationDelay: "160ms" }}
      >
        {tiered.map((plan) => (
          <PricingCard key={plan.id} plan={plan} isLoggedIn={isLoggedIn} />
        ))}
      </div>

      <section
        className="animate-fade-up mt-28"
        style={{ animationDelay: "260ms" }}
      >
        <SectionHeading eyebrow="Compare" title="What's in each plan" />
        <div className="mt-6">
          <ComparisonTable plans={tiered} />
        </div>
      </section>

      <section
        className="animate-fade-up mt-24 max-w-[620px]"
        style={{ animationDelay: "340ms" }}
      >
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

/* -------------------------------------------------------------------------- */
/*  Plan cards                                                                 */
/* -------------------------------------------------------------------------- */

const HIGHLIGHT_LIMIT = 5;

function PricingCard({
  plan,
  isLoggedIn,
}: {
  plan: PricingPlan;
  isLoggedIn: boolean;
}) {
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
      toast.error(
        error instanceof Error ? error.message : "Failed to start checkout",
      );
      setIsStartingCheckout(false);
    }
  };

  return (
    <article
      className={cn(
        "relative flex min-h-[420px] flex-col rounded-[10px] border bg-bg p-7 transition-colors",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        recommended
          ? "border-fg/[0.2] bg-fg/[0.018]"
          : "border-fg/[0.08] hover:border-fg/[0.14]",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13.5px] font-medium tracking-tight text-fg">
          {plan.name}
        </p>
        {recommended ? (
          <span className="text-[10.5px] tracking-tight text-fg/50">
            Recommended
          </span>
        ) : null}
      </div>

      <div className="mt-7 flex items-baseline gap-1.5">
        <span className="text-[46px] font-light leading-none tracking-[-0.04em] text-fg tabular-nums">
          {plan.price === null ? "Custom" : `$${plan.price}`}
        </span>
        <span className="pb-1 text-[12px] text-fg/50">{cadenceLabel(plan)}</span>
      </div>

      <p className="mt-3 text-[12.5px] leading-[1.55] text-fg/60">
        {plan.description}
      </p>

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
      ) : plan.id === "business" ? (
        <button type="button" disabled className={ctaClassName}>
          Coming later
        </button>
      ) : (
        <Link to={isLoggedIn ? "/" : "/login"} className={ctaClassName}>
          Start free
        </Link>
      )}
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*  Comparison table                                                           */
/* -------------------------------------------------------------------------- */

type Cell = string | number | boolean | null;

type ComparisonRow = {
  label: string;
  values: Record<string, Cell>;
};

type ComparisonGroup = {
  label: string;
  rows: ComparisonRow[];
};

function buildComparison(plans: PricingPlan[]): ComparisonGroup[] {
  const cell = (
    plan: PricingPlan,
    pick: (p: PricingPlan) => Cell | undefined,
  ): Cell => {
    const value = pick(plan);
    return value === undefined ? null : value;
  };

  const limit = (plan: PricingPlan, key: string): Cell =>
    cell(plan, (p) => p.limits?.[key]);

  return [
    {
      label: "Workspace",
      rows: [
        {
          label: "Workspaces",
          values: Object.fromEntries(plans.map((p) => [p.id, limit(p, "workspaces")])),
        },
        {
          label: "Members",
          values: Object.fromEntries(plans.map((p) => [p.id, limit(p, "members")])),
        },
        {
          label: "Active issues",
          values: Object.fromEntries(plans.map((p) => [p.id, limit(p, "activeIssues")])),
        },
        {
          label: "Projects",
          values: Object.fromEntries(plans.map((p) => [p.id, limit(p, "projects")])),
        },
        {
          label: "Notes",
          values: Object.fromEntries(plans.map((p) => [p.id, limit(p, "notes")])),
        },
        {
          label: "Encrypted notes",
          values: Object.fromEntries(plans.map((p) => [p.id, limit(p, "notesEncrypted")])),
        },
        {
          label: "Storage",
          values: Object.fromEntries(
            plans.map((p) => [
              p.id,
              p.limits?.storageGbPerUser !== undefined
                ? `${p.limits.storageGbPerUser} GB / user`
                : p.limits?.storageGb !== undefined
                  ? `${p.limits.storageGb} GB`
                  : null,
            ]),
          ),
        },
      ],
    },
    {
      label: "AI",
      rows: [
        {
          label: "Usage",
          values: Object.fromEntries(plans.map((p) => [p.id, p.ai?.usageLimit ?? null])),
        },
        {
          label: "Models",
          values: Object.fromEntries(
            plans.map((p) => [
              p.id,
              (p.ai?.models.length ?? 0) > 1 ? "Better models" : "Basic",
            ]),
          ),
        },
      ],
    },
    {
      label: "Integrations",
      rows: [
        {
          label: "API requests / mo.",
          values: Object.fromEntries(
            plans.map((p) => [
              p.id,
              p.limits?.apiRequestsPerUserPerMonth !== undefined
                ? `${formatNumber(p.limits.apiRequestsPerUserPerMonth)} / user`
                : limit(p, "apiRequestsPerMonth"),
            ]),
          ),
        },
        {
          label: "GitHub repos",
          values: Object.fromEntries(plans.map((p) => [p.id, limit(p, "githubRepositories")])),
        },
        {
          label: "GitHub auto-import",
          values: Object.fromEntries(
            plans.map((p) => [p.id, limit(p, "githubAutoImport")]),
          ),
        },
        {
          label: "Slack",
          values: Object.fromEntries(
            plans.map((p) => [p.id, p.integrations?.slack ?? null]),
          ),
        },
        {
          label: "Discord",
          values: Object.fromEntries(
            plans.map((p) => [p.id, p.integrations?.discord ?? null]),
          ),
        },
      ],
    },
    {
      label: "Security",
      rows: [
        {
          label: "Workspace 2FA requirement",
          values: Object.fromEntries(
            plans.map((p) => [p.id, p.security?.workspaceTwoFactorRequirement ?? false]),
          ),
        },
        {
          label: "Trusted devices",
          values: Object.fromEntries(
            plans.map((p) => [p.id, p.security?.trustedDevices ?? false]),
          ),
        },
        {
          label: "Audit log",
          values: Object.fromEntries(plans.map((p) => [p.id, p.security?.auditLog ?? false])),
        },
        {
          label: "Advanced roles",
          values: Object.fromEntries(
            plans.map((p) => [p.id, p.security?.advancedRoles ?? false]),
          ),
        },
        {
          label: "Security event history",
          values: Object.fromEntries(
            plans.map((p) => [p.id, p.security?.securityEvents ?? false]),
          ),
        },
      ],
    },
  ];
}

function ComparisonTable({ plans }: { plans: PricingPlan[] }) {
  const groups = buildComparison(plans);

  return (
    <div className="overflow-x-auto rounded-[10px] border border-fg/[0.08]">
      <table className="w-full min-w-[640px] table-fixed text-[12.5px]">
        <thead>
          <tr className="border-b border-fg/[0.06]">
            <th className="w-[34%] px-4 py-3.5 text-left text-[11.5px] font-medium text-fg/55">
              {/* */}
            </th>
            {plans.map((plan) => (
              <th
                key={plan.id}
                className="px-3 py-3.5 text-left text-[12.5px] font-medium tracking-tight text-fg/85"
              >
                {plan.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group, groupIdx) => (
            <GroupRows
              key={group.label}
              group={group}
              plans={plans}
              isFirst={groupIdx === 0}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  group,
  plans,
  isFirst,
}: {
  group: ComparisonGroup;
  plans: PricingPlan[];
  isFirst: boolean;
}) {
  return (
    <>
      <tr className={cn(!isFirst && "border-t border-fg/[0.05]")}>
        <td
          colSpan={plans.length + 1}
          className="px-4 pb-1.5 pt-4 text-[11px] font-medium tracking-tight text-fg/45"
        >
          {group.label}
        </td>
      </tr>
      {group.rows.map((row) => (
        <tr key={row.label} className="border-t border-fg/[0.05]">
          <td className="px-4 py-2.5 align-top text-fg/65">{row.label}</td>
          {plans.map((plan) => (
            <td key={plan.id} className="px-3 py-2.5 align-top">
              <CellValue value={row.values[plan.id]} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function CellValue({ value }: { value: Cell }) {
  if (value === null || value === undefined) {
    return <span className="text-fg-faint">—</span>;
  }
  if (value === true) {
    return (
      <span className="inline-flex size-4 items-center justify-center rounded-full bg-fg/10 text-fg/85">
        <CheckGlyph small />
      </span>
    );
  }
  if (value === false) {
    return <span className="text-fg-faint">—</span>;
  }
  if (typeof value === "number") {
    return <span className="text-fg/85 tabular-nums">{formatNumber(value)}</span>;
  }
  if (value === "unlimited") {
    return <span className="text-fg/85">Unlimited</span>;
  }
  if (value === "not included") {
    return <span className="text-fg-faint">—</span>;
  }
  return <span className="text-fg/85">{capitalize(value)}</span>;
}

/* -------------------------------------------------------------------------- */
/*  Atoms + helpers                                                            */
/* -------------------------------------------------------------------------- */

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

function formatNumber(value: number | string | boolean): string {
  if (typeof value === "boolean") return value ? "Included" : "—";
  if (typeof value === "string") return value;
  if (value >= 1000) {
    return value.toLocaleString();
  }
  return String(value);
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
