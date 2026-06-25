import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight, HardDrive, Lock, Server } from "lucide-react";
import { useMemo } from "react";
import { Button } from "#/components/ui/button";
import { EmptyState } from "../components/EmptyState";
import { Spinner } from "#/components/ui/spinner";
import { Skeleton } from "#/components/ui/skeleton";
import { cn } from "#/lib/cn";
import { DEPLOYMENTS_ENABLED } from "#/lib/features";
import { toast } from "#/lib/toast";
import {
  deployAccessQuery,
  useDeployAccess,
  useDeployAllVolumes,
  useDeployServices,
  useRequestDeployAccess,
} from "../lib/queries";
import type { DeployAccessStatus, DeployService, DeployServiceVolume } from "../lib/types";

export const Route = createFileRoute("/_authed/$wid/deployments/volumes")({
  staticData: {
    title: "Volumes",
    description: "Persistent storage attached to deployment services.",
    parent: { label: "Deployments", to: "/$wid/deployments" },
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(deployAccessQuery(params.wid)),
  component: DeployVolumesPage,
});

function DeployVolumesPage() {
  const { wid } = Route.useParams();

  if (!DEPLOYMENTS_ENABLED) {
    return (
      <EmptyState
        icon={Lock}
        title="Deployments not available"
        description="Docker deployments are not enabled in this build."
      />
    );
  }

  return <DeployVolumesContent wid={wid} />;
}

function DeployVolumesContent({ wid }: { wid: string }) {
  const access = useDeployAccess(wid);
  const approved = access.data?.status === "approved";
  const services = useDeployServices(wid, approved);
  const serviceIds = useMemo(() => (services.data ?? []).map((service) => service.id), [services.data]);
  const volumes = useDeployAllVolumes(wid, serviceIds, approved);

  const serviceById = useMemo(() => {
    const map = new Map<string, DeployService>();
    for (const service of services.data ?? []) {
      map.set(service.id, service);
    }
    return map;
  }, [services.data]);

  const sorted = useMemo(
    () =>
      [...volumes.data].sort((a, b) =>
        b.volume.created_at.localeCompare(a.volume.created_at),
      ),
    [volumes.data],
  );

  const totalGb = useMemo(
    () => sorted.reduce((sum, entry) => sum + entry.volume.size_gb, 0),
    [sorted],
  );

  return (
    <div className="relative">
      <div
        className={cn(
          "transition-opacity",
          !approved && "pointer-events-none select-none opacity-35 blur-[2px]",
        )}
        aria-hidden={!approved}
      >
        {!approved || services.isLoading || volumes.isLoading ? (
          <VolumeListSkeleton />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={HardDrive}
            title="No volumes"
            description="Attach persistent storage from a service's settings, then deploy to mount it on the next machine."
            action={
              services.data?.length ? (
                <Button
                  render={<Link to="/$wid/deployments" params={{ wid }} />}
                  type="button"
                  variant="default"
                  size="sm"
                >
                  <Server size={14} /> View services
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <VolumeStat label="Volumes" value={String(sorted.length)} />
              <VolumeStat label="Total storage" value={`${totalGb} GB`} />
              <VolumeStat
                label="Services with storage"
                value={String(new Set(sorted.map((entry) => entry.serviceId)).size)}
              />
            </div>

            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
                <div className="flex items-center gap-2">
                  <HardDrive size={14} className="text-[var(--color-fg-muted)]" />
                  <span className="text-[13px] font-medium text-[var(--color-fg)]">All volumes</span>
                  <span className="tabular text-[11px] text-[var(--color-fg-dim)]">
                    {sorted.length}
                  </span>
                </div>
              </div>

              <div className="divide-y divide-[var(--color-border)]">
                {sorted.map(({ volume, serviceId }) => {
                  const service = serviceById.get(serviceId);
                  return (
                    <VolumeListRow
                      key={volume.id}
                      wid={wid}
                      volume={volume}
                      service={service}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {access.isSuccess && !approved && (
        <RequestAccessOverlay wid={wid} status={access.data.status} />
      )}
    </div>
  );
}

function VolumeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3 shadow-[var(--shadow-xs)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-fg-dim)]">
        {label}
      </p>
      <p className="tabular mt-1 text-[20px] font-medium tracking-tight text-[var(--color-fg)]">
        {value}
      </p>
    </div>
  );
}

function VolumeListRow({
  wid,
  volume,
  service,
}: {
  wid: string;
  volume: DeployServiceVolume;
  service: DeployService | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[13px] font-medium text-[var(--color-fg)]">{volume.name}</p>
          <VolumeStatus status={volume.status} />
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--color-fg-muted)]">
          <span>{volume.size_gb} GB</span>
          <span>{volume.region}</span>
          <span className="mono">{volume.mount_path}</span>
          {volume.provider_volume_id && (
            <span className="mono">{volume.provider_volume_id.slice(0, 18)}</span>
          )}
        </div>
      </div>

      {service ? (
        <Link
          to="/$wid/deployments"
          params={{ wid }}
          search={{ service: service.id, tab: "settings" }}
          className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-2.5 py-1.5 text-[12px] text-[var(--color-fg-muted)] no-underline transition-colors hover:border-[var(--color-border-hi)] hover:text-[var(--color-fg)]"
        >
          <Server size={12} />
          <span className="max-w-[140px] truncate">{service.name}</span>
          <ChevronRight size={12} />
        </Link>
      ) : (
        <span className="text-[11px] text-[var(--color-fg-dim)]">Unknown service</span>
      )}
    </div>
  );
}

function VolumeStatus({ status }: { status: string }) {
  const active = status === "created";
  const tone = active
    ? "border-[color-mix(in_srgb,var(--color-ok)_35%,transparent)] text-[var(--color-ok)]"
    : status === "failed"
      ? "border-[color-mix(in_srgb,var(--color-err)_35%,transparent)] text-[var(--color-err)]"
      : "border-[color-mix(in_srgb,var(--color-warn)_35%,transparent)] text-[var(--color-warn)]";
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium uppercase",
        tone,
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function VolumeListSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-[72px] rounded-[var(--radius-lg)]" />
        ))}
      </div>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3.5 last:border-b-0"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-8 w-28 rounded-[var(--radius-md)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

function RequestAccessOverlay({ wid, status }: { wid: string; status: DeployAccessStatus }) {
  const request = useRequestDeployAccess(wid);
  const pending = status === "pending";
  const denied = status === "denied";
  const disabled = status === "disabled";

  const title = disabled
    ? "Deployments disabled"
    : pending
      ? "Access requested"
      : "Deployments private preview";
  const description = disabled
    ? "Deployments are disabled on this Produktive deployment."
    : pending
      ? "Your request is in review. Deployments unlock for this workspace once approved."
      : denied
        ? "Your previous request was declined. You can submit a new request for review."
        : "Request access to deploy HTTP services from Docker images.";

  return (
    <div className="absolute inset-0 z-10 flex items-start justify-center px-4 pt-8 sm:pt-16">
      <div className="w-full max-w-md overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-pop)]">
        <div className="h-1 bg-[linear-gradient(90deg,var(--color-accent)_0%,color-mix(in_srgb,var(--color-accent)_40%,transparent)_100%)]" />
        <div className="p-6 text-center sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-row)] text-[var(--color-fg-muted)]">
            <Lock size={20} />
          </div>
          <h2 className="mt-5 text-[17px] font-medium tracking-tight text-[var(--color-fg)]">
            {title}
          </h2>
          <p className="mt-2 text-[13px] leading-6 text-[var(--color-fg-muted)]">{description}</p>
          <div className="mt-6">
            {pending || disabled ? (
              <Button type="button" variant="secondary" size="sm" disabled>
                {disabled ? "Unavailable" : "Request pending"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={request.isPending}
                onClick={() =>
                  request.mutate(undefined, {
                    onSuccess: () => toast.success("Access requested"),
                    onError: (err) => toast.error((err as Error).message),
                  })
                }
              >
                {request.isPending && <Spinner className="size-3" />}
                Request access
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
