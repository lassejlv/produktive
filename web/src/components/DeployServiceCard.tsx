import { Box, GitBranch } from "lucide-react";
import { memo } from "react";
import { cn } from "#/lib/cn";
import {
  DEPLOY_GLOW_CLASS,
  DEPLOY_STATUS_COLOR,
  deployCanvasStatusLabel,
  deployStatusActive,
  deployStatusPending,
} from "#/lib/status";
import type { DeployService } from "../lib/types";

export function resourcePresetLabel(value: string): string {
  const labels: Record<string, string> = {
    preview_small: "Small",
    preview_medium: "Medium",
    preview_large: "Large",
  };
  return labels[value] ?? value.replace(/^preview_/, "");
}

function replicaLabel(count: number): string {
  return count === 1 ? "1 replica" : `${count} replicas`;
}

function ServiceSourceIcon({ service }: { service: DeployService }) {
  const Icon = service.source_kind === "git" ? GitBranch : Box;
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-canvas-border)] bg-[color-mix(in_srgb,var(--color-canvas-bg)_55%,transparent)]"
    >
      <Icon size={15} className="text-[var(--color-canvas-muted)]" strokeWidth={1.75} />
    </div>
  );
}

interface Props {
  service: DeployService;
  selected?: boolean;
}

export const DeployServiceCard = memo(function DeployServiceCard({ service, selected }: Props) {
  const color = DEPLOY_STATUS_COLOR[service.status];
  const active = deployStatusActive(service.status);
  const pending = deployStatusPending(service.status);
  const glow = DEPLOY_GLOW_CLASS[service.status];
  const statusLabel = deployCanvasStatusLabel(service.status);

  const subtitleParts: string[] = [statusLabel];
  if (active && service.machine_count > 0) {
    subtitleParts.push(replicaLabel(service.machine_count));
  } else if (service.url && active) {
    subtitleParts.push(service.url.replace(/^https?:\/\//, ""));
  }

  return (
    <div
      className={cn(
        "deploy-card group relative flex w-[212px] cursor-pointer select-none items-start gap-2.5",
        "rounded-[var(--radius-md)] border bg-[var(--color-canvas-surface)] px-3 py-2.5",
        "border-[var(--color-canvas-border)] transition-[border-color,box-shadow,transform] duration-200",
        glow,
        selected &&
          "border-[var(--color-canvas-border-hi)] ring-1 ring-[color-mix(in_srgb,var(--color-accent)_38%,transparent)]",
        service.status === "failed" || service.status === "build_failed"
          ? "shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-err)_14%,transparent)]"
          : "shadow-[var(--shadow-xs)]",
      )}
    >
      <ServiceSourceIcon service={service} />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
              active && "pulse-dot",
              pending && "animate-pulse",
            )}
            style={{
              background: color,
              boxShadow: active
                ? `0 0 6px color-mix(in srgb, ${color} 50%, transparent)`
                : undefined,
            }}
          />
          <span className="truncate text-[13px] font-medium leading-tight tracking-tight text-[var(--color-canvas-fg)]">
            {service.name}
          </span>
        </div>
        <p className="mt-1 truncate text-[11px] leading-snug text-[var(--color-canvas-muted)]">
          {subtitleParts.join(" · ")}
        </p>
      </div>
    </div>
  );
});
