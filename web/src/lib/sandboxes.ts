export type SandboxDetailTab = "overview" | "exec" | "checkpoints" | "settings";

export const DEFAULT_SANDBOX_DETAIL_TAB: SandboxDetailTab = "overview";

export interface SandboxesSearch {
  sandbox?: string;
  tab?: SandboxDetailTab;
}

const SANDBOX_TABS = new Set<SandboxDetailTab>([
  "overview",
  "exec",
  "checkpoints",
  "settings",
]);

export function parseSandboxesSearch(search: Record<string, unknown>): SandboxesSearch {
  const sandbox =
    typeof search.sandbox === "string" && search.sandbox.trim()
      ? search.sandbox.trim()
      : undefined;
  const tabRaw = typeof search.tab === "string" ? search.tab : undefined;
  const tab =
    tabRaw && SANDBOX_TABS.has(tabRaw as SandboxDetailTab)
      ? (tabRaw as SandboxDetailTab)
      : undefined;
  return { sandbox, tab };
}

export function openSandboxSearch(
  current: SandboxesSearch,
  sandboxId: string,
  tab: SandboxDetailTab = DEFAULT_SANDBOX_DETAIL_TAB,
): SandboxesSearch {
  return { ...current, sandbox: sandboxId, tab };
}

export function closeSandboxSearch(current: SandboxesSearch): SandboxesSearch {
  const { sandbox: _sandbox, tab: _tab, ...rest } = current;
  return rest;
}

export const SANDBOX_STATUS_LABEL: Record<string, string> = {
  cold: "Cold",
  warm: "Warm",
  active: "Active",
  stopped: "Stopped",
  unknown: "Unknown",
};

export const SANDBOX_STATUS_COLOR: Record<string, string> = {
  cold: "var(--color-unknown)",
  warm: "var(--color-warn)",
  active: "var(--color-ok)",
  stopped: "var(--color-fg-dim)",
  unknown: "var(--color-unknown)",
};

export function sandboxStatusActive(status: string): boolean {
  return status === "active" || status === "warm";
}
