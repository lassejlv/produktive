import { createFileRoute, redirect } from "@tanstack/react-router";
import { CheckCircle2, PauseCircle, RefreshCw, ServerCog, Trash2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { Input } from "../components/Input";
import { Spinner } from "../components/Spinner";
import {
  adminRegionsQuery,
  meQuery,
  useAdminRegions,
  useDeleteAdminRegion,
  useUpdateAdminRegion,
} from "../lib/queries";
import { lastSeen } from "../lib/status";
import type { AdminRegion } from "../lib/types";

export const Route = createFileRoute("/_authed/$wid/settings/workers")({
  staticData: {
    title: "Settings",
    description: "Manage regional probe workers and monitor-region availability.",
  },
  beforeLoad: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me.is_admin) {
      throw redirect({ to: "/$wid", params: { wid: params.wid } });
    }
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

  if (regions.isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-[13px] text-[var(--color-fg-muted)]">
        <Spinner size={15} />
        <span className="ml-2">loading workers...</span>
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <EmptyState
        icon={ServerCog}
        title="No workers registered"
        description="Workers appear here after their first heartbeat."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric label="Regions" value={String(sorted.length)} />
        <Metric label="Enabled" value={String(sorted.filter((r) => r.enabled).length)} />
        <Metric label="Heartbeating" value={String(sorted.filter(isFresh).length)} />
      </div>

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
          <Button size="sm" variant="danger" disabled={pending} onClick={() => setEnabled(false)}>
            Disable
          </Button>
        ) : (
          <Button size="sm" variant="primary" disabled={pending} onClick={() => setEnabled(true)}>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3 shadow-[var(--shadow-sm)]">
      <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
        {label}
      </div>
      <div className="mt-1 text-[22px] font-medium text-[var(--color-fg)]">{value}</div>
    </div>
  );
}

function isFresh(region: AdminRegion) {
  if (!region.heartbeat_at) return false;
  return Date.now() - new Date(region.heartbeat_at).getTime() < 90_000;
}
