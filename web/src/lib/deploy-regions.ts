import type { DeployRegion } from "./types";

export function deployRegionShortName(name: string): string {
  const short = name.split(",")[0]?.trim();
  return short || name;
}

export function findDeployRegion(
  code: string,
  catalog: DeployRegion[] | undefined,
): DeployRegion | undefined {
  return catalog?.find((region) => region.code === code);
}

export function formatDeployRegion(
  code: string,
  catalog: DeployRegion[] | undefined,
  style: "full" | "short" = "full",
): string {
  const region = findDeployRegion(code, catalog);
  if (!region) return code;
  if (style === "short") {
    return `${region.flag} ${deployRegionShortName(region.name)}`;
  }
  return `${region.flag} ${region.name}`;
}
