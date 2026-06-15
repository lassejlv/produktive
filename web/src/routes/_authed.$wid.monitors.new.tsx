import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Clock, FileCode, Globe, SquarePen } from "lucide-react";
import { toast } from "#/lib/toast";
import { Button } from "#/components/ui/button";
import { Input } from "../components/Input";
import {
  HttpIcon,
  PingIcon,
  PostgresIcon,
  RedisIcon,
  SshIcon,
  TcpIcon,
  type ProbeIcon,
} from "../components/ProbeIcons";
import { PageActions } from "../components/PageLayout";
import { Segmented } from "../components/Segmented";
import { Spinner } from "#/components/ui/spinner";
import {
  useBillingSummary,
  useCreateMonitor,
  useRegions,
  useValidateDsl,
  useWorkspaces,
  type DslError,
} from "../lib/queries";
import {
  buildMonitorCreateCostEstimate,
  parseDslIntervalSeconds,
  type MeterCostLine,
  type MonitorCreateCostEstimate,
  type UsageLimitStatus,
} from "../lib/billing";
import {
  buildIntervalOptions,
  formatInterval,
  minimumIntervalSeconds,
  presetForInterval,
  type IntervalPreset,
} from "../lib/monitorInterval";
import type { MonitorKind } from "../lib/types";
import { cn } from "#/lib/cn";

const MonacoDsl = lazy(() => import("../components/MonacoDsl"));

export const Route = createFileRoute("/_authed/$wid/monitors/new")({
  staticData: {
    title: "New monitor",
    description:
      "Add a probe and where to run it. Rules and alerts can be configured after creation.",
    parent: { label: "Monitors", to: "/$wid/monitors" },
  },
  component: NewMonitorPage,
});

const KINDS: { value: MonitorKind; label: string; hint: string; icon: ProbeIcon }[] = [
  { value: "http", label: "HTTP", hint: "Web endpoint or API", icon: HttpIcon },
  { value: "tcp", label: "TCP", hint: "Raw socket", icon: TcpIcon },
  { value: "ping", label: "Ping", hint: "ICMP reachability", icon: PingIcon },
  { value: "postgres", label: "Postgres", hint: "SQL query", icon: PostgresIcon },
  { value: "redis", label: "Redis", hint: "Command probe", icon: RedisIcon },
  { value: "ssh", label: "SSH", hint: "Banner probe", icon: SshIcon },
];

type Mode = "form" | "code";

function NewMonitorPage() {
  const { wid } = Route.useParams();
  const nav = useNavigate();
  const create = useCreateMonitor(wid);
  const [mode, setMode] = useState<Mode>("form");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<MonitorKind>("http");
  const [target, setTarget] = useState("");
  const [postgresQuery, setPostgresQuery] = useState("SELECT 1");
  const [redisCommand, setRedisCommand] = useState("PING");
  const [interval, setInterval] = useState(900);
  const [intervalPreset, setIntervalPreset] = useState<IntervalPreset>("900");
  const [selectedRegions, setSelectedRegions] = useState<string[]>(["eu-west"]);
  const [source, setSource] = useState<string>(() => defaultTemplate("http", "", 900));
  const [parseError, setParseError] = useState<DslError | null>(null);
  const validate = useValidateDsl(wid);
  const regions = useRegions(wid);
  const billing = useBillingSummary(wid);
  const workspaces = useWorkspaces();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspace = workspaces.data?.find((item) => item.id === wid || item.slug === wid);
  const canChangeRegions = workspace?.role === "owner";
  const currentPlan = billing.data?.plans.find((plan) => plan.current);
  const minimumInterval = minimumIntervalSeconds(currentPlan);
  const intervalOptions = buildIntervalOptions(minimumInterval);
  const selectedKind = KINDS.find((k) => k.value === kind);
  const submitDisabled = create.isPending || (mode === "code" && !!parseError);
  const effectiveInterval = useMemo(() => {
    if (mode === "form") return interval;
    return parseDslIntervalSeconds(source) ?? null;
  }, [mode, interval, source]);
  const costEstimate = useMemo(
    () =>
      buildMonitorCreateCostEstimate({
        billing: billing.data,
        currentPlan,
        intervalSeconds: effectiveInterval,
        regionCount: selectedRegions.length,
      }),
    [billing.data, currentPlan, effectiveInterval, selectedRegions.length],
  );

  function switchMode(next: Mode) {
    if (next === "code") {
      const placeholder = target || defaultTarget(kind);
      setSource(defaultTemplate(kind, placeholder, interval, postgresQuery, redisCommand));
    }
    setMode(next);
  }

  useEffect(() => {
    if (mode !== "code") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      validate.mutate(source, {
        onSuccess: (r) => {
          if (r.ok) setParseError(null);
          else if (r.error) setParseError(r.error);
        },
        onError: () => setParseError(null),
      });
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, mode]);

  useEffect(() => {
    if (!regions.data?.length) return;
    setSelectedRegions((current) => {
      const available = new Set(regions.data.map((region) => region.slug));
      const kept = current.filter((slug) => available.has(slug));
      if (kept.length > 0) return kept;
      return [regions.data[0].slug];
    });
  }, [regions.data]);

  useEffect(() => {
    if (interval >= minimumInterval) return;
    setInterval(minimumInterval);
    setIntervalPreset(presetForInterval(minimumInterval));
  }, [interval, minimumInterval]);

  function toggleRegion(slug: string) {
    if (!canChangeRegions) return;
    setSelectedRegions((current) => {
      if (current.includes(slug)) {
        const next = current.filter((value) => value !== slug);
        return next.length > 0 ? next : current;
      }
      return [...current, slug];
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    const body =
      mode === "form"
        ? kind === "postgres" || kind === "redis"
          ? {
              name,
              dsl_source: defaultTemplate(kind, target, interval, postgresQuery, redisCommand),
              enabled: true,
              region_slugs: selectedRegions,
            }
          : {
              name,
              kind,
              target,
              interval_seconds: interval,
              enabled: true,
              region_slugs: selectedRegions,
            }
        : { name, dsl_source: source, enabled: true, region_slugs: selectedRegions };
    create.mutate(body, {
      onSuccess: () => {
        toast.success("Monitor created");
        nav({ to: "/$wid/monitors", params: { wid } });
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  const regionList = regions.data ?? [
    { slug: "eu-west", name: "eu-west", capabilities: KINDS.map((k) => k.value) },
  ];

  return (
    <>
      <PageActions>
        <Segmented<Mode>
          value={mode}
          onChange={switchMode}
          size="sm"
          options={[
            { value: "form", label: "Form", icon: SquarePen },
            { value: "code", label: "Code", icon: FileCode },
          ]}
        />
        <Button
          type="submit"
          form="new-monitor"
          variant="default"
          size="sm"
          disabled={submitDisabled}
        >
          {create.isPending && <Spinner className="size-3" />}
          {create.isPending ? "Creating…" : "Create monitor"}
        </Button>
      </PageActions>

      <div
        className={cn(
          "grid grid-cols-1 gap-8",
          mode === "form"
            ? "xl:grid-cols-[minmax(0,640px)_minmax(280px,320px)]"
            : "max-w-5xl xl:max-w-none xl:grid-cols-[minmax(0,1fr)_300px]",
        )}
      >
        <form id="new-monitor" onSubmit={onSubmit} className="min-w-0">
          {mode === "form" ? (
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-xs)]">
              <FieldGroup>
                <Input
                  label="Name"
                  placeholder="api.acme.com"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </FieldGroup>

              <Divider />

              <FieldGroup className="flex flex-col gap-4">
                <div>
                  <FieldLabel>Probe type</FieldLabel>
                  <div className="mt-2 grid grid-cols-3 gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] p-1 sm:grid-cols-6">
                    {KINDS.map((k) => {
                      const Icon = k.icon;
                      const active = kind === k.value;
                      return (
                        <Button
                          key={k.value}
                          type="button"
                          variant="ghost"
                          size="sm"
                          title={k.hint}
                          onClick={() => setKind(k.value)}
                          className={cn(
                            "h-auto flex-col gap-1.5 rounded-[var(--radius-sm)] px-1 py-2.5 shadow-none",
                            active
                              ? "bg-[var(--color-bg-elev)] text-[var(--color-fg)] shadow-[var(--shadow-xs)]"
                              : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
                          )}
                        >
                          <Icon
                            size={15}
                            className={active ? "text-[var(--color-accent)]" : undefined}
                          />
                          <span className="text-[11px] font-medium leading-none">{k.label}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <Input
                  label="Target"
                  className="mono"
                  placeholder={defaultTarget(kind)}
                  hint={selectedKind ? `${selectedKind.label} endpoint to probe.` : undefined}
                  required
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />

                {kind === "postgres" && (
                  <Input
                    label="SQL query"
                    className="mono"
                    placeholder="SELECT 1"
                    hint="Monitor is up when the query executes successfully."
                    required
                    value={postgresQuery}
                    onChange={(e) => setPostgresQuery(e.target.value)}
                  />
                )}

                {kind === "redis" && (
                  <Input
                    label="Redis command"
                    className="mono"
                    placeholder="PING"
                    hint="Monitor is up when the command executes successfully."
                    required
                    value={redisCommand}
                    onChange={(e) => setRedisCommand(e.target.value)}
                  />
                )}
              </FieldGroup>

              <Divider />

              <FieldGroup className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <FieldLabel>Check interval</FieldLabel>
                  <div className="mt-2">
                    <Segmented<IntervalPreset>
                      value={intervalPreset}
                      onChange={(v) => {
                        setIntervalPreset(v);
                        if (v !== "custom") setInterval(parseInt(v, 10));
                      }}
                      options={intervalOptions}
                      className="w-full"
                    />
                  </div>
                  {intervalPreset === "custom" && (
                    <div className="mt-3">
                      <Input
                        type="number"
                        label="Custom interval"
                        min={minimumInterval}
                        step={60}
                        value={interval}
                        onChange={(e) => {
                          const next = parseInt(e.target.value || String(minimumInterval), 10);
                          setInterval(
                            Number.isFinite(next)
                              ? Math.max(minimumInterval, next)
                              : minimumInterval,
                          );
                        }}
                        trailing="seconds"
                        aria-label="Custom interval in seconds"
                      />
                    </div>
                  )}
                  <p className="mt-2.5 text-[11px] text-[var(--color-fg-dim)]">
                    Plan minimum: every {formatInterval(minimumInterval)}.
                  </p>
                </div>

                <div>
                  <FieldLabel>Regions</FieldLabel>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {regionList.map((region) => {
                      const active = selectedRegions.includes(region.slug);
                      const supported =
                        !("capabilities" in region) || region.capabilities.includes(kind);
                      return (
                        <Button
                          key={region.slug}
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={!supported || !canChangeRegions}
                          onClick={() => toggleRegion(region.slug)}
                          className={cn(
                            "h-8 rounded-[var(--radius-sm)] px-2.5 text-[12px] font-medium shadow-none",
                            active
                              ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-fg)]"
                              : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
                            !supported && "cursor-not-allowed opacity-45",
                            !canChangeRegions && "cursor-not-allowed opacity-70",
                          )}
                          title={
                            !canChangeRegions
                              ? "Only workspace owners can change monitor regions"
                              : supported
                                ? `Run from ${region.name}`
                                : `${region.name} does not support ${kind} checks`
                          }
                        >
                          {region.name}
                        </Button>
                      );
                    })}
                  </div>
                  <p className="mt-2.5 text-[11px] text-[var(--color-fg-dim)]">
                    {canChangeRegions
                      ? "At least one region required."
                      : "Only workspace owners can change monitor regions."}
                  </p>
                </div>
              </FieldGroup>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <Input
                label="Name"
                placeholder="api.acme.com"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <FieldLabel>Monitor definition</FieldLabel>
                  <ValidStatus validating={validate.isPending} error={parseError} />
                </div>
                <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-sunken)] shadow-[var(--shadow-xs)]">
                  <Suspense
                    fallback={
                      <div className="flex h-[480px] items-center justify-center text-[12px] text-[var(--color-fg-muted)]">
                        <Spinner className="size-4" /> <span className="ml-2">Loading editor…</span>
                      </div>
                    }
                  >
                    <MonacoDsl
                      value={source}
                      onChange={setSource}
                      errorLine={parseError?.line ?? null}
                      errorMessage={parseError?.message ?? null}
                      height={480}
                    />
                  </Suspense>
                  {parseError && (
                    <div className="border-t border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-err)_8%,var(--color-bg-elev))] px-4 py-2.5 text-[12px] text-[var(--color-err)] mono">
                      {parseError.line}:{parseError.col} — {parseError.message}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <FieldLabel>Regions</FieldLabel>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {regionList.map((region) => {
                    const active = selectedRegions.includes(region.slug);
                    return (
                      <Button
                        key={region.slug}
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!canChangeRegions}
                        onClick={() => toggleRegion(region.slug)}
                        className={cn(
                          "h-8 rounded-[var(--radius-sm)] px-2.5 text-[12px] font-medium shadow-none",
                          active
                            ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-fg)]"
                            : "border-[var(--color-border)] bg-[var(--color-bg-elev)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
                          !canChangeRegions && "cursor-not-allowed opacity-70",
                        )}
                      >
                        {region.name}
                      </Button>
                    );
                  })}
                </div>
                <p className="mt-2.5 text-[11px] text-[var(--color-fg-dim)]">
                  {canChangeRegions
                    ? "At least one region required."
                    : "Only workspace owners can change monitor regions."}
                </p>
              </div>
            </div>
          )}

          {create.error && (
            <p className="mt-3 text-[12px] text-[var(--color-err)]">
              {(create.error as Error).message}
            </p>
          )}

          <div className="mt-4">
            <Button
              variant="ghost"
              type="button"
              size="sm"
              onClick={() => nav({ to: "/$wid/monitors", params: { wid } })}
            >
              Cancel
            </Button>
          </div>
        </form>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
          {mode === "form" && (
            <MonitorPreview
              name={name}
              kind={kind}
              target={target || defaultTarget(kind)}
              interval={interval}
              regions={selectedRegions}
            />
          )}
          <MonitorCostPanel wid={wid} estimate={costEstimate} billingLoading={billing.isLoading} />
        </aside>
      </div>
    </>
  );
}

function FieldGroup({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-4 py-4 sm:px-5 sm:py-5", className)}>{children}</div>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[12px] font-medium tracking-wide text-[var(--color-fg-muted)]">
      {children}
    </span>
  );
}

function Divider() {
  return <div className="h-px bg-[var(--color-border)]" />;
}

function MonitorPreview({
  name,
  kind,
  target,
  interval,
  regions,
}: {
  name: string;
  kind: MonitorKind;
  target: string;
  interval: number;
  regions: string[];
}) {
  const KindIcon = KINDS.find((k) => k.value === kind)?.icon ?? HttpIcon;

  return (
    <div className="sticky top-6 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5 shadow-[var(--shadow-xs)]">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
        Preview
      </div>
      <div className="mt-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <KindIcon size={16} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium tracking-tight text-[var(--color-fg)]">
            {name.trim() || "Untitled monitor"}
          </div>
          <div className="mono mt-1 truncate text-[12px] text-[var(--color-fg-muted)]">
            {target}
          </div>
        </div>
      </div>

      <dl className="mt-5 space-y-3 border-t border-[var(--color-border)] pt-4 text-[12px]">
        <PreviewRow icon={KindIcon} label="Type" value={kind.toUpperCase()} />
        <PreviewRow icon={Clock} label="Interval" value={`Every ${formatInterval(interval)}`} />
        <PreviewRow icon={Globe} label="Regions" value={regions.join(", ") || "—"} />
      </dl>
    </div>
  );
}

function PreviewRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-[var(--color-fg-dim)]">
        <Icon size={12} />
        {label}
      </dt>
      <dd className="truncate font-medium text-[var(--color-fg)]">{value}</dd>
    </div>
  );
}

function MonitorCostPanel({
  wid,
  estimate,
  billingLoading,
}: {
  wid: string;
  estimate: MonitorCreateCostEstimate;
  billingLoading: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5 shadow-[var(--shadow-xs)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
            Estimated cost
          </div>
          {estimate.planName && (
            <p className="mt-1 text-[12px] text-[var(--color-fg-muted)]">
              {estimate.planName} plan
            </p>
          )}
        </div>
        <Link
          to="/$wid/settings/billing"
          params={{ wid }}
          search={{ checkout: undefined }}
          className="text-[11px] text-[var(--color-link)] no-underline hover:underline"
        >
          Billing
        </Link>
      </div>

      {billingLoading ? (
        <div className="mt-4 flex items-center gap-2 text-[12px] text-[var(--color-fg-muted)]">
          <Spinner className="size-3" /> Loading usage…
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <CostMeterRow line={estimate.monitors} />
          <CostMeterRow line={estimate.events} />
          {estimate.multiRegionBlocked && (
            <p className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-warn)_35%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-warn)_8%,var(--color-bg-elev))] px-3 py-2 text-[11px] leading-relaxed text-[var(--color-warn)]">
              Multiple regions require a plan with multi-region checks.
            </p>
          )}
          {!estimate.billingEnabled && (
            <p className="text-[11px] leading-relaxed text-[var(--color-fg-dim)]">
              Self-hosted — no metered billing or plan limits.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CostMeterRow({ line }: { line: MeterCostLine }) {
  const accent = statusAccent(line.status);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-[var(--color-fg-muted)]">{line.label}</span>
        {line.deltaText && (
          <span className="mono text-[10px] uppercase tracking-[0.06em] text-[var(--color-fg-dim)]">
            {line.deltaText}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <span className="tabular text-[18px] font-medium tracking-tight text-[var(--color-fg)]">
          {line.projectedText}
        </span>
        {line.currentText !== line.projectedText && line.currentText !== "—" && (
          <span className="tabular text-[11px] text-[var(--color-fg-dim)]">
            now {line.currentText}
          </span>
        )}
      </div>
      {line.limitText && line.usagePercent != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-row)]">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${line.usagePercent}%`,
              background: accent,
            }}
          />
        </div>
      )}
      {line.limitText && (
        <p className="mt-1.5 text-[11px] text-[var(--color-fg-dim)]">{line.limitText}</p>
      )}
      {line.note && (
        <p
          className={cn(
            "mt-2 text-[11px] leading-relaxed",
            line.status === "blocked"
              ? "text-[var(--color-err)]"
              : line.status === "warning"
                ? "text-[var(--color-warn)]"
                : "text-[var(--color-fg-dim)]",
          )}
        >
          {line.note}
        </p>
      )}
    </div>
  );
}

function statusAccent(status: UsageLimitStatus): string {
  if (status === "blocked") return "var(--color-err)";
  if (status === "warning") return "var(--color-warn)";
  return "var(--color-accent)";
}

function defaultTemplate(
  kind: MonitorKind,
  target: string,
  interval: number,
  postgresQuery = "SELECT 1",
  redisCommand = "PING",
): string {
  const cfg =
    kind === "http"
      ? `  url: "${target}"\n  timeout: 5s`
      : kind === "ping"
        ? `  host: "${target}"\n  timeout: 5s`
        : kind === "postgres"
          ? `  url: "${target}"\n  query: "${escapeDslString(postgresQuery)}"\n  timeout: 5s`
          : kind === "redis"
            ? `  url: "${target}"\n  command: "${escapeDslString(redisCommand)}"\n  timeout: 5s`
            : `  host: "${target}"\n  timeout: 5s`;

  const rules =
    kind === "http"
      ? `  if result.status == 200 -> ok
  if result.status >= 500 -> down with "5xx response"
  if result.latency_ms > 2000 -> warn with "slow"
  else -> ok`
      : kind === "postgres"
        ? `  if result.status == 0 -> ok
  else -> down with "query failed"`
        : kind === "redis"
          ? `  if result.status == 0 -> ok
  else -> down with "command failed"`
          : `  if result.latency_ms > 2000 -> warn with "slow"
  else -> ok`;

  return `type ${kind}

set params.config {
${cfg}
}

set schedule.interval ${interval}s

# Declare the shape of result.json for autocomplete.
# Example:
# declare result.json {
#   status: string
#   data: { id: number, name: string }
# }

rules {
${rules}
}
`;
}

function escapeDslString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function defaultTarget(kind: MonitorKind): string {
  switch (kind) {
    case "http":
      return "https://api.acme.com/health";
    case "tcp":
      return "db.acme.com:5432";
    case "ping":
      return "edge-eu.acme.com";
    case "postgres":
      return "postgres://user:password@db.acme.com:5432/app";
    case "redis":
      return "redis://:password@cache.acme.com:6379/0";
    case "ssh":
      return "bastion.acme.com:22";
  }
}

function ValidStatus({ validating, error }: { validating: boolean; error: DslError | null }) {
  if (validating) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-fg-muted)] mono">
        <Spinner className="size-2.5" /> checking…
      </span>
    );
  }
  if (error) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-err)] mono">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-err)]" />
        error {error.line}:{error.col}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-ok)] mono">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-ok)]" />
      valid
    </span>
  );
}
