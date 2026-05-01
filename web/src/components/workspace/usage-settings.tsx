import { useEffect } from "react";
import { toast } from "sonner";
import { SettingsSkeleton } from "@/components/workspace/setting-row";
import { useBillingUsageQuery } from "@/lib/queries/billing";
import { cn } from "@/lib/utils";

export function UsageSettings() {
  const usageQuery = useBillingUsageQuery();
  const usage = usageQuery.data;

  useEffect(() => {
    if (usageQuery.error) {
      toast.error(usageQuery.error.message || "Failed to load usage");
    }
  }, [usageQuery.error]);

  if (usageQuery.isLoading || !usage) {
    return <SettingsSkeleton rows={5} />;
  }

  const maxDailyCredits = Math.max(1, ...usage.daily.map((day) => day.credits));
  const percentUsed =
    usage.includedCredits > 0
      ? Math.min(100, Math.round((usage.usedCredits / usage.includedCredits) * 100))
      : 0;

  return (
    <div className="space-y-8">
      <section className="border-b border-border-subtle pb-6">
        <div className="grid gap-px overflow-hidden rounded-[8px] border border-border-subtle bg-border-subtle md:grid-cols-4">
          <UsageMetric label="Plan" value={usage.planName} detail="Current workspace" />
          <UsageMetric
            label="Used"
            value={formatCredits(usage.usedCredits)}
            detail="Last 30 days"
          />
          <UsageMetric
            label="Included"
            value={formatCredits(usage.includedCredits)}
            detail={`${formatCredits(usage.remainingCredits)} left`}
          />
          <UsageMetric
            label="Overage"
            value={formatCredits(usage.overageCredits)}
            detail="Billed at €0.08 / credit"
          />
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-fg-faint">
            <span className="font-mono uppercase tracking-[0.08em]">Included credits</span>
            <span className="font-mono tabular-nums">{percentUsed}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-[3px] border border-border-subtle bg-surface-2">
            <div
              className={cn(
                "h-full transition-[width] duration-300",
                usage.overageCredits > 0 ? "bg-danger" : "bg-fg",
              )}
              style={{ width: `${percentUsed}%` }}
            />
          </div>
        </div>
      </section>

      <section className="border-b border-border-subtle pb-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h3 className="m-0 text-[13px] font-medium text-fg">Credit activity</h3>
            <p className="mt-1 text-[12px] text-fg-faint">
              Daily credits recorded by the billing engine.
            </p>
          </div>
          <div className="hidden font-mono text-[11px] text-fg-faint sm:block">
            {formatDate(usage.periodStart)} - {formatDate(usage.periodEnd)}
          </div>
        </div>

        <div className="flex h-[104px] items-end gap-1 border-b border-border-subtle pb-2">
          {usage.daily.map((day) => {
            const height = Math.max(3, Math.round((day.credits / maxDailyCredits) * 96));
            return (
              <div
                key={day.date}
                title={`${day.date}: ${formatCredits(day.credits)}`}
                className="flex min-w-0 flex-1 items-end"
              >
                <div
                  className={cn(
                    "w-full rounded-[2px] border border-border-subtle",
                    day.credits > 0 ? "bg-fg" : "bg-surface-2",
                  )}
                  style={{ height }}
                />
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h3 className="m-0 text-[13px] font-medium text-fg">Ingestion ledger</h3>
            <p className="mt-1 text-[12px] text-fg-faint">
              Local events queued for Polar usage billing.
            </p>
          </div>
          <div className="flex gap-2 font-mono text-[10.5px] text-fg-faint">
            <span>{usage.sentEvents} sent</span>
            <span>{usage.pendingEvents} pending</span>
            <span>{usage.failedEvents} failed</span>
          </div>
        </div>

        {usage.recent.length > 0 ? (
          <div className="overflow-hidden border border-border-subtle">
            <div className="grid grid-cols-[1fr_72px_82px] border-b border-border-subtle bg-surface-2 px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-fg-faint sm:grid-cols-[1fr_92px_92px_90px]">
              <span>Model</span>
              <span className="text-right">Credits</span>
              <span className="text-right">Status</span>
              <span className="hidden text-right sm:block">Source</span>
            </div>
            {usage.recent.map((event) => (
              <div
                key={event.id}
                className="grid grid-cols-[1fr_72px_82px] border-b border-border-subtle px-3 py-2 text-[12px] last:border-b-0 sm:grid-cols-[1fr_92px_92px_90px]"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-fg">{event.model}</div>
                  <div className="mt-0.5 font-mono text-[10.5px] text-fg-faint">
                    {formatDate(event.createdAt)} / {event.totalTokens.toLocaleString()} tokens
                  </div>
                </div>
                <div className="self-center text-right font-mono text-[12px] tabular-nums text-fg">
                  {event.credits.toLocaleString()}
                </div>
                <div className="self-center text-right">
                  <UsageStatus status={event.status} />
                </div>
                <div className="hidden self-center text-right font-mono text-[11px] text-fg-faint sm:block">
                  {event.usageSource}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-border-subtle bg-surface-2 px-3 py-8 text-center text-[12px] text-fg-muted">
            No AI credit usage has been recorded for this period.
          </div>
        )}
      </section>
    </div>
  );
}

function UsageMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="bg-bg px-4 py-3">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-faint">
        {label}
      </div>
      <div className="mt-2 text-[19px] font-semibold tracking-[-0.02em] text-fg">
        {value}
      </div>
      <div className="mt-0.5 text-[11.5px] text-fg-muted">{detail}</div>
    </div>
  );
}

function UsageStatus({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-[999px] px-2 py-0.5 font-mono text-[10.5px]",
        status === "sent"
          ? "bg-success/10 text-success"
          : status === "failed"
            ? "bg-danger/10 text-danger"
            : "bg-surface-2 text-fg-muted",
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function formatCredits(value: number) {
  return value.toLocaleString();
}

function formatDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}
