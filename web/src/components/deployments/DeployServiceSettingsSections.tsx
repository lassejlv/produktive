import { Trash2 } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { cn } from "#/lib/cn";
import { formatDeployRegion } from "#/lib/deploy-regions";
import {
  useDeleteDeployService,
  useDeployRegions,
  useUpdateDeployService,
} from "#/lib/queries";
import { toast } from "#/lib/toast";
import type { DeployResourcePreset, DeployService } from "#/lib/types";
import {
  MACHINE_COUNT_OPTIONS,
  RESOURCE_PRESETS,
  fieldControlClass,
  machineCountLabel,
  normalizeResourcePreset,
} from "./deploy-shared";

function SettingsField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-2.5">
      <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-[13px] text-[var(--color-fg)]",
          mono && "mono truncate text-[12px]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function SourceSection({ wid, service }: { wid: string; service: DeployService }) {
  const { data: regions } = useDeployRegions(wid);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[13px] font-medium text-[var(--color-fg)]">Source</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-fg-muted)]">
          Image or repository used for builds and deploys. Change source by creating a new service.
        </p>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2">
        <SettingsField
          label="Source type"
          value={service.source_kind === "git" ? "Git repository" : "Container image"}
        />
        {service.source_kind === "git" ? (
          <>
            <SettingsField
              label="Repository"
              value={service.repo_url?.replace(/^https:\/\//, "") ?? "—"}
              mono
            />
            <SettingsField label="Git ref" value={service.git_ref ?? "default branch"} mono />
            <SettingsField label="Root directory" value={service.root_dir ?? "/"} mono />
            <SettingsField
              label="Dockerfile"
              value={service.dockerfile_path ?? "auto-detect"}
              mono
            />
          </>
        ) : (
          <SettingsField label="Image" value={service.image} mono />
        )}
        <SettingsField label="Region" value={formatDeployRegion(service.region, regions)} />
        <SettingsField label="Environment" value={service.environment} />
        <SettingsField label="Internal port" value={String(service.internal_port)} mono />
        <SettingsField label="Health check" value={service.health_check_path} mono />
      </dl>
    </div>
  );
}

export function ScaleSection({ wid, service }: { wid: string; service: DeployService }) {
  const updateService = useUpdateDeployService(wid);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[13px] font-medium text-[var(--color-fg)]">Scale</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-fg-muted)]">
          Compute size and replica count for this service on Fly.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
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
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[var(--color-fg-muted)]">Machines</span>
          <select
            className={cn(fieldControlClass, "h-9")}
            value={service.machine_count}
            disabled={updateService.isPending}
            onChange={(event) =>
              updateService.mutate(
                {
                  serviceId: service.id,
                  machine_count: Number(event.target.value),
                },
                {
                  onSuccess: () => toast.success("Machine count updated"),
                  onError: (err) => toast.error((err as Error).message),
                },
              )
            }
          >
            {MACHINE_COUNT_OPTIONS.map((count) => (
              <option key={count} value={count}>
                {machineCountLabel(count)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

export function DangerZoneSection({
  wid,
  service,
  onDeleted,
}: {
  wid: string;
  service: DeployService;
  onDeleted?: () => void;
}) {
  const deleteService = useDeleteDeployService(wid);

  function removeService() {
    if (
      !window.confirm(
        `Delete ${service.name}? This stops deployments and queues provider cleanup.`,
      )
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
    <div className="space-y-4">
      <div>
        <h3 className="text-[13px] font-medium text-[var(--color-err)]">Danger zone</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-fg-muted)]">
          Permanently remove this service and its Fly app. This cannot be undone.
        </p>
      </div>
      <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-err)_22%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-err)_5%,transparent)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-[var(--color-fg)]">Delete service</p>
            <p className="mt-0.5 text-[11px] text-[var(--color-fg-muted)]">
              Stops all machines and removes provider resources.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deleteService.isPending}
            onClick={removeService}
            className="text-[var(--color-err)] hover:bg-[color-mix(in_srgb,var(--color-err)_10%,transparent)] hover:text-[var(--color-err)]"
          >
            {deleteService.isPending && <Spinner className="size-3" />}
            <Trash2 size={13} /> Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
