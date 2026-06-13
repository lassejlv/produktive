import { cn } from "../../lib/cn";
import {
  minimumIntervalLabel,
  nextResetText,
  summaryPlanItemText,
  usageNumbers,
  type BillingBalanceSummary,
  type BillingPlanSummary,
  type BillingSummary,
} from "../../lib/billing";

export function UsageCard({
  billing,
  currentPlan,
}: {
  billing: BillingSummary;
  currentPlan?: BillingPlanSummary;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-medium text-[var(--color-fg)]">Usage</h3>
        <span className="text-[11px] text-[var(--color-fg-dim)] tabular">
          {nextResetText(billing.balances.events)}
        </span>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 shadow-[var(--shadow-sm)]">
        <div className="space-y-5">
          <MeteredUsageRow label="Monitors" balance={billing.balances.monitors} />
          <MeteredUsageRow label="Members" balance={billing.balances.members} />
          <MeteredUsageRow
            label="Events"
            balance={billing.balances.events}
            hint="1 recorded check = 10 event units"
          />
        </div>

        <div className="my-4 h-px bg-[var(--color-border)]" />

        <div className="space-y-3">
          <CapabilityRow
            label="Custom domain"
            value={summaryPlanItemText(currentPlan, "custom_domain")}
          />
          <CapabilityRow label="Minimum check interval" value={minimumIntervalLabel(currentPlan)} />
        </div>
      </div>
    </div>
  );
}

function MeteredUsageRow({
  label,
  balance,
  hint,
}: {
  label: string;
  balance: BillingBalanceSummary | null | undefined;
  hint?: string;
}) {
  const usage = usageNumbers(balance);
  const width = usage.percent == null ? 0 : Math.min(100, Math.max(0, usage.percent));
  const highUsage = width >= 85;

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-medium text-[var(--color-fg)]">{label}</div>
          <div className="mt-0.5 text-[11px] text-[var(--color-fg-dim)]">
            {hint ?? usage.remainingText}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[13px] font-medium text-[var(--color-fg)] tabular">
            {usage.primaryText}
          </div>
          {hint && (
            <div className="mt-0.5 text-[11px] text-[var(--color-fg-dim)] tabular">
              {usage.remainingText}
            </div>
          )}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg-sunken)]">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            highUsage
              ? "bg-[var(--color-warn)]"
              : "bg-[color-mix(in_srgb,var(--color-accent)_82%,#fff_8%)]",
          )}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function CapabilityRow({ label, value }: { label: string; value: string }) {
  const supported = value !== "Not included";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12px] text-[var(--color-fg-muted)]">{label}</span>
      <span
        className={cn(
          "rounded-full px-2 py-1 text-[11px] font-medium",
          supported
            ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
            : "bg-[var(--color-bg-row)] text-[var(--color-fg-dim)]",
        )}
      >
        {value}
      </span>
    </div>
  );
}
