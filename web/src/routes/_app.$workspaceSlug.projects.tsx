import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/issue/avatar";
import { NewProjectSheet } from "@/components/project/new-project-sheet";
import { ProjectIcon } from "@/components/project/project-icon";
import { ProjectStatusIcon } from "@/components/project/project-status-icon";
import { Spinner } from "@/components/ui/spinner";
import { type Project } from "@/lib/api";
import { projectColorHex, projectStatusLabel } from "@/lib/project-constants";
import { useUpdateProject } from "@/lib/mutations/projects";
import { useProjects } from "@/lib/use-projects";
import { cn } from "@/lib/utils";

type ViewKey = "all" | "active" | "completed" | "archived";

const viewLabels: Record<ViewKey, string> = {
  all: "All",
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

function isActiveProject(project: Project) {
  return (
    project.archivedAt === null &&
    (project.status === "planned" || project.status === "in-progress")
  );
}

export const Route = createFileRoute("/_app/$workspaceSlug/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const navigate = useNavigate();
  const { workspaceSlug } = Route.useParams();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [view, setView] = useState<ViewKey>("active");
  const includeArchived = view === "archived" || view === "all";
  const { projects, isLoading, error, addProject } = useProjects(includeArchived);
  const updateProjectMutation = useUpdateProject();

  const filtered = useMemo(() => {
    if (view === "all") return projects;
    if (view === "active") return projects.filter(isActiveProject);
    if (view === "completed") {
      return projects.filter((p) => p.archivedAt === null && p.status === "completed");
    }
    return projects.filter((p) => p.archivedAt !== null);
  }, [projects, view]);

  const counts = useMemo(
    () => ({
      all: projects.length,
      active: projects.filter(isActiveProject).length,
      completed: projects.filter((p) => p.archivedAt === null && p.status === "completed").length,
      archived: projects.filter((p) => p.archivedAt !== null).length,
    }),
    [projects],
  );

  if (pathname.startsWith(`/${workspaceSlug}/projects/`)) {
    return <Outlet />;
  }

  const handleArchiveToggle = async (project: Project) => {
    const next = project.archivedAt === null;
    try {
      await updateProjectMutation.mutateAsync({
        id: project.id,
        patch: { archived: next },
      });
      toast.success(next ? "Project archived" : "Project restored");
    } catch (archiveError) {
      toast.error(archiveError instanceof Error ? archiveError.message : "Failed to update project");
    }
  };

  const total = counts.all;
  const heroLabel = total === 1 ? "1 project" : `${total} projects`;

  return (
    <main className="min-h-full bg-bg">
      <header className="sticky top-0 z-10 flex h-11 items-center justify-between gap-3 border-b border-border-subtle bg-bg/85 px-4 backdrop-blur">
        <h1 className="text-sm font-medium text-fg">Projects</h1>
        <NewProjectSheet
          onCreated={(project) => {
            addProject(project);
            void navigate({
              to: "/$workspaceSlug/projects/$projectId",
              params: { workspaceSlug, projectId: project.id },
            });
          }}
        />
      </header>

      <section className="mx-auto w-full max-w-3xl animate-fade-up px-4 pb-16 pt-12">
        {error ? (
          <p className="mb-4 rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div>
          <h2 className="text-4xl font-light leading-[1.05] tracking-tight text-fg sm:text-5xl">
            {heroLabel}
          </h2>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-fg-faint">
            <span>
              <span className="tabular-nums text-fg-muted">{counts.active}</span> active
            </span>
            <span>
              <span className="tabular-nums text-fg-muted">{counts.completed}</span> completed
            </span>
            <span>
              <span className="tabular-nums text-fg-muted">{counts.archived}</span> archived
            </span>
          </div>
        </div>

        <nav className="mt-8 flex flex-wrap gap-1">
          {(Object.keys(viewLabels) as ViewKey[]).map((key) => {
            const isActive = view === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs transition-colors",
                  isActive
                    ? "bg-surface text-fg"
                    : "text-fg-muted hover:bg-surface/60 hover:text-fg",
                )}
              >
                <span>{viewLabels[key]}</span>
                <span
                  className={cn(
                    "tabular-nums",
                    isActive ? "text-fg-muted" : "text-fg-faint",
                  )}
                >
                  {counts[key]}
                </span>
              </button>
            );
          })}
        </nav>

        <section className="mt-10">
          <div className="hairline-top mb-3" />
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="text-xs font-medium text-fg-muted">{viewLabels[view]}</h3>
            <span className="text-[11px] tabular-nums text-fg-faint">{filtered.length}</span>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10 text-fg-faint">
              <Spinner size={14} />
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              onCreate={(suggestedName) => {
                window.dispatchEvent(
                  new CustomEvent("produktive:new-project", {
                    detail: { name: suggestedName },
                  }),
                );
              }}
            />
          ) : filtered.length === 0 ? (
            <p className="py-4 text-sm text-fg-faint">
              No projects in {viewLabels[view].toLowerCase()}.
            </p>
          ) : (
            <ul className="-mx-2 flex flex-col animate-stagger">
              {filtered.map((project, idx) => (
                <li key={project.id} style={{ "--i": idx } as React.CSSProperties}>
                  <ProjectRow
                    project={project}
                    onOpen={() =>
                      void navigate({
                        to: "/$workspaceSlug/projects/$projectId",
                        params: { workspaceSlug, projectId: project.id },
                      })
                    }
                    onArchiveToggle={() => void handleArchiveToggle(project)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}

function ProjectRow({
  project,
  onOpen,
  onArchiveToggle,
}: {
  project: Project;
  onOpen: () => void;
  onArchiveToggle: () => void;
}) {
  const progress = project.issueCount === 0 ? 0 : project.doneCount / project.issueCount;
  const isArchived = project.archivedAt !== null;
  const percent = Math.round(progress * 100);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        onOpen();
      }}
      className={cn(
        "row-hover-shift group grid w-full cursor-pointer grid-cols-1 gap-3 rounded-md px-2 py-2.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent md:grid-cols-[minmax(0,1fr)_180px_72px] md:gap-4",
        isArchived && "opacity-65",
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <ProjectIcon color={project.color} icon={project.icon} name={project.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm text-fg">{project.name}</h3>
            {isArchived ? (
              <span className="shrink-0 rounded-[5px] border border-border-subtle px-1.5 py-px text-[10px] text-fg-faint">
                Archived
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-muted">
            <ProjectStatusIcon status={project.status} progress={progress} size="sm" />
            <span>{projectStatusLabel[project.status] ?? project.status}</span>
            <Sep />
            {project.lead ? (
              <span className="inline-flex items-center gap-1.5">
                <Avatar name={project.lead.name} image={project.lead.image} />
                <span>{project.lead.name}</span>
              </span>
            ) : (
              <span className="text-fg-faint">No lead</span>
            )}
            {project.targetDate ? (
              <>
                <Sep />
                <span className="tabular-nums">
                  {new Date(project.targetDate).toLocaleDateString("en", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="self-center">
        <div className="flex items-center justify-between gap-2 text-xs text-fg-muted">
          <span className="tabular-nums">
            {project.doneCount} / {project.issueCount}
          </span>
          <span className="tabular-nums text-fg-faint">{percent}%</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full transition-all"
            style={{
              width: `${percent}%`,
              backgroundColor: projectColorHex[project.color] ?? "#5b8cff",
            }}
          />
        </div>
      </div>

      <span className="flex items-center md:justify-end">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onArchiveToggle();
          }}
          className="rounded-md px-2 py-1 text-xs text-fg-faint transition-colors hover:bg-surface hover:text-fg md:opacity-0 md:group-hover:opacity-100 md:group-focus-visible:opacity-100"
        >
          {isArchived ? "Restore" : "Archive"}
        </button>
      </span>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: (name?: string) => void }) {
  const suggestions = ["Q2 launch", "Onboarding revamp", "Bug bash"];
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <h2 className="text-sm text-fg">No projects yet</h2>
      <p className="mt-1 max-w-sm text-sm text-fg-muted">
        Group issues into initiatives. Start from a template or create your own.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onCreate(suggestion)}
            className="rounded-full border border-border-subtle px-3 py-1 text-xs text-fg-muted transition-colors hover:border-border hover:bg-surface/40 hover:text-fg"
          >
            {suggestion}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onCreate()}
        className="mt-4 text-xs text-fg-muted transition-colors hover:text-fg"
      >
        Create project →
      </button>
    </div>
  );
}

function Sep() {
  return <span className="select-none text-fg-faint/50">·</span>;
}
