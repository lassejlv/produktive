import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
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

export function TabBar({ enabled }: Props) {
  const { tabs, close } = useTabs();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  if (!enabled) return null;
  if (tabs.length === 0) return null;

  const activeId = activeTargetFor(pathname);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3">
      <div className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-[10px] border border-border-subtle bg-surface/95 p-1 shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur">
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
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-[4px] text-fg-faint transition-opacity hover:bg-surface-3 hover:text-fg",
          hover || active ? "opacity-100" : "opacity-0",
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

