import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/issue/avatar";
import { EditableDescription } from "@/components/issue/editable-description";
import { EditableTitle } from "@/components/issue/editable-title";
import { IssueList } from "@/components/issue/issue-list";
import { MemberPicker } from "@/components/issue/member-picker";
import { ProjectIcon } from "@/components/project/project-icon";
import { ProjectStatusIcon } from "@/components/project/project-status-icon";
import {
  type Project,
  createIssue,
  deleteProject,
  getProject,
  updateIssue,
  updateProject,
} from "@/lib/api";
import { statusLabel } from "@/lib/issue-constants";
import { defaultDisplayOptions } from "@/lib/issue-display";
import {
  projectColorHex,
  projectStatusLabel,
  projectStatusOptions,
} from "@/lib/project-constants";
import { useIssues } from "@/lib/use-issues";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/projects/$projectId")({
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const { issues, addIssue, updateIssueLocal } = useIssues();

  const loadProject = async () => {
    try {
      const response = await getProject(projectId);
      setProject(response.project);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load project",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const projectIssues = useMemo(
    () => issues.filter((issue) => issue.projectId === projectId),
    [issues, projectId],
  );

  const updateField = async (patch: Partial<Project>, body: object) => {
    if (!project) return;
    const previous = project;
    setProject({ ...project, ...patch });
    try {
      const response = await updateProject(projectId, body);
      setProject(response.project);
    } catch (error) {
      setProject(previous);
      toast.error(
        error instanceof Error ? error.message : "Failed to update",
      );
    }
  };

  const handleStatus = (next: string) =>
    void updateField({ status: next }, { status: next });

  const handleLead = (leadId: string | null) =>
    void updateField(
      {
        leadId,
        lead: null,
      },
      { leadId: leadId ?? "" },
    ).then(() => loadProject());

  const handleArchiveToggle = async () => {
    if (!project) return;
    const next = project.archivedAt === null;
    await updateField(
      { archivedAt: next ? new Date().toISOString() : null },
      { archived: next },
    );
    toast.success(next ? "Project archived" : "Project restored");
  };

  const handleDelete = async () => {
    if (!project) return;
    if (!window.confirm(`Delete project "${project.name}"?`)) return;
    try {
      await deleteProject(projectId);
      toast.success("Project deleted");
      await navigate({ to: "/projects" });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete",
      );
    }
  };

  const handleCreateInGroup = async (status: string, title: string) => {
    try {
      const response = await createIssue({
        title,
        status,
        projectId,
      });
      addIssue(response.issue);
      // re-pull project counts
      void loadProject();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create issue",
      );
    }
  };

  const handleMoveToStatus = async (movingId: string, nextStatus: string) => {
    const previous = issues.find((issue) => issue.id === movingId)?.status;
    if (!previous || previous === nextStatus) return;
    updateIssueLocal(movingId, { status: nextStatus });
    try {
      const response = await updateIssue(movingId, { status: nextStatus });
      updateIssueLocal(movingId, response.issue);
      toast.success(`Moved to ${statusLabel[nextStatus] ?? nextStatus}`);
      void loadProject();
    } catch (error) {
      updateIssueLocal(movingId, { status: previous });
      toast.error(
        error instanceof Error ? error.message : "Failed to move issue",
      );
    }
  };

  if (loading || !project) {
    return (
      <main className="min-h-full bg-bg p-6">
        <p className="text-[13px] text-fg-faint">Loading project…</p>
      </main>
    );
  }

  const progress =
    project.issueCount === 0 ? 0 : project.doneCount / project.issueCount;

  return (
    <main className="min-h-full bg-bg">
      <header className="flex items-center justify-between gap-3 px-6 pt-5">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 text-[12px] text-fg-faint transition-colors hover:text-fg-muted"
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
            <path
              d="M9 3l-4 4 4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to projects
        </Link>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            className="grid size-7 place-items-center rounded-[6px] text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          >
            ⋯
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-8 z-30 w-44 overflow-hidden rounded-[8px] border border-border bg-surface py-1 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  void handleArchiveToggle();
                }}
              >
                {project.archivedAt === null
                  ? "Archive project"
                  : "Restore project"}
              </MenuItem>
              <div className="my-1 h-px bg-border-subtle" />
              <MenuItem
                danger
                onClick={() => {
                  setMenuOpen(false);
                  void handleDelete();
                }}
              >
                Delete project
              </MenuItem>
            </div>
          ) : null}
        </div>
      </header>

      <article className="mx-auto w-full max-w-[760px] px-6 pb-24 pt-10">
        <div className="flex items-center gap-3">
          <ProjectIcon
            color={project.color}
            icon={project.icon}
            name={project.name}
            size="lg"
          />
          {project.archivedAt !== null ? (
            <span className="rounded-full border border-border-subtle bg-surface/40 px-2 py-0.5 text-[10.5px] uppercase tracking-[0.06em] text-fg-muted">
              Archived
            </span>
          ) : null}
        </div>
        <div className="mt-4">
          <EditableTitle
            value={project.name}
            onSave={async (next) => {
              await updateField({ name: next }, { name: next });
            }}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-1.5 text-[13px] text-fg-muted">
          <InlineStatusSelect
            status={project.status}
            progress={progress}
            onChange={handleStatus}
          />
          <Sep />
          <MemberPicker
            selectedId={project.leadId}
            onSelect={handleLead}
            trigger={({ onClick }) => (
              <button
                type="button"
                onClick={onClick}
                className="inline-flex h-6 items-center gap-1.5 rounded-[5px] px-1 transition-colors hover:bg-surface/60 hover:text-fg"
              >
                {project.lead ? (
                  <>
                    <Avatar
                      name={project.lead.name}
                      image={project.lead.image}
                    />
                    <span>{project.lead.name}</span>
                  </>
                ) : (
                  <span className="text-fg-faint">No lead</span>
                )}
              </button>
            )}
          />
          {project.targetDate ? (
            <>
              <Sep />
              <span className="font-mono text-[12px]">
                {new Date(project.targetDate).toLocaleDateString("en", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </>
          ) : null}
        </div>

        <div className="mt-10">
          <EditableDescription
            value={project.description}
            onSave={async (next) => {
              await updateField(
                { description: next || null },
                { description: next },
              );
            }}
          />
        </div>

        <section className="mt-12">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint">
              Progress
            </h2>
            <Link
              to="/issues"
              className="text-[11px] text-fg-muted transition-colors hover:text-fg"
            >
              Open in Issues →
            </Link>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface/60">
            <div
              className="h-full transition-all"
              style={{
                width: `${Math.round(progress * 100)}%`,
                backgroundColor:
                  projectColorHex[project.color] ?? "#5b8cff",
              }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-muted">
            <BreakdownPill label="Backlog" count={project.statusBreakdown.backlog} />
            <BreakdownPill label="Todo" count={project.statusBreakdown.todo} />
            <BreakdownPill
              label="In progress"
              count={project.statusBreakdown.inProgress}
            />
            <BreakdownPill label="Done" count={project.statusBreakdown.done} />
          </div>
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint">
            Issues
          </h2>
          {projectIssues.length === 0 ? (
            <p className="text-[13px] text-fg-faint">
              No issues yet. Add the first one from a status group.
            </p>
          ) : null}
          <IssueList
            issues={projectIssues}
            selectedId={null}
            onSelect={(id) =>
              void navigate({
                to: "/issues/$issueId",
                params: { issueId: id },
              })
            }
            onMoveToStatus={handleMoveToStatus}
            onCreateInGroup={handleCreateInGroup}
            displayOptions={defaultDisplayOptions}
          />
        </section>
      </article>
    </main>
  );
}

function InlineStatusSelect({
  status,
  progress,
  onChange,
}: {
  status: string;
  progress: number;
  onChange: (next: string) => void;
}) {
  return (
    <label className="relative inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-[5px] px-1 capitalize transition-colors hover:bg-surface/60 hover:text-fg">
      <ProjectStatusIcon status={status} progress={progress} size="sm" />
      <span>{projectStatusLabel[status] ?? status}</span>
      <select
        aria-label="Status"
        value={status}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {projectStatusOptions.map((option) => (
          <option key={option} value={option}>
            {projectStatusLabel[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function BreakdownPill({ label, count }: { label: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      <span className="tabular-nums text-fg-faint">{count}</span>
    </span>
  );
}

function Sep() {
  return <span className="select-none px-0.5 text-fg-faint/60">·</span>;
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center px-2.5 text-left text-[12.5px] transition-colors hover:bg-surface-2",
        danger ? "text-danger" : "text-fg",
      )}
    >
      {children}
    </button>
  );
}
