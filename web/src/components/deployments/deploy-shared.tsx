import {
  Copy,
  ExternalLink,
  MapPin,
  Rocket,
  RotateCcw,
  Square,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { cn } from "#/lib/cn";
import {
  DEPLOY_STATUS_COLOR,
  DEPLOY_STATUS_LABEL,
} from "#/lib/status";
import { toast } from "#/lib/toast";
import {
  useCreateDeployment,
  useRollbackDeployment,
  useStopDeployService,
} from "#/lib/queries";
import type { DeployResourcePreset, DeployService, DeployStatus } from "#/lib/types";

export const RESOURCE_PRESETS: Array<{
  value: DeployResourcePreset;
  label: string;
  detail: string;
}> = [
  { value: "preview_small", label: "Small", detail: "1 shared CPU / 512 MB" },
  { value: "preview_medium", label: "Medium", detail: "1 shared CPU / 1 GB" },
  { value: "preview_large", label: "Large", detail: "2 shared CPUs / 2 GB" },
];

export const fieldControlClass =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-hi)] bg-[var(--color-bg-elev)] px-3 text-[13px] text-[var(--color-fg)] shadow-[var(--shadow-xs)] outline-none transition-[border-color,box-shadow] focus:border-[var(--color-accent)] focus:shadow-[var(--ring-accent)]";

export function LiveDot({ label = "Live", color = "var(--color-ok)" }: { label?: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-fg-dim)]">
      <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

/** Consistent panel chrome: a bordered surface with a hairline-separated header. */
export function PanelCard({
  title,
  icon: Icon,
  count,
  live,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  icon?: typeof Rocket;
  count?: ReactNode;
  live?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-[var(--color-border)] px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon size={14} className="shrink-0 text-[var(--color-fg-muted)]" />}
          <span className="truncate text-[13px] font-medium text-[var(--color-fg)]">{title}</span>
          {count != null && (
            <span className="tabular text-[11px] text-[var(--color-fg-dim)]">{count}</span>
          )}
          {live && <LiveDot />}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
      </div>
      <div className={cn("p-3.5", bodyClassName)}>{children}</div>
    </div>
  );
}

/** A click-to-copy mono chip — used for image refs, digests, and provider ids. */
export function CopyChip({
  value,
  icon: Icon,
  label,
  className,
}: {
  value: string;
  icon?: typeof Rocket;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        toast.success("Copied to clipboard");
      }}
      title="Copy"
      className={cn(
        "group/copy inline-flex max-w-full items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-2 py-1 text-left transition-colors hover:border-[var(--color-border-hi)] hover:bg-[var(--color-bg-sunken)]",
        className,
      )}
    >
      {Icon && <Icon size={12} className="shrink-0 text-[var(--color-fg-dim)]" />}
      <span className="mono min-w-0 truncate text-[11.5px] text-[var(--color-fg-muted)] group-hover/copy:text-[var(--color-fg)]">
        {label ?? value}
      </span>
      <Copy
        size={11}
        className="shrink-0 text-[var(--color-fg-dim)] opacity-0 transition-opacity group-hover/copy:opacity-100"
      />
    </button>
  );
}

export function DetailStat({
  label,
  value,
  sub,
  icon: Icon,
  mono = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: typeof MapPin;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
        {Icon && <Icon size={10} />}
        {label}
      </div>
      <div
        className={cn(
          "mt-1 truncate text-[13px] font-medium text-[var(--color-fg)]",
          mono && "mono text-[12px]",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-[10px] text-[var(--color-fg-muted)]">{sub}</div>}
    </div>
  );
}

export function ServiceActionButtons({
  service,
  createDeployment,
  rollback,
  stop,
  fullWidth = false,
}: {
  service: DeployService;
  createDeployment: ReturnType<typeof useCreateDeployment>;
  rollback: ReturnType<typeof useRollbackDeployment>;
  stop: ReturnType<typeof useStopDeployService>;
  fullWidth?: boolean;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", fullWidth && "w-full [&>button]:flex-1")}>
      {service.url && (
        <Button
          render={<a href={service.url} target="_blank" rel="noreferrer" />}
          variant="secondary"
          size="sm"
          className={fullWidth ? "flex-1" : undefined}
        >
          <ExternalLink size={13} /> Open
        </Button>
      )}
      <Button
        type="button"
        variant="default"
        size="sm"
        className={fullWidth ? "flex-1" : undefined}
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
        className={fullWidth ? "flex-1" : undefined}
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
        <Square size={13} />
        {!fullWidth && " Stop"}
      </Button>
    </div>
  );
}

export function StatusBadge({ status }: { status: DeployStatus }) {
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

export function ServiceDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-3 w-24" />
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]">
        <div className="space-y-3 border-b border-[var(--color-border)] p-5">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-3 w-80" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-[var(--radius-md)]" />
            ))}
          </div>
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="m-5 h-[360px] w-[calc(100%-2.5rem)] rounded-[var(--radius-md)]" />
      </div>
    </div>
  );
}

export function PanelLoading({ label }: { label: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center text-[12px] text-[var(--color-fg-muted)]">
      <Spinner className="size-4" /> <span className="ml-2">{label}</span>
    </div>
  );
}

export function PanelEmpty({
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

export function parseKeyValues(input: string): Record<string, string> {
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

export function normalizeResourcePreset(value: string): DeployResourcePreset {
  return RESOURCE_PRESETS.some((preset) => preset.value === value)
    ? (value as DeployResourcePreset)
    : "preview_small";
}

export function resourcePresetDetail(value: string): string {
  return RESOURCE_PRESETS.find((preset) => preset.value === value)?.detail ?? value;
}
