import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Globe,
  HardDrive,
  KeyRound,
  Lock,
  MapPin,
  MemoryStick,
  Network,
  Plus,
  Rocket,
  RotateCcw,
  ScrollText,
  Server,
  Settings,
  Square,
  Terminal,
  Trash2,
} from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ChartTooltip, Grid, Line, LineChart, XAxis } from "#/charts";
import { Button } from "#/components/ui/button";
import { ScrollArea } from "#/components/ui/scroll-area";
import { Skeleton } from "#/components/ui/skeleton";
import { Dialog, DialogClose, DialogContent } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { PageActions } from "../components/PageLayout";
import { Segmented } from "../components/Segmented";
import { Spinner } from "#/components/ui/spinner";
import { cn } from "#/lib/cn";
import { DEPLOYMENTS_ENABLED } from "#/lib/features";
import {
  DEPLOY_STATUS_COLOR,
  DEPLOY_STATUS_LABEL,
  deployStatusActive,
  deployStatusPending,
  lastSeen,
} from "#/lib/status";
import { toast } from "#/lib/toast";
import {
  deployAccessQuery,
  useCreateDeployCredential,
  useCreateDeployServiceVolume,
  useCreateDeployServiceDomain,
  useCreateDeployService,
  useCreateDeployment,
  useDeleteDeployService,
  useDeleteDeployServiceVolume,
  useDeployAccess,
  useDeployCredentials,
  useDeployEvents,
  useDeployLogs,
  useDeployMetrics,
  useDeployServiceDomains,
  useDeployServiceVolumes,
  useDeployServices,
  useDeployments,
  useDeleteDeployServiceDomain,
  useRequestDeployAccess,
  useRollbackDeployment,
  useStopDeployService,
  useUpdateDeployService,
  useVerifyDeployServiceDomain,
} from "../lib/queries";
import type {
  DeployAccessStatus,
  Deployment,
  DeployMetricPoint,
  DeployRegistryCredential,
  DeployRegistryKind,
  DeployResourcePreset,
  DeployServiceDomain,
  DeployService,
  DeployServiceVolume,
  DeployStatus,
} from "../lib/types";

type DetailTab = "deployments" | "events" | "logs" | "metrics" | "domains" | "settings";
type MetricChartKind = "cpu" | "memory" | "requests";

const RESOURCE_PRESETS: Array<{
  value: DeployResourcePreset;
  label: string;
  detail: string;
}> = [
  { value: "preview_small", label: "Small", detail: "1 shared CPU / 512 MB" },
  { value: "preview_medium", label: "Medium", detail: "1 shared CPU / 1 GB" },
  { value: "preview_large", label: "Large", detail: "2 shared CPUs / 2 GB" },
];

const fieldControlClass =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-hi)] bg-[var(--color-bg-elev)] px-3 text-[13px] text-[var(--color-fg)] shadow-[var(--shadow-xs)] outline-none transition-[border-color,box-shadow] focus:border-[var(--color-accent)] focus:shadow-[var(--ring-accent)]";

export const Route = createFileRoute("/_authed/$wid/deployments")({
  staticData: {
    title: "Deployments",
    description: "Private-preview Docker services with Fly-backed runtime, logs, and metrics.",
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(deployAccessQuery(params.wid)),
  component: DeploymentsIndexPage,
});

function DeploymentsIndexPage() {
  const { wid } = Route.useParams();
  const { serviceId } = useParams({ strict: false }) as { serviceId?: string };
  return <DeploymentsRoute wid={wid} serviceId={serviceId} />;
}

export function DeploymentsRoute({ wid, serviceId }: { wid: string; serviceId?: string }) {
  if (!DEPLOYMENTS_ENABLED) {
    return (
      <EmptyState
        icon={Lock}
        title="Deployments not available"
        description="Docker deployments are not enabled in this build."
      />
    );
  }

  return <DeploymentsContent wid={wid} selectedServiceId={serviceId ?? null} />;
}

function DeploymentsContent({
  wid,
  selectedServiceId,
}: {
  wid: string;
  selectedServiceId: string | null;
}) {
  const navigate = useNavigate();
  const access = useDeployAccess(wid);
  const approved = access.data?.status === "approved";
  const services = useDeployServices(wid, approved);
  const credentials = useDeployCredentials(wid, approved);
  const createService = useCreateDeployService(wid);
  const createCredential = useCreateDeployCredential(wid);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [credentialOpen, setCredentialOpen] = useState(false);

  const sorted = useMemo(
    () => [...(services.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [services.data],
  );
  const selected = selectedServiceId
    ? (sorted.find((service) => service.id === selectedServiceId) ?? null)
    : null;
  const isDetailView = selectedServiceId != null;

  return (
    <>
      {!isDetailView && (
        <PageActions>
          <div className="flex flex-wrap items-center gap-2">
            {approved && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCredentialOpen(true)}
                >
                  <KeyRound size={14} /> Registry credential
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => setServiceOpen(true)}
                >
                  <Plus size={14} /> New service
                </Button>
              </>
            )}
          </div>
        </PageActions>
      )}

      <div className={cn("relative", isDetailView && "fade-in mx-auto max-w-5xl px-6 py-7 lg:px-8")}>
        <div
          className={cn(
            "transition-opacity",
            !approved && "pointer-events-none select-none opacity-35 blur-[2px]",
          )}
          aria-hidden={!approved}
        >
          {!approved || services.isLoading ? (
            isDetailView ? (
              <ServiceDetailSkeleton />
            ) : (
              <ServiceGridSkeleton />
            )
          ) : isDetailView ? (
            selected ? (
              <ServiceDetailPage wid={wid} service={selected} />
            ) : (
              <ServiceNotFound wid={wid} />
            )
          ) : sorted.length === 0 ? (
            <EmptyState
              icon={Rocket}
              title="No deployment services"
              description="Create an HTTP service from a Docker image to start deploying."
              action={
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => setServiceOpen(true)}
                >
                  <Plus size={14} /> New service
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sorted.map((service) => (
                <ServiceCard key={service.id} wid={wid} service={service} />
              ))}
            </div>
          )}
        </div>

        {access.isSuccess && !approved && (
          <RequestAccessOverlay wid={wid} status={access.data.status} />
        )}
      </div>

      <CreateCredentialDialog
        open={credentialOpen}
        pending={createCredential.isPending}
        onOpenChange={(open) => {
          if (!open && createCredential.isPending) return;
          setCredentialOpen(open);
        }}
        onSubmit={(body) =>
          createCredential.mutate(body, {
            onSuccess: () => {
              toast.success("Registry credential saved");
              setCredentialOpen(false);
            },
            onError: (err) => toast.error((err as Error).message),
          })
        }
      />

      <CreateServiceDialog
        open={serviceOpen}
        credentials={credentials.data ?? []}
        pending={createService.isPending}
        onOpenChange={(open) => {
          if (!open && createService.isPending) return;
          setServiceOpen(open);
        }}
        onSubmit={(body) =>
          createService.mutate(body, {
            onSuccess: (service) => {
              toast.success("Service created");
              setServiceOpen(false);
              void navigate({
                to: "/$wid/deployments/$serviceId",
                params: { wid, serviceId: service.id },
              });
            },
            onError: (err) => toast.error((err as Error).message),
          })
        }
      />
    </>
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
    <div className="absolute inset-0 z-10 flex items-start justify-center px-4 pt-10 sm:pt-16">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-6 text-center shadow-[var(--shadow-pop)]">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-row)] text-[var(--color-fg-muted)]">
          <Lock size={18} />
        </div>
        <h2 className="mt-4 text-[16px] font-medium text-[var(--color-fg)]">{title}</h2>
        <p className="mt-2 text-[13px] leading-5 text-[var(--color-fg-muted)]">{description}</p>
        <div className="mt-5">
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
  );
}

function ServiceNotFound({ wid }: { wid: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <EmptyState
        icon={Server}
        title="Service not found"
        description="This deployment service does not exist in this workspace."
      />
      <Link
        to="/$wid/deployments"
        params={{ wid }}
        className="text-[13px] text-[var(--color-link)] no-underline hover:underline"
      >
        Back to deployments
      </Link>
    </div>
  );
}

function ServiceCard({ wid, service }: { wid: string; service: DeployService }) {
  const color = DEPLOY_STATUS_COLOR[service.status];
  const active = deployStatusActive(service.status);
  const pending = deployStatusPending(service.status);

  return (
    <Link
      to="/$wid/deployments/$serviceId"
      params={{ wid, serviceId: service.id }}
      className="group flex min-h-44 flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 text-left no-underline shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-row)]"
    >
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-block h-2 w-2 shrink-0 rounded-full",
                  active && "pulse-dot",
                  pending && "animate-pulse",
                )}
                style={{
                  background: color,
                  boxShadow: active
                    ? `0 0 10px color-mix(in srgb, ${color} 55%, transparent)`
                    : undefined,
                }}
              />
              <h2 className="truncate text-[15px] font-medium text-[var(--color-fg)]">
                {service.name}
              </h2>
            </div>
            <div className="mono mt-1 truncate text-[11px] text-[var(--color-fg-muted)]">
              {service.image}
            </div>
          </div>
          <StatusBadge status={service.status} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <MetaChip icon={MapPin} label={service.region} />
          <MetaChip label={service.environment} />
          <MetaChip label={`:${service.internal_port}`} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <CardMetric label="Compute" value={resourcePresetLabel(service.resource_preset)} />
        <CardMetric
          label="Health"
          value={service.health_check_path}
          mono
        />
        <div className="col-span-2 truncate text-[11px] text-[var(--color-fg-muted)]">
          {service.url
            ? service.url.replace(/^https?:\/\//, "")
            : `updated ${lastSeen(service.updated_at)}`}
        </div>
      </div>
    </Link>
  );
}

function ServiceDetailPage({ wid, service }: { wid: string; service: DeployService }) {
  const [tab, setTab] = useState<DetailTab>("deployments");
  const createDeployment = useCreateDeployment(wid);
  const rollback = useRollbackDeployment(wid);
  const stop = useStopDeployService(wid);
  const color = DEPLOY_STATUS_COLOR[service.status];
  const active = deployStatusActive(service.status);

  return (
    <>
      <Link
        to="/$wid/deployments"
        params={{ wid }}
        className="mb-5 inline-flex items-center gap-1.5 text-[12px] text-[var(--color-fg-muted)] no-underline hover:text-[var(--color-fg)]"
      >
        <ArrowLeft size={12} /> All services
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={cn(
                "inline-block h-2.5 w-2.5 rounded-full",
                active && "pulse-dot",
              )}
              style={{
                background: color,
                boxShadow: active
                  ? `0 0 12px color-mix(in srgb, ${color} 60%, transparent)`
                  : undefined,
              }}
            />
            <h1 className="truncate text-[23px] font-medium tracking-tight text-[var(--color-fg)]">
              {service.name}
            </h1>
            <StatusBadge status={service.status} />
          </div>
          <div className="mono mt-2 truncate text-[12px] text-[var(--color-fg-muted)]">
            {service.image}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-[var(--color-fg-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={12} className="text-[var(--color-fg-dim)]" /> {service.region}
            </span>
            <span>{service.environment}</span>
            <span className="mono">:{service.internal_port}</span>
            <span>{resourcePresetDetail(service.resource_preset)}</span>
            {service.url && (
              <span className="inline-flex items-center gap-1.5">
                <Globe size={12} className="text-[var(--color-fg-dim)]" />
                {service.url.replace(/^https?:\/\//, "")}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {service.url && (
            <Button
              render={<a href={service.url} target="_blank" rel="noreferrer" />}
              variant="secondary"
              size="sm"
            >
              <ExternalLink size={13} /> Open
            </Button>
          )}
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={createDeployment.isPending}
            onClick={() =>
              createDeployment.mutate(
                { serviceId: service.id },
                {
                  onSuccess: () => toast.success("Deployment queued"),
                  onError: (err) => toast.error((err as Error).message),
                },
              )
            }
          >
            {createDeployment.isPending && <Spinner className="size-3" />}
            <Rocket size={13} /> Deploy
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={rollback.isPending}
            onClick={() =>
              rollback.mutate(service.id, {
                onSuccess: () => toast.success("Rollback queued"),
                onError: (err) => toast.error((err as Error).message),
              })
            }
          >
            <RotateCcw size={13} /> Rollback
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={stop.isPending}
            onClick={() =>
              stop.mutate(service.id, {
                onSuccess: () => toast.success("Service stop requested"),
                onError: (err) => toast.error((err as Error).message),
              })
            }
          >
            <Square size={13} /> Stop
          </Button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "deployments", label: "Deployments", icon: Rocket },
            { value: "events", label: "Events", icon: ScrollText },
            { value: "logs", label: "Logs", icon: Terminal },
            { value: "metrics", label: "Metrics", icon: Activity },
            { value: "domains", label: "Domains", icon: Globe },
            { value: "settings", label: "Settings", icon: Settings },
          ]}
        />
        <span className="mono text-[11px] text-[var(--color-fg-dim)]">
          {service.provider_service_id ?? service.slug}
        </span>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]">
        <div className="min-h-[360px] p-4">
          {tab === "deployments" && <DeploymentsPanel wid={wid} service={service} />}
          {tab === "events" && <EventsPanel wid={wid} service={service} />}
          {tab === "logs" && <LogsPanel wid={wid} service={service} />}
          {tab === "metrics" && <MetricsPanel wid={wid} service={service} />}
          {tab === "domains" && <DomainsPanel wid={wid} service={service} />}
          {tab === "settings" && <SettingsPanel wid={wid} service={service} />}
        </div>
      </div>
    </>
  );
}

function DeploymentsPanel({ wid, service }: { wid: string; service: DeployService }) {
  const deployments = useDeployments(wid, service.id);
  if (deployments.isLoading) return <PanelLoading label="Loading deployments…" />;
  if (!deployments.data?.length) {
    return (
      <PanelEmpty
        icon={Rocket}
        label="No deployments yet"
        hint="Deploy pushes the current image and starts a new release."
      />
    );
  }
  return (
    <div className="space-y-2">
      {deployments.data.map((deployment) => (
        <DeploymentRow key={deployment.id} deployment={deployment} />
      ))}
    </div>
  );
}

function DeploymentRow({ deployment }: { deployment: Deployment }) {
  const color = DEPLOY_STATUS_COLOR[deployment.status];
  return (
    <div
      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-3"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="mono truncate text-[12px] text-[var(--color-fg)]">{deployment.image}</div>
          {deployment.image_digest && (
            <div className="mono mt-0.5 truncate text-[10px] text-[var(--color-fg-dim)]">
              {deployment.image_digest.slice(0, 19)}…
            </div>
          )}
        </div>
        <StatusBadge status={deployment.status} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--color-fg-muted)]">
        <span>queued {lastSeen(deployment.created_at)}</span>
        {deployment.started_at && <span>started {lastSeen(deployment.started_at)}</span>}
        {deployment.finished_at && <span>finished {lastSeen(deployment.finished_at)}</span>}
      </div>
      {deployment.failure_message && (
        <p className="mt-2 text-[12px] leading-5 text-[var(--color-err)]">
          {deployment.failure_message}
        </p>
      )}
    </div>
  );
}

function EventsPanel({ wid, service }: { wid: string; service: DeployService }) {
  const events = useDeployEvents(wid, service.id);
  if (events.isLoading) return <PanelLoading label="Loading events…" />;
  if (!events.data?.length) {
    return (
      <PanelEmpty icon={ScrollText} label="No events yet" hint="Lifecycle events appear here." />
    );
  }
  return (
    <LogConsole
      title="Lifecycle events"
      icon={ScrollText}
      lines={events.data.map((event) => ({
        id: event.id,
        level: event.level,
        message: event.message,
        timestamp: event.created_at,
      }))}
    />
  );
}

function LogsPanel({ wid, service }: { wid: string; service: DeployService }) {
  const logs = useDeployLogs(wid, service.id);
  if (logs.isLoading) return <PanelLoading label="Loading logs…" />;
  if (!logs.data?.length) {
    return (
      <PanelEmpty
        icon={Terminal}
        label="No logs ingested yet"
        hint="Runtime logs from the service will stream here."
      />
    );
  }
  return (
    <LogConsole
      title="Runtime logs"
      icon={Terminal}
      lines={logs.data.map((line, index) => ({
        id: `${line.timestamp}-${index}`,
        level: line.level,
        message: line.message,
        timestamp: line.timestamp,
      }))}
    />
  );
}

const METRIC_TILES: Array<{ kind: MetricChartKind; label: string; icon: typeof Cpu }> = [
  { kind: "cpu", label: "CPU", icon: Cpu },
  { kind: "memory", label: "Memory", icon: MemoryStick },
  { kind: "requests", label: "Requests", icon: Network },
];

function MetricsPanel({ wid, service }: { wid: string; service: DeployService }) {
  const metrics = useDeployMetrics(wid, service.id);
  const [chartKind, setChartKind] = useState<MetricChartKind>("cpu");

  if (metrics.isLoading) {
    return (
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
        <div className="grid grid-cols-3 divide-x divide-[var(--color-border)] border-b border-[var(--color-border)]">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-2 px-3.5 py-3">
              <Skeleton className="h-2.5 w-14" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-2.5 w-12" />
            </div>
          ))}
        </div>
        <div className="p-3">
          <MetricsLineChart points={[]} metric="cpu" loading />
        </div>
      </div>
    );
  }

  if (!metrics.data?.length) {
    return (
      <PanelEmpty
        icon={Activity}
        label="No metrics collected yet"
        hint="CPU, memory, and request counts appear after the service is live."
      />
    );
  }

  const points = metrics.data;
  const lastBucket = points[points.length - 1].bucket_start;
  const selected = metricStats(points, chartKind);

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
      <div className="grid grid-cols-3 divide-x divide-[var(--color-border)] border-b border-[var(--color-border)]">
        {METRIC_TILES.map((tile) => {
          const stats = metricStats(points, tile.kind);
          const high = tile.kind === "cpu" && stats.latest != null && stats.latest >= 80;
          return (
            <MetricTile
              key={tile.kind}
              icon={tile.icon}
              label={tile.label}
              value={formatStat(stats.latest, tile.kind)}
              sub={
                stats.peak == null
                  ? "no samples"
                  : `peak ${formatMetricChartValue(stats.peak, tile.kind)}`
              }
              active={chartKind === tile.kind}
              accent={high ? "var(--color-warn)" : undefined}
              onClick={() => setChartKind(tile.kind)}
            />
          );
        })}
      </div>
      <div className="p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12px] font-medium text-[var(--color-fg)]">
            {metricChartLabel(chartKind)} over time
          </span>
          <span className="mono tabular text-[11px] text-[var(--color-fg-dim)]">
            avg {formatStat(selected.avg, chartKind)} · {selected.samples} pts ·{" "}
            {lastSeen(lastBucket)}
          </span>
        </div>
        <MetricsLineChart points={points} metric={chartKind} />
      </div>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  sub,
  active,
  accent,
  onClick,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  sub: string;
  active: boolean;
  accent?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex flex-col gap-1 px-3.5 py-3 text-left transition-colors",
        active
          ? "bg-[color-mix(in_srgb,var(--color-accent)_7%,transparent)]"
          : "hover:bg-[var(--color-bg-row)]",
      )}
    >
      <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
        <Icon size={11} />
        {label}
      </span>
      <span
        className="tabular text-[19px] font-medium leading-none text-[var(--color-fg)]"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </span>
      <span className="tabular text-[10px] text-[var(--color-fg-muted)]">{sub}</span>
      {active && (
        <span className="absolute inset-x-0 -bottom-px h-[2px] bg-[var(--color-accent)]" />
      )}
    </button>
  );
}

interface MetricChartRow extends Record<string, unknown> {
  date: Date;
  value: number;
  raw: number | null;
}

function MetricsLineChart({
  points,
  metric,
  loading = false,
}: {
  points: DeployMetricPoint[];
  metric: MetricChartKind;
  loading?: boolean;
}) {
  const data = useMemo<MetricChartRow[]>(
    () =>
      points.map((point) => {
        const raw = metricChartValue(point, metric);
        return {
          date: new Date(point.bucket_start),
          value: raw ?? 0,
          raw,
        };
      }),
    [points, metric],
  );

  return (
    <LineChart
      data={data}
      xDataKey="date"
      aspectRatio=""
      style={{ height: 220 }}
      status={loading ? "loading" : "ready"}
      loadingLabel={loading ? "Loading metrics" : undefined}
      margin={{ top: 16, right: 10, bottom: 26, left: 10 }}
      revealSignature={`${metric}:${data.length}`}
    >
      <Grid horizontal numTicksRows={4} />
      <Line dataKey="value" strokeWidth={1.75} />
      <XAxis numTicks={5} />
      <ChartTooltip
        rows={(point) => {
          const row = point as MetricChartRow;
          return [
            {
              color: "var(--chart-line-primary)",
              label: metricChartLabel(metric),
              value:
                typeof row.raw === "number"
                  ? formatMetricChartValue(row.raw, metric)
                  : "No sample",
            },
          ];
        }}
        dotColor="var(--chart-line-primary)"
      />
    </LineChart>
  );
}

function metricChartValue(point: DeployMetricPoint, metric: MetricChartKind): number | null {
  switch (metric) {
    case "cpu":
      return point.cpu_percent;
    case "memory":
      return point.memory_mb;
    case "requests":
      return point.requests;
  }
}

function metricChartLabel(metric: MetricChartKind): string {
  switch (metric) {
    case "cpu":
      return "CPU";
    case "memory":
      return "Memory";
    case "requests":
      return "Requests";
  }
}

function formatMetricChartValue(value: number, metric: MetricChartKind): string {
  switch (metric) {
    case "cpu":
      return `${value.toFixed(1)}%`;
    case "memory":
      return `${value.toFixed(0)} MB`;
    case "requests":
      return Math.round(value).toLocaleString();
  }
}

function formatStat(value: number | null, metric: MetricChartKind): string {
  return value == null ? "—" : formatMetricChartValue(value, metric);
}

interface MetricStats {
  latest: number | null;
  peak: number | null;
  avg: number | null;
  samples: number;
}

function metricStats(points: DeployMetricPoint[], metric: MetricChartKind): MetricStats {
  const values: number[] = [];
  for (const point of points) {
    const value = metricChartValue(point, metric);
    if (value != null) values.push(value);
  }
  const latest = points.length ? metricChartValue(points[points.length - 1], metric) : null;
  const peak = values.length ? Math.max(...values) : null;
  const avg = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
  return { latest, peak, avg, samples: points.length };
}

function normalizeResourcePreset(value: string): DeployResourcePreset {
  return RESOURCE_PRESETS.some((preset) => preset.value === value)
    ? (value as DeployResourcePreset)
    : "preview_small";
}

function resourcePresetLabel(value: string): string {
  return (
    RESOURCE_PRESETS.find((preset) => preset.value === value)?.label ??
    value.replace(/^preview_/, "")
  );
}

function resourcePresetDetail(value: string): string {
  return RESOURCE_PRESETS.find((preset) => preset.value === value)?.detail ?? value;
}

function SettingsPanel({ wid, service }: { wid: string; service: DeployService }) {
  const navigate = useNavigate();
  const updateService = useUpdateDeployService(wid);
  const deleteService = useDeleteDeployService(wid);
  const volumes = useDeployServiceVolumes(wid, service.id);
  const createVolume = useCreateDeployServiceVolume(wid);
  const deleteVolume = useDeleteDeployServiceVolume(wid);
  const [volumeName, setVolumeName] = useState("");
  const [mountPath, setMountPath] = useState("/data");
  const [sizeGb, setSizeGb] = useState(1);

  function submitVolume(event: FormEvent) {
    event.preventDefault();
    createVolume.mutate(
      {
        serviceId: service.id,
        name: volumeName,
        mount_path: mountPath,
        size_gb: sizeGb,
      },
      {
        onSuccess: () => {
          toast.success("Volume attached");
          setVolumeName("");
          setMountPath("/data");
          setSizeGb(1);
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  function removeService() {
    if (!window.confirm(`Delete ${service.name}? This stops deployments and queues provider cleanup.`)) {
      return;
    }
    deleteService.mutate(service.id, {
      onSuccess: () => {
        toast.success("Service deletion queued");
        void navigate({ to: "/$wid/deployments", params: { wid } });
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,280px)] md:items-end">
        <div>
          <h2 className="text-[13px] font-medium text-[var(--color-fg)]">Compute</h2>
          <p className="mt-1 text-[12px] leading-5 text-[var(--color-fg-muted)]">
            Applied when the next deployment creates a machine.
          </p>
        </div>
        <select
          className={cn(fieldControlClass, "h-9")}
          value={normalizeResourcePreset(service.resource_preset)}
          disabled={updateService.isPending}
          onChange={(event) =>
            updateService.mutate(
              {
                serviceId: service.id,
                resource_preset: event.target.value as DeployResourcePreset,
              },
              {
                onSuccess: () => toast.success("Compute size updated"),
                onError: (err) => toast.error((err as Error).message),
              },
            )
          }
        >
          {RESOURCE_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label} · {preset.detail}
            </option>
          ))}
        </select>
      </section>

      <section className="border-t border-[var(--color-border)] pt-5">
        <div className="mb-3 flex items-center gap-2">
          <HardDrive size={14} className="text-[var(--color-fg-muted)]" />
          <h2 className="text-[13px] font-medium text-[var(--color-fg)]">Volumes</h2>
        </div>
        <form onSubmit={submitVolume} className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
          <input
            className={cn(fieldControlClass, "h-9")}
            value={volumeName}
            onChange={(event) => setVolumeName(event.target.value)}
            placeholder="data"
            autoCapitalize="none"
            autoCorrect="off"
            required
          />
          <input
            className={cn(fieldControlClass, "h-9")}
            value={mountPath}
            onChange={(event) => setMountPath(event.target.value)}
            placeholder="/data"
            autoCapitalize="none"
            autoCorrect="off"
            required
          />
          <input
            type="number"
            min={1}
            max={50}
            className={cn(fieldControlClass, "h-9")}
            value={sizeGb}
            onChange={(event) => setSizeGb(Number(event.target.value))}
            required
          />
          <Button
            type="submit"
            variant="default"
            size="sm"
            disabled={createVolume.isPending || !volumeName.trim() || !mountPath.trim()}
          >
            {createVolume.isPending && <Spinner className="size-3" />}
            <Plus size={13} /> Attach
          </Button>
        </form>

        <div className="mt-3 space-y-2">
          {volumes.isLoading ? (
            <PanelLoading label="Loading volumes…" />
          ) : !volumes.data?.length ? (
            <PanelEmpty
              icon={HardDrive}
              label="No volumes attached"
              hint="Attach a volume, then deploy to mount it on the next machine."
            />
          ) : (
            volumes.data.map((volume) => (
              <VolumeRow
                key={volume.id}
                volume={volume}
                deleting={deleteVolume.isPending}
                onDelete={(volumeId) =>
                  deleteVolume.mutate(
                    { serviceId: service.id, volumeId },
                    {
                      onSuccess: () => toast.success("Volume removal queued"),
                      onError: (err) => toast.error((err as Error).message),
                    },
                  )
                }
              />
            ))
          )}
        </div>
      </section>

      <section className="border-t border-[var(--color-border)] pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-medium text-[var(--color-fg)]">Delete service</h2>
            <p className="mt-1 text-[12px] leading-5 text-[var(--color-fg-muted)]">
              Hides the service and queues Fly resource cleanup.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deleteService.isPending}
            onClick={removeService}
          >
            {deleteService.isPending && <Spinner className="size-3" />}
            <Trash2 size={13} /> Delete
          </Button>
        </div>
      </section>
    </div>
  );
}

function VolumeRow({
  volume,
  deleting,
  onDelete,
}: {
  volume: DeployServiceVolume;
  deleting: boolean;
  onDelete: (volumeId: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[13px] font-medium text-[var(--color-fg)]">{volume.name}</p>
          <VolumeStatus status={volume.status} />
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--color-fg-muted)]">
          <span className="mono">{volume.mount_path}</span>
          <span>{volume.size_gb} GB</span>
          <span>{volume.region}</span>
          {volume.provider_volume_id && (
            <span className="mono">{volume.provider_volume_id.slice(0, 18)}</span>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={deleting}
        onClick={() => onDelete(volume.id)}
      >
        <Trash2 size={13} /> Remove
      </Button>
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

function DomainsPanel({ wid, service }: { wid: string; service: DeployService }) {
  const [hostname, setHostname] = useState("");
  const domains = useDeployServiceDomains(wid, service.id);
  const createDomain = useCreateDeployServiceDomain(wid);
  const verifyDomain = useVerifyDeployServiceDomain(wid);
  const deleteDomain = useDeleteDeployServiceDomain(wid);
  const canAddDomain = Boolean(service.provider_service_id);

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = hostname.trim();
    if (!value) return;
    createDomain.mutate(
      { serviceId: service.id, hostname: value },
      {
        onSuccess: () => {
          toast.success("Custom domain queued");
          setHostname("");
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  if (!canAddDomain) {
    return (
      <PanelEmpty
        icon={Globe}
        label="Deploy before adding domains"
        hint="Fly needs a provisioned app before Produktive can request certificates."
      />
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <input
          className={cn(fieldControlClass, "h-9")}
          value={hostname}
          onChange={(event) => setHostname(event.target.value)}
          placeholder="app.example.com"
          autoCapitalize="none"
          autoCorrect="off"
        />
        <Button
          type="submit"
          variant="default"
          size="sm"
          disabled={createDomain.isPending || !hostname.trim()}
        >
          {createDomain.isPending && <Spinner className="size-3" />}
          <Plus size={13} /> Add domain
        </Button>
      </form>

      {domains.isLoading ? (
        <PanelLoading label="Loading domains…" />
      ) : !domains.data?.length ? (
        <PanelEmpty
          icon={Globe}
          label="No custom domains"
          hint="Add a hostname to request a Fly certificate and DNS records."
        />
      ) : (
        <div className="space-y-3">
          {domains.data.map((domain) => (
            <DomainRow
              key={domain.id}
              domain={domain}
              verifying={verifyDomain.isPending}
              deleting={deleteDomain.isPending}
              onVerify={(domainId) =>
                verifyDomain.mutate(
                  { serviceId: service.id, domainId },
                  {
                    onSuccess: () => toast.success("Domain check queued"),
                    onError: (err) => toast.error((err as Error).message),
                  },
                )
              }
              onDelete={(domainId) =>
                deleteDomain.mutate(
                  { serviceId: service.id, domainId },
                  {
                    onSuccess: () => toast.success("Domain removal queued"),
                    onError: (err) => toast.error((err as Error).message),
                  },
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DomainRow({
  domain,
  verifying,
  deleting,
  onVerify,
  onDelete,
}: {
  domain: DeployServiceDomain;
  verifying: boolean;
  deleting: boolean;
  onVerify: (domainId: string) => void;
  onDelete: (domainId: string) => void;
}) {
  const records = dnsRecords(domain);
  const active = domain.status === "active" || Boolean(domain.verified_at);
  const errors = validationErrors(domain.validation_errors);
  const errorTone =
    domain.status === "failed"
      ? "text-[var(--color-err)]"
      : "text-[var(--color-warn)]";

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] font-medium text-[var(--color-fg)]">
              {domain.hostname}
            </p>
            <DomainStatus status={domain.status} active={active} />
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-fg-muted)]">
            {active ? "certificate active" : `updated ${lastSeen(domain.updated_at)}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={records.length === 0}
            title={records.length === 0 ? "Waiting for DNS records" : "Download DNS records"}
            onClick={() => downloadDnsFile(domain, records)}
          >
            <Download size={13} /> DNS file
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={verifying || deleting}
            onClick={() => onVerify(domain.id)}
          >
            <CheckCircle2 size={13} /> Check
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deleting}
            onClick={() => onDelete(domain.id)}
          >
            <Trash2 size={13} /> Remove
          </Button>
        </div>
      </div>

      {records.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
          {records.map((record, index) => (
            <DnsRecordRow
              key={`${record.type}-${record.name}-${record.value}-${index}`}
              record={record}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-sunken)] px-3 py-2 text-[12px] text-[var(--color-fg-muted)]">
          Waiting for Fly DNS requirements.
        </p>
      )}

      {errors.length > 0 && (
        <div className="mt-3 space-y-1">
          {errors.map((error, index) => (
            <p key={index} className={cn("text-[12px] leading-5", errorTone)}>
              {error}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function DnsRecordRow({ record }: { record: DnsRecord }) {
  return (
    <div className="grid gap-2 border-b border-[var(--color-border)] px-3 py-2 last:border-b-0 sm:grid-cols-[72px_minmax(0,1fr)_minmax(0,1.4fr)_32px] sm:items-center">
      <span className="mono text-[11px] font-medium text-[var(--color-fg)]">{record.type}</span>
      <span className="mono min-w-0 break-all text-[11px] text-[var(--color-fg-muted)]">
        {record.name}
      </span>
      <span className="mono min-w-0 break-all text-[11px] text-[var(--color-fg)]">
        {record.value}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Copy DNS value"
        onClick={() => {
          void navigator.clipboard?.writeText(record.value);
          toast.success("DNS value copied");
        }}
      >
        <Copy size={13} />
      </Button>
    </div>
  );
}

function DomainStatus({ status, active }: { status: string; active: boolean }) {
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
      {active ? "active" : status.replace(/_/g, " ")}
    </span>
  );
}

type DnsRecord = {
  type: string;
  name: string;
  value: string;
};

type FlyDnsRequirements = {
  a?: string[];
  aaaa?: string[];
  cname?: string;
  acme_challenge?: { name?: string; target?: string };
  ownership?: { name?: string; app_value?: string; org_value?: string };
};

function dnsRecords(domain: DeployServiceDomain): DnsRecord[] {
  const req = flyDnsRequirements(domain.dns_requirements);
  const records: DnsRecord[] = [];
  if (req.cname) {
    records.push({ type: "CNAME", name: domain.hostname, value: req.cname });
  } else {
    for (const value of req.a ?? []) {
      records.push({ type: "A", name: domain.hostname, value });
    }
    for (const value of req.aaaa ?? []) {
      records.push({ type: "AAAA", name: domain.hostname, value });
    }
  }
  if (req.ownership?.name && (req.ownership.app_value || req.ownership.org_value)) {
    records.push({
      type: "TXT",
      name: req.ownership.name,
      value: req.ownership.app_value ?? req.ownership.org_value ?? "",
    });
  }
  if (req.acme_challenge?.name && req.acme_challenge.target) {
    records.push({
      type: "CNAME",
      name: req.acme_challenge.name,
      value: req.acme_challenge.target,
    });
  }
  return records.filter((record) => record.value.length > 0);
}

function downloadDnsFile(domain: DeployServiceDomain, records: DnsRecord[]) {
  if (records.length === 0) {
    toast.error("DNS records are not ready yet");
    return;
  }
  const blob = new Blob([dnsFileContents(domain, records)], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = dnsFileName(domain.hostname);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  toast.success("DNS file downloaded");
}

function dnsFileName(hostname: string): string {
  const safeHostname = hostname
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `produktive-dns-${safeHostname || "domain"}.zone`;
}

function dnsFileContents(domain: DeployServiceDomain, records: DnsRecord[]): string {
  const lines = [
    `; Produktive DNS records for ${domain.hostname}`,
    `; Generated ${new Date().toISOString()}`,
    "; Add these records at your DNS provider, then run Check in Produktive.",
    "",
    "$TTL 300",
    ...records.map((record) => dnsZoneLine(record)),
    "",
  ];
  return lines.join("\n");
}

function dnsZoneLine(record: DnsRecord): string {
  return `${absoluteDnsName(record.name)} 300 IN ${record.type} ${dnsZoneValue(record)}`;
}

function dnsZoneValue(record: DnsRecord): string {
  if (record.type === "TXT") return quoteDnsText(record.value);
  if (record.type === "CNAME") return absoluteDnsName(record.value);
  return record.value;
}

function quoteDnsText(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function absoluteDnsName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "@") return trimmed;
  return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
}

function flyDnsRequirements(value: unknown): FlyDnsRequirements {
  if (!value || typeof value !== "object") return {};
  return value as FlyDnsRequirements;
}

function validationErrors(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(formatValidationError);
  }
  if (typeof value === "string" && value.trim()) return [value];
  if (value && typeof value === "object" && Object.keys(value).length > 0) {
    return [formatValidationError(value)];
  }
  return [];
}

function formatValidationError(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return String(value);
  const record = value as Record<string, unknown>;
  const message = typeof record.message === "string" ? record.message : "";
  const remediation = typeof record.remediation === "string" ? record.remediation : "";
  if (message && remediation) return `${message}. ${remediation}`;
  if (message) return message;
  return JSON.stringify(value);
}

type LevelFilter = "all" | "warn" | "error";

interface ConsoleLine {
  id: string;
  level: string;
  message: string;
  timestamp: string;
}

const LEVEL_FILTERS: Array<{ value: LevelFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "warn", label: "Warnings" },
  { value: "error", label: "Errors" },
];

function LogConsole({
  title,
  icon: Icon,
  lines,
}: {
  title: string;
  icon: typeof Rocket;
  lines: ConsoleLine[];
}) {
  const [filter, setFilter] = useState<LevelFilter>("all");
  const visible = useMemo(
    () => lines.filter((line) => lineMatchesFilter(line.level, filter)),
    [lines, filter],
  );

  function copyAll() {
    const text = visible
      .map((line) => `${logClock(line.timestamp)} ${line.level.toUpperCase()} ${line.message}`)
      .join("\n");
    if (!text) {
      toast.error("Nothing to copy");
      return;
    }
    void navigator.clipboard?.writeText(text);
    toast.success("Copied to clipboard");
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-sunken)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2">
        <div className="flex items-center gap-2 text-[12px] text-[var(--color-fg)]">
          <Icon size={13} className="text-[var(--color-fg-muted)]" />
          <span className="font-medium">{title}</span>
          <span className="tabular text-[11px] text-[var(--color-fg-muted)]">
            {filter === "all" ? `${lines.length} lines` : `${visible.length} / ${lines.length}`}
          </span>
          <span className="ml-0.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] text-[var(--color-fg-dim)]">
            <span
              className="pulse-dot inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--color-ok)" }}
            />
            Live
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Segmented<LevelFilter>
            size="sm"
            value={filter}
            onChange={setFilter}
            options={LEVEL_FILTERS}
          />
          <Button type="button" variant="ghost" size="sm" onClick={copyAll}>
            <Copy size={13} /> Copy
          </Button>
        </div>
      </div>
      <ScrollArea className="h-[360px]">
        <div className="mono space-y-px p-2 text-[11px] leading-5">
          {visible.length === 0 ? (
            <div className="flex h-[320px] items-center justify-center text-[12px] text-[var(--color-fg-dim)]">
              No matching lines
            </div>
          ) : (
            visible.map((line) => <LogRow key={line.id} line={line} />)
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function LogRow({ line }: { line: ConsoleLine }) {
  const color = levelColor(line.level);
  return (
    <div
      className="group grid grid-cols-[58px_46px_minmax(0,1fr)] items-baseline gap-x-2.5 rounded-[var(--radius-sm)] border-l-2 py-[3px] pl-2 pr-1.5 transition-colors hover:bg-[var(--color-bg-row)]"
      style={{ borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }}
    >
      <span className="tabular text-[var(--color-fg-dim)]" title={logFullTime(line.timestamp)}>
        {logClock(line.timestamp)}
      </span>
      <span
        className="truncate text-[10px] font-semibold uppercase tracking-[0.04em]"
        style={{ color }}
      >
        {line.level}
      </span>
      <span className="min-w-0 whitespace-pre-wrap break-words text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg)]">
        {line.message}
      </span>
    </div>
  );
}

function levelColor(level: string): string {
  const normalized = level.toLowerCase();
  if (["error", "err", "fatal", "critical", "panic"].includes(normalized)) {
    return "var(--color-err)";
  }
  if (["warn", "warning"].includes(normalized)) {
    return "var(--color-warn)";
  }
  if (["debug", "trace"].includes(normalized)) {
    return "var(--color-fg-dim)";
  }
  return "var(--color-fg-muted)";
}

function lineMatchesFilter(level: string, filter: LevelFilter): boolean {
  if (filter === "all") return true;
  const normalized = level.toLowerCase();
  const isError = ["error", "err", "fatal", "critical", "panic"].includes(normalized);
  if (filter === "error") return isError;
  return isError || ["warn", "warning"].includes(normalized);
}

function logClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function logFullTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function MetaChip({
  icon: Icon,
  label,
}: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-fg-dim)]">
      {Icon && <Icon size={10} />}
      {label}
    </span>
  );
}

function CardMetric({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 truncate text-[15px] font-medium text-[var(--color-fg)]",
          mono && "mono text-[12px]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function CreateCredentialDialog({
  open,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: {
    name: string;
    registry_kind: DeployRegistryKind;
    username: string;
    password: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [registryKind, setRegistryKind] = useState<DeployRegistryKind>("ghcr");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({ name, registry_kind: registryKind, username, password });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Registry credential"
        description="Credentials are encrypted before they are stored."
        footer={
          <>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              form="deploy-credential-form"
              variant="default"
              disabled={pending}
            >
              {pending && <Spinner className="size-3" />} Save credential
            </Button>
          </>
        }
      >
        <form id="deploy-credential-form" onSubmit={submit} className="space-y-4">
          <Field label="Name">
            <input
              className={cn(fieldControlClass, "h-9")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          <Field label="Registry">
            <select
              className={cn(fieldControlClass, "h-9")}
              value={registryKind}
              onChange={(e) => setRegistryKind(e.target.value as DeployRegistryKind)}
            >
              <option value="ghcr">GitHub Container Registry</option>
              <option value="docker_hub">Docker Hub</option>
            </select>
          </Field>
          <Field label="Username">
            <input
              className={cn(fieldControlClass, "h-9")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </Field>
          <Field label="Token / password">
            <input
              type="password"
              className={cn(fieldControlClass, "h-9")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateServiceDialog({
  open,
  credentials,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  credentials: DeployRegistryCredential[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: {
    name: string;
    image: string;
    registry_kind: DeployRegistryKind;
    registry_credential_id?: string | null;
    internal_port: number;
    env: Record<string, string>;
    secrets: Record<string, string>;
    environment: string;
    health_check_path: string;
    region: string;
    resource_preset: DeployResourcePreset;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [registryKind, setRegistryKind] = useState<DeployRegistryKind>("ghcr");
  const [credentialId, setCredentialId] = useState("");
  const [port, setPort] = useState(3000);
  const [environment, setEnvironment] = useState("production");
  const [region, setRegion] = useState("fra");
  const [health, setHealth] = useState("/");
  const [resourcePreset, setResourcePreset] = useState<DeployResourcePreset>("preview_small");
  const [envText, setEnvText] = useState("");
  const [secretText, setSecretText] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      onSubmit({
        name,
        image,
        registry_kind: registryKind,
        registry_credential_id: credentialId || null,
        internal_port: port,
        env: parseKeyValues(envText),
        secrets: parseKeyValues(secretText),
        environment,
        health_check_path: health,
        region,
        resource_preset: resourcePreset,
      });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New deployment service"
        description="HTTP-only Docker services with private-preview compute limits."
        size="lg"
        footer={
          <>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" form="deploy-service-form" variant="default" disabled={pending}>
              {pending && <Spinner className="size-3" />} Create service
            </Button>
          </>
        }
      >
        <form id="deploy-service-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input
              className={cn(fieldControlClass, "h-9")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          <Field label="Image">
            <input
              className={cn(fieldControlClass, "h-9")}
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="ghcr.io/acme/api:latest"
              required
            />
          </Field>
          <Field label="Registry">
            <select
              className={cn(fieldControlClass, "h-9")}
              value={registryKind}
              onChange={(e) => setRegistryKind(e.target.value as DeployRegistryKind)}
            >
              <option value="ghcr">GHCR</option>
              <option value="docker_hub">Docker Hub</option>
            </select>
          </Field>
          <Field label="Credential">
            <select
              className={cn(fieldControlClass, "h-9")}
              value={credentialId}
              onChange={(e) => setCredentialId(e.target.value)}
            >
              <option value="">No credential</option>
              {credentials.map((credential) => (
                <option key={credential.id} value={credential.id}>
                  {credential.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Port">
            <input
              type="number"
              min={1}
              max={65535}
              className={cn(fieldControlClass, "h-9")}
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              required
            />
          </Field>
          <Field label="Region">
            <input
              className={cn(fieldControlClass, "h-9")}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              required
            />
          </Field>
          <Field label="Environment">
            <input
              className={cn(fieldControlClass, "h-9")}
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              required
            />
          </Field>
          <Field label="Health path">
            <input
              className={cn(fieldControlClass, "h-9")}
              value={health}
              onChange={(e) => setHealth(e.target.value)}
              required
            />
          </Field>
          <Field label="Compute">
            <select
              className={cn(fieldControlClass, "h-9")}
              value={resourcePreset}
              onChange={(e) => setResourcePreset(e.target.value as DeployResourcePreset)}
            >
              {RESOURCE_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label} · {preset.detail}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Env vars">
            <textarea
              className={cn(fieldControlClass, "min-h-24 resize-y py-2")}
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              placeholder={"LOG_LEVEL=info"}
            />
          </Field>
          <Field label="Secrets">
            <textarea
              className={cn(fieldControlClass, "min-h-24 resize-y py-2")}
              value={secretText}
              onChange={(e) => setSecretText(e.target.value)}
              placeholder={"DATABASE_URL=postgres://..."}
            />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-[var(--color-fg-muted)]">{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: DeployStatus }) {
  const color = DEPLOY_STATUS_COLOR[status];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 25%, transparent)`,
      }}
    >
      {DEPLOY_STATUS_LABEL[status]}
    </span>
  );
}

function ServiceGridSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="flex min-h-44 flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 shadow-[var(--shadow-sm)]"
        >
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <div className="mt-3 flex gap-2">
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-10 rounded-full" />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Skeleton className="h-14 rounded-[var(--radius-md)]" />
            <Skeleton className="h-14 rounded-[var(--radius-md)]" />
            <Skeleton className="col-span-2 h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ServiceDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-3 w-24" />
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-3 w-80" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-[360px] w-full rounded-[var(--radius-lg)]" />
    </div>
  );
}

function PanelLoading({ label }: { label: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center text-[12px] text-[var(--color-fg-muted)]">
      <Spinner className="size-4" /> <span className="ml-2">{label}</span>
    </div>
  );
}

function PanelEmpty({
  icon: Icon,
  label,
  hint,
}: {
  icon: typeof Rocket;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-row)] text-[var(--color-fg-muted)]">
        <Icon size={16} />
      </div>
      <p className="text-[13px] font-medium text-[var(--color-fg)]">{label}</p>
      {hint && <p className="max-w-sm text-[12px] leading-5 text-[var(--color-fg-muted)]">{hint}</p>}
    </div>
  );
}

function parseKeyValues(input: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of input.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) throw new Error(`Invalid KEY=value line: ${trimmed}`);
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1);
  }
  return out;
}
