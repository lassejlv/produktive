import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "#/lib/toast";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Input } from "../components/Input";
import { Spinner } from "#/components/ui/spinner";
import { useAdminWorkspaceUsage, useResetWorkspaceUsage } from "../lib/queries";
import { lastSeen } from "../lib/status";
import type { AdminWorkspaceUsage } from "../lib/types";

export const Route = createFileRoute("/_authed/$wid/admin/usage")({
  staticData: {
    title: "Admin",
    description: "Inspect and reset a workspace's billing usage in Polar and on the platform.",
  },
  component: UsageAdminPage,
});

function UsageAdminPage() {
  const [input, setInput] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const usage = useAdminWorkspaceUsage(target);
  const reset = useResetWorkspaceUsage();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = input.trim();
    setTarget(next || null);
  }

  function doReset() {
    if (!target) return;
    reset.mutate(target, {
      onSuccess: (result) => {
        toast.success(
          `Reset usage: ${formatNumber(result.events_consumed_before)} → ${formatNumber(
            result.events_consumed_after,
          )} events${result.polar_event_ingested ? " (Polar corrected)" : " (Polar correction skipped)"}`,
        );
        setConfirmOpen(false);
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <Input
          label="Workspace"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="slug or UUID"
          className="min-w-[260px]"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={!input.trim()}>
          <Search size={14} /> Load usage
        </Button>
      </form>

      {!target ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-10 text-center text-[13px] text-[var(--color-fg-muted)]">
          Enter a workspace slug or UUID to inspect its billing usage.
        </div>
      ) : usage.isLoading ? (
        <div className="flex h-40 items-center justify-center text-[13px] text-[var(--color-fg-muted)]">
          <Spinner className="size-3.75" />
          <span className="ml-2">loading usage...</span>
        </div>
      ) : usage.isError ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-6 text-center text-[13px] text-[var(--color-err)]">
          {(usage.error as Error).message}
        </div>
      ) : usage.data ? (
        <UsagePanel
          data={usage.data}
          onReset={() => setConfirmOpen(true)}
          resetPending={reset.isPending}
        />
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!reset.isPending) setConfirmOpen(open);
        }}
        title={`Reset usage for "${usage.data?.workspace_name ?? target}"?`}
        description="This zeroes the current period's billing-events usage in Polar (via a compensating event) and stops the platform from counting this period's prior checks toward the plan limit. Monitor history is preserved. Because billing is per owner account, this affects every workspace that owner has. This cannot be undone."
        confirmLabel="Reset usage"
        destructive
        pending={reset.isPending}
        onConfirm={doReset}
      />
    </div>
  );
}

function UsagePanel({
  data,
  onReset,
  resetPending,
}: {
  data: AdminWorkspaceUsage;
  onReset: () => void;
  resetPending: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 shadow-[var(--shadow-sm)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-medium text-[var(--color-fg)]">{data.workspace_name}</h2>
            <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
              {data.plan}
            </span>
          </div>
          <div className="mono mt-1 text-[11px] text-[var(--color-fg-muted)]">{data.workspace_slug}</div>
          {!data.is_billing_customer && (
            <div className="mt-2 text-[11px] text-[var(--color-fg-muted)]">
              Billing customer: <span className="mono">{data.billing_workspace_id}</span> (owner's
              personal workspace)
            </div>
          )}
          {!data.billing_enabled && (
            <div className="mt-2 text-[11px] text-[var(--color-warn)]">
              Billing is disabled on this deployment — reset is unavailable.
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={resetPending || !data.billing_enabled}
          onClick={onReset}
        >
          {resetPending ? <Spinner className="size-3" /> : <RotateCcw size={14} />}
          Reset usage
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <UsageTile
          label="Events (this period)"
          used={data.events_used}
          included={data.events_included}
          overage={data.events_overage_allowed}
        />
        <UsageTile label="Monitors" used={data.monitors_used} included={data.monitors_included} />
        <UsageTile label="Members" used={data.members_used} included={data.members_included} />
      </div>

      <div className="grid grid-cols-1 gap-3 text-[12px] text-[var(--color-fg-muted)] sm:grid-cols-2">
        <Meta label="Period ends" value={data.current_period_end ? lastSeen(data.current_period_end) : "—"} />
        <Meta
          label="Last reset"
          value={data.usage_reset_at ? lastSeen(data.usage_reset_at) : "never"}
        />
      </div>
    </div>
  );
}

function UsageTile({
  label,
  used,
  included,
  overage,
}: {
  label: string;
  used: number;
  included: number | null;
  overage?: boolean;
}) {
  const limit = included == null ? "∞" : formatNumber(included);
  const over = included != null && !overage && used > included;
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3 shadow-[var(--shadow-sm)]">
      <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">{label}</div>
      <div className="tabular mt-1 text-[20px] font-medium text-[var(--color-fg)]">
        <span className={over ? "text-[var(--color-err)]" : undefined}>{formatNumber(used)}</span>
        <span className="text-[13px] text-[var(--color-fg-dim)]"> / {limit}</span>
      </div>
      {overage && <div className="mt-1 text-[10px] text-[var(--color-fg-dim)]">overage allowed</div>}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-2">
      <span className="text-[var(--color-fg-dim)]">{label}: </span>
      <span className="text-[var(--color-fg)]">{value}</span>
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}
