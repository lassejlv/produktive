import { Check, Minus } from "lucide-react";
import { cn } from "#/lib/cn";
import type { ComparisonRow, PublicPricingPlan } from "../../lib/pricing";

export function PricingComparisonTable({
  plans,
  rows,
  featuredIndex,
}: {
  plans: PublicPricingPlan[];
  rows: ComparisonRow[];
  featuredIndex: number;
}) {
  if (!rows.length || !plans.length) return null;

  const gridCols = `minmax(180px,1.35fr) repeat(${plans.length}, minmax(108px, 1fr))`;

  return (
    <div className="overflow-x-auto rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]">
      <div className="min-w-[680px]">
        <div
          className="grid border-b border-[var(--color-border)] px-4 py-3.5 sm:px-5"
          style={{ gridTemplateColumns: gridCols }}
        >
          <span className="self-end text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-fg-dim)]">
            Capability
          </span>
          {plans.map((plan, index) => {
            const featured = index === featuredIndex;
            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col items-center gap-1 rounded-[var(--radius-md)] px-2 py-2 text-center",
                  featured &&
                    "bg-[color-mix(in_srgb,var(--color-accent)_7%,var(--color-bg-row))] ring-1 ring-[color-mix(in_srgb,var(--color-accent)_28%,var(--color-border-hi))]",
                )}
              >
                {featured && (
                  <span className="mono text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--color-accent)]">
                    Recommended
                  </span>
                )}
                <span
                  className={cn(
                    "text-[13px] font-medium tracking-tight text-[var(--color-fg)]",
                    featured && "text-[var(--color-accent)]",
                  )}
                >
                  {plan.name}
                </span>
              </div>
            );
          })}
        </div>

        <div className="divide-y divide-[var(--color-border)]">
          {rows.map((row, rowIndex) => (
            <div
              key={row.featureId}
              className={cn(
                "grid px-4 py-3 sm:px-5",
                rowIndex % 2 === 1 && "bg-[color-mix(in_srgb,var(--color-bg-row)_35%,transparent)]",
              )}
              style={{ gridTemplateColumns: gridCols }}
            >
              <span className="self-center text-[13px] text-[var(--color-fg-muted)]">{row.label}</span>
              {row.cells.map((cell, index) => {
                const featured = index === featuredIndex;
                return (
                  <div
                    key={`${row.featureId}-${plans[index]?.id}`}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-center",
                      featured &&
                        "bg-[color-mix(in_srgb,var(--color-accent)_5%,transparent)]",
                    )}
                  >
                    {cell.supported ? (
                      <>
                        <Check
                          size={13}
                          className={cn(
                            "shrink-0",
                            featured ? "text-[var(--color-accent)]" : "text-[var(--color-ok)]",
                          )}
                        />
                        <span className="tabular text-[12px] font-medium text-[var(--color-fg)]">
                          {cell.text}
                        </span>
                      </>
                    ) : (
                      <>
                        <Minus size={13} className="shrink-0 text-[var(--color-fg-dim)]" />
                        <span className="sr-only">Not included</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
