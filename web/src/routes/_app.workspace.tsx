import {
  Link,
  Outlet,
  createFileRoute,
  useRouterState,
} from "@tanstack/react-router";
import { useMemo } from "react";
import { StatusIcon } from "@/components/issue/status-icon";
import { ProjectIcon } from "@/components/project/project-icon";
import { useSession } from "@/lib/auth-client";
import {
  issuesQueryOptions,
  useIssuesQuery,
} from "@/lib/queries/issues";
import {
  projectsQueryOptions,
  useProjectsQuery,
} from "@/lib/queries/projects";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/workspace")({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(issuesQueryOptions());
    void context.queryClient.prefetchQuery(projectsQueryOptions());
  },
  component: WorkspaceRoute,
});

const STATUS_RANK: Record<string, number> = {
  "in-progress": 0,
  todo: 1,
  backlog: 2,
};

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

function WorkspaceOverview() {
  const session = useSession();
  const issuesQuery = useIssuesQuery();
  const projectsQuery = useProjectsQuery();

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
      } else if (issue.status === "todo" || issue.status === "backlog") {
        active++;
      } else if (issue.status === "done") {
        done++;
      }
    }
    return { active, inProgress, done };
  }, [issues]);

  const focusIssues = useMemo(() => {
    if (!userId) return [];
    return issues
      .filter(
        (issue) =>
          issue.assignedTo?.id === userId &&
          issue.status !== "done" &&
          issue.status !== "cancelled",
      )
      .sort((a, b) => {
        const sa = STATUS_RANK[a.status] ?? 9;
        const sb = STATUS_RANK[b.status] ?? 9;
        if (sa !== sb) return sa - sb;
        const pa = PRIORITY_RANK[a.priority] ?? 9;
        const pb = PRIORITY_RANK[b.priority] ?? 9;
        if (pa !== pb) return pa - pb;
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      })
      .slice(0, 5);
  }, [issues, userId]);

  const activeProjects = useMemo(
    () =>
      projects
        .filter(
          (p) =>
            p.archivedAt === null &&
            (p.status === "planned" || p.status === "in-progress"),
        )
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, 5),
    [projects],
  );

  const isLoading = issuesQuery.isPending || projectsQuery.isPending;
  const empty =
    !isLoading && issues.length === 0 && projects.length === 0;

  return (
    <main className="min-h-full bg-bg">
      <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-border-subtle bg-bg/85 px-5 backdrop-blur">
        <h1 className="text-sm font-medium text-fg">Overview</h1>
      </header>

      <section className="mx-auto w-full max-w-[640px] px-6 py-12">
        {isLoading ? (
          <p className="text-[13px] text-fg-faint">Loading…</p>
        ) : empty ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-[13.5px] text-fg">
              Add your first issue to get started.
            </p>
            <Link
              to="/issues"
              className="mt-3 text-[12px] text-fg-muted transition-colors hover:text-fg"
            >
              Go to issues →
            </Link>
          </div>
        ) : (
          <>
            <div>
              <h2 className="text-[24px] font-medium tracking-[-0.02em] text-fg">
                {orgName}
              </h2>
              <p className="mt-1.5 text-[13px] text-fg-muted">
                <span className="tabular-nums">{counts.active}</span> active
                <Sep />
                <span className="tabular-nums">{counts.inProgress}</span> in
                progress
                <Sep />
                <span className="tabular-nums">{counts.done}</span> done
              </p>
            </div>

            <Section title="Your focus" actionLabel="All issues" actionTo="/issues">
              {focusIssues.length === 0 ? (
                <p className="text-[13px] text-fg-faint">
                  Nothing on your plate.
                </p>
              ) : (
                <ul className="-mx-2 flex flex-col">
                  {focusIssues.map((issue) => (
                    <li key={issue.id}>
                      <Link
                        to="/issues/$issueId"
                        params={{ issueId: issue.id }}
                        className="group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface/40"
                      >
                        <StatusIcon status={issue.status} />
                        <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">
                          {issue.title}
                        </span>
                        {issue.project ? (
                          <span className="shrink-0 text-[11.5px] text-fg-faint">
                            {issue.project.name}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section
              title="Projects"
              actionLabel="All projects"
              actionTo="/projects"
            >
              {activeProjects.length === 0 ? (
                <p className="text-[13px] text-fg-faint">No projects yet.</p>
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
                        <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">
                          {project.name}
                        </span>
                        <span className="shrink-0 text-[11.5px] tabular-nums text-fg-faint">
                          {project.doneCount} / {project.issueCount}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
      </section>
    </main>
  );
}

function Sep() {
  return <span className="px-1.5 text-fg-faint">·</span>;
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
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint">
          {title}
        </h3>
        <Link
          to={actionTo}
          className={cn(
            "text-[11.5px] text-fg-muted transition-colors hover:text-fg",
          )}
        >
          {actionLabel} →
        </Link>
      </div>
      {children}
    </section>
  );
}
