import {
  Activity,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  Download,
  Gauge,
  Globe,
  HardDrive,
  LayoutGrid,
  MemoryStick,
  Network,
  Plus,
  Rocket,
  Save,
  ScrollText,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChartTooltip, Grid, Line, LineChart, XAxis } from "#/charts";
import { Button } from "#/components/ui/button";
import { ScrollArea } from "#/components/ui/scroll-area";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { Segmented } from "#/components/Segmented";
import { cn } from "#/lib/cn";
import {
  DEPLOY_STATUS_COLOR,
  DEPLOY_STATUS_LABEL,
  deployStatusActive,
  deployStatusPending,
  lastSeen,
  shortDigest,
} from "#/lib/status";
import type { DeployDetailTab } from "#/lib/deployments";
import { toast } from "#/lib/toast";
import {
  useCreateDeployServiceVolume,
  useCreateDeployServiceDomain,
  useDeleteDeployService,
  useDeleteDeployServiceVolume,
  useDeployEvents,
  useDeployLogs,
  useDeployMetrics,
  useDeployServiceDomains,
  useDeployServiceVolumes,
  useDeployments,
  useDeleteDeployServiceDomain,
  useUpdateDeployService,
  useUpdateDeployServiceVolume,
  useVerifyDeployServiceDomain,
} from "#/lib/queries";
import type {
  Deployment,
  DeployMetricPoint,
  DeployResourcePreset,
  DeployServiceDomain,
  DeployService,
  DeployServiceVolume,
} from "#/lib/types";
import {
  CopyChip,
  DetailStat,
  PanelCard,
  PanelEmpty,
  PanelLoading,
  RESOURCE_PRESETS,
  StatusBadge,
  fieldControlClass,
  normalizeResourcePreset,
  resourcePresetDetail,
} from "./deploy-shared";

type MetricChartKind = "cpu" | "memory" | "requests";

export function DeploymentsPanel({ wid, service }: { wid: string; service: DeployService }) {
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
      {deployments.data.map((deployment, index) => (
        <div
          key={deployment.id}
          className="fade-in"
          style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
        >
          <DeploymentRow deployment={deployment} />
        </div>
      ))}
    </div>
  );
}

function DeploymentRow({ deployment }: { deployment: Deployment }) {
  const color = DEPLOY_STATUS_COLOR[deployment.status];
  const active = deployStatusActive(deployment.status);
  const pending = deployStatusPending(deployment.status);

  return (
    <div
      className="group relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] transition-colors hover:border-[var(--color-border-hi)]"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                active && "pulse-dot",
                pending && "animate-pulse",
              )}
              style={{ background: color }}
            />
            <div className="mono truncate text-[12px] font-medium text-[var(--color-fg)]">
              {deployment.image}
            </div>
          </div>
          {deployment.image_digest && (
            <div className="mt-1 pl-3.5">
              <CopyChip
                value={deployment.image_digest}
                label={`${deployment.image_digest.slice(0, 24)}…`}
              />
            </div>
          )}
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 pl-3.5 text-[11px] text-[var(--color-fg-muted)]">
            <span className="inline-flex items-center gap-1">
              <Clock size={10} className="text-[var(--color-fg-dim)]" />
              queued {lastSeen(deployment.created_at)}
            </span>
            {deployment.started_at && <span>started {lastSeen(deployment.started_at)}</span>}
            {deployment.finished_at && <span>finished {lastSeen(deployment.finished_at)}</span>}
          </div>
        </div>
        <StatusBadge status={deployment.status} />
      </div>
      {deployment.failure_message && (
        <div className="border-t border-[color-mix(in_srgb,var(--color-err)_20%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-err)_6%,transparent)] px-4 py-2.5">
          <p className="text-[12px] leading-5 text-[var(--color-err)]">
            {deployment.failure_message}
          </p>
        </div>
      )}
    </div>
  );
}

export function OverviewPanel({
  wid,
  service,
  onTabChange,
}: {
  wid: string;
  service: DeployService;
  onTabChange: (tab: DeployDetailTab) => void;
}) {
  const deployments = useDeployments(wid, service.id);
  const events = useDeployEvents(wid, service.id);
  const latest = deployments.data?.[0] ?? null;
  const digest = shortDigest(latest?.image_digest ?? service.last_deploy_image_digest);

  const recentEvents = (events.data ?? []).slice(0, 4);
  const statusColor = DEPLOY_STATUS_COLOR[service.status];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <DetailStat
          label="Status"
          value={DEPLOY_STATUS_LABEL[service.status]}
          sub={deployStatusActive(service.status) ? "healthy" : undefined}
          icon={LayoutGrid}
        />
        <DetailStat
          label="Last deploy"
          value={service.last_deploy_at ? lastSeen(service.last_deploy_at) : "never"}
          sub={latest ? `deploy ${latest.status}` : undefined}
          icon={Rocket}
        />
        <DetailStat
          label="Compute"
          value={resourcePresetDetail(service.resource_preset)}
          sub={service.environment}
          icon={Gauge}
        />
        <DetailStat
          label="Image digest"
          value={digest ?? "—"}
          sub={service.internal_port ? `:${service.internal_port}` : undefined}
          icon={ScrollText}
          mono
        />
      </div>

      <PanelCard
        title="Latest deployment"
        icon={Rocket}
        count={deployments.data ? `${deployments.data.length} total` : undefined}
      >
        {deployments.isLoading ? (
          <PanelLoading label="Loading deployments…" />
        ) : latest ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mono truncate text-[12px] font-medium text-[var(--color-fg)]">
                  {latest.image}
                </div>
                {latest.image_digest && (
                  <div className="mt-1.5">
                    <CopyChip
                      value={latest.image_digest}
                      label={digest ?? latest.image_digest.slice(0, 24)}
                    />
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--color-fg-muted)]">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={10} className="text-[var(--color-fg-dim)]" />
                    queued {lastSeen(latest.created_at)}
                  </span>
                  {latest.finished_at && <span>finished {lastSeen(latest.finished_at)}</span>}
                </div>
              </div>
              <StatusBadge status={latest.status} />
            </div>
            {latest.failure_message && (
              <p className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-err)_20%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-err)_6%,transparent)] px-3 py-2 text-[12px] leading-5 text-[var(--color-err)]">
                {latest.failure_message}
              </p>
            )}
          </div>
        ) : (
          <PanelEmpty
            icon={Rocket}
            label="No deployments yet"
            hint="Deploy pushes the current image and starts a new release."
          />
        )}
      </PanelCard>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <QuickLink
          icon={Rocket}
          label="Deploys"
          hint={deployments.data?.length ? `${deployments.data.length} releases` : "view history"}
          onClick={() => onTabChange("deployments")}
        />
        <QuickLink
          icon={Terminal}
          label="Logs"
          hint="runtime + lifecycle"
          onClick={() => onTabChange("logs")}
        />
        <QuickLink
          icon={Activity}
          label="Metrics"
          hint="CPU · memory · requests"
          onClick={() => onTabChange("metrics")}
        />
      </div>

      <PanelCard
        title="Recent activity"
        icon={ScrollText}
        count={events.data ? `${events.data.length} events` : undefined}
      >
        {events.isLoading ? (
          <PanelLoading label="Loading events…" />
        ) : recentEvents.length ? (
          <ul className="space-y-1.5">
            {recentEvents.map((event) => (
              <li key={event.id} className="flex items-baseline gap-2 text-[12px]">
                <span className="tabular shrink-0 text-[10px] text-[var(--color-fg-dim)]">
                  {lastSeen(event.created_at)}
                </span>
                <span
                  className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.04em]"
                  style={{ color: levelColor(event.level) }}
                >
                  {event.level}
                </span>
                <span className="min-w-0 truncate text-[var(--color-fg-muted)]">
                  {event.message}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-2 text-[12px] text-[var(--color-fg-muted)]">No lifecycle events yet.</p>
        )}
      </PanelCard>

      {service.status === "failed" && (
        <div
          className="rounded-[var(--radius-md)] border px-3 py-2.5 text-[12px] text-[var(--color-err)]"
          style={{
            borderColor: `color-mix(in srgb, ${statusColor} 25%, transparent)`,
            background: `color-mix(in srgb, ${statusColor} 6%, transparent)`,
          }}
        >
          This service is currently failing. Check Logs for runtime errors or Deploys for the
          failure message.
        </div>
      )}
    </div>
  );
}

function QuickLink({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof Rocket;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-2.5 text-left transition-colors hover:border-[var(--color-border-hi)] hover:bg-[var(--color-bg-elev)]"
    >
      <Icon size={16} className="shrink-0 text-[var(--color-fg-muted)]" />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-[var(--color-fg)]">{label}</div>
        <div className="truncate text-[10px] text-[var(--color-fg-dim)]">{hint}</div>
      </div>
    </button>
  );
}

export function EventsPanel({ wid, service }: { wid: string; service: DeployService }) {
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

export function LogsPanel({ wid, service }: { wid: string; service: DeployService }) {
  const logs = useDeployLogs(wid, service.id);
  const events = useDeployEvents(wid, service.id);

  const runtimeLines = (logs.data ?? []).map((line, index) => ({
    id: `${line.timestamp}-${index}`,
    level: line.level,
    message: line.message,
    timestamp: line.timestamp,
  }));
  const eventLines = (events.data ?? []).map((event) => ({
    id: event.id,
    level: event.level,
    message: event.message,
    timestamp: event.created_at,
  }));

  return (
    <div className="space-y-3">
      {logs.isLoading ? (
        <PanelLoading label="Loading logs…" />
      ) : runtimeLines.length ? (
        <LogConsole title="Runtime logs" icon={Terminal} lines={runtimeLines} />
      ) : (
        <PanelEmpty
          icon={Terminal}
          label="No logs ingested yet"
          hint="Runtime logs from the service will stream here."
        />
      )}

      {events.isLoading ? (
        <PanelLoading label="Loading events…" />
      ) : eventLines.length ? (
        <LogConsole title="Lifecycle events" icon={ScrollText} lines={eventLines} />
      ) : (
        <PanelEmpty
          icon={ScrollText}
          label="No lifecycle events"
          hint="Deploys, stops, and rollbacks are recorded here."
        />
      )}
    </div>
  );
}

const METRIC_TILES: Array<{ kind: MetricChartKind; label: string; icon: typeof Cpu }> = [
  { kind: "cpu", label: "CPU", icon: Cpu },
  { kind: "memory", label: "Memory", icon: MemoryStick },
  { kind: "requests", label: "Requests", icon: Network },
];

export function MetricsPanel({ wid, service }: { wid: string; service: DeployService }) {
  const metrics = useDeployMetrics(wid, service.id);
  const [chartKind, setChartKind] = useState<MetricChartKind>("cpu");

  if (metrics.isLoading) {
    return (
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
        <div className="grid grid-cols-1 divide-y divide-[var(--color-border)] border-b border-[var(--color-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-2 px-3.5 py-3">
              <Skeleton className="h-2.5 w-14" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-2.5 w-12" />
            </div>
          ))}
        </div>
        <div className="p-3 sm:p-4">
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
      <div className="grid grid-cols-1 divide-y divide-[var(--color-border)] border-b border-[var(--color-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
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
      <div className="p-3 sm:p-4">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
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
        "relative flex flex-col gap-1 px-4 py-3.5 text-left transition-colors sm:px-3.5 sm:py-3",
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
                typeof row.raw === "number" ? formatMetricChartValue(row.raw, metric) : "No sample",
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
  const avg = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return { latest, peak, avg, samples: points.length };
}

export function SettingsPanel({
  wid,
  service,
  onDeleted,
}: {
  wid: string;
  service: DeployService;
  onDeleted?: () => void;
}) {
  const updateService = useUpdateDeployService(wid);
  const deleteService = useDeleteDeployService(wid);

  function removeService() {
    if (
      !window.confirm(`Delete ${service.name}? This stops deployments and queues provider cleanup.`)
    ) {
      return;
    }
    deleteService.mutate(service.id, {
      onSuccess: () => {
        toast.success("Service deletion queued");
        onDeleted?.();
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  return (
    <div className="space-y-5">
      <section>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[var(--color-fg-muted)]">Compute</span>
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
        </label>
      </section>

      <section className="border-t border-[var(--color-border)] pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-[var(--color-fg-muted)]">Delete this service</p>
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

export function ConfigurationPanel({ wid, service }: { wid: string; service: DeployService }) {
  return (
    <div className="space-y-6">
      <VolumesSection wid={wid} service={service} />
      <section className="border-t border-[var(--color-border)] pt-4">
        <div className="mb-3 flex items-center gap-2">
          <Globe size={14} className="text-[var(--color-fg-muted)]" />
          <h2 className="text-[13px] font-medium text-[var(--color-fg)]">Domains</h2>
        </div>
        <DomainsPanel wid={wid} service={service} />
      </section>
    </div>
  );
}

function VolumesSection({ wid, service }: { wid: string; service: DeployService }) {
  const volumes = useDeployServiceVolumes(wid, service.id);
  const createVolume = useCreateDeployServiceVolume(wid);
  const updateVolume = useUpdateDeployServiceVolume(wid);
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

  return (
    <section>
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
              updating={updateVolume.isPending}
              deleting={deleteVolume.isPending}
              onUpdate={(volumeId, nextMountPath) =>
                updateVolume.mutate(
                  { serviceId: service.id, volumeId, mount_path: nextMountPath },
                  {
                    onSuccess: () => toast.success("Volume mount path updated"),
                    onError: (err) => toast.error((err as Error).message),
                  },
                )
              }
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
  );
}

function VolumeRow({
  volume,
  updating,
  deleting,
  onUpdate,
  onDelete,
}: {
  volume: DeployServiceVolume;
  updating: boolean;
  deleting: boolean;
  onUpdate: (volumeId: string, mountPath: string) => void;
  onDelete: (volumeId: string) => void;
}) {
  const [mountPath, setMountPath] = useState(volume.mount_path);
  useEffect(() => {
    setMountPath(volume.mount_path);
  }, [volume.mount_path]);

  const trimmedMountPath = mountPath.trim();
  const changed = trimmedMountPath !== volume.mount_path;
  const busy = updating || deleting;

  function submitMountPath(event: FormEvent) {
    event.preventDefault();
    if (!trimmedMountPath || !changed || busy) {
      return;
    }
    onUpdate(volume.id, trimmedMountPath);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[13px] font-medium text-[var(--color-fg)]">{volume.name}</p>
          <VolumeStatus status={volume.status} />
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--color-fg-muted)]">
          <span>{volume.size_gb} GB</span>
          <span>{volume.region}</span>
          {volume.provider_volume_id && (
            <span className="mono">{volume.provider_volume_id.slice(0, 18)}</span>
          )}
        </div>
        <form onSubmit={submitMountPath} className="mt-2 flex max-w-md items-center gap-1.5">
          <input
            className={cn(fieldControlClass, "mono h-8 min-w-0 flex-1")}
            value={mountPath}
            onChange={(event) => setMountPath(event.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            required
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            disabled={!trimmedMountPath || !changed || busy}
            aria-label="Save mount path"
          >
            {updating ? <Spinner className="size-3" /> : <Save size={13} />}
          </Button>
          {changed && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              onClick={() => setMountPath(volume.mount_path)}
              aria-label="Reset mount path"
            >
              <X size={13} />
            </Button>
          )}
        </form>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
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

export function DomainsPanel({ wid, service }: { wid: string; service: DeployService }) {
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
    domain.status === "failed" ? "text-[var(--color-err)]" : "text-[var(--color-warn)]";

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[13px] font-medium text-[var(--color-fg)]">
              {domain.hostname}
            </p>
            <DomainStatus status={domain.status} active={active} />
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-fg-muted)]">
            {active ? "certificate active" : `updated ${lastSeen(domain.updated_at)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={records.length === 0}
            title={records.length === 0 ? "Waiting for DNS records" : "Download DNS records"}
            onClick={() => downloadDnsFile(domain, records)}
          >
            <Download size={13} /> DNS
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
            <Trash2 size={13} />
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
    <PanelCard
      title={title}
      icon={Icon}
      count={filter === "all" ? `${lines.length} lines` : `${visible.length} / ${lines.length}`}
      live
      actions={
        <>
          <Segmented<LevelFilter>
            size="sm"
            value={filter}
            onChange={setFilter}
            options={LEVEL_FILTERS}
          />
          <Button type="button" variant="ghost" size="sm" onClick={copyAll}>
            <Copy size={13} />
            <span className="hidden sm:inline"> Copy</span>
          </Button>
        </>
      }
      className="bg-[var(--color-bg-sunken)] shadow-none"
      bodyClassName="p-0"
    >
      <ScrollArea className="h-[min(360px,50vh)] sm:h-[360px]">
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
    </PanelCard>
  );
}

function LogRow({ line }: { line: ConsoleLine }) {
  const color = levelColor(line.level);
  return (
    <div
      className="group grid grid-cols-1 gap-0.5 rounded-[var(--radius-sm)] border-l-2 py-[4px] pl-2.5 pr-1.5 transition-colors hover:bg-[var(--color-bg-row)] sm:grid-cols-[58px_46px_minmax(0,1fr)] sm:items-baseline sm:gap-x-2.5"
      style={{ borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }}
    >
      <div className="flex items-baseline gap-2 sm:contents">
        <span className="tabular text-[var(--color-fg-dim)]" title={logFullTime(line.timestamp)}>
          {logClock(line.timestamp)}
        </span>
        <span
          className="truncate text-[10px] font-semibold uppercase tracking-[0.04em] sm:max-w-none"
          style={{ color }}
        >
          {line.level}
        </span>
      </div>
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
