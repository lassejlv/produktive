import type { DeployRegion } from "#/lib/types";

export const OBJECT_STORAGE_REGIONS: DeployRegion[] = [
  { code: "ams", name: "Amsterdam, Netherlands", flag: "🇳🇱" },
  { code: "arn", name: "Stockholm, Sweden", flag: "🇸🇪" },
  { code: "sin", name: "Singapore", flag: "🇸🇬" },
  { code: "iad", name: "Ashburn, Virginia (US)", flag: "🇺🇸" },
  { code: "sjc", name: "San Jose, California (US)", flag: "🇺🇸" },
];

export function formatObjectStorageRegion(code: string, regions = OBJECT_STORAGE_REGIONS) {
  const match = regions.find((region) => region.code === code);
  if (!match) return code;
  return `${match.flag} ${match.name}`;
}

export const BUCKET_ACCESS_LABEL = {
  private: "Private",
  public: "Public",
} as const;

export const BUCKET_STATUS_LABEL: Record<string, string> = {
  creating: "Creating",
  ready: "Ready",
  deleting: "Deleting",
  failed: "Failed",
};

export const BUCKET_STATUS_COLOR: Record<string, string> = {
  creating: "var(--color-warn)",
  ready: "var(--color-ok)",
  deleting: "var(--color-warn)",
  failed: "var(--color-err)",
};
