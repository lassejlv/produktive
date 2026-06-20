import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, PauseCircle, RefreshCw, ServerCog, Trash2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "#/lib/toast";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { Input } from "../components/Input";
import { StatTile } from "../components/StatTile";
import {
  adminRegionsQuery,
  useAdminRegions,
  useDeleteAdminRegion,
  useUpdateAdminRegion,
} from "../lib/queries";
import { lastSeen } from "../lib/status";
import type { AdminRegion } from "../lib/types";

export const Route = createFileRoute("/_authed/$wid/admin/workers")({
  staticData: {
    title: "Admin",
    description: "Manage regional probe workers and monitor-region availability.",
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(adminRegionsQuery),
  component: WorkersAdminPage,
});

function WorkersAdminPage() {
  const regions = useAdminRegions();
  const update = useUpdateAdminRegion();
  const remove = useDeleteAdminRegion();
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [toDelete, setToDelete] = useState<AdminRegion | null>(null);

  const sorted = useMemo(
    () =>
      [...(regions.data ?? [])].sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.slug.localeCompare(b.slug);
      }),
    [regions.data],
  );

  function setName(region: AdminRegion) {
    const name = (editing[region.id] ?? region.name).trim();
    if (!name || name === region.name) return;
    update.mutate(
      { id: region.id, name },
      {
        onSuccess: () => {
          toast.success("Region renamed");
          setEditing((current) => {
            const next = { ...current };
            delete next[region.id];
            return next;
          });
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  function setEnabled(region: AdminRegion, enabled: boolean) {
    update.mutate(
      { id: region.id, enabled },
      {
        onSuccess: () => toast.success(enabled ? "Region enabled" : "Region disabled"),
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  function deleteRegion(region: AdminRegion) {
    remove.mutate(region.id, {
      onSuccess: () => {
        toast.success(`Worker ${region.slug} deleted`);
        setToDelete(null);
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  const loading = regions.isLoading;

  if (!loading && !sorted.length) {
    return (
      <EmptyState
        icon={ServerCog}
        title="No workers registered"
        description="Workers appear here after their first heartbeat."
      />
    );
  }

  const enabledCount = sorted.filter((r) => r.enabled).length;
  const freshCount = sorted.filter(isFresh).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Regions" value={String(sorted.length)} loading={loading} />
        <StatTile
          label="Enabled"
          value={String(enabledCount)}
          sub={`${sorted.length - enabledCount} disabled`}
          accent="var(--color-ok)"
          loading={loading}
        />
        <StatTile
          label="Heartbeating"
          value={String(freshCount)}
          sub={freshCount < enabledCount ? `${enabledCount - freshCount} stale` : "all fresh"}
          accent={freshCount < enabledCount ? "var(--color-warn)" : "var(--color-ok)"}
          loading={loading}
        />
      </div>

      {loading ? (
        <WorkersSkeleton />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]">
          <div className="grid grid-cols-[minmax(150px,1fr)_150px_120px_190px] border-b border-[var(--color-border)] bg-[var(--color-bg-row)] px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)] max-lg:hidden">
            <span>Region</span>
            <span>State</span>
            <span>Runtime</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {sorted.map((region) => (
              <RegionRow
                key={region.id}
                region={region}
                name={editing[region.id] ?? region.name}
                setName={(name) => setEditing((current) => ({ ...current, [region.id]: name }))}
                saveName={() => setName(region)}
                setEnabled={(enabled) => setEnabled(region, enabled)}
                onDelete={() => setToDelete(region)}
                pending={update.isPending || remove.isPending}
              />
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title={`Delete worker "${toDelete?.slug}"?`}
        description="The region is removed and unassigned from every monitor. Stop the worker process first, otherwise it re-registers on its next heartbeat. Historical check data is kept."
        confirmLabel="Delete worker"
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          if (toDelete) deleteRegion(toDelete);
        }}
      />
    </div>
  );
}

function RegionRow({
  region,
  name,
  setName,
  saveName,
  setEnabled,
  onDelete,
  pending,
}: {
  region: AdminRegion;
  name: string;
  setName: (name: string) => void;
  saveName: () => void;
  setEnabled: (enabled: boolean) => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const fresh = isFresh(region);
  const dirty = name.trim() !== region.name;

  return (
    <div className="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[minmax(150px,1fr)_150px_120px_190px] lg:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="mono text-[12px] font-medium text-[var(--color-fg)]">{region.slug}</span>
          <span className="rounded-full bg-[var(--color-bg-row)] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-muted)]">
            {region.capabilities.length} caps
          </span>
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            aria-label={`${region.slug} name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            className="h-8 text-[12px]"
          />
          <Button size="sm" variant="ghost" disabled={!dirty || pending} onClick={saveName}>
            Save
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[12px]">
        {region.enabled ? (
          <CheckCircle2 size={14} className="text-[var(--color-ok)]" />
        ) : (
          <PauseCircle size={14} className="text-[var(--color-fg-dim)]" />
        )}
        <span className="text-[var(--color-fg)]">{region.enabled ? "Enabled" : "Disabled"}</span>
      </div>

      <div className="text-[12px] text-[var(--color-fg-muted)]">
        <div className="flex items-center gap-2">
          {fresh ? (
            <RefreshCw size={13} className="text-[var(--color-ok)]" />
          ) : (
            <XCircle size={13} className="text-[var(--color-warn)]" />
          )}
          <span>{region.heartbeat_at ? lastSeen(region.heartbeat_at) : "No heartbeat"}</span>
        </div>
        {region.version && <div className="mono mt-1 text-[11px]">{region.version}</div>}
      </div>

      <div className="flex justify-start gap-2 lg:justify-end">
        {region.enabled ? (
          <Button size="sm" variant="destructive" disabled={pending} onClick={() => setEnabled(false)}>
            Disable
          </Button>
        ) : (
          <Button size="sm" variant="default" disabled={pending} onClick={() => setEnabled(true)}>
            Enable
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={onDelete}
          aria-label={`Delete worker ${region.slug}`}
        >
          <Trash2 size={13} />
        </Button>
      </div>
    </div>
  );
}

function WorkersSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]">
      <div className="grid grid-cols-[minmax(150px,1fr)_150px_120px_190px] border-b border-[var(--color-border)] bg-[var(--color-bg-row)] px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)] max-lg:hidden">
        <span>Region</span>
        <span>State</span>
        <span>Runtime</span>
        <span className="text-right">Actions</span>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[minmax(150px,1fr)_150px_120px_190px] lg:items-center"
          >
            <div className="space-y-2">
              <div className="shimmer h-3.5 w-28 rounded-[var(--radius-sm)]" />
              <div className="shimmer h-7 w-full rounded-[var(--radius-md)]" />
            </div>
            <div className="shimmer h-3.5 w-20 rounded-[var(--radius-sm)]" />
            <div className="space-y-1.5">
              <div className="shimmer h-3.5 w-24 rounded-[var(--radius-sm)]" />
              <div className="shimmer h-2.5 w-16 rounded-[var(--radius-sm)]" />
            </div>
            <div className="flex gap-2 lg:justify-end">
              <div className="shimmer h-7 w-16 rounded-[var(--radius-md)]" />
              <div className="shimmer h-7 w-7 rounded-[var(--radius-md)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function isFresh(region: AdminRegion) {
  if (!region.heartbeat_at) return false;
  return Date.now() - new Date(region.heartbeat_at).getTime() < 90_000;
}
