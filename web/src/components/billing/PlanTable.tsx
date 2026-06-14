import { Button } from "../Button";
import { Spinner } from "../Spinner";
import {
  formatPlanPrice,
  minimumIntervalLabel,
  planActionLabel,
  summaryPlanItemText,
  type BillingPlanSummary,
} from "../../lib/billing";

export function PlanTable({
  plans,
  currentPlanId,
  currentPlan,
  isOwner,
  pendingPlanId,
  onSelect,
}: {
  plans: BillingPlanSummary[];
  currentPlanId: string | null;
  currentPlan?: BillingPlanSummary;
  isOwner: boolean;
  pendingPlanId?: string;
  onSelect: (plan: BillingPlanSummary) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]">
      <div className="grid grid-cols-[minmax(0,1fr)_100px_minmax(0,1.4fr)_100px] border-b border-[var(--color-border)] bg-[var(--color-bg-row)] px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)] max-md:hidden">
        <span>Plan</span>
        <span>Price</span>
        <span>Includes</span>
        <span className="text-right">Action</span>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {plans.map((plan) => {
          const current = plan.id === currentPlanId;
          const pending = pendingPlanId === plan.id;
          return (
            <PlanTableRow
              key={plan.id}
              plan={plan}
              current={current}
              isOwner={isOwner}
              pending={pending}
              actionLabel={currentPlan ? planActionLabel(currentPlan, plan) : "Change plan"}
              onSelect={() => onSelect(plan)}
            />
          );
        })}
      </div>
    </div>
  );
}

function PlanTableRow({
  plan,
  current,
  isOwner,
  pending,
  actionLabel,
  onSelect,
}: {
  plan: BillingPlanSummary;
  current: boolean;
  isOwner: boolean;
  pending: boolean;
  actionLabel: string;
  onSelect: () => void;
}) {
  const price = formatPlanPrice(plan.price);
  const interval =
    plan.price?.secondary_text ?? (plan.price?.interval ? `/${plan.price.interval}` : "");

  return (
    <div className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_100px_minmax(0,1.4fr)_100px] md:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-[var(--color-fg)]">{plan.name}</span>
          {current && (
            <span className="rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-accent)]">
              Current
            </span>
          )}
        </div>
        {plan.description && (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--color-fg-dim)] md:hidden">
            {plan.description}
          </p>
        )}
      </div>

      <div className="tabular text-[13px] text-[var(--color-fg)]">
        <span className="mr-2 text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)] md:hidden">
          Price
        </span>
        {price}
        {interval && <span className="text-[11px] text-[var(--color-fg-dim)]">{interval}</span>}
      </div>

      <div className="text-[12px] text-[var(--color-fg-muted)]">
        <span className="mr-2 text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)] md:hidden">
          Includes
        </span>
        {planHighlights(plan)}
      </div>

      <div className="flex justify-start md:justify-end">
        {isOwner && !current ? (
          <Button type="button" variant="subtle" size="sm" disabled={pending} onClick={onSelect}>
            {pending && <Spinner size={12} thickness={2} />}
            {actionLabel}
          </Button>
        ) : (
          <span className="text-[12px] text-[var(--color-fg-dim)]">{current ? "—" : ""}</span>
        )}
      </div>
    </div>
  );
}

function planHighlights(plan: BillingPlanSummary): string {
  const parts: string[] = [];
  const monitors = summaryPlanItemText(plan, "monitors");
  if (monitors !== "Not included") {
    parts.push(monitors === "Unlimited" ? "Unlimited monitors" : `${monitors} monitors`);
  }
  parts.push(`${minimumIntervalLabel(plan)} checks`);
  if (summaryPlanItemText(plan, "custom_domain") !== "Not included") {
    parts.push("Custom domain");
  }
  return parts.join(" · ");
}
