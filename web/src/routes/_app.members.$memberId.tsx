import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/issue/avatar";
import { PriorityIcon } from "@/components/issue/priority-icon";
import { StatusIcon } from "@/components/issue/status-icon";
import {
  getMemberProfile,
  type IssueHistoryChange,
  type MemberIssue,
  type MemberProfile,
} from "@/lib/api";
import { formatDate, statusLabel } from "@/lib/issue-constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/members/$memberId")({
  component: MemberProfilePage,
});

function MemberProfilePage() {
  const { memberId } = Route.useParams();
  const navigate = useNavigate();
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void getMemberProfile(memberId)
      .then((response) => {
        if (!cancelled) setMember(response.member);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load member",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [memberId]);

  if (isLoading) {
    return (
      <main className="p-6">
        <div className="mx-auto max-w-5xl animate-pulse">
          <div className="h-20 rounded-lg border border-border-subtle bg-surface" />
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="h-24 rounded-lg border border-border-subtle bg-surface" />
            <div className="h-24 rounded-lg border border-border-subtle bg-surface" />
            <div className="h-24 rounded-lg border border-border-subtle bg-surface" />
          </div>
        </div>
      </main>
    );
  }

  if (error || !member) {
    return (
      <main className="grid min-h-[60vh] place-items-center px-6 text-center">
        <div>
          <p className="text-sm text-fg">{error ?? "Member not found"}</p>
          <button
            type="button"
            onClick={() => history.back()}
            className="mt-3 text-xs text-accent hover:underline"
          >
            Go back
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-bg">
      <div className="mx-auto max-w-5xl px-5 py-6">
        <header className="rounded-lg border border-border-subtle bg-bg px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <MemberAvatar name={member.name} image={member.image} />
              <div className="min-w-0">
                <h1 className="truncate text-lg font-medium text-fg">
                  {member.name}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                  <span>{member.email}</span>
                  <span className="text-fg-faint">/</span>
                  <span className="capitalize">{member.role}</span>
                  <span className="text-fg-faint">/</span>
                  <span>Joined {formatDate(member.joinedAt)}</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => history.back()}
              className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-fg-muted transition-colors hover:bg-surface hover:text-fg"
            >
              Back
            </button>
          </div>
        </header>

        <section className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Assigned issues" value={member.stats.assignedIssues} />
          <Stat label="Created issues" value={member.stats.createdIssues} />
          <Stat label="Activity events" value={member.stats.activityEvents} />
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-border-subtle bg-bg">
            <div className="border-b border-border-subtle px-4 py-3">
              <h2 className="text-sm font-medium text-fg">Activity</h2>
            </div>
            <div>
              {member.activity.length === 0 ? (
                <EmptyLine text="No recorded activity yet." />
              ) : (
                member.activity.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() =>
                      event.issue &&
                      void navigate({
                        to: "/issues/$issueId",
                        params: { issueId: event.issue.id },
                      })
                    }
                    className="block w-full border-b border-border-subtle px-4 py-3 text-left last:border-b-0 transition-colors hover:bg-surface"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-fg">
                          {activityLabel(event.action)}{" "}
                          <span className="text-fg-muted">
                            {event.issue?.title}
                          </span>
                        </div>
                        <ChangeSummary changes={event.changes} />
                      </div>
                      <span className="shrink-0 font-mono text-[11px] text-fg-muted">
                        {formatDate(event.createdAt)}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="grid content-start gap-5">
            <IssuePanel
              title="Assigned"
              issues={member.assignedIssues}
              onOpen={(issueId) =>
                void navigate({
                  to: "/issues/$issueId",
                  params: { issueId },
                })
              }
            />
            <IssuePanel
              title="Created"
              issues={member.createdIssues}
              onOpen={(issueId) =>
                void navigate({
                  to: "/issues/$issueId",
                  params: { issueId },
                })
              }
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg px-4 py-3">
      <div className="font-mono text-xl text-fg tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-fg-muted">{label}</div>
    </div>
  );
}

function MemberAvatar({
  name,
  image,
}: {
  name: string;
  image: string | null;
}) {
  if (image) {
    return (
      <img
        src={image}
        alt=""
        className="size-11 shrink-0 rounded-full border border-border-subtle object-cover"
      />
    );
  }

  return (
    <div className="grid size-11 shrink-0 place-items-center rounded-full border border-border-subtle bg-surface font-mono text-sm text-fg-muted">
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function IssuePanel({
  title,
  issues,
  onOpen,
}: {
  title: string;
  issues: MemberIssue[];
  onOpen: (issueId: string) => void;
}) {
  return (
    <section className="rounded-lg border border-border-subtle bg-bg">
      <div className="border-b border-border-subtle px-4 py-3">
        <h2 className="text-sm font-medium text-fg">{title}</h2>
      </div>
      {issues.length === 0 ? (
        <EmptyLine text="No issues." />
      ) : (
        issues.map((issue) => (
          <button
            key={issue.id}
            type="button"
            onClick={() => onOpen(issue.id)}
            className="flex w-full items-center gap-2 border-b border-border-subtle px-4 py-2.5 text-left last:border-b-0 transition-colors hover:bg-surface"
          >
            <PriorityIcon priority={issue.priority} />
            <StatusIcon status={issue.status} />
            <span className="min-w-0 flex-1 truncate text-sm text-fg">
              {issue.title}
            </span>
            <span className="hidden text-[11px] text-fg-muted sm:block">
              {statusLabel[issue.status] ?? issue.status}
            </span>
          </button>
        ))
      )}
    </section>
  );
}

function ChangeSummary({ changes }: { changes: IssueHistoryChange[] }) {
  if (changes.length === 0) {
    return <div className="mt-1 text-xs text-fg-muted">No field changes.</div>;
  }

  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {changes.slice(0, 4).map((change) => (
        <span
          key={change.field}
          className={cn(
            "rounded border border-border-subtle bg-surface px-1.5 py-0.5",
            "font-mono text-[10.5px] text-fg-muted",
          )}
        >
          {change.field}: {formatValue(change.before)}
          {" -> "}
          {formatValue(change.after)}
        </span>
      ))}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="px-4 py-5 text-sm text-fg-muted">{text}</div>;
}

function activityLabel(action: string) {
  if (action === "created") return "Created";
  if (action === "updated") return "Updated";
  if (action === "attachment_added") return "Attached a file to";
  return action.replace(/_/g, " ");
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "empty";
  if (typeof value === "string") return value || "empty";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "changed";
}
