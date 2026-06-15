import type { BillingPlanSummary } from "./billing";
import { planIncludesFeature } from "./billing";

export type IntervalPreset = "60" | "300" | "900" | "custom";

/** Smallest check interval the workspace's current plan allows. */
export function minimumIntervalSeconds(plan?: BillingPlanSummary): number {
  if (planIncludesFeature(plan, "one_min_checks")) return 60;
  if (planIncludesFeature(plan, "five_min_checks")) return 300;
  return 900;
}

export function formatInterval(seconds: number): string {
  if (seconds % 60 !== 0) return `${seconds}s`;
  const minutes = seconds / 60;
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/** Snap an interval up to the nearest preset bucket (used when raising to the plan minimum). */
export function presetForInterval(interval: number): IntervalPreset {
  if (interval <= 60) return "60";
  if (interval <= 300) return "300";
  return "900";
}

/** Pick the preset that exactly matches an interval, falling back to "custom". */
export function exactIntervalPreset(interval: number): IntervalPreset {
  if (interval === 60 || interval === 300 || interval === 900) {
    return String(interval) as IntervalPreset;
  }
  return "custom";
}

export function buildIntervalOptions(minimum: number) {
  return [
    intervalOption("60", "1m", minimum),
    intervalOption("300", "5m", minimum),
    intervalOption("900", "15m", minimum),
    { value: "custom" as const, label: "Custom" },
  ];
}

function intervalOption(value: Exclude<IntervalPreset, "custom">, label: string, minimum: number) {
  const seconds = parseInt(value, 10);
  const disabled = seconds < minimum;
  return {
    value,
    label,
    disabled,
    title: disabled
      ? `Requires a plan with ${formatInterval(seconds)} checks`
      : `Run every ${formatInterval(seconds)}`,
  };
}
