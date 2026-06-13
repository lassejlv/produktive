import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileCode, SquarePen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/Button";
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
import { Segmented } from "../components/Segmented";
import { Spinner } from "../components/Spinner";
import { useCreateMonitor, useRegions, useValidateDsl, type DslError } from "../lib/queries";
import type { MonitorKind } from "../lib/types";
import { cn } from "#/lib/cn";

const MonacoDsl = lazy(() => import("../components/MonacoDsl"));

export const Route = createFileRoute("/_authed/$wid/monitors/new")({
  staticData: {
    title: "New monitor",
    layout: "bare",
    parent: { label: "Monitors", to: "/$wid/monitors" },
  },
  component: NewMonitorPage,
});

const KINDS: { value: MonitorKind; label: string; hint: string; icon: ProbeIcon }[] = [
  { value: "http", label: "HTTP", hint: "Web endpoint or API", icon: HttpIcon },
  { value: "tcp", label: "TCP", hint: "Raw socket", icon: TcpIcon },
  { value: "ping", label: "Ping", hint: "ICMP reachability", icon: PingIcon },
  { value: "postgres", label: "Postgres", hint: "Protocol availability", icon: PostgresIcon },
  { value: "redis", label: "Redis", hint: "PING probe", icon: RedisIcon },
  { value: "ssh", label: "SSH", hint: "Banner probe", icon: SshIcon },
];

type Mode = "form" | "code";
type IntervalPreset = "15" | "30" | "60" | "300" | "custom";

function NewMonitorPage() {
  const { wid } = Route.useParams();
  const nav = useNavigate();
  const create = useCreateMonitor(wid);
  const [mode, setMode] = useState<Mode>("form");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<MonitorKind>("http");
  const [target, setTarget] = useState("");
  const [interval, setInterval] = useState(60);
  const [intervalPreset, setIntervalPreset] = useState<IntervalPreset>("60");
  const [selectedRegions, setSelectedRegions] = useState<string[]>(["eu-west"]);
  const [source, setSource] = useState<string>(() => defaultTemplate("http", "", 60));
  const [parseError, setParseError] = useState<DslError | null>(null);
  const validate = useValidateDsl(wid);
  const regions = useRegions(wid);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // when switching to code mode the first time, sync from form values
  function switchMode(next: Mode) {
    if (next === "code") {
      const placeholder = target || defaultTarget(kind);
      setSource(defaultTemplate(kind, placeholder, interval));
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

  function toggleRegion(slug: string) {
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
      toast.error("name is required");
      return;
    }
    const body =
      mode === "form"
        ? {
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

  return (
    <div className={cn("fade-in px-8 py-8", mode === "form" ? "max-w-[560px]" : "max-w-[900px]")}>
      <Link
        to="/$wid/monitors"
        params={{ wid }}
        className="text-[12px] text-[var(--color-fg-muted)] no-underline hover:text-[var(--color-fg)] inline-flex items-center gap-1.5 mb-6"
      >
        <ArrowLeft size={12} /> Back to monitors
      </Link>

      <div className="flex items-start justify-between gap-6 mb-7">
        <div>
          <h2 className="text-[22px] tracking-tight font-medium mb-1.5 text-[var(--color-fg)]">
            New monitor
          </h2>
          <p className="text-[var(--color-fg-muted)] text-[13.5px]">
            Pick a probe type and target. You can add monitor-as-code rules afterward.
          </p>
        </div>
        <div className="flex items-center bg-[var(--color-bg-row)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-0.5 shrink-0">
          <ModeBtn active={mode === "form"} onClick={() => switchMode("form")} icon={SquarePen}>
            Form
          </ModeBtn>
          <ModeBtn active={mode === "code"} onClick={() => switchMode("code")} icon={FileCode}>
            Code
          </ModeBtn>
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5 shadow-[var(--shadow-xs)]">
          <Input
            label="Name"
            placeholder="api.acme.com"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {mode === "form" && (
            <>
              <div className="flex flex-col gap-2">
                <span className="text-[12px] font-medium text-[var(--color-fg-muted)] tracking-wide">
                  Probe type
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {KINDS.map((k) => {
                    const Icon = k.icon;
                    const active = kind === k.value;
                    return (
                      <button
                        key={k.value}
                        type="button"
                        onClick={() => setKind(k.value)}
                        title={k.hint}
                        className={cn(
                          "flex h-[38px] items-center justify-center gap-2 text-[12.5px] font-medium",
                          "border rounded-[var(--radius-md)] shadow-[var(--shadow-xs)] transition-all",
                          active
                            ? "border-[color-mix(in_srgb,var(--color-accent)_50%,var(--color-border-hi))] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                            : "border-[var(--color-border-hi)] bg-[var(--color-bg-elev)] text-[var(--color-fg)] hover:border-[var(--color-border-strong)]",
                        )}
                      >
                        <Icon
                          size={14}
                          className={
                            active ? "text-[var(--color-accent)]" : "text-[var(--color-fg-muted)]"
                          }
                        />
                        {k.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Input
                label="Target"
                className="mono"
                placeholder={defaultTarget(kind)}
                hint={`${KINDS.find((k) => k.value === kind)?.label ?? kind} endpoint to probe.`}
                required
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />

              <div className="flex flex-col gap-2">
                <span className="text-[12px] font-medium text-[var(--color-fg-muted)] tracking-wide">
                  Check interval
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <Segmented<IntervalPreset>
                    value={intervalPreset}
                    onChange={(v) => {
                      setIntervalPreset(v);
                      if (v !== "custom") setInterval(parseInt(v, 10));
                    }}
                    options={[
                      { value: "15", label: "15s" },
                      { value: "30", label: "30s" },
                      { value: "60", label: "1m" },
                      { value: "300", label: "5m" },
                      { value: "custom", label: "Custom" },
                    ]}
                  />
                  {intervalPreset === "custom" && (
                    <Input
                      type="number"
                      min={5}
                      step={5}
                      value={interval}
                      onChange={(e) => setInterval(parseInt(e.target.value || "60", 10))}
                      trailing="seconds"
                      className="w-[140px]"
                      aria-label="Custom interval in seconds"
                    />
                  )}
                </div>
              </div>
            </>
          )}

          {mode === "code" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-[var(--color-fg-muted)] tracking-wide">
                  Monitor definition
                </span>
                <ValidStatus validating={validate.isPending} error={parseError} />
              </div>
              <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] overflow-hidden shadow-[var(--shadow-sm)]">
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center h-[420px] text-[12px] text-[var(--color-fg-muted)]">
                      <Spinner size={16} /> <span className="ml-2">loading editor…</span>
                    </div>
                  }
                >
                  <MonacoDsl
                    value={source}
                    onChange={setSource}
                    errorLine={parseError?.line ?? null}
                    errorMessage={parseError?.message ?? null}
                    height={420}
                  />
                </Suspense>
                {parseError && (
                  <div className="border-t border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-err)_8%,var(--color-bg-elev))] px-4 py-2.5 text-[12px] text-[var(--color-err)] mono">
                    {parseError.line}:{parseError.col} — {parseError.message}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-medium text-[var(--color-fg-muted)] tracking-wide">
              Regions
            </span>
            <div className="flex flex-wrap gap-2">
              {(
                regions.data ?? [
                  { slug: "eu-west", name: "eu-west", capabilities: KINDS.map((k) => k.value) },
                ]
              ).map((region) => {
                const active = selectedRegions.includes(region.slug);
                const supported = !("capabilities" in region) || region.capabilities.includes(kind);
                return (
                  <button
                    key={region.slug}
                    type="button"
                    disabled={!supported}
                    onClick={() => toggleRegion(region.slug)}
                    className={cn(
                      "h-8 rounded-[var(--radius-sm)] border px-2.5 text-[12px] transition-colors",
                      active
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-fg)]"
                        : "border-[var(--color-border)] bg-[var(--color-bg-elev)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
                      !supported && "cursor-not-allowed opacity-45",
                    )}
                    title={
                      supported
                        ? `Run from ${region.name}`
                        : `${region.name} does not support ${kind} checks`
                    }
                  >
                    {region.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {create.error && (
          <div className="text-[var(--color-err)] text-[12px]">
            {(create.error as Error).message}
          </div>
        )}

        {/* single obvious primary action */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            type="button"
            onClick={() => nav({ to: "/$wid/monitors", params: { wid } })}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={create.isPending || (mode === "code" && !!parseError)}
            size="md"
          >
            {create.isPending && <Spinner size={12} thickness={2} />}
            {create.isPending ? "Creating…" : "Create monitor"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function defaultTemplate(kind: MonitorKind, target: string, interval: number): string {
  const cfg =
    kind === "http"
      ? `  url: "${target}"\n  timeout: 5s`
      : kind === "ping"
        ? `  host: "${target}"\n  timeout: 5s`
        : `  host: "${target}"\n  timeout: 5s`;

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
  if result.status == 200 -> ok
  if result.status >= 500 -> down with "5xx response"
  if result.latency_ms > 2000 -> warn with "slow"
  else -> ok
}
`;
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
      return "db.acme.com:5432";
    case "redis":
      return "cache.acme.com:6379";
    case "ssh":
      return "bastion.acme.com:22";
  }
}

function ModeBtn({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof FileCode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] rounded-[var(--radius-sm)] transition-colors",
        active
          ? "bg-[var(--color-bg-elev)] text-[var(--color-fg)] border border-[var(--color-border)] shadow-[var(--shadow-xs)]"
          : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-transparent",
      )}
    >
      <Icon size={11} />
      {children}
    </button>
  );
}

function ValidStatus({ validating, error }: { validating: boolean; error: DslError | null }) {
  if (validating) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-fg-muted)] mono">
        <Spinner size={10} thickness={2} /> checking…
      </span>
    );
  }
  if (error) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-err)] mono">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-err)]" />
        error {error.line}:{error.col}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-ok)] mono">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-ok)]" />
      valid
    </span>
  );
}
