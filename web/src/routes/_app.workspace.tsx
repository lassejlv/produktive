import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { StatusIcon } from "@/components/issue/status-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectIcon } from "@/components/project/project-icon";
import { AiBriefPanel } from "@/components/workspace/ai-brief-panel";
import { generateWorkspaceBrief, type AiBrief } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { sortedStatuses, statusCategory } from "@/lib/issue-constants";
import { inboxQueryOptions } from "@/lib/queries/inbox";
import { issuesQueryOptions, useIssuesQuery } from "@/lib/queries/issues";
import { projectsQueryOptions, useProjectsQuery } from "@/lib/queries/projects";
import { useInbox } from "@/lib/use-inbox";
import { useIssueStatuses } from "@/lib/use-issue-statuses";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/workspace")({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(issuesQueryOptions());
    void context.queryClient.prefetchQuery(projectsQueryOptions());
    void context.queryClient.prefetchQuery(inboxQueryOptions());
  },
  component: WorkspaceRoute,
});

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

function WorkspaceRoute() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  if (pathname !== "/workspace") {
    return <Outlet />;
  }

  return <WorkspaceOverview />;
}

function OverviewSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-10">
      <div className="space-y-2">
        <Skeleton className="h-8 w-52 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-14 w-full rounded-lg" />
      <div className="space-y-3 border-t border-border-subtle pt-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
      <div className="space-y-2 border-t border-border-subtle pt-6">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}

function WorkspaceOverview() {
  const session = useSession();
  const issuesQuery = useIssuesQuery();
  const projectsQuery = useProjectsQuery();
  const { statuses } = useIssueStatuses();
  const { unreadCount: inboxUnread } = useInbox();

  const issues = issuesQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const userId = session.data?.user?.id ?? null;
  const orgName = session.data?.organization?.name ?? "Workspace";

  const counts = useMemo(() => {
    let active = 0;
    let inProgress = 0;
    let done = 0;
    for (const issue of issues) {
      if (issue.status === "in-progress") {
        active++;
        inProgress++;
      } else if (statusCategory(statuses, issue.status) === "active") {
        active++;
      } else if (statusCategory(statuses, issue.status) === "backlog") {
        active++;
      } else if (statusCategory(statuses, issue.status) === "done") {
        done++;
      }
    }
    return { active, inProgress, done };
  }, [issues, statuses]);

  const focusIssues = useMemo(() => {
    if (!userId) return [];
    const statusRank = new Map(
      sortedStatuses(statuses).map((status, index) => [status.key, index]),
    );
    return issues
      .filter(
        (issue) =>
          issue.assignedTo?.id === userId &&
          !["done", "canceled"].includes(statusCategory(statuses, issue.status)),
      )
      .sort((a, b) => {
        const sa = statusRank.get(a.status) ?? 999;
        const sb = statusRank.get(b.status) ?? 999;
        if (sa !== sb) return sa - sb;
        const pa = PRIORITY_RANK[a.priority] ?? 9;
        const pb = PRIORITY_RANK[b.priority] ?? 9;
        if (pa !== pb) return pa - pb;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      })
      .slice(0, 5);
  }, [issues, statuses, userId]);

  const activeProjects = useMemo(
    () =>
      projects
        .filter(
          (p) => p.archivedAt === null && (p.status === "planned" || p.status === "in-progress"),
        )
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5),
    [projects],
  );

  const upcomingProjects = useMemo(() => {
    const now = Date.now();
    const horizon = now + 30 * 24 * 60 * 60 * 1000;
    return projects
      .filter((p) => p.archivedAt === null && p.targetDate)
      .filter((p) => {
        const t = new Date(p.targetDate as string).getTime();
        return t >= now && t <= horizon;
      })
      .sort(
        (a, b) =>
          new Date(a.targetDate as string).getTime() -
          new Date(b.targetDate as string).getTime(),
      )
      .slice(0, 5);
  }, [projects]);

  const isLoading = issuesQuery.isPending || projectsQuery.isPending;
  const empty = !isLoading && issues.length === 0 && projects.length === 0;
  const [brief, setBrief] = useState<AiBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  const handleGenerateBrief = async () => {
    setBriefLoading(true);
    setBriefError(null);
    try {
      const result = await generateWorkspaceBrief();
      setBrief(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate brief";
      setBriefError(message);
      toast.error(message);
    } finally {
      setBriefLoading(false);
    }
  };

  return (
    <main className="min-h-full bg-bg">
      <header className="sticky top-0 z-10 flex h-11 items-center justify-between gap-3 border-b border-border-subtle bg-bg px-4">
        <h1 className="text-sm font-medium text-fg">Overview</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/issues"
            search={{ new: true }}
            className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-fg-muted transition-colors hover:border-border hover:text-fg"
          >
            New issue
          </Link>
        </div>
      </header>

      {isLoading ? (
        <OverviewSkeleton />
      ) : empty ? (
        <section className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-20 text-center">
          <p className="text-sm text-fg">Add your first issue to get started.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link
              to="/issues"
              search={{ new: true }}
              className="rounded-md bg-fg px-3 py-1.5 text-xs font-medium text-bg hover:bg-white"
            >
              Create issue
            </Link>
            <Link
              to="/issues"
              className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-fg-muted transition-colors hover:border-border hover:text-fg"
            >
              Browse issues
            </Link>
          </div>
        </section>
      ) : (
        <section className="mx-auto w-full max-w-2xl px-4 py-8">
          <div>
            <h2 className="text-xl font-medium tracking-tight text-fg">{orgName}</h2>
            <p className="mt-1 text-sm text-fg-muted">
              <span className="tabular-nums">{counts.active}</span> active
              <Sep />
              <span className="tabular-nums">{counts.inProgress}</span> in progress
              <Sep />
              <span className="tabular-nums">{counts.done}</span> done
            </p>
            <p
              className="mt-2 max-w-prose text-xs text-fg-faint"
              title="Includes backlog, active workflow, and in-progress work that is not done or canceled."
            >
              Active includes backlog and in-flight work (not done or canceled).
            </p>
          </div>

          <Link
            to="/inbox"
            className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface/30 px-3 py-2.5 text-sm transition-colors hover:border-border hover:bg-surface/50"
          >
            <span className="text-fg">Inbox</span>
            {inboxUnread > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-medium text-white">
                {inboxUnread > 99 ? "99+" : inboxUnread}
              </span>
            ) : (
              <span className="text-xs text-fg-faint">Up to date</span>
            )}
          </Link>

          <AiBriefPanel
            className="mt-8"
            title="AI brief"
            actionLabel="Generate brief"
            refreshLabel="Refresh brief"
            brief={brief}
            loading={briefLoading}
            error={briefError}
            onGenerate={() => void handleGenerateBrief()}
            emptyDescription="Short read-only summary of active work, risks, and suggested next actions for this workspace."
          />

          <Section title="Your focus" actionLabel="All issues" actionTo="/issues">
            {focusIssues.length === 0 ? (
              <p className="text-sm text-fg-faint">Nothing on your plate.</p>
            ) : (
              <ul className="-mx-2 flex flex-col">
                {focusIssues.map((issue) => (
                  <li key={issue.id}>
                    <Link
                      to="/issues/$issueId"
                      params={{ issueId: issue.id }}
                      className="group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface/40"
                    >
                      <StatusIcon status={issue.status} statuses={statuses} />
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">{issue.title}</span>
                      {issue.project ? (
                        <span className="shrink-0 text-xs text-fg-faint">{issue.project.name}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Projects" actionLabel="All projects" actionTo="/projects">
            {activeProjects.length === 0 ? (
              <p className="text-sm text-fg-faint">No projects yet.</p>
            ) : (
              <ul className="-mx-2 flex flex-col">
                {activeProjects.map((project) => (
                  <li key={project.id}>
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: project.id }}
                      className="group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface/40"
                    >
                      <ProjectIcon
                        color={project.color}
                        icon={project.icon}
                        name={project.name}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">{project.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-fg-faint">
                        {project.doneCount} / {project.issueCount}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Upcoming deadlines" actionLabel="Projects" actionTo="/projects">
            {upcomingProjects.length === 0 ? (
              <p className="text-sm text-fg-faint">No project targets in the next 30 days.</p>
            ) : (
              <ul className="-mx-2 flex flex-col">
                {upcomingProjects.map((project) => (
                  <li key={project.id}>
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: project.id }}
                      className="group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface/40"
                    >
                      <ProjectIcon
                        color={project.color}
                        icon={project.icon}
                        name={project.name}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">{project.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-fg-muted">
                        {new Date(project.targetDate as string).toLocaleDateString("en", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </section>
      )}
    </main>
  );
}

function Section({
  title,
  actionLabel,
  actionTo,
  children,
}: {
  title: string;
  actionLabel: string;
  actionTo: "/issues" | "/projects";
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-medium text-fg-muted">{title}</h3>
        <Link
          to={actionTo}
          className={cn("text-xs text-fg-faint transition-colors hover:text-fg-muted")}
        >
          {actionLabel} →
        </Link>
      </div>
      {children}
    </section>
  );
}

function Sep() {
  return <span className="px-1.5 text-fg-faint/60">·</span>;
}
