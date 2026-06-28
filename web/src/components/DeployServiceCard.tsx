import { Link, useParams } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { memo } from "react";
import { cn } from "#/lib/cn";
import { formatDeployRegion } from "#/lib/deploy-regions";
import { useDeployRegions } from "#/lib/queries";
import { machineCountLabel } from "./deployments/deploy-shared";
import {
  DEPLOY_GLOW_CLASS,
  DEPLOY_STATUS_COLOR,
  DEPLOY_STATUS_LABEL,
  deployStatusActive,
  deployStatusPending,
  lastSeen,
  shortDigest,
} from "#/lib/status";
import type { DeployService, DeployStatus } from "../lib/types";

function surfaceShadow(status: DeployStatus): string {
  const color = DEPLOY_STATUS_COLOR[status];
  if (status === "failed") {
    return `var(--shadow-md), 0 0 0 1px color-mix(in srgb, ${color} 16%, transparent), 0 16px 38px -18px color-mix(in srgb, ${color} 34%, transparent)`;
  }
  if (deployStatusActive(status)) {
    return `var(--shadow-sm), 0 0 0 1px color-mix(in srgb, ${color} 13%, transparent)`;
  }
  return "var(--shadow-sm)";
}

export function resourcePresetLabel(value: string): string {
  const labels: Record<string, string> = {
    preview_small: "Small",
    preview_medium: "Medium",
    preview_large: "Large",
  };
  return labels[value] ?? value.replace(/^preview_/, "");
}

function DeployHealthStrip({ status }: { status: DeployStatus }) {
  // Honest single-status summary: the prior 24-tick "sparkline" was fake —
  // 23 ticks were always idle and only the last reflected current status. We
  // don't have a real recent-health sample series yet, so don't pretend.
  let kind: "live" | "pending" | "failed" | "idle";
  if (deployStatusActive(status)) kind = "live";
  else if (deployStatusPending(status)) kind = "pending";
  else if (status === "failed") kind = "failed";
  else kind = "idle";

  const bg =
    kind === "live"
      ? "var(--color-ok)"
      : kind === "pending"
        ? "var(--color-warn)"
        : kind === "failed"
          ? "var(--color-err)"
          : "var(--color-border-hi)";

  return (
    <div className="mt-3.5 flex h-2 items-center gap-1.5">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: bg, opacity: kind === "idle" ? 0.55 : 0.92 }}
      />
      <span className="h-[2px] flex-1 rounded-full bg-[var(--color-border-hi)] opacity-55" />
    </div>
  );
}

function MetaChip({ icon: Icon, label }: { icon?: typeof MapPin; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-1.5 py-0.5 text-[10px] text-[var(--color-fg-muted)]">
      {Icon && <Icon size={10} className="shrink-0 text-[var(--color-fg-dim)]" />}
      {label}
    </span>
  );
}

export { MetaChip };

interface Props {
  service: DeployService;
  /** Rendered as a draggable node on the canvas (fixed width, propagation guards). */
  canvas?: boolean;
  selected?: boolean;
}

export const DeployServiceCard = memo(function DeployServiceCard({
  service,
  canvas,
  selected,
}: Props) {
  const { wid } = useParams({ from: "/_authed/$wid" });
  const { data: regions } = useDeployRegions(wid);
  const color = DEPLOY_STATUS_COLOR[service.status];
  const active = deployStatusActive(service.status);
  const pending = deployStatusPending(service.status);
  const glow = DEPLOY_GLOW_CLASS[service.status];

  const cardBody = (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
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
          {canvas ? (
            <span className="truncate text-[13px] font-medium tracking-tight text-[var(--color-fg)]">
              {service.name}
            </span>
          ) : (
            <h2 className="truncate text-[13px] font-medium tracking-tight text-[var(--color-fg)]">
              {service.name}
            </h2>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 py-3.5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{ color }}
            >
              {DEPLOY_STATUS_LABEL[service.status]}
            </div>
            <div className="mono mt-1.5 truncate text-[12px] text-[var(--color-fg-muted)]">
              {service.image}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
              compute
            </div>
            <div className="mt-1.5 text-[12px] font-medium text-[var(--color-fg)]">
              {resourcePresetLabel(service.resource_preset)}
            </div>
          </div>
        </div>

        <DeployHealthStrip status={service.status} />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <MetaChip icon={MapPin} label={formatDeployRegion(service.region, regions, "short")} />
            <MetaChip label={service.environment} />
            <MetaChip label={machineCountLabel(service.machine_count)} />
            <MetaChip label={`:${service.internal_port}`} />
            {shortDigest(service.last_deploy_image_digest) && (
              <MetaChip label={shortDigest(service.last_deploy_image_digest) as string} />
            )}
          </div>
          <span className="mono shrink-0 text-[10px] text-[var(--color-fg-dim)]">
            {service.last_deploy_at
              ? `deployed ${lastSeen(service.last_deploy_at)}`
              : service.url
                ? service.url.replace(/^https?:\/\//, "")
                : lastSeen(service.updated_at)}
          </span>
        </div>
      </div>
    </>
  );

  const className = cn(
    "deploy-card group relative flex flex-col overflow-hidden rounded-[var(--radius-lg)]",
    "border border-[var(--color-border)] bg-[var(--color-bg-elev)]",
    "transition-all duration-200 hover:-translate-y-[1px]",
    glow,
    canvas ? "w-[300px] cursor-pointer select-none no-underline" : "w-full no-underline",
    canvas &&
      selected &&
      "ring-2 ring-[color-mix(in_srgb,var(--color-accent)_45%,transparent)] border-[var(--color-border-hi)]",
  );

  if (canvas) {
    return (
      <div className={className} style={{ boxShadow: surfaceShadow(service.status) }}>
        {cardBody}
      </div>
    );
  }

  return (
    <Link
      to="/$wid/deployments"
      params={{ wid }}
      search={{ service: service.id }}
      className={className}
      style={{ boxShadow: surfaceShadow(service.status) }}
    >
      {cardBody}
    </Link>
  );
});
