import { useMemo, useState } from "react";
import { Input } from "#/components/ui/input";
import { formatCost } from "#/lib/billing";
import { cn } from "#/lib/cn";
import {
  CLOUD_USAGE_CALCULATOR_DEFAULTS,
  DEPLOY_METER_UNITS,
  estimateCloudUsageCost,
  sandboxRateText,
  type CloudUsageEstimateSection,
  type DeployPricingRow,
} from "#/lib/pricing";

const DEPLOYMENT_FIELDS = [
  {
    featureId: "deploy_memory" as const,
    label: "Memory",
    inputKey: "memoryGb" as const,
    min: 0,
    max: 64,
    step: 0.5,
  },
  {
    featureId: "deploy_cpu" as const,
    label: "CPU",
    inputKey: "cpuVcpu" as const,
    min: 0,
    max: 16,
    step: 0.25,
  },
  {
    featureId: "deploy_volume" as const,
    label: "Disk",
    inputKey: "volumeGb" as const,
    min: 0,
    max: 500,
    step: 1,
  },
  {
    featureId: "object_storage" as const,
    label: "Object storage",
    inputKey: "objectStorageGb" as const,
    min: 0,
    max: 10_000,
    step: 1,
  },
] as const;

const SANDBOX_FIELDS = [
  {
    featureId: "deploy_memory" as const,
    label: "Memory",
    inputKey: "sandboxMemoryGb" as const,
    min: 0,
    max: 64,
    step: 0.5,
  },
  {
    featureId: "deploy_cpu" as const,
    label: "CPU",
    inputKey: "sandboxCpuVcpu" as const,
    min: 0,
    max: 16,
    step: 0.25,
  },
  {
    featureId: "deploy_volume" as const,
    label: "Disk",
    inputKey: "sandboxVolumeGb" as const,
    min: 0,
    max: 500,
    step: 1,
  },
] as const;

export function PricingCalculator({ rows }: { rows: DeployPricingRow[] }) {
  const [values, setValues] = useState(CLOUD_USAGE_CALCULATOR_DEFAULTS);
  const rowByFeature = useMemo(() => new Map(rows.map((row) => [row.featureId, row])), [rows]);
  const estimate = useMemo(() => estimateCloudUsageCost(rows, values), [rows, values]);

  if (rows.length === 0 || !estimate) return null;

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-medium text-[var(--color-fg)]">Cloud usage calculator</h2>
        <span className="text-[12px] text-[var(--color-fg-muted)]">Pay as you go</span>
      </div>
      <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">
        Estimate monthly cost for deployments, sandboxes, volumes, and object storage. Billed on top
        of any paid plan.
      </p>

      <CalculatorSection
        title="Deployments"
        fields={DEPLOYMENT_FIELDS}
        rowByFeature={rowByFeature}
        values={values}
        onChange={setValues}
        rateText={(_featureId, row) => row.rateText}
      />

      <CalculatorSection
        title="Sandboxes"
        description="Warm sandboxes bill through the same meters at a 30% premium."
        fields={SANDBOX_FIELDS}
        rowByFeature={rowByFeature}
        values={values}
        onChange={setValues}
        rateText={(featureId, row) => sandboxRateText(featureId, row.unitAmount)}
        className="mt-6 border-t border-[var(--color-border)] pt-5"
      />

      <div className="mt-6 border-t border-[var(--color-border)] pt-4">
        <EstimateSection section={estimate.deployment} />
        <EstimateSection section={estimate.sandbox} className="mt-4" />

        <div className="mt-4 flex items-end justify-between gap-3 border-t border-[var(--color-border)] pt-3">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
              Estimated cloud usage
            </div>
            <p className="mt-1 text-[12px] text-[var(--color-fg-muted)]">
              Plan subscription billed separately.
            </p>
          </div>
          <div className="tabular text-right text-[22px] font-medium leading-none tracking-tight text-[var(--color-fg)]">
            {formatCost(estimate.total)}
            <span className="ml-1 text-[13px] font-normal text-[var(--color-fg-muted)]">/ mo</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalculatorSection<T extends readonly CalculatorField[]>({
  title,
  description,
  fields,
  rowByFeature,
  values,
  onChange,
  rateText,
  className,
}: {
  title: string;
  description?: string;
  fields: T;
  rowByFeature: Map<string, DeployPricingRow>;
  values: typeof CLOUD_USAGE_CALCULATOR_DEFAULTS;
  onChange: React.Dispatch<React.SetStateAction<typeof CLOUD_USAGE_CALCULATOR_DEFAULTS>>;
  rateText: (
    featureId: T[number]["featureId"],
    row: DeployPricingRow,
  ) => string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div>
        <h3 className="text-[13px] font-medium text-[var(--color-fg)]">{title}</h3>
        {description && (
          <p className="mt-0.5 text-[12px] text-[var(--color-fg-muted)]">{description}</p>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {fields.map((field) => {
          const row = rowByFeature.get(field.featureId);
          if (!row) return null;

          return (
            <CalculatorField
              key={`${title}-${field.featureId}`}
              label={field.label}
              unit={DEPLOY_METER_UNITS[field.featureId]}
              rateText={rateText(field.featureId, row)}
              value={values[field.inputKey]}
              min={field.min}
              max={field.max}
              step={field.step}
              onChange={(next) =>
                onChange((current) => ({
                  ...current,
                  [field.inputKey]: next,
                }))
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function EstimateSection({
  section,
  className,
}: {
  section: CloudUsageEstimateSection;
  className?: string;
}) {
  if (section.lines.length === 0) return null;

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[12px] font-medium text-[var(--color-fg)]">{section.title}</h3>
          {section.note && (
            <p className="mt-0.5 text-[11px] text-[var(--color-fg-dim)]">{section.note}</p>
          )}
        </div>
        <span className="tabular text-[12px] font-medium text-[var(--color-fg-muted)]">
          {formatCost(section.total)}
        </span>
      </div>

      <ul className="mt-2 divide-y divide-[var(--color-border)]">
        {section.lines.map((line) => (
          <li
            key={`${line.section}-${line.featureId}`}
            className="grid gap-1 py-2 text-[13px] sm:grid-cols-[minmax(0,1.2fr)_auto_auto] sm:items-baseline sm:gap-x-4"
          >
            <span className="text-[var(--color-fg-muted)]">
              {line.label}
              {line.quantity > 0 && (
                <span className="tabular text-[var(--color-fg-dim)]">
                  {" "}
                  · {formatQuantity(line.quantity)} {line.unit}
                </span>
              )}
            </span>
            <span className="tabular hidden text-[var(--color-fg-dim)] sm:block sm:text-right">
              {line.rateText}
            </span>
            <span className="tabular text-right font-medium text-[var(--color-fg)]">
              {formatCost(line.cost)}
            </span>
            <span className="tabular text-[11px] text-[var(--color-fg-dim)] sm:hidden">
              {line.rateText}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CalculatorField({
  label,
  unit,
  rateText,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  unit: string;
  rateText: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,120px)_auto] sm:items-center sm:gap-3">
      <div>
        <div className="text-[13px] font-medium text-[var(--color-fg)]">{label}</div>
        <div className="mt-0.5 text-[11px] text-[var(--color-fg-dim)]">{rateText}</div>
      </div>

      <Input
        nativeInput
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : min}
        onChange={(event) => {
          const parsed = Number.parseFloat(event.target.value);
          onChange(clampNumber(Number.isFinite(parsed) ? parsed : min, min, max));
        }}
        className={cn(
          "rounded-[var(--radius-md)] border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-none",
          "before:hidden has-focus-visible:border-[var(--color-accent)] has-focus-visible:ring-[var(--ring-accent)]",
        )}
        aria-label={`${label} in ${unit}`}
      />

      <span className="text-[12px] text-[var(--color-fg-muted)]">{unit}</span>
    </div>
  );
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value < 10 ? 2 : 1,
  }).format(value);
}

type CalculatorField = {
  featureId: "deploy_memory" | "deploy_cpu" | "deploy_volume" | "object_storage";
  label: string;
  inputKey: keyof typeof CLOUD_USAGE_CALCULATOR_DEFAULTS;
  min: number;
  max: number;
  step: number;
};
