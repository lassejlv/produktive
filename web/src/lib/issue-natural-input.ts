import type { Label, Member, Project } from "@/lib/api";

export type NaturalIssueParseResult = {
  title: string;
  status: string | null;
  priority: string | null;
  assignedToId: string | null;
  projectId: string | null;
  labelIds: string[];
  chips: NaturalIssueChip[];
};

export type NaturalIssueChip = {
  kind: "status" | "priority" | "assignee" | "project" | "label";
  label: string;
};

type ParseContext = {
  members: Member[];
  projects: Project[];
  labels: Label[];
};

const PRIORITY_ALIASES: Record<string, string> = {
  p0: "urgent",
  urgent: "urgent",
  p1: "high",
  p2: "medium",
  p3: "low",
};

const STATUSES = new Set(["backlog", "todo", "in-progress", "done"]);

export function parseNaturalIssueInput(
  input: string,
  { members, projects, labels }: ParseContext,
): NaturalIssueParseResult {
  const words = input.trim().split(/\s+/).filter(Boolean);
  const titleWords: string[] = [];
  const labelIds = new Set<string>();
  const chips: NaturalIssueChip[] = [];
  let status: string | null = null;
  let priority: string | null = null;
  let assignedToId: string | null = null;
  let projectId: string | null = null;

  for (const word of words) {
    const parsed = parseWord(word, { members, projects, labels });
    if (!parsed) {
      titleWords.push(word);
      continue;
    }

    if (parsed.kind === "label") {
      if (!labelIds.has(parsed.id)) {
        labelIds.add(parsed.id);
        chips.push({ kind: parsed.kind, label: parsed.label });
      }
      continue;
    }

    if (parsed.kind === "priority") {
      priority = parsed.value;
      replaceChip(chips, parsed.kind, parsed.label);
      continue;
    }

    if (parsed.kind === "status") {
      status = parsed.value;
      replaceChip(chips, parsed.kind, parsed.label);
      continue;
    }

    if (parsed.kind === "assignee") {
      assignedToId = parsed.id;
      replaceChip(chips, parsed.kind, parsed.label);
      continue;
    }

    projectId = parsed.id;
    replaceChip(chips, parsed.kind, parsed.label);
  }

  return {
    title: cleanTitle(titleWords.join(" ")),
    status,
    priority,
    assignedToId,
    projectId,
    labelIds: [...labelIds],
    chips,
  };
}

function parseWord(word: string, context: ParseContext): ParsedWord | null {
  const token = stripTrailingPunctuation(word);
  const lower = token.toLowerCase();

  const priority = priorityFromToken(lower);
  if (priority) {
    return {
      kind: "priority",
      value: priority,
      label: `Priority ${priorityLabel(priority)}`,
    };
  }

  const status = statusFromToken(lower);
  if (status) {
    return { kind: "status", value: status, label: statusLabel(status) };
  }

  if (token.startsWith("@") && token.length > 1) {
    const member = resolveMember(token.slice(1), context.members);
    if (member) {
      return { kind: "assignee", id: member.id, label: member.name };
    }
  }

  if (token.startsWith("#") && token.length > 1) {
    const query = token.slice(1);
    const project = resolveProject(query, context.projects);
    if (project) {
      return { kind: "project", id: project.id, label: project.name };
    }

    const label = resolveLabel(query, context.labels);
    if (label) {
      return { kind: "label", id: label.id, label: label.name };
    }
  }

  if (token.startsWith("+") && token.length > 1) {
    const label = resolveLabel(token.slice(1), context.labels);
    if (label) {
      return { kind: "label", id: label.id, label: label.name };
    }
  }

  return null;
}

type ParsedWord =
  | { kind: "priority"; value: string; label: string }
  | { kind: "status"; value: string; label: string }
  | { kind: "assignee"; id: string; label: string }
  | { kind: "project"; id: string; label: string }
  | { kind: "label"; id: string; label: string };

function priorityFromToken(token: string) {
  const explicit = token.match(/^priority:(urgent|high|medium|low|p[0-3])$/);
  if (explicit) {
    return PRIORITY_ALIASES[explicit[1]] ?? explicit[1];
  }

  return PRIORITY_ALIASES[token] ?? null;
}

function statusFromToken(token: string) {
  const value = token.match(/^status:(backlog|todo|in-progress|done)$/)?.[1];
  if (value && STATUSES.has(value)) return value;
  return null;
}

function resolveMember(query: string, members: Member[]) {
  const normalized = normalize(query);
  const matches = members.filter((member) => {
    const name = normalize(member.name);
    const email = normalize(member.email.split("@")[0] ?? member.email);
    return name === normalized || email === normalized || name.startsWith(normalized);
  });
  return matches.length === 1 ? matches[0] : null;
}

function resolveProject(query: string, projects: Project[]) {
  return resolveNamed(
    query,
    projects.filter((project) => project.archivedAt === null),
  );
}

function resolveLabel(query: string, labels: Label[]) {
  return resolveNamed(
    query,
    labels.filter((label) => label.archivedAt === null),
  );
}

function resolveNamed<T extends { name: string }>(query: string, items: T[]) {
  const normalized = normalize(query);
  const exact = items.filter((item) => normalize(item.name) === normalized);
  if (exact.length === 1) return exact[0];

  const prefixed = items.filter((item) => normalize(item.name).startsWith(normalized));
  return prefixed.length === 1 ? prefixed[0] : null;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function stripTrailingPunctuation(value: string) {
  return value.replace(/[,.!?;:]+$/, "");
}

function cleanTitle(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function priorityLabel(priority: string) {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function statusLabel(status: string) {
  return status === "in-progress" ? "In progress" : priorityLabel(status);
}

function replaceChip(chips: NaturalIssueChip[], kind: NaturalIssueChip["kind"], label: string) {
  const existing = chips.findIndex((chip) => chip.kind === kind);
  const chip = { kind, label };
  if (existing >= 0) {
    chips[existing] = chip;
  } else {
    chips.push(chip);
  }
}
