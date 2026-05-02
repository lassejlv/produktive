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
    if (view === "active") {
      return projects.filter(
        (p) => p.archivedAt === null && (p.status === "planned" || p.status === "in-progress"),
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
        (p) => p.archivedAt === null && (p.status === "planned" || p.status === "in-progress"),
      ).length,
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
      <header className="sticky top-0 z-10 flex h-12 items-center justify-between gap-3 border-b border-border-subtle bg-bg/85 px-5 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="text-fg-muted">
            <ProjectsIcon />
          </span>
          <h1 className="text-sm font-medium text-fg">Projects</h1>
          <span className="text-xs text-fg-muted tabular-nums">{filtered.length}</span>
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

      <section className="mx-auto w-full max-w-[980px] px-5 pb-20 pt-6">
        <div className="flex flex-col gap-5 border-b border-border-subtle pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-faint">
              Portfolio
            </p>
            <h2 className="mt-1 text-[24px] font-medium tracking-[-0.02em] text-fg">
              Project work
            </h2>
            <p className="mt-1 text-[12.5px] text-fg-muted">
              <span className="tabular-nums text-fg">{filtered.length}</span>{" "}
              {filtered.length === 1 ? "project" : "projects"} in {viewLabels[view].toLowerCase()}.
            </p>
          </div>

          <div className="grid grid-cols-3 divide-x divide-border-subtle border-y border-border-subtle md:min-w-[340px]">
            <SummaryStat label="Active" value={counts.active} />
            <SummaryStat label="Completed" value={counts.completed} />
            <SummaryStat label="Archived" value={counts.archived} />
          </div>
        </div>

        <nav className="mt-4 flex flex-wrap items-center gap-1">
          {(Object.keys(viewLabels) as ViewKey[]).map((key) => {
            const isActive = view === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] transition-colors active:scale-[0.98]",
                  isActive
                    ? "bg-surface text-fg"
                    : "text-fg-muted hover:bg-surface/60 hover:text-fg",
                )}
              >
                <span>{viewLabels[key]}</span>
                <span
                  className={cn(
                    "font-mono text-[11px]",
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
          <p className="mt-5 border-y border-danger/30 py-3 text-[13px] text-danger">{error}</p>
        ) : null}

        <div className="mt-5">
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
            <p className="text-[13px] text-fg-faint">
              No projects in {viewLabels[view].toLowerCase()}.
            </p>
          ) : (
            <div className="border-y border-border-subtle">
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

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-3 py-2.5">
      <div className="font-mono text-[17px] leading-none text-fg tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] text-fg-faint">{label}</div>
    </div>
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
        "group grid w-full cursor-pointer grid-cols-1 gap-3 border-b border-border-subtle px-0 py-4 text-left transition-colors last:border-b-0 hover:bg-surface/25 focus-visible:bg-surface/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:bg-surface/35 md:grid-cols-[minmax(0,1fr)_220px_76px]",
        isArchived && "opacity-70",
      )}
    >
      <div className="flex min-w-0 items-start gap-3 px-0 md:px-3">
        <ProjectIcon color={project.color} icon={project.icon} name={project.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-[13.5px] font-medium text-fg">{project.name}</h3>
            {isArchived ? (
              <span className="shrink-0 rounded-full border border-border-subtle px-1.5 py-px text-[10.5px] uppercase tracking-[0.04em] text-fg-faint">
                Archived
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-fg-muted">
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
                <span className="font-mono text-[11px]">
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

      <div className="px-0 md:px-3">
        <div className="flex items-center justify-between gap-3 text-[11px] text-fg-muted">
          <span className="font-mono tabular-nums">
            {project.doneCount} / {project.issueCount}
          </span>
          <span className="font-mono tabular-nums text-fg-faint">{percent}%</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full transition-all"
            style={{
              width: `${percent}%`,
              backgroundColor: projectColorHex[project.color] ?? "#5b8cff",
            }}
          />
        </div>
      </div>

      <span className="flex items-center justify-start px-0 md:justify-end md:px-3">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onArchiveToggle();
          }}
          className="rounded-md px-2 py-1 text-[11.5px] text-fg-faint opacity-100 transition-colors hover:bg-surface hover:text-fg active:scale-[0.98] md:opacity-0 md:group-hover:opacity-100 md:group-focus-visible:opacity-100"
        >
          {isArchived ? "Restore" : "Archive"}
        </button>
      </span>
    </div>
  );
}

function ProjectListSkeleton() {
  return (
    <div className="border-y border-border-subtle">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-1 gap-3 border-b border-border-subtle px-0 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_220px_76px]"
        >
          <div className="flex items-start gap-3 px-0 md:px-3">
            <div className="size-8 rounded-[8px] bg-surface/70" />
            <div className="min-w-0 flex-1">
              <div className="h-3.5 w-40 rounded-full bg-surface/80" />
              <div className="mt-2 h-2.5 w-56 max-w-full rounded-full bg-surface/50" />
            </div>
          </div>
          <div className="px-0 md:px-3">
            <div className="flex items-center justify-between gap-3">
              <div className="h-2.5 w-12 rounded-full bg-surface/60" />
              <div className="h-2.5 w-8 rounded-full bg-surface/40" />
            </div>
            <div className="mt-2 h-1 rounded-full bg-surface/60" />
          </div>
          <div className="hidden px-3 md:block">
            <div className="ml-auto h-5 w-14 rounded-md bg-surface/40" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: (name?: string) => void }) {
  const suggestions = ["Q2 launch", "Onboarding revamp", "Bug bash"];
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <div className="mb-4 grid size-11 place-items-center rounded-[10px] border border-border-subtle bg-surface/40 text-fg-muted">
        <ProjectsIcon size={22} />
      </div>
      <h2 className="text-[15px] font-medium text-fg">Track work as projects</h2>
      <p className="mt-1 max-w-[360px] text-[13px] text-fg-muted">
        Projects group related issues into initiatives — from a launch to a polish week. Try one of
        these to get started:
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onCreate(suggestion)}
            className="rounded-full border border-border-subtle bg-transparent px-3 py-1 text-[12px] text-fg-muted transition-colors hover:border-border hover:text-fg active:scale-[0.98]"
          >
            {suggestion}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onCreate()}
        className="mt-5 rounded-md bg-fg px-3 py-1.5 text-[12.5px] font-medium text-bg transition-colors hover:bg-white active:scale-[0.98]"
      >
        + Create project
      </button>
    </div>
  );
}

function Sep() {
  return <span className="select-none text-fg-faint/60">·</span>;
}
