import type { DeployService, DeployStatus } from "./types";
import { deployStatusActive, deployStatusPending } from "./status";

export type DeployServiceFilter = "all" | "live" | "deploying" | "failed" | "stopped";

export type DeployDetailTab =
  | "overview"
  | "deployments"
  | "logs"
  | "metrics"
  | "variables"
  | "configuration"
  | "settings";

export const DEPLOY_DETAIL_TABS: DeployDetailTab[] = [
  "overview",
  "deployments",
  "logs",
  "metrics",
  "variables",
  "configuration",
  "settings",
];

export const DEFAULT_DEPLOY_DETAIL_TAB: DeployDetailTab = "overview";

export type DeploymentsSearch = {
  q?: string;
  status?: DeployServiceFilter;
  service?: string;
  tab?: DeployDetailTab;
};

export const EMPTY_DEPLOYMENTS_SEARCH: DeploymentsSearch = {
  q: undefined,
  status: undefined,
  service: undefined,
  tab: undefined,
};

export function parseDeployDetailTab(value: unknown): DeployDetailTab | undefined {
  return typeof value === "string" && (DEPLOY_DETAIL_TABS as readonly string[]).includes(value)
    ? (value as DeployDetailTab)
    : undefined;
}

export function parseDeploymentsSearch(search: Record<string, unknown>): DeploymentsSearch {
  return {
    q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
    status: parseDeployServiceFilter(search.status),
    service:
      typeof search.service === "string" && search.service.trim() ? search.service : undefined,
    tab: parseDeployDetailTab(search.tab),
  };
}

export function deploymentsSearchWithoutService(search: DeploymentsSearch): DeploymentsSearch {
  return {
    q: search.q,
    status: search.status,
    service: undefined,
    tab: undefined,
  };
}

export function openServiceSearch(
  search: DeploymentsSearch,
  serviceId: string,
  tab?: DeployDetailTab,
): DeploymentsSearch {
  return {
    ...search,
    service: serviceId,
    tab: tab && tab !== DEFAULT_DEPLOY_DETAIL_TAB ? tab : undefined,
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
