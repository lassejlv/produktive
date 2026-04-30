import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  HashIcon,
  InboxIcon,
  IssuesIcon,
  ProjectsIcon,
  SettingsIcon,
  SparkleIcon,
} from "@/components/chat/icons";
import { ProjectIcon } from "@/components/project/project-icon";
import { useProjectsQuery } from "@/lib/queries/projects";
import { findStaticPage, type StaticPageGlyph } from "@/lib/tab-pages";
import { useTabs } from "@/lib/use-tabs";
import { type WorkspaceTab } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  enabled: boolean;
};

const POSITION_STORAGE_KEY = "produktive:tabbar-position";
const VIEWPORT_MARGIN = 8;

type Position = { x: number; y: number };

export function TabBar({ enabled }: Props) {
  const { tabs, close } = useTabs();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [position, setPosition] = useState<Position | null>(() =>
    readStoredPosition(),
  );
  const [dragging, setDragging] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<Position>({ x: 0, y: 0 });

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => {
      const node = barRef.current;
      if (!node) return;
      const width = node.offsetWidth;
      const height = node.offsetHeight;
      const rawX = event.clientX - dragOffsetRef.current.x;
      const rawY = event.clientY - dragOffsetRef.current.y;
      const x = clamp(rawX, VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
      const y = clamp(rawY, VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);
      setPosition({ x, y });
    };
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging]);

  useEffect(() => {
    if (dragging) return;
    if (!position) return;
    window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
  }, [dragging, position]);

  useEffect(() => {
    if (!position) return;
    const onResize = () => {
      const node = barRef.current;
      if (!node) return;
      const width = node.offsetWidth;
      const height = node.offsetHeight;
      setPosition((current) => {
        if (!current) return current;
        return {
          x: clamp(current.x, VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
          y: clamp(current.y, VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN),
        };
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [position]);

  if (!enabled) return null;
  if (tabs.length === 0) return null;

  const activeId = activeTargetFor(pathname);

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const node = barRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    if (!position) {
      setPosition({ x: rect.left, y: rect.top });
    }
    setDragging(true);
    event.preventDefault();
  };

  const resetPosition = () => {
    setPosition(null);
    window.localStorage.removeItem(POSITION_STORAGE_KEY);
  };

  const wrapperStyle: React.CSSProperties = position
    ? {
        position: "fixed",
        left: position.x,
        top: position.y,
        right: "auto",
        bottom: "auto",
      }
    : {};

  return (
    <div
      className={cn(
        "pointer-events-none z-30",
        position
          ? ""
          : "fixed inset-x-0 bottom-0 flex justify-center px-3 pb-3",
      )}
      style={wrapperStyle}
    >
      <div
        ref={barRef}
        className={cn(
          "pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-[10px] border border-border-subtle bg-surface/95 p-1 shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur",
          dragging && "select-none",
        )}
      >
        <button
          type="button"
          onPointerDown={startDrag}
          onDoubleClick={resetPosition}
          aria-label="Drag tab bar (double-click to reset)"
          title="Drag to move · double-click to reset"
          className={cn(
            "grid h-7 w-4 shrink-0 place-items-center text-fg-faint transition-colors hover:text-fg",
            dragging ? "cursor-grabbing" : "cursor-grab",
          )}
        >
          <GripIcon />
        </button>
        {tabs.map((tab) => (
          <TabPill
            key={tab.id}
            tab={tab}
            active={tab.targetId === activeId.targetId && tab.tabType === activeId.tabType}
            onSelect={() => {
              if (tab.tabType === "issue") {
                void navigate({
                  to: "/issues/$issueId",
                  params: { issueId: tab.targetId },
                });
              } else if (tab.tabType === "project") {
                void navigate({
                  to: "/projects/$projectId",
                  params: { projectId: tab.targetId },
                });
              } else if (tab.tabType === "chat") {
                void navigate({
                  to: "/chat/$chatId",
                  params: { chatId: tab.targetId },
                });
              } else if (tab.tabType === "page") {
                void navigateToPage(navigate, tab.targetId);
              }
            }}
            onClose={() => close(tab.id)}
          />
        ))}
      </div>
    </div>
  );
}

function TabPill({
  tab,
  active,
  onSelect,
  onClose,
}: {
  tab: WorkspaceTab;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        "group flex h-7 max-w-[200px] items-center gap-1.5 rounded-[7px] px-2 text-[12px] transition-colors",
        active
          ? "bg-bg text-fg ring-1 ring-border"
          : "text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 items-center gap-1.5 text-left"
      >
        <TabGlyph tab={tab} />
        <span className="min-w-0 truncate">{tab.title}</span>
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label={`Close ${tab.title}`}
        tabIndex={hover || active ? 0 : -1}
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-[4px] text-fg-faint transition-opacity hover:bg-surface-3 hover:text-fg",
          hover || active
            ? "opacity-100"
            : "pointer-events-none opacity-0",
        )}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

function TabGlyph({ tab }: { tab: WorkspaceTab }) {
  if (tab.tabType === "project") return <ProjectGlyph targetId={tab.targetId} title={tab.title} />;
  if (tab.tabType === "chat") return <SparkleIcon size={11} />;
  if (tab.tabType === "page") {
    const page = findStaticPage(tab.targetId);
    return <PageGlyph glyph={page?.glyph ?? null} />;
  }
  return <IssueDot />;
}

function PageGlyph({ glyph }: { glyph: StaticPageGlyph | null }) {
  switch (glyph) {
    case "issues":
      return <IssuesIcon size={11} />;
    case "projects":
      return <ProjectsIcon size={11} />;
    case "inbox":
      return <InboxIcon size={11} />;
    case "labels":
      return <HashIcon size={11} />;
    case "settings":
      return <SettingsIcon size={11} />;
    case "account":
      return <PersonGlyph />;
    case "overview":
      return <GridGlyph />;
    default:
      return <IssueDot />;
  }
}

function PersonGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
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

function GridGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="2" y="2" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="8" y="2" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2" y="8" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="8" y="8" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function navigateToPage(
  navigate: ReturnType<typeof useNavigate>,
  path: string,
): Promise<void> {
  switch (path) {
    case "/workspace":
      return navigate({ to: "/workspace" });
    case "/issues":
      return navigate({ to: "/issues" });
    case "/projects":
      return navigate({ to: "/projects" });
    case "/inbox":
      return navigate({ to: "/inbox" });
    case "/labels":
      return navigate({ to: "/labels" });
    case "/account":
      return navigate({ to: "/account" });
    case "/workspace/settings":
      return navigate({ to: "/workspace/settings" });
    default:
      return Promise.resolve();
  }
}

function ProjectGlyph({ targetId, title }: { targetId: string; title: string }) {
  const { data } = useProjectsQuery();
  const project = (data ?? []).find((p) => p.id === targetId);
  if (!project) {
    return (
      <ProjectIcon color="blue" icon={null} name={title} size="sm" />
    );
  }
  return (
    <ProjectIcon
      color={project.color}
      icon={project.icon}
      name={project.name}
      size="sm"
    />
  );
}

function IssueDot() {
  return (
    <span
      aria-hidden
      className="size-1.5 shrink-0 rounded-full bg-fg-faint"
    />
  );
}

function CloseIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M3 3l6 6M9 3l-6 6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg width="6" height="12" viewBox="0 0 6 12" fill="currentColor" aria-hidden>
      <circle cx="1.5" cy="2" r="0.9" />
      <circle cx="4.5" cy="2" r="0.9" />
      <circle cx="1.5" cy="6" r="0.9" />
      <circle cx="4.5" cy="6" r="0.9" />
      <circle cx="1.5" cy="10" r="0.9" />
      <circle cx="4.5" cy="10" r="0.9" />
    </svg>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function readStoredPosition(): Position | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Position;
    if (
      typeof parsed?.x === "number" &&
      typeof parsed?.y === "number" &&
      Number.isFinite(parsed.x) &&
      Number.isFinite(parsed.y)
    ) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function activeTargetFor(pathname: string): {
  tabType: WorkspaceTab["tabType"] | null;
  targetId: string | null;
} {
  if (pathname.startsWith("/issues/")) {
    return { tabType: "issue", targetId: decodeURIComponent(pathname.slice("/issues/".length)) };
  }
  if (pathname.startsWith("/projects/")) {
    return { tabType: "project", targetId: decodeURIComponent(pathname.slice("/projects/".length)) };
  }
  if (pathname.startsWith("/chat/")) {
    return { tabType: "chat", targetId: decodeURIComponent(pathname.slice("/chat/".length)) };
  }
  const page = findStaticPage(pathname);
  if (page) {
    return { tabType: "page", targetId: page.path };
  }
  return { tabType: null, targetId: null };
}

