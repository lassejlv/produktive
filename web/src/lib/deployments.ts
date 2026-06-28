import type { DeployService, DeployStatus } from "./types";
import { deployStatusActive, deployStatusPending } from "./status";

export type DeployServiceFilter = "all" | "live" | "deploying" | "failed" | "stopped";

export type DeployDetailTab = "deployments" | "variables" | "logs" | "settings";

export const DEPLOY_DETAIL_TABS: DeployDetailTab[] = [
  "deployments",
  "variables",
  "logs",
  "settings",
];

export const DEFAULT_DEPLOY_DETAIL_TAB: DeployDetailTab = "deployments";

export type DeploySettingsSection = "source" | "networking" | "scale" | "danger";

export const DEPLOY_SETTINGS_SECTIONS: DeploySettingsSection[] = [
  "source",
  "networking",
  "scale",
  "danger",
];

export const DEFAULT_DEPLOY_SETTINGS_SECTION: DeploySettingsSection = "source";

export type DeploymentsSearch = {
  q?: string;
  status?: DeployServiceFilter;
  service?: string;
  tab?: DeployDetailTab;
  section?: DeploySettingsSection;
};

export const EMPTY_DEPLOYMENTS_SEARCH: DeploymentsSearch = {
  q: undefined,
  status: undefined,
  service: undefined,
  tab: undefined,
  section: undefined,
};

const LEGACY_TAB_MAP: Record<string, DeployDetailTab> = {
  overview: "deployments",
  metrics: "deployments",
  configuration: "settings",
};

export function parseDeployDetailTab(value: unknown): DeployDetailTab | undefined {
  if (typeof value !== "string") return undefined;
  if ((DEPLOY_DETAIL_TABS as readonly string[]).includes(value)) {
    return value as DeployDetailTab;
  }
  return LEGACY_TAB_MAP[value];
}

export function parseDeploySettingsSection(value: unknown): DeploySettingsSection | undefined {
  return typeof value === "string" &&
    (DEPLOY_SETTINGS_SECTIONS as readonly string[]).includes(value)
    ? (value as DeploySettingsSection)
    : undefined;
}

export function parseDeploymentsSearch(search: Record<string, unknown>): DeploymentsSearch {
  const tab = parseDeployDetailTab(search.tab);
  const legacySection =
    search.tab === "configuration" ? "networking" : undefined;
  return {
    q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
    status: parseDeployServiceFilter(search.status),
    service:
      typeof search.service === "string" && search.service.trim() ? search.service : undefined,
    tab,
    section: parseDeploySettingsSection(search.section) ?? legacySection,
  };
}

export function deploymentsSearchWithoutService(search: DeploymentsSearch): DeploymentsSearch {
  return {
    q: search.q,
    status: search.status,
    service: undefined,
    tab: undefined,
    section: undefined,
  };
}

export function openServiceSearch(
  search: DeploymentsSearch,
  serviceId: string,
  tab?: DeployDetailTab,
  section?: DeploySettingsSection,
): DeploymentsSearch {
  const resolvedTab = tab ?? search.tab;
  const resolvedSection =
    section ??
    (resolvedTab === "settings"
      ? (search.section ?? DEFAULT_DEPLOY_SETTINGS_SECTION)
      : undefined);

  return {
    ...search,
    service: serviceId,
    tab: resolvedTab && resolvedTab !== DEFAULT_DEPLOY_DETAIL_TAB ? resolvedTab : undefined,
    section:
      resolvedTab === "settings" && resolvedSection !== DEFAULT_DEPLOY_SETTINGS_SECTION
        ? resolvedSection
        : undefined,
  };
}

export const DEPLOY_SERVICE_FILTERS: DeployServiceFilter[] = [
  "all",
  "live",
  "deploying",
  "failed",
  "stopped",
];

export function parseDeployServiceFilter(value: unknown): DeployServiceFilter | undefined {
  return typeof value === "string" && DEPLOY_SERVICE_FILTERS.includes(value as DeployServiceFilter)
    ? (value as DeployServiceFilter)
    : undefined;
}

export function deployServiceFilterBucket(status: DeployStatus): DeployServiceFilter {
  if (deployStatusActive(status)) return "live";
  if (deployStatusPending(status)) return "deploying";
  if (status === "failed" || status === "build_failed") return "failed";
  if (status === "stopped" || status === "rolled_back") return "stopped";
  return "all";
}

export function matchesDeploySearch(service: DeployService, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    service.name.toLowerCase().includes(q) ||
    service.image.toLowerCase().includes(q) ||
    service.region.toLowerCase().includes(q) ||
    service.environment.toLowerCase().includes(q) ||
    service.slug.toLowerCase().includes(q) ||
    (service.url?.toLowerCase().includes(q) ?? false) ||
    (service.repo_url?.toLowerCase().includes(q) ?? false)
  );
}
