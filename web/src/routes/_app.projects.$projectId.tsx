import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/issue/avatar";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { EditableDescription } from "@/components/issue/editable-description";
import { EditableTitle } from "@/components/issue/editable-title";
import { IssueList } from "@/components/issue/issue-list";
import { MemberPicker } from "@/components/issue/member-picker";
import { ProjectIcon } from "@/components/project/project-icon";
import { ProjectStatusIcon } from "@/components/project/project-status-icon";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { AiBriefPanel } from "@/components/workspace/ai-brief-panel";
import { generateProjectHealth, type AiBrief, type UpdateProjectInput } from "@/lib/api";
import { sortedStatuses, statusName } from "@/lib/issue-constants";
import { defaultDisplayOptions } from "@/lib/issue-display";
import { projectColorHex, projectStatusLabel, projectStatusOptions } from "@/lib/project-constants";
import { useCreateIssue, useUpdateIssue } from "@/lib/mutations/issues";
import { useDeleteProject, useUpdateProject } from "@/lib/mutations/projects";
import { useProjectDetailQuery } from "@/lib/queries/projects";
import { useIssues } from "@/lib/use-issues";
import { useIssueStatuses } from "@/lib/use-issue-statuses";
import { useRegisterTab } from "@/lib/use-tabs";
import { useUserPreferences } from "@/lib/use-user-preferences";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/projects/$projectId")({
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const projectQuery = useProjectDetailQuery(projectId);
  const project = projectQuery.data ?? null;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { issues } = useIssues();
  const { statuses } = useIssueStatuses();
  const updateProjectMutation = useUpdateProject();
  const deleteProjectMutation = useDeleteProject();
  const createIssueMutation = useCreateIssue();
  const updateIssueMutation = useUpdateIssue();
  const { confirm, dialog } = useConfirmDialog();
  const [health, setHealth] = useState<AiBrief | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const projectIssues = useMemo(
    () => issues.filter((issue) => issue.projectId === projectId),
    [issues, projectId],
  );
  const statusBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const issue of projectIssues) {
      counts.set(issue.status, (counts.get(issue.status) ?? 0) + 1);
    }
    return sortedStatuses(statuses).map((status) => ({
      key: status.key,
      name: status.name,
      count: counts.get(status.key) ?? 0,
    }));
  }, [projectIssues, statuses]);

  const { tabsEnabled } = useUserPreferences();
  useRegisterTab({
    tabType: "project",
    targetId: projectId,
    title: project?.name,
    enabled: tabsEnabled,
  });

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const updateField = async (patch: UpdateProjectInput) => {
    if (!project) return;
    try {
      await updateProjectMutation.mutateAsync({ id: projectId, patch });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update");
    }
  };

  const handleStatus = (next: string) => void updateField({ status: next });
  const handleLead = (leadId: string | null) => void updateField({ leadId });

  const handleArchiveToggle = async () => {
    if (!project) return;
    const next = project.archivedAt === null;
    await updateField({ archived: next });
    toast.success(next ? "Project archived" : "Project restored");
  };

  const handleDelete = () => {
    if (!project) return;
    confirm({
      title: `Delete project "${project.name}"?`,
      description:
        "Issues in this project won't be deleted, but they'll lose the project assignment.",
      confirmLabel: "Delete project",
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteProjectMutation.mutateAsync(projectId);
          toast.success("Project deleted");
          await navigate({ to: "/projects" });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to delete");
        }
      },
    });
  };

  const handleCreateInGroup = async (status: string, title: string) => {
    try {
      await createIssueMutation.mutateAsync({ title, status, projectId });
      void projectQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create issue");
    }
  };

  const handleMoveToStatus = async (movingId: string, nextStatus: string) => {
    const previous = issues.find((issue) => issue.id === movingId)?.status;
    if (!previous || previous === nextStatus) return;
    try {
      await updateIssueMutation.mutateAsync({
        id: movingId,
        patch: { status: nextStatus },
      });
      toast.success(`Moved to ${statusName(statuses, nextStatus)}`);
      void projectQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to move issue");
    }
  };

  const handleGenerateHealth = async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const result = await generateProjectHealth(projectId);
      setHealth(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate project health";
      setHealthError(message);
      toast.error(message);
    } finally {
      setHealthLoading(false);
    }
  };

  if (projectQuery.isPending || !project) {
    return (
      <main className="flex min-h-full items-center justify-center bg-bg text-fg-faint">
        <Spinner size={16} />
      </main>
    );
  }

  const progress = project.issueCount === 0 ? 0 : project.doneCount / project.issueCount;
  const isArchived = project.archivedAt !== null;
  const accentColor = projectColorHex[project.color] ?? "#5b8cff";

  return (
    <main className="min-h-full bg-bg">
      {dialog}
      <header className="sticky top-0 z-10 flex h-11 items-center justify-between gap-3 border-b border-border-subtle bg-bg/85 px-4 backdrop-blur">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
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
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className={cn(
              "grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface/60 hover:text-fg",
              menuOpen && "bg-surface text-fg",
            )}
          >
            <DotsGlyph />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-[10px] border border-border-subtle/80 bg-bg/85 backdrop-blur-2xl widget-panel-shadow animate-modal-pop"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-fg-muted/40 to-transparent"
              />
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  void handleArchiveToggle();
                }}
              >
                {project.archivedAt === null ? "Archive" : "Restore"}
              </MenuItem>
              <div className="relative h-px">
                <div
                  aria-hidden
                  className="absolute inset-x-3 h-px bg-gradient-to-r from-border-subtle via-border-subtle/60 to-transparent"
                />
              </div>
              <MenuItem
                danger
                onClick={() => {
                  setMenuOpen(false);
                  handleDelete();
                }}
              >
                Delete
              </MenuItem>
            </div>
          ) : null}
        </div>
      </header>

      <article className="mx-auto w-full max-w-2xl animate-fade-up px-4 pb-20 pt-12">
        <div className="flex items-center gap-3">
          <ProjectIcon color={project.color} icon={project.icon} name={project.name} size="lg" />
          {isArchived ? (
            <span className="rounded-[5px] border border-border-subtle px-1.5 py-px text-[10px] text-fg-faint">
              Archived
            </span>
          ) : null}
        </div>
        <div className="mt-3">
          <EditableTitle
            value={project.name}
            onSave={async (next) => {
              await updateField({ name: next });
            }}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-fg-muted">
          <InlineStatusSelect status={project.status} progress={progress} onChange={handleStatus} />
          <Sep />
          <MemberPicker
            selectedId={project.leadId}
            onSelect={handleLead}
            trigger={({ onClick }) => (
              <button
                type="button"
                onClick={onClick}
                className="inline-flex h-6 items-center gap-1.5 rounded-md px-1 transition-colors hover:bg-surface/60 hover:text-fg"
              >
                {project.lead ? (
                  <>
                    <Avatar name={project.lead.name} image={project.lead.image} />
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
              <span className="tabular-nums">
                {new Date(project.targetDate).toLocaleDateString("en", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </>
          ) : null}
        </div>

        <div className="mt-8">
          <EditableDescription
            value={project.description}
            onSave={async (next) => {
              await updateField({ description: next });
            }}
          />
        </div>

        <section className="mt-12">
          <div className="hairline-top mb-3" />
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-xs font-medium text-fg-muted">Progress</h2>
            <span className="text-[11px] tabular-nums text-fg-faint">
              {Math.round(progress * 100)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full transition-all"
              style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: accentColor }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
            {statusBreakdown.map((item) => (
              <BreakdownPill key={item.key} label={item.name} count={item.count} />
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="hairline-top mb-3" />
          <h2 className="mb-3 text-xs font-medium text-fg-muted">Health</h2>
          <AiBriefPanel
            title="Health"
            actionLabel="Generate summary"
            refreshLabel="Refresh"
            brief={health}
            loading={healthLoading}
            error={healthError}
            onGenerate={() => void handleGenerateHealth()}
            emptyDescription="AI summary from this project's issues and recent activity."
          />
        </section>

        <section className="mt-12">
          <div className="hairline-top mb-3" />
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-xs font-medium text-fg-muted">Issues</h2>
            <Link
              to="/issues"
              className="text-[11px] text-fg-faint transition-colors hover:text-fg-muted"
            >
              All issues →
            </Link>
          </div>
          {projectIssues.length === 0 ? (
            <p className="text-sm text-fg-faint">No issues yet. Add one from a status group.</p>
          ) : null}
          <IssueList
            issues={projectIssues}
            statuses={statuses}
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
    <Select value={status} onValueChange={onChange}>
      <SelectTrigger
        aria-label="Status"
        className="h-6 w-auto justify-start gap-1 rounded-md border-0 bg-transparent px-1 capitalize hover:bg-surface/60 hover:text-fg [&>svg]:hidden"
      >
        <ProjectStatusIcon status={status} progress={progress} size="sm" />
        <span>{projectStatusLabel[status] ?? status}</span>
      </SelectTrigger>
      <SelectContent align="start">
        {projectStatusOptions.map((option) => (
          <SelectItem key={option} value={option}>
            {projectStatusLabel[option] ?? option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
  return <span className="select-none px-0.5 text-fg-faint/50">·</span>;
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
        "flex h-9 w-full items-center px-3 text-left text-[13px] transition-colors hover:bg-surface/60",
        danger ? "text-danger" : "text-fg",
      )}
    >
      {children}
    </button>
  );
}

function DotsGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}
