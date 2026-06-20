import { createFileRoute } from "@tanstack/react-router";
import { Check, Inbox, X } from "lucide-react";
import { useMemo } from "react";
import { toast } from "#/lib/toast";
import { cn } from "#/lib/cn";
import { Button } from "#/components/ui/button";
import { EmptyState } from "../components/EmptyState";
import { StatTile } from "../components/StatTile";
import {
  adminLogAccessRequestsQuery,
  useAdminLogAccessRequests,
  useDecideLogAccessRequest,
} from "../lib/queries";
import { lastSeen } from "../lib/status";
import type { AdminLogAccessRequest } from "../lib/types";

export const Route = createFileRoute("/_authed/$wid/admin/log-access")({
  staticData: {
    title: "Admin",
    description: "Review and approve workspace requests for the logs feature.",
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(adminLogAccessRequestsQuery),
  component: LogAccessAdminPage,
});

function LogAccessAdminPage() {
  const requests = useAdminLogAccessRequests();
  const decide = useDecideLogAccessRequest();

  const sorted = useMemo(
    () =>
      [...(requests.data ?? [])].sort((a, b) => {
        const rank = (s: string) => (s === "pending" ? 0 : 1);
        if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
        return b.requested_at.localeCompare(a.requested_at);
      }),
    [requests.data],
  );

  function setStatus(req: AdminLogAccessRequest, status: "approved" | "denied") {
    decide.mutate(
      { id: req.id, status },
      {
        onSuccess: () =>
          toast.success(
            status === "approved"
              ? `Approved logs for ${req.workspace_name}`
              : `Denied logs for ${req.workspace_name}`,
          ),
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  const loading = requests.isLoading;
  const pendingCount = sorted.filter((r) => r.status === "pending").length;
  const approvedCount = sorted.filter((r) => r.status === "approved").length;

  if (loading && !sorted.length) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile label="Requests" value="" loading />
          <StatTile label="Pending" value="" loading />
          <StatTile label="Approved" value="" loading />
        </div>
        <RequestsSkeleton />
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <EmptyState
        icon={Inbox}
        title="No access requests"
        description="When a workspace requests access to the logs feature, it shows up here for review."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Requests" value={String(sorted.length)} />
        <StatTile
          label="Pending"
          value={String(pendingCount)}
          sub={pendingCount ? "awaiting review" : "none waiting"}
          accent={pendingCount ? "var(--color-warn)" : undefined}
        />
        <StatTile
          label="Approved"
          value={String(approvedCount)}
          sub={`${sorted.length - approvedCount - pendingCount} denied`}
          accent="var(--color-ok)"
        />
      </div>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]">
        <div className="grid grid-cols-[minmax(160px,1fr)_minmax(180px,1fr)_110px_180px] border-b border-[var(--color-border)] bg-[var(--color-bg-row)] px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)] max-lg:hidden">
          <span>Workspace</span>
          <span>Requested by</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {sorted.map((req) => (
            <RequestRow
              key={req.id}
              req={req}
              onApprove={() => setStatus(req, "approved")}
              onDeny={() => setStatus(req, "denied")}
              pending={decide.isPending}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RequestRow({
  req,
  onApprove,
  onDeny,
  pending,
}: {
  req: AdminLogAccessRequest;
  onApprove: () => void;
  onDeny: () => void;
  pending: boolean;
}) {
  const approved = req.status === "approved";
  const denied = req.status === "denied";

  return (
    <div className="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[minmax(160px,1fr)_minmax(180px,1fr)_110px_180px] lg:items-center">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-[var(--color-fg)]">
          {req.workspace_name}
        </div>
        <div className="mono mt-0.5 truncate text-[11px] text-[var(--color-fg-muted)]">
          {req.workspace_slug}
        </div>
      </div>

      <div className="min-w-0 text-[12px] text-[var(--color-fg-muted)]">
        <div className="truncate text-[var(--color-fg)]">{req.requested_by_email ?? "—"}</div>
        <div className="mt-0.5 truncate">requested {lastSeen(req.requested_at)}</div>
      </div>

      <div>
        <StatusBadge status={req.status} />
      </div>

      <div className="flex justify-start gap-2 lg:justify-end">
        <Button
          size="sm"
          variant="default"
          disabled={pending || approved}
          onClick={onApprove}
        >
          <Check size={13} /> Approve
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending || denied}
          onClick={onDeny}
          aria-label={`Deny ${req.workspace_slug}`}
        >
          <X size={13} /> Deny
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AdminLogAccessRequest["status"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: {
      label: "Pending",
      cls: "border-[var(--color-warn)] text-[var(--color-warn)]",
    },
    approved: {
      label: "Approved",
      cls: "border-[var(--color-ok)] text-[var(--color-ok)]",
    },
    denied: {
      label: "Denied",
      cls: "border-[var(--color-err)] text-[var(--color-err)]",
    },
    unknown: {
      label: "Unknown",
      cls: "border-[var(--color-border)] text-[var(--color-fg-muted)]",
    },
  };
  const cfg = map[status] ?? map.unknown;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]",
        cfg.cls,
      )}
    >
      {cfg.label}
    </span>
  );
}

function RequestsSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]">
      <div className="grid grid-cols-[minmax(160px,1fr)_minmax(180px,1fr)_110px_180px] border-b border-[var(--color-border)] bg-[var(--color-bg-row)] px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)] max-lg:hidden">
        <span>Workspace</span>
        <span>Requested by</span>
        <span>Status</span>
        <span className="text-right">Actions</span>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[minmax(160px,1fr)_minmax(180px,1fr)_110px_180px] lg:items-center"
          >
            <div className="space-y-1.5">
              <div className="shimmer h-3.5 w-32 rounded-[var(--radius-sm)]" />
              <div className="shimmer h-2.5 w-20 rounded-[var(--radius-sm)]" />
            </div>
            <div className="space-y-1.5">
              <div className="shimmer h-3 w-36 rounded-[var(--radius-sm)]" />
              <div className="shimmer h-2.5 w-24 rounded-[var(--radius-sm)]" />
            </div>
            <div className="shimmer h-5 w-16 rounded-full" />
            <div className="flex gap-2 lg:justify-end">
              <div className="shimmer h-7 w-20 rounded-[var(--radius-md)]" />
              <div className="shimmer h-7 w-16 rounded-[var(--radius-md)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
