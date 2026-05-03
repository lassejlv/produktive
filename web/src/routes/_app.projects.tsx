import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ProjectsIcon } from "@/components/chat/icons";
import { Avatar } from "@/components/issue/avatar";
import { NewProjectDialog } from "@/components/project/new-project-dialog";
import { ProjectIcon } from "@/components/project/project-icon";
import { ProjectStatusIcon } from "@/components/project/project-status-icon";
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

export const Route = createFileRoute("/_app/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const navigate = useNavigate();
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

  if (pathname.startsWith("/projects/")) {
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update project");
    }
  };

  return (
    <main className="min-h-full bg-bg">
      <header className="sticky top-0 z-10 flex h-11 items-center justify-between gap-3 border-b border-border-subtle bg-bg px-4">
        <div className="flex items-center gap-2">
          <span className="text-fg-muted">
            <ProjectsIcon />
          </span>
          <h1 className="text-sm font-medium text-fg">Projects</h1>
          <span className="text-xs tabular-nums text-fg-muted">{filtered.length}</span>
        </div>
        <NewProjectDialog
          onCreated={(project) => {
            addProject(project);
            void navigate({
              to: "/projects/$projectId",
              params: { projectId: project.id },
            });
          }}
        />
      </header>

      <section className="mx-auto w-full max-w-3xl px-4 pb-16 pt-5">
        <nav className="flex flex-wrap gap-1">
          {(Object.keys(viewLabels) as ViewKey[]).map((key) => {
            const isActive = view === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
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

        {error ? (
          <p className="mt-4 rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-4">
          {isLoading ? (
            <ProjectListSkeleton />
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
            <p className="text-sm text-fg-faint">
              No projects in {viewLabels[view].toLowerCase()}.
            </p>
          ) : (
            <div className="divide-y divide-border-subtle">
              {filtered.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  onOpen={() =>
                    void navigate({
                      to: "/projects/$projectId",
                      params: { projectId: project.id },
                    })
                  }
                  onArchiveToggle={() => void handleArchiveToggle(project)}
                />
              ))}
            </div>
          )}
        </div>
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
        "group grid w-full cursor-pointer grid-cols-1 gap-3 py-3 text-left transition-colors hover:bg-surface/30 focus-visible:bg-surface/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent md:grid-cols-[minmax(0,1fr)_200px_72px] md:gap-4 md:px-0",
        isArchived && "opacity-65",
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <ProjectIcon color={project.color} icon={project.icon} name={project.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-medium text-fg">{project.name}</h3>
            {isArchived ? (
              <span className="shrink-0 rounded bg-surface px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-fg-faint">
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

      <div>
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

function ProjectListSkeleton() {
  return (
    <div className="divide-y divide-border-subtle">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-1 gap-3 py-3 md:grid-cols-[minmax(0,1fr)_200px_72px] md:gap-4"
        >
          <div className="flex items-start gap-2.5">
            <div className="size-8 rounded-lg bg-surface/70" />
            <div className="min-w-0 flex-1">
              <div className="h-3.5 w-36 rounded-full bg-surface/80" />
              <div className="mt-2 h-2.5 w-48 max-w-full rounded-full bg-surface/50" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="h-2.5 w-10 rounded-full bg-surface/60" />
              <div className="h-2.5 w-7 rounded-full bg-surface/40" />
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-surface/60" />
          </div>
          <div className="hidden md:block">
            <div className="ml-auto h-5 w-12 rounded-md bg-surface/40" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: (name?: string) => void }) {
  const suggestions = ["Q2 launch", "Onboarding revamp", "Bug bash"];
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="mb-3 text-fg-muted">
        <ProjectsIcon size={22} />
      </div>
      <h2 className="text-sm font-medium text-fg">No projects yet</h2>
      <p className="mt-1 max-w-sm text-sm text-fg-muted">
        Group issues into initiatives. Start from a template or create your own.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onCreate(suggestion)}
            className="rounded-full border border-border-subtle px-3 py-1 text-xs text-fg-muted transition-colors hover:border-border hover:text-fg"
          >
            {suggestion}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onCreate()}
        className="mt-4 rounded-md bg-fg px-3 py-1.5 text-xs font-medium text-bg hover:bg-white"
      >
        Create project
      </button>
    </div>
  );
}

function Sep() {
  return <span className="select-none text-fg-faint/50">·</span>;
}
