import type { Issue, IssueStatus } from "@/lib/api";

export const defaultIssueStatuses: IssueStatus[] = [
  {
    id: "backlog",
    key: "backlog",
    name: "Backlog",
    color: "gray",
    category: "backlog",
    sortOrder: 0,
    isSystem: true,
    archived: false,
  },
  {
    id: "todo",
    key: "todo",
    name: "Todo",
    color: "blue",
    category: "active",
    sortOrder: 10,
    isSystem: true,
    archived: false,
  },
  {
    id: "in-progress",
    key: "in-progress",
    name: "In Progress",
    color: "purple",
    category: "active",
    sortOrder: 20,
    isSystem: true,
    archived: false,
  },
  {
    id: "done",
    key: "done",
    name: "Done",
    color: "green",
    category: "done",
    sortOrder: 30,
    isSystem: true,
    archived: false,
  },
  {
    id: "canceled",
    key: "canceled",
    name: "Canceled",
    color: "red",
    category: "canceled",
    sortOrder: 40,
    isSystem: true,
    archived: false,
  },
];

export const statusOptions = defaultIssueStatuses.map((status) => status.key);

export const priorityOptions = ["low", "medium", "high", "urgent"] as const;

export const statusLabel: Record<string, string> = Object.fromEntries(
  defaultIssueStatuses.map((status) => [status.key, status.name]),
);

export const statusOrder = defaultIssueStatuses.map((status) => status.key);

export type View = "all" | "active" | "backlog" | "done";

export const viewLabels: Record<View, string> = {
  all: "All issues",
  active: "Active",
  backlog: "Backlog",
  done: "Done",
};

export const sortedStatuses = (statuses: IssueStatus[]) =>
  [...statuses].filter((s) => !s.archived).sort((a, b) => a.sortOrder - b.sortOrder);

export const statusName = (statuses: IssueStatus[], key: string) =>
  statuses.find((status) => status.key === key)?.name ?? statusLabel[key] ?? key;

export const statusCategory = (statuses: IssueStatus[], key: string) =>
  statuses.find((status) => status.key === key)?.category ??
  defaultIssueStatuses.find((status) => status.key === key)?.category ??
  "active";

export const statusesByCategory = (
  statuses: IssueStatus[],
  category: IssueStatus["category"],
) => sortedStatuses(statuses).filter((status) => status.category === category);

export const firstStatusForCategory = (
  statuses: IssueStatus[],
  category: IssueStatus["category"],
  fallback: string,
) => statusesByCategory(statuses, category)[0]?.key ?? fallback;

export const issueMatchesView = (
  issue: Issue,
  view: View,
  statuses: IssueStatus[],
) => {
  if (view === "all") return true;
  if (view === "active") return statusCategory(statuses, issue.status) === "active";
  if (view === "backlog") return statusCategory(statuses, issue.status) === "backlog";
  if (view === "done") return statusCategory(statuses, issue.status) === "done";
  return true;
};

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
    new Date(value),
  );
