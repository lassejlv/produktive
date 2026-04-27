export const statusOptions = ["backlog", "todo", "in-progress", "done"] as const;
export const priorityOptions = ["low", "medium", "high", "urgent"] as const;

export const statusLabel: Record<string, string> = {
  "in-progress": "In Progress",
  todo: "Todo",
  backlog: "Backlog",
  done: "Done",
};

export const statusOrder = ["in-progress", "todo", "backlog", "done"];

export type View = "all" | "active" | "backlog" | "done";

export const viewLabels: Record<View, string> = {
  all: "All issues",
  active: "Active",
  backlog: "Backlog",
  done: "Done",
};

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
    new Date(value),
  );
