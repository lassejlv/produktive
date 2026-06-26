import { cn } from "#/lib/cn";
import { formatDeployRegion } from "#/lib/deploy-regions";
import {
  SANDBOX_STATUS_COLOR,
  SANDBOX_STATUS_LABEL,
  sandboxStatusActive,
} from "#/lib/sandboxes";
import type { DeployRegion, DeploySandbox } from "#/lib/types";

export function SandboxCard({
  sandbox,
  regions,
  onClick,
}: {
  sandbox: DeploySandbox;
  regions?: DeployRegion[];
  onClick: () => void;
}) {
  const color = SANDBOX_STATUS_COLOR[sandbox.status] ?? SANDBOX_STATUS_COLOR.unknown;
  const active = sandboxStatusActive(sandbox.status);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 text-left shadow-[var(--shadow-xs)] transition hover:border-[var(--color-border-hi)] hover:shadow-[var(--shadow-sm)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn("inline-block h-2 w-2 shrink-0 rounded-full", active && "pulse-dot")}
              style={{
                background: color,
                boxShadow: active
                  ? `0 0 8px color-mix(in srgb, ${color} 50%, transparent)`
                  : undefined,
              }}
            />
            <h3 className="truncate text-[14px] font-medium text-[var(--color-fg)]">
              {sandbox.name}
            </h3>
          </div>
          <p className="mono mt-1 truncate text-[11px] text-[var(--color-fg-muted)]">
            {sandbox.slug}
          </p>
        </div>
        <span
          className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.06em]"
          style={{ color }}
        >
          {SANDBOX_STATUS_LABEL[sandbox.status] ?? sandbox.status}
        </span>
      </div>
      <div className="mt-4 text-[11px] text-[var(--color-fg-dim)]">
        <span>
          {formatDeployRegion(sandbox.region, regions)}
          <span className="mx-1.5 text-[var(--color-border-hi)]">·</span>
          {sandbox.cpus} CPU
          <span className="mx-1.5 text-[var(--color-border-hi)]">·</span>
          {sandbox.ram_mb} MB
        </span>
      </div>
    </button>
  );
}

export function SandboxRow({
  sandbox,
  regions,
  onClick,
}: {
  sandbox: DeploySandbox;
  regions?: DeployRegion[];
  onClick: () => void;
}) {
  const color = SANDBOX_STATUS_COLOR[sandbox.status] ?? SANDBOX_STATUS_COLOR.unknown;

  return (
    <button
      type="button"
      onClick={onClick}
      className="grid w-full grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.7fr)] items-center gap-3 border-b border-[var(--color-border)] px-4 py-3 text-left transition hover:bg-[var(--color-bg-row)]"
    >
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-[var(--color-fg)]">{sandbox.name}</p>
        <p className="mono truncate text-[11px] text-[var(--color-fg-muted)]">{sandbox.slug}</p>
      </div>
      <span className="text-[12px] text-[var(--color-fg-muted)]">
        {formatDeployRegion(sandbox.region, regions)}
      </span>
      <span className="text-[12px] text-[var(--color-fg-muted)]">
        {sandbox.cpus} CPU · {sandbox.ram_mb} MB
      </span>
      <span className="text-[12px] font-medium" style={{ color }}>
        {SANDBOX_STATUS_LABEL[sandbox.status] ?? sandbox.status}
      </span>
    </button>
  );
}
