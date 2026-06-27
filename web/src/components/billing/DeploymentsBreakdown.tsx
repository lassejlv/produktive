import {
  featureNoun,
  formatCost,
  formatUsageNumber,
  summaryPlanItem,
  type BillingBalanceSummary,
  type BillingPlanSummary,
} from "../../lib/billing";

/** Pure-overage deploy resource meters, in bill-breakdown order. */
const DEPLOY_RESOURCES = [
  { feature: "deploy_memory", label: "Memory" },
  { feature: "deploy_cpu", label: "CPU" },
  { feature: "deploy_volume", label: "Volumes" },
] as const;

interface BreakdownRow {
  feature: string;
  label: string;
  quantity: string | null;
  rate: string | null;
  cost: number | null;
}

/** Plan overage rate for a meter, e.g. `$10.01 per GB-month` (drops "then "). */
function rateText(plan: BillingPlanSummary | undefined, feature: string): string | null {
  const raw = summaryPlanItem(plan, feature)?.primary_text;
  if (!raw) return null;
  return raw.replace(/^then\s+/i, "");
}

/**
 * Itemized deployments bill, inspired by Railway's usage breakdown: each
 * compute/storage meter shows the metered quantity, its rate, and the resulting
 * dollar cost, headlined by the period total.
 */
export function DeploymentsBreakdown({
  balances,
  currentPlan,
  periodText,
}: {
  balances: Record<string, BillingBalanceSummary | null>;
  currentPlan?: BillingPlanSummary;
  periodText: string;
}) {
  const rows: BreakdownRow[] = DEPLOY_RESOURCES.map(({ feature, label }) => {
    const balance = balances[feature];
    const usage = balance?.usage ?? null;
    const noun = featureNoun(feature);
    return {
      feature,
      label,
      quantity: usage != null ? `${formatUsageNumber(usage)}${noun ? ` ${noun}` : ""}` : null,
      rate: rateText(currentPlan, feature),
      cost: balance?.cost ?? null,
    };
  });

  const total = rows.reduce((sum, row) => sum + (row.cost ?? 0), 0);
  const cols =
    "grid-cols-[1fr_auto] gap-x-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1.5fr)_auto]";

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-xs)]">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
        <div>
          <h3 className="text-[14px] font-medium tracking-tight text-[var(--color-fg)]">
            Deployments usage
          </h3>
          <p className="mt-0.5 text-[12px] text-[var(--color-fg-muted)]">{periodText}</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
            This period
          </div>
          <div className="tabular mt-1 text-[22px] font-medium leading-none tracking-tight text-[var(--color-fg)]">
            {formatCost(total)}
          </div>
        </div>
      </header>

      <div className="px-5">
        <div
          className={`hidden py-2.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)] sm:grid ${cols}`}
        >
          <span>Resource</span>
          <span>Usage</span>
          <span>Rate</span>
          <span className="text-right">Cost</span>
        </div>

        <div className="divide-y divide-[var(--color-border)]">
          {rows.map((row) => (
            <div key={row.feature} className={`grid gap-y-1 py-3 sm:py-2.5 ${cols}`}>
              <span className="text-[13px] font-medium text-[var(--color-fg)]">{row.label}</span>
              <span className="tabular hidden text-[13px] text-[var(--color-fg-muted)] sm:block">
                {row.quantity ?? "—"}
              </span>
              <span className="tabular hidden text-[13px] text-[var(--color-fg-dim)] sm:block">
                {row.rate ?? "—"}
              </span>
              <span className="tabular text-right text-[13px] font-medium text-[var(--color-fg)]">
                {row.cost != null ? formatCost(row.cost) : "—"}
              </span>
              <span className="tabular col-span-2 text-[11px] text-[var(--color-fg-dim)] sm:hidden">
                {[row.quantity, row.rate].filter(Boolean).join(" · ") || "No usage yet"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
