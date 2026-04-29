import {
  Outlet,
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ProjectsIcon } from "@/components/chat/icons";
import { Avatar } from "@/components/issue/avatar";
import { NewProjectDialog } from "@/components/project/new-project-dialog";
import { ProjectIcon } from "@/components/project/project-icon";
import { ProjectStatusIcon } from "@/components/project/project-status-icon";
import { type Project, updateProject } from "@/lib/api";
import {
  projectColorHex,
  projectStatusLabel,
} from "@/lib/project-constants";
import { useProjects } from "@/lib/use-projects";
import { cn } from "@/lib/utils";

type ViewKey = "all" | "active" | "completed" | "archived";

const viewLabels: Record<ViewKey, string> = {
  all: "All",
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

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
  const {
    projects,
    isLoading,
    refresh,
    addProject,
    updateProjectLocal,
  } = useProjects(includeArchived);

  const filtered = useMemo(() => {
    if (view === "all") return projects;
    if (view === "active") {
      return projects.filter(
        (p) =>
          p.archivedAt === null &&
          (p.status === "planned" || p.status === "in-progress"),
      );
    }
    if (view === "completed") {
      return projects.filter((p) => p.archivedAt === null && p.status === "completed");
    }
    return projects.filter((p) => p.archivedAt !== null);
  }, [projects, view]);

  const counts = useMemo(
    () => ({
      all: projects.length,
      active: projects.filter(
        (p) =>
          p.archivedAt === null &&
          (p.status === "planned" || p.status === "in-progress"),
      ).length,
      completed: projects.filter(
        (p) => p.archivedAt === null && p.status === "completed",
      ).length,
      archived: projects.filter((p) => p.archivedAt !== null).length,
    }),
    [projects],
  );

  if (pathname.startsWith("/projects/")) {
    return <Outlet />;
  }

  const handleArchiveToggle = async (project: Project) => {
    const next = project.archivedAt === null;
    updateProjectLocal(project.id, {
      archivedAt: next ? new Date().toISOString() : null,
    });
    try {
      await updateProject(project.id, { archived: next });
      void refresh();
      toast.success(next ? "Project archived" : "Project restored");
    } catch (error) {
      updateProjectLocal(project.id, { archivedAt: project.archivedAt });
      toast.error(
        error instanceof Error ? error.message : "Failed to update project",
      );
    }
  };

  return (
    <main className="min-h-full bg-bg">
      <header className="sticky top-0 z-10 flex h-12 items-center justify-between gap-3 border-b border-border-subtle bg-bg/85 px-5 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="text-fg-muted">
            <ProjectsIcon />
          </span>
          <h1 className="text-sm font-medium text-fg">Projects</h1>
          <span className="text-xs text-fg-muted tabular-nums">
            {filtered.length}
          </span>
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

      <nav className="flex items-center gap-1 border-b border-border-subtle bg-bg px-5 py-2">
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
                  : "text-fg-muted hover:bg-surface hover:text-fg",
              )}
            >
              <span>{viewLabels[key]}</span>
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  isActive ? "text-fg-muted" : "text-fg-faint",
                )}
              >
                {counts[key]}
              </span>
            </button>
          );
        })}
      </nav>

      <section className="mx-auto w-full max-w-[960px] px-5 py-6">
        {isLoading ? (
          <p className="text-[13px] text-fg-faint">Loading…</p>
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
          <p className="text-[13px] text-fg-faint">
            No projects in {viewLabels[view].toLowerCase()}.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((project) => (
              <ProjectCard
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
      </section>
    </main>
  );
}

function ProjectCard({
  project,
  onOpen,
  onArchiveToggle,
}: {
  project: Project;
  onOpen: () => void;
  onArchiveToggle: () => void;
}) {
  const progress =
    project.issueCount === 0 ? 0 : project.doneCount / project.issueCount;
  const isArchived = project.archivedAt !== null;

  return (
    <div
      onClick={onOpen}
      className={cn(
        "group relative cursor-pointer rounded-[10px] border border-border-subtle bg-surface/40 p-4 transition-colors hover:border-border hover:bg-surface/60",
        isArchived && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        <ProjectIcon
          color={project.color}
          icon={project.icon}
          name={project.name}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[13.5px] font-medium text-fg">
              {project.name}
            </h3>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-fg-muted">
            <ProjectStatusIcon
              status={project.status}
              progress={progress}
              size="sm"
            />
            <span>{projectStatusLabel[project.status] ?? project.status}</span>
            {project.issueCount > 0 ? (
              <>
                <span className="text-fg-faint">·</span>
                <span className="tabular-nums">
                  {project.doneCount} / {project.issueCount}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {project.issueCount > 0 ? (
        <div className="mt-3.5 h-1 overflow-hidden rounded-full bg-bg">
          <div
            className="h-full transition-all"
            style={{
              width: `${Math.round(progress * 100)}%`,
              backgroundColor: projectColorHex[project.color] ?? "#5b8cff",
            }}
          />
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between text-[11.5px] text-fg-muted">
        <div className="flex items-center gap-2">
          {project.lead ? (
            <div className="flex items-center gap-1.5">
              <Avatar name={project.lead.name} image={project.lead.image} />
              <span>{project.lead.name}</span>
            </div>
          ) : (
            <span className="text-fg-faint">No lead</span>
          )}
        </div>
        {project.targetDate ? (
          <span className="font-mono">
            {new Date(project.targetDate).toLocaleDateString("en", {
              month: "short",
              day: "numeric",
            })}
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onArchiveToggle();
        }}
        className="absolute right-3 top-3 hidden rounded-md px-2 py-0.5 text-[11px] text-fg-muted transition-colors hover:bg-surface hover:text-fg group-hover:block"
      >
        {isArchived ? "Restore" : "Archive"}
      </button>
    </div>
  );
}

function EmptyState({
  onCreate,
}: {
  onCreate: (name?: string) => void;
}) {
  const suggestions = ["Q2 launch", "Onboarding revamp", "Bug bash"];
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-xl bg-surface/60 text-fg-muted">
        <ProjectsIcon size={22} />
      </div>
      <h2 className="text-[15px] font-medium text-fg">
        Track work as projects
      </h2>
      <p className="mt-1 max-w-[360px] text-[13px] text-fg-muted">
        Projects group related issues into initiatives — from a launch to a
        polish week. Try one of these to get started:
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onCreate(suggestion)}
            className="rounded-full border border-border-subtle bg-surface/40 px-3 py-1 text-[12px] text-fg-muted transition-colors hover:border-border hover:text-fg"
          >
            {suggestion}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onCreate()}
        className="mt-5 rounded-md bg-fg px-3 py-1.5 text-[12.5px] font-medium text-bg transition-colors hover:bg-white"
      >
        + Create project
      </button>
    </div>
  );
}
