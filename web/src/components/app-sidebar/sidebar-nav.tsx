import { useNavigate } from "@tanstack/react-router";
import {
  type ForwardRefExoticComponent,
  type HTMLAttributes,
  type ReactNode,
  type RefAttributes,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { ISSUE_DRAG_MIME } from "@/components/issue/issue-list";
import { ProjectIcon } from "@/components/project/project-icon";
import { useWorkspaceSlug } from "@/lib/use-workspace-slug";
import { BookmarkIcon } from "@/components/ui/bookmark";
import { CircleCheckIcon } from "@/components/ui/circle-check";
import { FileTextIcon } from "@/components/ui/file-text";
import { FolderKanbanIcon } from "@/components/ui/folder-kanban";
import { LayoutGridIcon } from "@/components/ui/layout-grid";
import { MailboxIcon } from "@/components/ui/mailbox";
import { SparklesIcon } from "@/components/ui/sparkles";
import { Spinner } from "@/components/ui/spinner";
import { UserIcon } from "@/components/ui/user";
import type { SidebarLayoutItem } from "@/lib/api";
import { updateIssue } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  type SidebarItemId,
  defaultSidebarItems,
  useSidebarLayout,
} from "@/lib/use-sidebar-layout";
import { useProjects } from "@/lib/use-projects";

function SidebarRecentProjects({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  const workspaceSlug = useWorkspaceSlug();
  const { projects } = useProjects(false);
  const recent = projects
    .filter((p) => p.archivedAt === null && p.status !== "cancelled")
    .slice(0, 5);

  if (recent.length === 0) return null;

  return (
    <div className="ml-3 mt-0.5 flex flex-col gap-px border-l border-border-subtle/60 pl-2">
      {recent.map((project) => {
        const projectPath = `/${workspaceSlug}/projects/${project.id}`;
        const isActive = pathname === projectPath || pathname.startsWith(projectPath);
        return (
          <button
            key={project.id}
            type="button"
            title={project.name}
            onClick={() =>
              void navigate({
                to: "/$workspaceSlug/projects/$projectId",
                params: { workspaceSlug, projectId: project.id },
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


type NavContext = {
  pathname: string;
  issuesMine: boolean;
  workspaceSlug: string;
};

export type AnimatedIconHandle = {
  startAnimation: () => void;
  stopAnimation: () => void;
};

type AnimatedIconProps = HTMLAttributes<HTMLDivElement> & { size?: number };

type AnimatedIconComponent = ForwardRefExoticComponent<
  AnimatedIconProps & RefAttributes<AnimatedIconHandle>
>;

type NavItemSpec = {
  id: SidebarItemId;
  label: string;
  Icon: AnimatedIconComponent;
  isActive: (ctx: NavContext) => boolean;
  onNavigate: (navigate: ReturnType<typeof useNavigate>, ctx: NavContext) => void;
};

function workspaceSubpath(pathname: string, workspaceSlug: string): string {
  const prefix = `/${workspaceSlug}`;
  if (!workspaceSlug) return pathname;
  if (pathname === prefix) return "/";
  if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length) || "/";
  return pathname;
}

const NAV_ITEM_SPECS: Record<SidebarItemId, NavItemSpec> = {
  inbox: {
    id: "inbox",
    label: "Inbox",
    Icon: MailboxIcon as AnimatedIconComponent,
    isActive: (ctx) => workspaceSubpath(ctx.pathname, ctx.workspaceSlug) === "/inbox",
    onNavigate: (n, ctx) =>
      void n({ to: "/$workspaceSlug/inbox", params: { workspaceSlug: ctx.workspaceSlug } }),
  },
  "my-issues": {
    id: "my-issues",
    label: "My issues",
    Icon: UserIcon as AnimatedIconComponent,
    isActive: (ctx) =>
      workspaceSubpath(ctx.pathname, ctx.workspaceSlug) === "/issues" && ctx.issuesMine,
    onNavigate: (n, ctx) =>
      void n({
        to: "/$workspaceSlug/issues",
        params: { workspaceSlug: ctx.workspaceSlug },
        search: { mine: true },
      }),
  },
  overview: {
    id: "overview",
    label: "Overview",
    Icon: LayoutGridIcon as AnimatedIconComponent,
    isActive: (ctx) => workspaceSubpath(ctx.pathname, ctx.workspaceSlug) === "/",
    onNavigate: (n, ctx) =>
      void n({ to: "/$workspaceSlug", params: { workspaceSlug: ctx.workspaceSlug } }),
  },
  issues: {
    id: "issues",
    label: "Issues",
    Icon: CircleCheckIcon as AnimatedIconComponent,
    isActive: (ctx) => {
      const sub = workspaceSubpath(ctx.pathname, ctx.workspaceSlug);
      return (sub === "/issues" && !ctx.issuesMine) || sub.startsWith("/issues/");
    },
    onNavigate: (n, ctx) =>
      void n({ to: "/$workspaceSlug/issues", params: { workspaceSlug: ctx.workspaceSlug } }),
  },
  notes: {
    id: "notes",
    label: "Notes (preview)",
    Icon: FileTextIcon as AnimatedIconComponent,
    isActive: (ctx) => {
      const sub = workspaceSubpath(ctx.pathname, ctx.workspaceSlug);
      return sub === "/notes" || sub.startsWith("/notes/");
    },
    onNavigate: (n, ctx) =>
      void n({ to: "/$workspaceSlug/notes", params: { workspaceSlug: ctx.workspaceSlug } }),
  },
  projects: {
    id: "projects",
    label: "Projects",
    Icon: FolderKanbanIcon as AnimatedIconComponent,
    isActive: (ctx) => {
      const sub = workspaceSubpath(ctx.pathname, ctx.workspaceSlug);
      return sub === "/projects" || sub.startsWith("/projects/");
    },
    onNavigate: (n, ctx) =>
      void n({ to: "/$workspaceSlug/projects", params: { workspaceSlug: ctx.workspaceSlug } }),
  },
  labels: {
    id: "labels",
    label: "Labels",
    Icon: BookmarkIcon as AnimatedIconComponent,
    isActive: (ctx) => workspaceSubpath(ctx.pathname, ctx.workspaceSlug) === "/labels",
    onNavigate: (n, ctx) =>
      void n({ to: "/$workspaceSlug/labels", params: { workspaceSlug: ctx.workspaceSlug } }),
  },
  chats: {
    id: "chats",
    label: "Chats",
    Icon: SparklesIcon as AnimatedIconComponent,
    isActive: (ctx) => {
      const sub = workspaceSubpath(ctx.pathname, ctx.workspaceSlug);
      return sub === "/chats" || sub === "/chat" || sub.startsWith("/chat/");
    },
    onNavigate: (n, ctx) =>
      void n({ to: "/$workspaceSlug/chats", params: { workspaceSlug: ctx.workspaceSlug } }),
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
  const iconRef = useRef<AnimatedIconHandle | null>(null);
  const Icon = spec.Icon;

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
          <Icon size={15} />
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
      onMouseEnter={() => iconRef.current?.startAnimation()}
      onMouseLeave={() => iconRef.current?.stopAnimation()}
      onFocus={() => iconRef.current?.startAnimation()}
      onBlur={() => iconRef.current?.stopAnimation()}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[13px] transition-colors [&_svg]:text-fg-faint",
        active
          ? "bg-surface-2 text-fg [&_svg]:text-fg"
          : "text-fg-muted hover:bg-surface hover:text-fg",
      )}
    >
      <Icon ref={iconRef} size={15} />
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
  const workspaceSlug = useWorkspaceSlug();
  const navCtx: NavContext = { pathname, issuesMine, workspaceSlug };
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
              onClick={() => spec.onNavigate(navigate, navCtx)}
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
              {isSaving ? <Spinner size={11} /> : "Done"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
