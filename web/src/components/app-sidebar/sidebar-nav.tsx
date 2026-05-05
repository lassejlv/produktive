import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { InboxIcon, IssuesIcon, ProjectsIcon } from "@/components/chat/icons";
import { ISSUE_DRAG_MIME } from "@/components/issue/issue-list";
import { ProjectIcon } from "@/components/project/project-icon";
import type { SidebarLayoutItem } from "@/lib/api";
import { updateIssue } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  type SidebarItemId,
  defaultSidebarItems,
  useSidebarLayout,
} from "@/lib/use-sidebar-layout";
import { useProjects } from "@/lib/use-projects";

function MyIssuesIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="5" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M3 12c.5-2 2-3 4-3s3.5 1 4 3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SidebarRecentProjects({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  const { projects } = useProjects(false);
  const recent = projects
    .filter((p) => p.archivedAt === null && p.status !== "cancelled")
    .slice(0, 5);

  if (recent.length === 0) return null;

  return (
    <div className="ml-3 mt-0.5 flex flex-col gap-px border-l border-border-subtle/60 pl-2">
      {recent.map((project) => {
        const isActive =
          pathname === `/projects/${project.id}` ||
          pathname.startsWith(`/projects/${project.id}`);
        return (
          <button
            key={project.id}
            type="button"
            title={project.name}
            onClick={() =>
              void navigate({
                to: "/projects/$projectId",
                params: { projectId: project.id },
              })
            }
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(ISSUE_DRAG_MIME)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              event.currentTarget.classList.add(
                "ring-2",
                "ring-accent",
                "bg-accent/15",
              );
            }}
            onDragLeave={(event) => {
              event.currentTarget.classList.remove(
                "ring-2",
                "ring-accent",
                "bg-accent/15",
              );
            }}
            onDrop={(event) => {
              event.currentTarget.classList.remove(
                "ring-2",
                "ring-accent",
                "bg-accent/15",
              );
              const issueId = event.dataTransfer.getData(ISSUE_DRAG_MIME);
              if (!issueId) return;
              event.preventDefault();
              void (async () => {
                try {
                  await updateIssue(issueId, { projectId: project.id });
                  toast.success(`Added to ${project.name}`);
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Failed to add to project",
                  );
                }
              })();
            }}
            className={cn(
              "flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[12.5px] transition-colors",
              isActive
                ? "bg-surface text-fg"
                : "text-fg-muted hover:bg-surface hover:text-fg",
            )}
          >
            <ProjectIcon
              color={project.color}
              icon={project.icon}
              name={project.name}
              size="sm"
            />
            <span className="min-w-0 flex-1 truncate">{project.name}</span>
            {project.issueCount > 0 ? (
              <span className="shrink-0 text-[10px] tabular-nums text-fg-faint">
                {project.doneCount}/{project.issueCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function OverviewIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect
        x="2"
        y="2"
        width="4"
        height="4"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect
        x="8"
        y="2"
        width="4"
        height="4"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect
        x="2"
        y="8"
        width="4"
        height="4"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect
        x="8"
        y="8"
        width="4"
        height="4"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function SidebarLabelsIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M7.5 1.5h4a1 1 0 011 1v4l-6 6a1 1 0 01-1.4 0L1.5 8.4a1 1 0 010-1.4l6-6z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="4.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

function SidebarNotesIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3 1.5h5.4L11.5 4.6V12a1 1 0 01-1 1H3a1 1 0 01-1-1V2.5a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M8.4 1.7v3h2.9M4.4 7h5M4.4 9.5h4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

type NavContext = {
  pathname: string;
  issuesMine: boolean;
};

type NavItemSpec = {
  id: SidebarItemId;
  label: string;
  icon: ReactNode;
  isActive: (ctx: NavContext) => boolean;
  onNavigate: (navigate: ReturnType<typeof useNavigate>) => void;
};

const NAV_ITEM_SPECS: Record<SidebarItemId, NavItemSpec> = {
  inbox: {
    id: "inbox",
    label: "Inbox",
    icon: <InboxIcon />,
    isActive: (ctx) => ctx.pathname === "/inbox",
    onNavigate: (n) => void n({ to: "/inbox" }),
  },
  "my-issues": {
    id: "my-issues",
    label: "My issues",
    icon: <MyIssuesIcon />,
    isActive: (ctx) => ctx.pathname === "/issues" && ctx.issuesMine,
    onNavigate: (n) => void n({ to: "/issues", search: { mine: true } }),
  },
  overview: {
    id: "overview",
    label: "Overview",
    icon: <OverviewIcon />,
    isActive: (ctx) => ctx.pathname === "/workspace",
    onNavigate: (n) => void n({ to: "/workspace" }),
  },
  issues: {
    id: "issues",
    label: "Issues",
    icon: <IssuesIcon />,
    isActive: (ctx) =>
      (ctx.pathname === "/issues" && !ctx.issuesMine) ||
      (ctx.pathname.startsWith("/issues/") &&
        ctx.pathname.length > "/issues/".length),
    onNavigate: (n) => void n({ to: "/issues" }),
  },
  notes: {
    id: "notes",
    label: "Notes (preview)",
    icon: <SidebarNotesIcon />,
    isActive: (ctx) =>
      ctx.pathname === "/notes" || ctx.pathname.startsWith("/notes/"),
    onNavigate: (n) => void n({ to: "/notes" }),
  },
  projects: {
    id: "projects",
    label: "Projects",
    icon: <ProjectsIcon />,
    isActive: (ctx) =>
      ctx.pathname === "/projects" || ctx.pathname.startsWith("/projects/"),
    onNavigate: (n) => void n({ to: "/projects" }),
  },
  labels: {
    id: "labels",
    label: "Labels",
    icon: <SidebarLabelsIcon />,
    isActive: (ctx) => ctx.pathname === "/labels",
    onNavigate: (n) => void n({ to: "/labels" }),
  },
};

const NAV_DRAG_MIME = "application/x-produktive-sidebar-item";

function sidebarItemsEqual(a: SidebarLayoutItem[], b: SidebarLayoutItem[]) {
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const other = b[index];
    return (
      Boolean(other) && item.id === other.id && item.hidden === other.hidden
    );
  });
}

function DragHandleIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <circle cx="4" cy="3" r="0.9" fill="currentColor" />
      <circle cx="8" cy="3" r="0.9" fill="currentColor" />
      <circle cx="4" cy="6" r="0.9" fill="currentColor" />
      <circle cx="8" cy="6" r="0.9" fill="currentColor" />
      <circle cx="4" cy="9" r="0.9" fill="currentColor" />
      <circle cx="8" cy="9" r="0.9" fill="currentColor" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="7" r="1.6" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M1 7s2-4 6-4c1 0 1.9.2 2.7.6M13 7s-2 4-6 4c-1 0-1.9-.2-2.7-.6M2 12L12 2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SidebarNavRow({
  spec,
  isEditing,
  hidden,
  active,
  isDragging,
  trailing,
  onClick,
  onToggleHidden,
  onDragStart,
  onDragEnd,
  onDropOnto,
}: {
  spec: NavItemSpec;
  isEditing: boolean;
  hidden: boolean;
  active: boolean;
  isDragging: boolean;
  trailing?: ReactNode;
  onClick: () => void;
  onToggleHidden: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOnto: (sourceId: string) => void;
}) {
  const [dropping, setDropping] = useState(false);

  if (isEditing) {
    return (
      <div
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(NAV_DRAG_MIME, spec.id);
          event.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onDragEnd={() => {
          setDropping(false);
          onDragEnd();
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(NAV_DRAG_MIME)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (!dropping) setDropping(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null))
            return;
          setDropping(false);
        }}
        onDrop={(event) => {
          const sourceId = event.dataTransfer.getData(NAV_DRAG_MIME);
          setDropping(false);
          if (!sourceId) return;
          event.preventDefault();
          onDropOnto(sourceId);
        }}
        className={cn(
          "group flex h-8 w-full select-none items-center gap-1.5 rounded-[7px] border border-transparent pl-1 pr-1.5 text-[13px] transition-colors",
          dropping
            ? "border-accent/40 bg-accent/10"
            : "border-border-subtle/60 bg-surface/30",
          isDragging && "opacity-60",
          hidden && !dropping && "text-fg-faint",
        )}
      >
        <span
          aria-hidden
          className="cursor-grab text-fg-faint hover:text-fg active:cursor-grabbing"
          title="Drag to reorder"
        >
          <DragHandleIcon />
        </span>
        <span
          className={cn("shrink-0", hidden ? "text-fg-faint" : "text-fg-muted")}
        >
          {spec.icon}
        </span>
        <span className="flex-1 truncate">{spec.label}</span>
        <button
          type="button"
          onClick={onToggleHidden}
          aria-label={hidden ? `Show ${spec.label}` : `Hide ${spec.label}`}
          title={hidden ? "Show" : "Hide"}
          className="grid size-5 place-items-center rounded-[4px] text-fg-faint transition-colors hover:bg-surface hover:text-fg"
        >
          {hidden ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[13px] transition-colors [&_svg]:text-fg-faint",
        active
          ? "bg-surface-2 text-fg [&_svg]:text-fg"
          : "text-fg-muted hover:bg-surface hover:text-fg",
      )}
    >
      {spec.icon}
      <span className="flex-1 truncate">{spec.label}</span>
      {trailing}
    </button>
  );
}

export function SidebarNav({
  pathname,
  issuesMine,
  inboxUnread,
  isEditing,
  onExitEditing,
}: {
  pathname: string;
  issuesMine: boolean;
  inboxUnread: number;
  isEditing: boolean;
  onExitEditing: () => void;
}) {
  const navigate = useNavigate();
  const navCtx: NavContext = { pathname, issuesMine };
  const { layout, saveItems, isSaving } = useSidebarLayout();
  const savedItems = layout.items;
  const [draft, setDraft] = useState<SidebarLayoutItem[]>(savedItems);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraft((current) =>
        sidebarItemsEqual(current, savedItems) ? current : savedItems,
      );
    }
  }, [isEditing, savedItems]);

  const items = isEditing ? draft : savedItems;

  const moveBefore = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setDraft((current) => {
      const next = current.filter((item) => item.id !== sourceId);
      const sourceItem = current.find((item) => item.id === sourceId);
      if (!sourceItem) return current;
      const targetIdx = next.findIndex((item) => item.id === targetId);
      if (targetIdx < 0) return current;
      next.splice(targetIdx, 0, sourceItem);
      return next;
    });
  };

  const toggleHidden = (id: string) => {
    setDraft((current) =>
      current.map((item) =>
        item.id === id ? { ...item, hidden: !item.hidden } : item,
      ),
    );
  };

  const onDone = () => {
    saveItems(draft);
    onExitEditing();
  };

  const onCancel = () => {
    setDraft(savedItems);
    onExitEditing();
  };

  const onReset = () => {
    setDraft(defaultSidebarItems);
  };

  return (
    <div className="flex flex-col gap-px">
      {items.map((entry) => {
        const spec = NAV_ITEM_SPECS[entry.id as SidebarItemId];
        if (!spec) return null;
        const hidden = entry.hidden === true;
        if (!isEditing && hidden) return null;
        const active = spec.isActive(navCtx);
        const showRecent = !isEditing && spec.id === "projects" && !hidden;
        return (
          <div key={entry.id}>
            <SidebarNavRow
              spec={spec}
              isEditing={isEditing}
              hidden={hidden}
              active={active}
              isDragging={dragId === entry.id}
              onClick={() => spec.onNavigate(navigate)}
              onToggleHidden={() => toggleHidden(entry.id)}
              onDragStart={() => setDragId(entry.id)}
              onDragEnd={() => setDragId(null)}
              onDropOnto={(sourceId) => moveBefore(sourceId, entry.id)}
              trailing={
                spec.id === "inbox" && inboxUnread > 0 ? (
                  <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium text-white">
                    {inboxUnread > 99 ? "99+" : inboxUnread}
                  </span>
                ) : null
              }
            />
            {showRecent ? <SidebarRecentProjects pathname={pathname} /> : null}
          </div>
        );
      })}
      {isEditing ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-[8px] border border-border-subtle bg-surface/40 px-2.5 py-2 text-[11.5px]">
          <button
            type="button"
            onClick={onReset}
            className="text-fg-muted transition-colors hover:text-fg"
          >
            Reset
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-2 py-0.5 text-fg-muted transition-colors hover:bg-surface hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onDone}
              disabled={isSaving}
              className="rounded-md bg-fg px-2 py-0.5 font-medium text-bg transition-colors hover:bg-white disabled:opacity-60"
            >
              {isSaving ? "Saving…" : "Done"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
