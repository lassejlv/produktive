import type { DeployService, DeployStatus } from "./types";
import { deployStatusActive, deployStatusPending } from "./status";

export type DeployServiceFilter = "all" | "live" | "deploying" | "failed" | "stopped";

export type DeploymentsSearch = {
  q?: string;
  status?: DeployServiceFilter;
};

export const EMPTY_DEPLOYMENTS_SEARCH: DeploymentsSearch = { q: undefined, status: undefined };

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
  if (status === "failed") return "failed";
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
    (service.url?.toLowerCase().includes(q) ?? false)
  );
}
