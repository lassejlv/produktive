import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check as CheckIcon, Clock, Copy, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "../lib/api";
import { useChecks, useMonitor, useStats, useUpdateMonitor } from "../lib/queries";
import { monitorStatus, type Check, type MonitorRegion } from "../lib/types";
import { Button } from "../components/Button";
import { FullPageSpinner } from "../components/Spinner";
import { DslEditor } from "../components/DslEditor";
import { Segmented } from "../components/Segmented";
import { StatTile } from "../components/StatTile";
import { LatencyChart } from "../components/LatencyChart";
import { MonitorMenu } from "../components/MonitorMenu";
import { PROBE_ICON } from "../components/ProbeIcons";
import { STATUS_COLOR, STATUS_LABEL } from "../lib/status";
import { cn } from "#/lib/cn";

export const Route = createFileRoute("/_authed/$wid/monitors/$mid")({
  staticData: {
    title: "Monitor",
    layout: "bare",
    parent: { label: "Monitors", to: "/$wid/monitors" },
  },
  component: MonitorDetail,
});

type Win = "24h" | "7d" | "30d";
type Tab = "checks" | "config";
type CheckFilter = "all" | "fail";

function MonitorDetail() {
  const { wid, mid } = Route.useParams();
  const [win, setWin] = useState<Win>("7d");
  const [tab, setTab] = useState<Tab>("checks");
  const [checkFilter, setCheckFilter] = useState<CheckFilter>("all");
  const [selectedRegion, setSelectedRegion] = useState("all");

  const monitor = useMonitor(wid, mid);
  const stats = useStats(wid, mid, win, selectedRegion);
  const checks = useChecks(wid, mid, 200, selectedRegion);
  const update = useUpdateMonitor(wid);

  const rows = useMemo(() => {
    const data = checks.data ?? [];
    const filtered = checkFilter === "fail" ? data.filter((c) => c.status !== 1) : data;
    return filtered.slice(0, 100);
  }, [checks.data, checkFilter]);

  if (monitor.isLoading) return <FullPageSpinner label="Loading monitor…" />;
  if (monitor.isError) {
    const is404 = monitor.error instanceof ApiError && monitor.error.status === 404;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="text-[15px] font-medium text-[var(--color-fg)]">
          {is404 ? "Monitor not found" : "Could not load monitor"}
        </div>
        <div className="max-w-sm text-[13px] text-[var(--color-fg-muted)]">
          {is404
            ? "This monitor may have been deleted or the link is incorrect."
            : monitor.error instanceof Error
              ? monitor.error.message
              : "Something went wrong."}
        </div>
        <Link
          to="/$wid/monitors"
          params={{ wid }}
          className="mt-2 text-[13px] text-[var(--color-link)] no-underline hover:underline"
        >
          Back to monitors
        </Link>
      </div>
    );
  }
  if (!monitor.data)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="text-[15px] font-medium text-[var(--color-fg)]">Monitor not found</div>
        <Link
          to="/$wid/monitors"
          params={{ wid }}
          className="text-[13px] text-[var(--color-link)] no-underline hover:underline"
        >
          Back to monitors
        </Link>
      </div>
    );

  const m = monitor.data;
  const status = monitorStatus(m);
  const color = STATUS_COLOR[status];
  const KindIcon = PROBE_ICON[m.kind];
  const regions = m.regions ?? [];

  return (
    <div className="fade-in mx-auto max-w-5xl px-6 py-7 lg:px-8">
      <Link
        to="/$wid/monitors"
        params={{ wid }}
        className="text-[12px] text-[var(--color-fg-muted)] no-underline hover:text-[var(--color-fg)] inline-flex items-center gap-1.5 mb-5"
      >
        <ArrowLeft size={12} /> All monitors
      </Link>

      {/* header */}
      <div className="flex items-start justify-between gap-6 mb-7">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={cn(
                "inline-block w-2.5 h-2.5 rounded-full",
                status === "up" && "pulse-dot",
              )}
              style={{
                background: color,
                boxShadow: `0 0 12px color-mix(in srgb, ${color} 60%, transparent)`,
              }}
            />
            <h1 className="text-[23px] font-medium tracking-tight text-[var(--color-fg)] truncate">
              {m.name}
            </h1>
            <Badge color={color}>{STATUS_LABEL[status]}</Badge>
            {m.billing_paused_at && <Badge color="var(--color-warn)">billing paused</Badge>}
            {!m.enabled && <Badge color="var(--color-unknown)">paused</Badge>}
          </div>
          <CopyTarget target={m.target} />
          {/* quiet meta line — kind · interval · per-region health */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-[var(--color-fg-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <KindIcon size={12} className="text-[var(--color-fg-dim)]" /> {m.kind.toUpperCase()}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock size={12} className="text-[var(--color-fg-dim)]" /> every {m.interval_seconds}s
            </span>
            {regions.length > 0 && <RegionBadges regions={regions} />}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant={m.enabled ? "secondary" : "primary"}
            size="sm"
            disabled={update.isPending}
            onClick={() =>
              update.mutate(
                { id: m.id, patch: { enabled: !m.enabled } },
                {
                  onSuccess: () => toast.success(m.enabled ? "Monitor paused" : "Monitor resumed"),
                  onError: (err) => toast.error((err as Error).message),
                },
              )
            }
          >
            {m.enabled ? <Pause size={13} /> : <Play size={13} />}
            {m.enabled ? "Pause" : "Resume"}
          </Button>
          <MonitorMenu monitor={m} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <StatTile
          label="Uptime"
          loading={stats.isLoading}
          value={stats.data ? `${stats.data.uptime_percent.toFixed(2)}%` : "—"}
          accent={
            stats.data
              ? stats.data.uptime_percent >= 99.9
                ? "var(--color-ok)"
                : stats.data.uptime_percent >= 95
                  ? "var(--color-warn)"
                  : "var(--color-err)"
              : undefined
          }
          sub={`over ${win}`}
        />
        <StatTile
          label="Avg latency"
          loading={stats.isLoading}
          value={
            stats.data?.avg_latency_ms != null ? `${Math.round(stats.data.avg_latency_ms)}` : "—"
          }
          sub="ms response"
        />
        <StatTile
          label="Checks"
          loading={stats.isLoading}
          value={stats.data ? stats.data.total.toLocaleString() : "—"}
          sub={`${win} total`}
        />
        <StatTile
          label="Failures"
          loading={stats.isLoading}
          value={stats.data ? stats.data.down.toLocaleString() : "—"}
          accent={stats.data && stats.data.down > 0 ? "var(--color-err)" : undefined}
          sub={`${win} window`}
        />
      </div>

      {/* latency chart — the time-window control lives here only */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)] p-4 mb-8">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <span className="text-[12px] font-medium text-[var(--color-fg)]">Response time</span>
          <div className="flex items-center gap-2">
            {regions.length > 1 && (
              <select
                value={selectedRegion}
                onChange={(event) => setSelectedRegion(event.target.value)}
                className="h-8 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 text-[12px] text-[var(--color-fg)]"
              >
                <option value="all">All regions</option>
                {regions.map((region) => (
                  <option key={region.slug} value={region.slug}>
                    {region.name}
                  </option>
                ))}
              </select>
            )}
            <Segmented<Win>
              size="sm"
              value={win}
              onChange={setWin}
              options={[
                { value: "24h", label: "24h" },
                { value: "7d", label: "7d" },
                { value: "30d", label: "30d" },
              ]}
            />
          </div>
        </div>
        {checks.isLoading ? (
          <div className="h-[168px] flex items-center justify-center">
            <FullPageSpinner />
          </div>
        ) : checks.data && checks.data.length > 0 ? (
          <LatencyChart checks={checks.data} />
        ) : (
          <div className="h-[168px] flex items-center justify-center text-[12px] text-[var(--color-fg-dim)]">
            No checks recorded yet.
          </div>
        )}
      </div>

      {/* tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border)] mb-5">
        <TabButton active={tab === "checks"} onClick={() => setTab("checks")}>
          Recent checks
        </TabButton>
        <TabButton active={tab === "config"} onClick={() => setTab("config")}>
          Configuration
        </TabButton>
      </div>

      {tab === "config" ? (
        <DslEditor
          wid={wid}
          mid={mid}
          initialSource={m.dsl_source}
          monitorKind={m.kind}
          monitorTarget={m.target}
          monitorInterval={m.interval_seconds}
        />
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] text-[var(--color-fg-muted)] tabular">
              Showing {rows.length} check{rows.length === 1 ? "" : "s"}
            </span>
            <Segmented<CheckFilter>
              size="sm"
              value={checkFilter}
              onChange={setCheckFilter}
              options={[
                { value: "all", label: "All" },
                { value: "fail", label: "Failures" },
              ]}
            />
          </div>
          <ChecksTable rows={rows} loading={checks.isLoading} showRegion={regions.length > 1} />
        </div>
      )}
    </div>
  );
}

function ChecksTable({
  rows,
  loading,
  showRegion,
}: {
  rows: Check[];
  loading: boolean;
  showRegion: boolean;
}) {
  const columns = showRegion
    ? "grid-cols-[150px_90px_100px_100px_1fr]"
    : "grid-cols-[150px_110px_110px_1fr]";
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)] overflow-hidden">
      <div
        className={cn(
          "grid gap-3 text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)] px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg-sunken)] font-medium",
          columns,
        )}
      >
        <span>Time</span>
        {showRegion && <span>Region</span>}
        <span>Status</span>
        <span className="text-right">Latency</span>
        <span>Detail</span>
      </div>
      {loading && (
        <div className="px-4 py-8 text-center">
          <FullPageSpinner />
        </div>
      )}
      {!loading &&
        rows.map((c, idx) => {
          const sColor =
            c.status === 1
              ? "var(--color-ok)"
              : c.status === 2
                ? "var(--color-warn)"
                : "var(--color-err)";
          return (
            <div
              key={`${c.time}-${idx}`}
              className={cn(
                "grid gap-3 px-4 py-2 text-[12.5px] items-center",
                columns,
                idx !== rows.length - 1 && "border-b border-[var(--color-border)]",
                "hover:bg-[var(--color-bg-row)] transition-colors",
              )}
            >
              <span
                className="text-[var(--color-fg-muted)] mono tabular truncate"
                title={new Date(c.time).toLocaleString()}
              >
                {new Date(c.time).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              {showRegion && (
                <span className="truncate text-[var(--color-fg-muted)] text-[12px]">
                  {c.region_name ?? c.region_slug ?? "—"}
                </span>
              )}
              <span className="flex items-center gap-1.5" style={{ color: sColor }}>
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ background: sColor }}
                />
                {c.status === 1 ? "up" : c.status === 2 ? "degraded" : "down"}
                {c.status_code != null && (
                  <span className="mono text-[10px] text-[var(--color-fg-dim)]">
                    {c.status_code}
                  </span>
                )}
              </span>
              <span className="text-right text-[var(--color-fg)] mono tabular">
                {c.latency_ms != null ? `${c.latency_ms}ms` : "—"}
              </span>
              <span className="truncate text-[var(--color-err)] text-[12px]">
                {c.error_message ?? ""}
              </span>
            </div>
          );
        })}
      {!loading && rows.length === 0 && (
        <div className="px-4 py-10 text-center text-[12px] text-[var(--color-fg-dim)]">
          No checks to show.
        </div>
      )}
    </div>
  );
}

function CopyTarget({ target }: { target: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(target).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        });
      }}
      className="group mt-2 inline-flex items-center gap-2 mono text-[12px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] max-w-full"
      title="Copy target"
    >
      <span className="truncate">{target}</span>
      {copied ? (
        <CheckIcon size={12} className="text-[var(--color-ok)] shrink-0" />
      ) : (
        <Copy
          size={12}
          className="text-[var(--color-fg-dim)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        />
      )}
    </button>
  );
}

function RegionBadges({ regions }: { regions: MonitorRegion[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {regions.map((region) => {
        const status =
          region.last_status === 1
            ? "up"
            : region.last_status === 2
              ? "degraded"
              : region.last_status === 0
                ? "down"
                : "unknown";
        const color = STATUS_COLOR[status];
        return (
          <span
            key={region.slug}
            className="inline-flex h-6 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-2 text-[11px] text-[var(--color-fg-muted)]"
            title={region.last_error ?? region.name}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
            {region.name}
          </span>
        );
      })}
    </span>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative px-3 h-9 text-[13px] font-medium transition-colors -mb-px",
        active
          ? "text-[var(--color-fg)]"
          : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
      )}
    >
      {children}
      {active && (
        <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[var(--color-accent)] rounded-full" />
      )}
    </button>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center px-2 h-5 text-[10px] uppercase tracking-[0.08em] font-medium rounded-full"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}
