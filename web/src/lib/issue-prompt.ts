import type { Issue } from "@/lib/api";

export function issueIdentifier(issue: Pick<Issue, "id">): string {
  return `P-${issue.id.slice(0, 4).toUpperCase()}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatIssueAsPrompt(issue: Issue): string {
  const identifier = issueIdentifier(issue);
  const lines: string[] = [];

  lines.push(`<issue identifier="${identifier}">`);
  lines.push(`<title>${escapeXml(issue.title)}</title>`);

  const description = issue.description?.trim();
  if (description) {
    lines.push(`<description>${escapeXml(description)}</description>`);
  }

  lines.push(`<status>${escapeXml(issue.status)}</status>`);
  lines.push(`<priority>${escapeXml(issue.priority)}</priority>`);

  if (issue.assignedTo) {
    lines.push(`<assignee>${escapeXml(issue.assignedTo.name)}</assignee>`);
  }
  if (issue.project) {
    lines.push(`<project>${escapeXml(issue.project.name)}</project>`);
  }
  if (issue.labels && issue.labels.length > 0) {
    const names = issue.labels.map((label) => label.name).join(", ");
    lines.push(`<labels>${escapeXml(names)}</labels>`);
  }

  lines.push("</issue>");

  return `Work on issue ${identifier}:\n\n${lines.join("\n")}`;
}

export async function copyIssuePrompt(issue: Issue): Promise<void> {
  const text = formatIssueAsPrompt(issue);
  await navigator.clipboard.writeText(text);
}
