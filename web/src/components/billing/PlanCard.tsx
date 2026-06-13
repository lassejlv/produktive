import { Button } from "../Button";
import { Spinner } from "../Spinner";
import { cn } from "../../lib/cn";
import { formatPlanPrice, type BillingPlanSummary } from "../../lib/billing";

export function PlanCard({
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
    plan.price?.secondary_text ?? (plan.price?.interval ? `per ${plan.price.interval}` : "");

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border p-4 flex flex-col gap-3",
        current
          ? "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_6%,var(--color-bg-elev))]"
          : "border-[var(--color-border)] bg-[var(--color-bg-elev)]",
      )}
    >
      <div>
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-medium text-[var(--color-fg)]">{plan.name}</span>
          {current && (
            <span className="text-[10px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
              Current
            </span>
          )}
        </div>
        {plan.description && (
          <p className="mt-1.5 text-[12px] text-[var(--color-fg-muted)] line-clamp-3">
            {plan.description}
          </p>
        )}
      </div>
      <div className="text-[13px] text-[var(--color-fg)] tabular">
        {price}
        {interval ? <span className="text-[var(--color-fg-dim)]"> · {interval}</span> : null}
      </div>
      {plan.items && plan.items.length > 0 && (
        <div className="space-y-1.5">
          {plan.items.slice(0, 6).map((item) => (
            <div key={item.feature_id} className="text-[12px] text-[var(--color-fg-muted)]">
              {item.primary_text ?? item.feature_id}
              {item.secondary_text && (
                <span className="text-[var(--color-fg-dim)]">, {item.secondary_text}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {isOwner && !current && (
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={pending}
          onClick={onSelect}
          className="mt-auto"
        >
          {pending && <Spinner size={12} thickness={2} />}
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
