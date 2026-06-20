import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check as CheckIcon,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Plus,
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "#/lib/cn";
import { usageNumbers } from "#/lib/billing";
import { AnimatedIcon } from "../components/AnimatedIcon";
import { Button } from "#/components/ui/button";
import { EmptyState } from "../components/EmptyState";
import { StatTile } from "../components/StatTile";
import { PROBE_ICON } from "../components/ProbeIcons";
import {
  incidentsQuery,
  monitorsQuery,
  useBillingSummary,
  useChecks,
  useIncidents,
  useMonitors,
  useWorkspaces,
} from "../lib/queries";
import { STATUS_COLOR, STATUS_LABEL, lastSeen } from "../lib/status";
import {
  monitorStatus,
  type Check,
  type Incident,
  type IncidentSeverity,
  type Monitor,
  type MonitorStatus,
} from "../lib/types";

export const Route = createFileRoute("/_authed/$wid/")({
  staticData: {
    title: "Overview",
    description: "Live health of every monitor in this workspace.",
    primaryAction: { label: "New monitor", to: "/$wid/monitors/new", icon: Plus },
  },
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(monitorsQuery(params.wid)),
      context.queryClient.ensureQueryData(incidentsQuery(params.wid, "open")),
    ]),
  component: OverviewPage,
});

type Filter = "all" | MonitorStatus;

/** Worst-first ordering so anything needing attention floats to the top. */
const STATUS_RANK: Record<MonitorStatus, number> = { down: 0, degraded: 1, unknown: 2, up: 3 };

function OverviewPage() {
  const { wid } = Route.useParams();
  const { data: monitors = [] } = useMonitors(wid);
  const { data: openIncidents = [] } = useIncidents(wid, "open");
  const { data: workspaces = [] } = useWorkspaces();
  const billing = useBillingSummary(wid);
  const workspace = workspaces.find((w) => w.id === wid || w.slug === wid);
  const [filter, setFilter] = useState<Filter>("all");

  const byStatus = useMemo(
    () =>
      monitors.reduce(
        (acc, m) => {
          acc[monitorStatus(m)] += 1;
          return acc;
        },
        { up: 0, down: 0, degraded: 0, unknown: 0 },
      ),
    [monitors],
  );

  const ranked = useMemo(
    () =>
      [...monitors].sort(
        (a, b) =>
          STATUS_RANK[monitorStatus(a)] - STATUS_RANK[monitorStatus(b)] ||
          a.name.localeCompare(b.name),
      ),
    [monitors],
  );

  const shown = useMemo(
    () => (filter === "all" ? ranked : ranked.filter((m) => monitorStatus(m) === filter)),
    [ranked, filter],
  );

  const affected = useMemo(
    () =>
      ranked.filter((m) => {
        const s = monitorStatus(m);
        return s === "down" || s === "degraded";
      }),
    [ranked],
  );

  if (monitors.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No monitors yet"
        description="Add your first endpoint and Produktive will start pinging it on the interval you choose."
        action={
          <Link to="/$wid/monitors/new" params={{ wid }}>
            <Button variant="default" size="lg">
              <Plus size={14} /> New monitor
            </Button>
          </Link>
        }
      />
    );
  }

  // Derived metrics — chosen to be additive, not a restatement of the hero/pills.
  const active = monitors.filter((m) => m.enabled && !m.billing_paused_at);
  const latencies = monitors.filter((m) => m.last_latency_ms != null);
  const avgLatency = latencies.length
    ? Math.round(latencies.reduce((s, m) => s + (m.last_latency_ms ?? 0), 0) / latencies.length)
    : null;
  const checksPerMin = active.reduce((s, m) => s + 60 / m.interval_seconds, 0);
  const regionCount = new Set(monitors.flatMap((m) => m.regions.map((r) => r.id))).size;
  const lastChecked = monitors.reduce<string | null>(
    (latest, m) =>
      m.last_checked_at && (!latest || m.last_checked_at > latest) ? m.last_checked_at : latest,
    null,
  );

  const allGood = byStatus.down === 0 && byStatus.degraded === 0;
  const needsAttention = !allGood || openIncidents.length > 0;
  const pausedCount = monitors.filter((m) => m.billing_paused_at).length;
  const monitorsUsage = usageNumbers(billing.data?.balances.monitors);
  const usageWarning = Boolean(
    billing.data?.billing_enabled &&
      monitorsUsage.percent != null &&
      monitorsUsage.percent >= 85,
  );

  const publicUrl = workspace?.status_slug
    ? `${window.location.origin}/s/${workspace.status_slug}`
    : null;
  const statusPageLive = Boolean(workspace?.status_slug && workspace.status_page_enabled);

  const heroColor = allGood
    ? "var(--color-ok)"
    : byStatus.down
      ? "var(--color-err)"
      : "var(--color-warn)";
  const heroLine = allGood
    ? "All systems operational"
    : [
        byStatus.down ? `${byStatus.down} down` : null,
        byStatus.degraded ? `${byStatus.degraded} degraded` : null,
      ]
        .filter(Boolean)
        .join(" · ");

  // Only pull per-monitor history when the list is small enough that the
  // fan-out stays cheap; larger workspaces fall back to point-in-time rows.
  const showTrends = monitors.length <= 30;

  return (
    <div className="flex flex-col gap-7">
      {(pausedCount > 0 || usageWarning) && (
        <BillingAlert
          wid={wid}
          pausedCount={pausedCount}
          usageWarning={usageWarning}
          monitorsUsage={monitorsUsage}
        />
      )}

      {/* system status hero — one calm line */}
      <div
        className="flex flex-col gap-4 rounded-[var(--radius-lg)] border bg-[var(--color-bg-elev)] p-5 shadow-[var(--shadow-xs)] sm:flex-row sm:items-center"
        style={{
          borderColor: allGood
            ? "var(--color-border)"
            : `color-mix(in srgb, ${heroColor} 30%, var(--color-border))`,
        }}
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: `color-mix(in srgb, ${heroColor} 14%, transparent)` }}
        >
          <span
            className={cn("inline-block h-[11px] w-[11px] rounded-full", allGood && "pulse-dot")}
            style={{
              background: heroColor,
              boxShadow: `0 0 10px color-mix(in srgb, ${heroColor} 60%, transparent)`,
            }}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-medium tracking-tight text-[var(--color-fg)]">
            {heroLine}
          </div>
          <div className="mt-0.5 text-[13px] text-[var(--color-fg-muted)]">
            {openIncidents.length} open incident{openIncidents.length === 1 ? "" : "s"}
            {lastChecked && ` · last check ${lastSeen(lastChecked)}`}
            {" · "}refreshes every 15s
          </div>
          {monitors.length > 0 && (
            <StatusBreakdownBar counts={byStatus} total={monitors.length} className="mt-3" />
          )}
        </div>
        {statusPageLive && publicUrl && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[12px] font-medium text-[var(--color-fg)] no-underline transition-colors hover:bg-[var(--color-bg-row)]"
            >
              <ExternalLink size={13} />
              Status page
            </a>
            <CopyLinkButton url={publicUrl} />
          </div>
        )}
      </div>

      {needsAttention && (
        <section className="flex flex-col gap-5">
          {openIncidents.length > 0 && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <SectionHead className="mb-0">Needs attention</SectionHead>
                <Link
                  to="/$wid/incidents"
                  params={{ wid }}
                  className="inline-flex items-center gap-1 text-[12px] text-[var(--color-link)] no-underline hover:underline"
                >
                  All incidents <ArrowRight size={12} />
                </Link>
              </div>
              <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]">
                {openIncidents.slice(0, 4).map((incident) => (
                  <IncidentLine key={incident.id} wid={wid} incident={incident} />
                ))}
              </div>
            </div>
          )}

          {affected.length > 0 && (
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <SectionHead className="mb-0">{`Affected monitors (${affected.length})`}</SectionHead>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[12px] text-[var(--color-link)]"
                  onClick={() => setFilter(byStatus.down > 0 ? "down" : "degraded")}
                >
                  Jump to list <ArrowRight size={12} />
                </Button>
              </div>
              <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]">
                {affected.slice(0, 6).map((m) => (
                  <MonitorRow key={m.id} wid={wid} monitor={m} trends={showTrends} compact />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* additive KPI row — health & scale, not a restatement of the hero */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Monitors"
          value={String(monitors.length)}
          sub={`${active.length} active${pausedCount > 0 ? ` · ${pausedCount} paused` : ""}`}
        />
        <StatTile
          label="Avg latency"
          value={withUnit(avgLatency)}
          sub="across monitors"
          accent={avgLatency != null && avgLatency > 1000 ? "var(--color-warn)" : undefined}
        />
        <StatTile
          label="Open incidents"
          value={String(openIncidents.length)}
          sub={openIncidents.length > 0 ? "needs attention" : "all clear"}
          accent={openIncidents.length > 0 ? "var(--color-err)" : "var(--color-ok)"}
        />
        <StatTile
          label="Checks / min"
          value={checksPerMin > 0 && checksPerMin < 1 ? "<1" : Math.round(checksPerMin)}
          sub={`${regionCount} regions`}
        />
      </div>

      {/* every monitor, worst-first, filterable */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <SectionHead className="mb-0">All monitors</SectionHead>
            <Link
              to="/$wid/monitors"
              params={{ wid }}
              className="inline-flex items-center gap-1 text-[12px] text-[var(--color-link)] no-underline hover:underline"
            >
              Canvas view <ArrowRight size={12} />
            </Link>
          </div>
          <StatusFilterBar
            counts={byStatus}
            total={monitors.length}
            value={filter}
            onChange={setFilter}
          />
        </div>
        {shown.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-5 text-[13px] text-[var(--color-fg-muted)] shadow-[var(--shadow-xs)]">
            No {filter === "all" ? "" : filter + " "}monitors.
            {filter !== "all" && (
              <button
                type="button"
                onClick={() => setFilter("all")}
                className="ml-1 text-[var(--color-link)] hover:underline"
              >
                Show all
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]">
            {shown.map((m) => (
              <MonitorRow key={m.id} wid={wid} monitor={m} trends={showTrends} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function withUnit(ms: number | null) {
  if (ms == null) return "—";
  return (
    <>
      {ms}
      <span className="ml-0.5 text-[12px] font-normal text-[var(--color-fg-dim)]">ms</span>
    </>
  );
}

function BillingAlert({
  wid,
  pausedCount,
  usageWarning,
  monitorsUsage,
}: {
  wid: string;
  pausedCount: number;
  usageWarning: boolean;
  monitorsUsage: ReturnType<typeof usageNumbers>;
}) {
  const title =
    pausedCount > 0 ? "Checks paused" : "Approaching plan limit";
  const message =
    pausedCount > 0 && usageWarning
      ? `${pausedCount} monitor${pausedCount === 1 ? "" : "s"} paused by billing · monitor usage at ${Math.round(monitorsUsage.percent ?? 0)}%`
      : pausedCount > 0
        ? `${pausedCount} monitor${pausedCount === 1 ? " is" : "s are"} paused — upgrade or remove monitors to resume checks`
        : `Monitor usage is at ${Math.round(monitorsUsage.percent ?? 0)}% of your plan limit`;

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-warn)_8%,var(--color-bg-elev))] p-4 shadow-[var(--shadow-xs)] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--color-warn)]" />
        <div>
          <p className="text-[13px] font-medium text-[var(--color-fg)]">{title}</p>
          <p className="mt-0.5 text-[12px] text-[var(--color-fg-muted)]">{message}</p>
        </div>
      </div>
      <Link
        to="/$wid/settings/billing"
        params={{ wid }}
        search={{ checkout: undefined }}
        className="inline-flex h-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[12px] font-medium text-[var(--color-fg)] no-underline transition-colors hover:bg-[var(--color-bg-row)]"
      >
        View billing
      </Link>
    </div>
  );
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={copy}
      className="h-8 gap-1.5 border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[12px] font-medium text-[var(--color-fg)] hover:bg-[var(--color-bg-row)]"
    >
      {copied ? <CheckIcon size={13} /> : <Copy size={13} />}
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

/** Thin segmented bar showing the proportion of monitors in each status. */
function StatusBreakdownBar({
  counts,
  total,
  className,
}: {
  counts: Record<MonitorStatus, number>;
  total: number;
  className?: string;
}) {
  const segments: { status: MonitorStatus; n: number; color: string }[] = (
    [
      { status: "up", n: counts.up, color: STATUS_COLOR.up },
      { status: "degraded", n: counts.degraded, color: STATUS_COLOR.degraded },
      { status: "down", n: counts.down, color: STATUS_COLOR.down },
      { status: "unknown", n: counts.unknown, color: STATUS_COLOR.unknown },
    ] as { status: MonitorStatus; n: number; color: string }[]
  ).filter((s) => s.n > 0);

  if (segments.length === 0) return null;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-row)]">
        {segments.map((s) => (
          <div
            key={s.status}
            className="h-full transition-all duration-500"
            style={{ width: `${(s.n / total) * 100}%`, background: s.color }}
            title={`${s.n} ${s.status}`}
          />
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2.5 text-[11px] text-[var(--color-fg-dim)] tabular">
        {segments.map((s) => (
          <span key={s.status} className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
            {s.n}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Status filter pills that double as the per-status count readout. */
function StatusFilterBar({
  counts,
  total,
  value,
  onChange,
}: {
  counts: Record<MonitorStatus, number>;
  total: number;
  value: Filter;
  onChange: (f: Filter) => void;
}) {
  const pills: { value: Filter; label: string; n: number; color?: string }[] = [
    { value: "all", label: "All", n: total },
    { value: "down", label: "Down", n: counts.down, color: STATUS_COLOR.down },
    { value: "degraded", label: "Degraded", n: counts.degraded, color: STATUS_COLOR.degraded },
    { value: "up", label: "Up", n: counts.up, color: STATUS_COLOR.up },
  ];
  if (counts.unknown > 0) {
    pills.push({ value: "unknown", label: "Idle", n: counts.unknown, color: STATUS_COLOR.unknown });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pills.map((p) => {
        const active = value === p.value;
        return (
          <Button
            key={p.value}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(active && p.value !== "all" ? "all" : p.value)}
            className={cn(
              "h-7 rounded-full px-2.5 text-[12px] font-medium shadow-none",
              active
                ? "border-[var(--color-border-hi)] bg-[var(--color-bg-elev)] text-[var(--color-fg)] shadow-[var(--shadow-xs)]"
                : "border-transparent text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-row)] hover:text-[var(--color-fg)]",
            )}
          >
            {p.color && (
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: p.color }} />
            )}
            {p.label}
            <span className="tabular text-[11px] text-[var(--color-fg-dim)]">{p.n}</span>
          </Button>
        );
      })}
    </div>
  );
}

/** One monitor as a dense, scannable row with a live latency sparkline. */
function MonitorRow({
  wid,
  monitor,
  trends,
  compact = false,
}: {
  wid: string;
  monitor: Monitor;
  trends: boolean;
  compact?: boolean;
}) {
  const status = monitorStatus(monitor);
  const color = STATUS_COLOR[status];
  const KindIcon = PROBE_ICON[monitor.kind];
  const paused = !monitor.enabled || !!monitor.billing_paused_at;
  const { data: checks } = useChecks(wid, monitor.slug || monitor.id, 24, undefined, trends);

  return (
    <Link
      to="/$wid/monitors/$mid"
      params={{ wid, mid: monitor.slug || monitor.id }}
      className="block border-b border-[var(--color-border)] no-underline transition-colors last:border-b-0 hover:bg-[var(--color-bg-row)]"
      style={{
        boxShadow:
          status === "down"
            ? "inset 3px 0 0 0 color-mix(in srgb, var(--color-err) 70%, transparent)"
            : status === "degraded"
              ? "inset 3px 0 0 0 color-mix(in srgb, var(--color-warn) 65%, transparent)"
              : undefined,
      }}
    >
      <motion.div
        initial="rest"
        animate="rest"
        whileHover="hover"
        className="flex items-center gap-4 px-4 py-3"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            className={cn("h-2 w-2 shrink-0 rounded-full", status === "up" && "pulse-dot")}
            style={{
              background: color,
              boxShadow: `0 0 10px color-mix(in srgb, ${color} 60%, transparent)`,
            }}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[13.5px] font-medium text-[var(--color-fg)]">
                {monitor.name}
              </span>
              {paused && (
                <span className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-bg-row)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--color-fg-dim)]">
                  {monitor.billing_paused_at ? "paused" : "off"}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-[var(--color-fg-dim)]">
              <KindIcon size={11} className="shrink-0" />
              <span className="mono truncate">{monitor.target}</span>
            </div>
          </div>
        </div>

        {monitor.regions.length > 1 && (
          <div className="hidden shrink-0 items-center gap-1 lg:flex" title="Per-region status">
            {monitor.regions.slice(0, 5).map((r) => (
              <span
                key={r.id}
                className="h-[6px] w-[6px] rounded-full"
                style={{ background: regionColor(r.last_status) }}
                title={`${r.name}: ${regionLabel(r.last_status)}`}
              />
            ))}
            {monitor.regions.length > 5 && (
              <span className="text-[10px] text-[var(--color-fg-dim)]">
                +{monitor.regions.length - 5}
              </span>
            )}
          </div>
        )}

        {!compact && trends && (
          <div className="hidden shrink-0 md:block">
            <Sparkline checks={checks} status={status} />
          </div>
        )}

        <span className="mono tabular w-[52px] shrink-0 text-right text-[13px] text-[var(--color-fg)]">
          {monitor.last_latency_ms != null ? (
            <>
              {monitor.last_latency_ms}
              <span className="text-[10px] text-[var(--color-fg-dim)]">ms</span>
            </>
          ) : (
            <span className="text-[var(--color-fg-dim)]">—</span>
          )}
        </span>

        <span className="tabular hidden w-[64px] shrink-0 text-right text-[11.5px] text-[var(--color-fg-dim)] sm:block">
          {lastSeen(monitor.last_checked_at)}
        </span>

        <span
          className={cn(
            "shrink-0 text-right text-[10.5px] font-semibold uppercase tracking-[0.08em]",
            compact ? "w-[72px]" : "hidden w-[84px] sm:block",
          )}
          style={{ color }}
        >
          {STATUS_LABEL[status]}
        </span>

        <AnimatedIcon
          icon={ChevronRight}
          animation="slideX"
          trigger="group"
          size={14}
          className="text-[var(--color-fg-dim)]"
        />
      </motion.div>
    </Link>
  );
}

/** Inline latency sparkline over the most recent checks (no chart deps). */
function Sparkline({ checks, status }: { checks: Check[] | undefined; status: MonitorStatus }) {
  const W = 84;
  const H = 26;
  const PAD = 3;
  const base = H - PAD;

  if (!checks) {
    return <div className="shimmer h-[26px] w-[84px] rounded-[var(--radius-sm)]" aria-hidden />;
  }

  const series = [...checks].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  const known = series
    .map((c, i) => ({ i, v: c.latency_ms }))
    .filter((p): p is { i: number; v: number } => p.v != null);

  if (known.length === 0) {
    return (
      <svg width={W} height={H} aria-hidden>
        <line
          x1={PAD}
          y1={H / 2}
          x2={W - PAD}
          y2={H / 2}
          stroke="var(--color-border-hi)"
          strokeWidth={1.5}
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  const vals = known.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const n = series.length;
  const x = (i: number) => (n <= 1 ? W / 2 : PAD + (i / (n - 1)) * (W - 2 * PAD));
  const y = (v: number) => base - ((v - min) / span) * (H - 2 * PAD);

  const color = STATUS_COLOR[status];
  const line = known.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `M${x(known[0].i).toFixed(1)},${base} L${line.replaceAll(" ", " L")} L${x(
    known[known.length - 1].i,
  ).toFixed(1)},${base} Z`;
  const incidents = series.filter((c) => c.status === 0 || c.status === 2);

  return (
    <svg width={W} height={H} aria-hidden className="block">
      <path d={area} fill={color} opacity={0.1} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {incidents.map((c, k) => (
        <circle
          key={k}
          cx={x(series.indexOf(c))}
          cy={base}
          r={1.6}
          fill={c.status === 0 ? "var(--color-err)" : "var(--color-warn)"}
        />
      ))}
    </svg>
  );
}

function regionColor(status: number | null): string {
  if (status === 1) return "var(--color-ok)";
  if (status === 2) return "var(--color-warn)";
  if (status === 0) return "var(--color-err)";
  return "var(--color-unknown)";
}

function regionLabel(status: number | null): string {
  if (status === 1) return "up";
  if (status === 2) return "degraded";
  if (status === 0) return "down";
  return "idle";
}

function IncidentLine({ wid, incident }: { wid: string; incident: Incident }) {
  const color = severityColor(incident.severity);
  const content = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{
            background: color,
            boxShadow: `0 0 10px color-mix(in srgb, ${color} 60%, transparent)`,
          }}
        />
        <span className="truncate text-[13px] font-medium text-[var(--color-fg)]">
          {incident.title || incident.monitor_name || "Incident"}
        </span>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
          style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}
        >
          {incident.severity}
        </span>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-[var(--color-fg-muted)]">
        <Clock size={12} /> {lastSeen(incident.started_at)}
      </span>
    </>
  );
  const className =
    "flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-4 py-3 no-underline transition-colors last:border-b-0 hover:bg-[var(--color-bg-row)]";

  if (incident.monitor_id) {
    return (
      <Link
        to="/$wid/monitors/$mid"
        params={{ wid, mid: incident.monitor_slug || incident.monitor_id }}
        className={className}
      >
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}

function SectionHead({ children, className }: { children: string; className?: string }) {
  return (
    <h2
      className={
        "mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]" +
        (className ? ` ${className}` : "")
      }
    >
      {children}
    </h2>
  );
}

function severityColor(severity: IncidentSeverity) {
  if (severity === "down" || severity === "critical") return "var(--color-err)";
  if (severity === "degraded" || severity === "maintenance" || severity === "minor") {
    return "var(--color-warn)";
  }
  if (severity === "informational") return "var(--color-accent)";
  return "var(--color-unknown)";
}
