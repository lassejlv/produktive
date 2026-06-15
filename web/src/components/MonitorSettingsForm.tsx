import { useMemo, useState } from "react";
import { Clock, FileCode2, Gauge } from "lucide-react";
import { toast } from "#/lib/toast";
import { Button } from "#/components/ui/button";
import { Input } from "./Input";
import { Segmented } from "./Segmented";
import { Spinner } from "#/components/ui/spinner";
import { PROBE_ICON } from "./ProbeIcons";
import { useBillingSummary, useRegions, useUpdateMonitor, useWorkspaces } from "../lib/queries";
import {
  buildIntervalOptions,
  exactIntervalPreset,
  formatInterval,
  minimumIntervalSeconds,
  type IntervalPreset,
} from "../lib/monitorInterval";
import type { Monitor, UpdateMonitorBody } from "../lib/types";
import { cn } from "#/lib/cn";

interface Props {
  wid: string;
  monitor: Monitor;
  /** Switch the detail page to the Code tab — used for DSL-managed fields. */
  onEditCode?: () => void;
}

const TIMEOUT_MIN_SEC = 1;
const TIMEOUT_MAX_SEC = 60;

export function MonitorSettingsForm({ wid, monitor, onEditCode }: Props) {
  // When a monitor carries DSL, its kind/target/interval/timeout are projected from the
  // source on every save — editing those columns in a form would just get overwritten. So
  // we surface them read-only here and send the user to the Code tab.
  const dslManaged = !!monitor.dsl_source;

  const update = useUpdateMonitor(wid);
  const regions = useRegions(wid);
  const billing = useBillingSummary(wid);
  const workspaces = useWorkspaces();

  const workspace = workspaces.data?.find((w) => w.id === wid || w.slug === wid);
  const canChangeRegions = workspace?.role === "owner";
  const currentPlan = billing.data?.plans.find((p) => p.current);
  const minInterval = minimumIntervalSeconds(currentPlan);

  const initialRegions = useMemo(() => monitor.regions.map((r) => r.slug), [monitor.regions]);

  const [name, setName] = useState(monitor.name);
  const [target, setTarget] = useState(monitor.target);
  const [interval, setIntervalSeconds] = useState(monitor.interval_seconds);
  const [intervalPreset, setIntervalPreset] = useState<IntervalPreset>(
    exactIntervalPreset(monitor.interval_seconds),
  );
  const [timeoutSec, setTimeoutSec] = useState(monitor.timeout_ms / 1000);
  const [selectedRegions, setSelectedRegions] = useState<string[]>(initialRegions);

  const intervalOptions = buildIntervalOptions(minInterval);
  const KindIcon = PROBE_ICON[monitor.kind];

  const timeoutMs = Math.round(timeoutSec * 1000);
  const targetChanged = !dslManaged && target.trim() !== monitor.target;
  const intervalChanged = !dslManaged && interval !== monitor.interval_seconds;
  const timeoutChanged = !dslManaged && timeoutMs !== monitor.timeout_ms;
  const regionsDirty = !sameSet(selectedRegions, initialRegions);
  const dirty =
    name.trim() !== monitor.name ||
    regionsDirty ||
    targetChanged ||
    intervalChanged ||
    timeoutChanged;

  // Only validate fields the user actually changed — otherwise a slow/unavailable billing
  // load (which lowers minInterval to the free floor) would block an unrelated name edit.
  const nameValid = name.trim().length > 0;
  const targetValid = !targetChanged || target.trim().length > 0;
  const intervalValid = !intervalChanged || (Number.isFinite(interval) && interval >= minInterval);
  const timeoutValid =
    !timeoutChanged ||
    (Number.isFinite(timeoutSec) && timeoutSec >= TIMEOUT_MIN_SEC && timeoutSec <= TIMEOUT_MAX_SEC);
  const regionsValid = selectedRegions.length > 0;
  const canSave =
    dirty &&
    nameValid &&
    targetValid &&
    intervalValid &&
    timeoutValid &&
    regionsValid &&
    !update.isPending;

  function reset() {
    setName(monitor.name);
    setTarget(monitor.target);
    setIntervalSeconds(monitor.interval_seconds);
    setIntervalPreset(exactIntervalPreset(monitor.interval_seconds));
    setTimeoutSec(monitor.timeout_ms / 1000);
    setSelectedRegions(initialRegions);
  }

  function toggleRegion(slug: string) {
    if (!canChangeRegions) return;
    setSelectedRegions((current) => {
      if (current.includes(slug)) {
        const next = current.filter((value) => value !== slug);
        return next.length > 0 ? next : current; // keep at least one
      }
      return [...current, slug];
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;

    const patch: UpdateMonitorBody = {};
    if (name.trim() !== monitor.name) patch.name = name.trim();
    if (!dslManaged) {
      if (target.trim() !== monitor.target) patch.target = target.trim();
      if (interval !== monitor.interval_seconds) patch.interval_seconds = interval;
      if (timeoutMs !== monitor.timeout_ms) patch.timeout_ms = timeoutMs;
    }
    if (canChangeRegions && regionsDirty) patch.region_slugs = selectedRegions;

    update.mutate(
      { id: monitor.id, patch },
      {
        onSuccess: () => toast.success("Monitor updated"),
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  const regionList = regions.data ?? [];

  return (
    <form
      onSubmit={onSubmit}
      className="max-w-2xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]"
    >
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
        <div className="flex items-center justify-between gap-3">
          <FieldLabel>Probe</FieldLabel>
          <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-2 py-1 text-[11px] font-medium text-[var(--color-fg-muted)]">
            <KindIcon size={12} className="text-[var(--color-fg-dim)]" />
            {monitor.kind.toUpperCase()}
          </span>
        </div>

        {dslManaged ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <FileCode2 size={15} className="mt-0.5 shrink-0 text-[var(--color-fg-dim)]" />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-[var(--color-fg)]">
                  Target, interval and timeout are defined in this monitor’s code.
                </p>
                <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px]">
                  <ReadonlyRow label="Target" value={monitor.target} mono />
                  <ReadonlyRow
                    label="Interval"
                    value={`every ${formatInterval(monitor.interval_seconds)}`}
                  />
                  <ReadonlyRow
                    label="Timeout"
                    value={formatInterval(Math.round(monitor.timeout_ms / 1000))}
                  />
                </dl>
                {onEditCode && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={onEditCode}
                  >
                    <FileCode2 size={13} /> Edit in Code
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <Input
            label="Target"
            className="mono"
            required
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        )}
      </FieldGroup>

      {!dslManaged && (
        <>
          <Divider />
          <FieldGroup className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <FieldLabel>
                <span className="inline-flex items-center gap-1.5">
                  <Clock size={12} /> Check interval
                </span>
              </FieldLabel>
              <div className="mt-2">
                <Segmented<IntervalPreset>
                  value={intervalPreset}
                  onChange={(v) => {
                    setIntervalPreset(v);
                    if (v !== "custom") setIntervalSeconds(parseInt(v, 10));
                  }}
                  options={intervalOptions}
                  className="w-full"
                />
              </div>
              {intervalPreset === "custom" && (
                <div className="mt-3">
                  <Input
                    type="number"
                    aria-label="Custom interval in seconds"
                    min={minInterval}
                    step={60}
                    value={interval}
                    onChange={(e) => {
                      const next = parseInt(e.target.value || String(minInterval), 10);
                      setIntervalSeconds(
                        Number.isFinite(next) ? Math.max(minInterval, next) : minInterval,
                      );
                    }}
                    trailing="seconds"
                  />
                </div>
              )}
              <p className="mt-2.5 text-[11px] text-[var(--color-fg-dim)]">
                Plan minimum: every {formatInterval(minInterval)}.
              </p>
            </div>

            <div>
              <FieldLabel>
                <span className="inline-flex items-center gap-1.5">
                  <Gauge size={12} /> Request timeout
                </span>
              </FieldLabel>
              <div className="mt-2">
                <Input
                  type="number"
                  aria-label="Request timeout in seconds"
                  min={TIMEOUT_MIN_SEC}
                  max={TIMEOUT_MAX_SEC}
                  step={1}
                  value={timeoutSec}
                  onChange={(e) => setTimeoutSec(parseFloat(e.target.value))}
                  trailing="seconds"
                  error={
                    !timeoutValid ? `Between ${TIMEOUT_MIN_SEC} and ${TIMEOUT_MAX_SEC}s` : undefined
                  }
                />
              </div>
              <p className="mt-2.5 text-[11px] text-[var(--color-fg-dim)]">
                Fail the check if no response within this window.
              </p>
            </div>
          </FieldGroup>
        </>
      )}

      <Divider />

      <FieldGroup>
        <FieldLabel>Regions</FieldLabel>
        {regions.isLoading ? (
          <div className="mt-2 flex items-center gap-2 text-[12px] text-[var(--color-fg-muted)]">
            <Spinner className="size-3" /> Loading regions…
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {regionList.map((region) => {
              const active = selectedRegions.includes(region.slug);
              const supported = region.capabilities.includes(monitor.kind);
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
                    supported && !canChangeRegions && "cursor-not-allowed opacity-70",
                  )}
                  title={
                    !canChangeRegions
                      ? "Only workspace owners can change monitor regions"
                      : supported
                        ? `Run from ${region.name}`
                        : `${region.name} does not support ${monitor.kind} checks`
                  }
                >
                  {region.name}
                </Button>
              );
            })}
          </div>
        )}
        <p className="mt-2.5 text-[11px] text-[var(--color-fg-dim)]">
          {canChangeRegions
            ? "At least one region required."
            : "Only workspace owners can change monitor regions."}
        </p>
      </FieldGroup>

      <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-bg-sunken)] px-4 py-3 sm:px-5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!dirty || update.isPending}
          onClick={reset}
        >
          Reset
        </Button>
        <Button type="submit" variant="default" size="sm" disabled={!canSave}>
          {update.isPending && <Spinner className="size-3" />}
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
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

function ReadonlyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-[var(--color-fg-dim)]">{label}</dt>
      <dd className={cn("min-w-0 truncate text-[var(--color-fg)]", mono && "mono")} title={value}>
        {value}
      </dd>
    </>
  );
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}
