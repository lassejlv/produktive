import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { StatusIcon } from "@/components/issue/status-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectIcon } from "@/components/project/project-icon";
import { useSession } from "@/lib/auth-client";
import { sortedStatuses, statusCategory } from "@/lib/issue-constants";
import { inboxQueryOptions } from "@/lib/queries/inbox";
import { issuesQueryOptions, useIssuesQuery } from "@/lib/queries/issues";
import { projectsQueryOptions, useProjectsQuery } from "@/lib/queries/projects";
import { useInbox } from "@/lib/use-inbox";
import { useIssueStatuses } from "@/lib/use-issue-statuses";

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

const INTRO_SESSION_KEY = "produktive:workspace-overview-intro";

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
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <Skeleton className="h-12 w-64 max-w-full" />
      <Skeleton className="mt-5 h-3 w-72 max-w-full" />
      <Skeleton className="mt-8 h-7 w-32 rounded-full" />
      <div className="mt-12 space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

function useIntroProgress(ready: boolean) {
  const [progress, setProgress] = useState(() => {
    if (typeof window === "undefined") return 1;
    if (window.sessionStorage.getItem(INTRO_SESSION_KEY)) return 1;
    return 0;
  });

  useEffect(() => {
    if (!ready) return;
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(INTRO_SESSION_KEY)) {
      setProgress(1);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.sessionStorage.setItem(INTRO_SESSION_KEY, "1");
      setProgress(1);
      return;
    }
    const start = performance.now();
    const duration = 700;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setProgress(eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        window.sessionStorage.setItem(INTRO_SESSION_KEY, "1");
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  return progress;
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
      const category = statusCategory(statuses, issue.status);
      if (issue.status === "in-progress") {
        active++;
        inProgress++;
      } else if (category === "active" || category === "backlog") {
        active++;
      } else if (category === "done") {
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

  const introProgress = useIntroProgress(!isLoading && !empty);
  const a = Math.round(counts.active * introProgress);
  const i = Math.round(counts.inProgress * introProgress);
  const d = Math.round(counts.done * introProgress);

  return (
    <main className="min-h-full bg-bg">
      <header className="sticky top-0 z-10 flex h-11 items-center justify-between gap-3 border-b border-border-subtle bg-bg/85 px-4 backdrop-blur">
        <h1 className="text-[11px] font-medium uppercase tracking-[0.14em] text-fg-muted">
          Overview
        </h1>
        <Link
          to="/issues"
          search={{ new: true }}
          className="text-xs text-fg-muted transition-colors hover:text-fg"
        >
          New issue
        </Link>
      </header>

      {isLoading ? (
        <OverviewSkeleton />
      ) : empty ? (
        <section className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-24 text-center animate-fade-up">
          <p className="text-sm text-fg">Add your first issue to get started.</p>
          <Link
            to="/issues"
            search={{ new: true }}
            className="mt-4 text-xs text-fg-muted transition-colors hover:text-fg"
          >
            Create issue →
          </Link>
        </section>
      ) : (
        <section className="mx-auto w-full max-w-2xl px-4 py-12 animate-fade-up">
          <div>
            <h2 className="text-4xl font-light leading-[1.05] tracking-tight text-fg sm:text-5xl">
              {orgName}
            </h2>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[10.5px] font-medium uppercase tracking-[0.14em] text-fg-faint">
              <span>
                <span className="tabular-nums text-fg-muted">{a}</span> active
              </span>
              <span>
                <span className="tabular-nums text-fg-muted">{i}</span> in progress
              </span>
              <span>
                <span className="tabular-nums text-fg-muted">{d}</span> done
              </span>
            </div>
          </div>

          <div className="mt-8">
            <Link
              to="/inbox"
              className="inline-flex items-center gap-2 rounded-full border border-border-subtle px-3 py-1 text-[11.5px] text-fg-muted transition-colors hover:border-border hover:text-fg"
            >
              <span>Inbox</span>
              <span className="size-1 rounded-full bg-fg-faint" aria-hidden />
              <span className="tabular-nums">
                {inboxUnread > 0
                  ? `${inboxUnread > 99 ? "99+" : inboxUnread} unread`
                  : "Up to date"}
              </span>
            </Link>
          </div>

          <Section title="Your focus" actionLabel="All issues" actionTo="/issues">
            {focusIssues.length === 0 ? (
              <p className="text-sm text-fg-faint">Nothing on your plate.</p>
            ) : (
              <ul className="-mx-2 flex flex-col animate-stagger">
                {focusIssues.map((issue, idx) => (
                  <li key={issue.id} style={{ "--i": idx } as React.CSSProperties}>
                    <Link
                      to="/issues/$issueId"
                      params={{ issueId: issue.id }}
                      className="row-hover-shift group flex items-center gap-3 rounded-md px-2 py-2"
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
              <ul className="-mx-2 flex flex-col animate-stagger">
                {activeProjects.map((project, idx) => (
                  <li key={project.id} style={{ "--i": idx } as React.CSSProperties}>
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: project.id }}
                      className="row-hover-shift group flex items-center gap-3 rounded-md px-2 py-2"
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
              <ul className="-mx-2 flex flex-col animate-stagger">
                {upcomingProjects.map((project, idx) => (
                  <li key={project.id} style={{ "--i": idx } as React.CSSProperties}>
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: project.id }}
                      className="row-hover-shift group flex items-center gap-3 rounded-md px-2 py-2"
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
    <section className="mt-12">
      <div className="hairline-top mb-3" />
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-fg-muted">
          {title}
        </h3>
        <Link
          to={actionTo}
          className="text-[11px] text-fg-faint transition-colors hover:text-fg-muted"
        >
          {actionLabel} →
        </Link>
      </div>
      {children}
    </section>
  );
}
