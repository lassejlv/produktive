import { useEffect, useState } from "react";
import type { Issue, IssueStatus } from "@/lib/api";
import {
  priorityOptions,
  statusLabel,
  sortedStatuses,
} from "@/lib/issue-constants";

export type GroupBy = "status" | "priority" | "assignee" | "project" | "none";
export type SortBy = "manual" | "created" | "updated" | "priority";
export type Density = "comfortable" | "compact";
export type ViewMode = "list" | "board";

export type ShownProperties = {
  priority: boolean;
  id: boolean;
  status: boolean;
  assignee: boolean;
  project: boolean;
  labels: boolean;
  updated: boolean;
};

export type DisplayOptions = {
  groupBy: GroupBy;
  sortBy: SortBy;
  density: Density;
  viewMode: ViewMode;
  properties: ShownProperties;
};

export const defaultDisplayOptions: DisplayOptions = {
  groupBy: "status",
  sortBy: "manual",
  density: "comfortable",
  viewMode: "list",
  properties: {
    priority: true,
    id: true,
    status: true,
    assignee: true,
    project: true,
    labels: true,
    updated: true,
  },
};

const STORAGE_KEY = "issues-display-options";

function readStorage(): DisplayOptions {
  if (typeof window === "undefined") return defaultDisplayOptions;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultDisplayOptions;
    const parsed = JSON.parse(raw) as Partial<DisplayOptions>;
    return {
      ...defaultDisplayOptions,
      ...parsed,
      properties: {
        ...defaultDisplayOptions.properties,
        ...(parsed?.properties ?? {}),
      },
    };
  } catch {
    return defaultDisplayOptions;
  }
}

export function useDisplayOptions() {
  const [options, setOptions] = useState<DisplayOptions>(defaultDisplayOptions);

  useEffect(() => {
    setOptions(readStorage());
  }, []);

  const update = (patch: Partial<DisplayOptions>) => {
    setOptions((current) => {
      const next = { ...current, ...patch };
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };

  const updateProperties = (patch: Partial<ShownProperties>) => {
    setOptions((current) => {
      const next = {
        ...current,
        properties: { ...current.properties, ...patch },
      };
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };

  return { options, update, updateProperties };
}

const priorityRank: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

export const priorityLabels: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};

export type IssueGroup = {
  key: string;
  label: string;
  status: string | null;
  items: Issue[];
};

export function groupIssues(
  issues: Issue[],
  groupBy: GroupBy,
  statuses?: IssueStatus[],
): IssueGroup[] {
  if (groupBy === "none") {
    return [{ key: "all", label: "All issues", status: null, items: issues }];
  }

  if (groupBy === "status") {
    const buckets: Record<string, Issue[]> = {};
    for (const issue of issues) {
      (buckets[issue.status] ??= []).push(issue);
    }
    const ordered = statuses?.length
      ? sortedStatuses(statuses).map((status) => ({
          key: status.key,
          label: status.name,
        }))
      : Object.keys(statusLabel).map((key) => ({ key, label: statusLabel[key] }));
    const known = ordered
      .filter((s) => buckets[s.key]?.length)
      .map((status) => ({
        key: status.key,
        label: status.label,
        status: status.key,
        items: buckets[status.key],
      }));
    const unknown = Object.keys(buckets)
      .filter((key) => !ordered.some((status) => status.key === key))
      .map((key) => ({
        key,
        label: statusLabel[key] ?? key,
        status: key,
        items: buckets[key],
      }));
    return [...known, ...unknown];
  }

  if (groupBy === "priority") {
    const buckets: Record<string, Issue[]> = {};
    for (const issue of issues) {
      (buckets[issue.priority] ??= []).push(issue);
    }
    return [...priorityOptions]
      .filter((p) => buckets[p]?.length)
      .map((priority) => ({
        key: priority,
        label: priorityLabels[priority] ?? priority,
        status: null,
        items: buckets[priority],
      }));
  }

  if (groupBy === "project") {
    const buckets: Record<string, { name: string; items: Issue[] }> = {};
    for (const issue of issues) {
      const id = issue.project?.id ?? "__noproject";
      const name = issue.project?.name ?? "No project";
      (buckets[id] ??= { name, items: [] }).items.push(issue);
    }
    return Object.entries(buckets)
      .sort(([a, av], [b, bv]) => {
        if (a === "__noproject") return 1;
        if (b === "__noproject") return -1;
        return av.name.localeCompare(bv.name);
      })
      .map(([key, { name, items }]) => ({
        key,
        label: name,
        status: null,
        items,
      }));
  }

  // assignee
  const buckets: Record<string, { name: string; items: Issue[] }> = {};
  for (const issue of issues) {
    const id = issue.assignedTo?.id ?? "__unassigned";
    const name = issue.assignedTo?.name ?? "Unassigned";
    (buckets[id] ??= { name, items: [] }).items.push(issue);
  }
  return Object.entries(buckets)
    .sort(([a, av], [b, bv]) => {
      if (a === "__unassigned") return 1;
      if (b === "__unassigned") return -1;
      return av.name.localeCompare(bv.name);
    })
    .map(([key, { name, items }]) => ({
      key,
      label: name,
      status: null,
      items,
    }));
}

export function sortIssues(items: Issue[], sortBy: SortBy): Issue[] {
  if (sortBy === "manual") return items;
  const sorted = [...items];
  if (sortBy === "created") {
    sorted.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  } else if (sortBy === "updated") {
    sorted.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  } else if (sortBy === "priority") {
    sorted.sort(
      (a, b) =>
        (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99),
    );
  }
  return sorted;
}
