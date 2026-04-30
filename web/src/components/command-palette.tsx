import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ProjectIcon } from "@/components/project/project-icon";
import { listIssues, listProjects, type Issue, type Project } from "@/lib/api";
import { signOut } from "@/lib/auth-client";
import { applyTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type CommandResult =
  | { type: "issue"; id: string; title: string; statusKey: string }
  | {
      type: "project";
      id: string;
      title: string;
      color: string;
      icon: string | null;
      issueCount: number;
      doneCount: number;
    }
  | {
      type: "action";
      key: string;
      label: string;
      hint?: string;
      run: () => Promise<void> | void;
    };

export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Open via Cmd/Ctrl+K
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      } else if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Open via custom event from sidebar
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("produktive:open-cmdk", handler as EventListener);
    return () =>
      window.removeEventListener(
        "produktive:open-cmdk",
        handler as EventListener,
      );
  }, []);

  // Reset state on open + focus input + load issues
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    void Promise.all([listIssues(), listProjects(false)])
      .then(([issuesResponse, projectsResponse]) => {
        setIssues(issuesResponse.issues);
        setProjects(projectsResponse.projects);
      })
      .catch(() => {
        /* ignore */
      });
  }, [open]);

  const results = useMemo<CommandResult[]>(() => {
    const q = query.trim().toLowerCase();
    const issueResults: CommandResult[] = issues
      .filter((issue) => {
        if (!q) return true;
        const id = `p-${issue.id.slice(0, 4)}`.toLowerCase();
        return issue.title.toLowerCase().includes(q) || id.includes(q);
      })
      .slice(0, 6)
      .map((issue) => ({
        type: "issue" as const,
        id: issue.id,
        title: issue.title,
        statusKey: issue.status,
      }));

    const projectResults: CommandResult[] = projects
      .filter((project) => {
        if (!q) return true;
        return project.name.toLowerCase().includes(q);
      })
      .slice(0, 6)
      .map((project) => ({
        type: "project" as const,
        id: project.id,
        title: project.name,
        color: project.color,
        icon: project.icon,
        issueCount: project.issueCount,
        doneCount: project.doneCount,
      }));

    const actions: CommandResult[] = [
      {
        type: "action" as const,
        key: "go-projects",
        label: "Go to Projects",
        run: () => navigate({ to: "/projects" }),
      },
      {
        type: "action" as const,
        key: "new-project",
        label: "New project",
        run: () => {
          window.dispatchEvent(new CustomEvent("produktive:new-project"));
        },
      },
      {
        type: "action" as const,
        key: "go-overview",
        label: "Go to Overview",
        hint: "G O",
        run: () => navigate({ to: "/workspace" }),
      },
      {
        type: "action" as const,
        key: "go-issues",
        label: "Go to Issues",
        hint: "G I",
        run: () => navigate({ to: "/issues" }),
      },
      {
        type: "action" as const,
        key: "go-chat",
        label: "Go to Chat",
        hint: "G C",
        run: () => navigate({ to: "/chat" }),
      },
      {
        type: "action" as const,
        key: "go-account",
        label: "Account settings",
        run: () => navigate({ to: "/account" }),
      },
      {
        type: "action" as const,
        key: "go-workspace-settings",
        label: "Settings",
        run: () => navigate({ to: "/workspace/settings" }),
      },
      {
        type: "action" as const,
        key: "theme-ember",
        label: "Theme: Ember (warm dark)",
        run: () => {
          applyTheme("ember");
          toast.success("Ember theme applied");
        },
      },
      {
        type: "action" as const,
        key: "theme-slate",
        label: "Theme: Slate (cool dark)",
        run: () => {
          applyTheme("slate");
          toast.success("Slate theme applied");
        },
      },
      {
        type: "action" as const,
        key: "theme-tokyo-night",
        label: "Theme: Tokyo Night",
        run: () => {
          applyTheme("tokyo-night");
          toast.success("Tokyo Night theme applied");
        },
      },
      {
        type: "action" as const,
        key: "theme-midnight",
        label: "Theme: Midnight (cobalt dark)",
        run: () => {
          applyTheme("midnight");
          toast.success("Midnight theme applied");
        },
      },
      {
        type: "action" as const,
        key: "theme-vercel",
        label: "Theme: Vercel",
        run: () => {
          applyTheme("vercel");
          toast.success("Vercel theme applied");
        },
      },
      {
        type: "action" as const,
        key: "theme-light",
        label: "Theme: Light",
        run: () => {
          applyTheme("light");
          toast.success("Light theme applied");
        },
      },
      {
        type: "action" as const,
        key: "new-issue",
        label: "New issue",
        hint: "C",
        run: async () => {
          await navigate({ to: "/issues" });
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("produktive:new-issue"));
          }, 50);
        },
      },
      {
        type: "action" as const,
        key: "sign-out",
        label: "Sign out",
        run: async () => {
          await signOut();
          await navigate({ to: "/login" });
        },
      },
    ].filter((action) => {
      if (!q) return true;
      return action.label.toLowerCase().includes(q);
    });

    return [...projectResults, ...issueResults, ...actions];
  }, [query, issues, projects, navigate]);

  // Clamp activeIndex
  useEffect(() => {
    if (activeIndex >= results.length) {
      setActiveIndex(Math.max(0, results.length - 1));
    }
  }, [activeIndex, results.length]);

  const runResult = async (result: CommandResult) => {
    setOpen(false);
    if (result.type === "issue") {
      await navigate({
        to: "/issues/$issueId",
        params: { issueId: result.id },
      });
    } else if (result.type === "project") {
      await navigate({
        to: "/projects/$projectId",
        params: { projectId: result.id },
      });
    } else {
      try {
        await result.run();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed");
      }
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const result = results[activeIndex];
      if (result) void runResult(result);
    }
  };

  // Scroll active into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(
      `[data-result-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-bg/60 px-4 pt-[15vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        onKeyDown={handleKeyDown}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[560px] overflow-hidden rounded-xl border border-border bg-bg shadow-[0_24px_60px_rgba(0,0,0,0.6)] animate-fade-up"
      >
        <div className="flex items-center gap-2 border-b border-border-subtle px-4">
          <SearchIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="Type a command or search issues…"
            className="h-12 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-faint"
          />
          <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-fg-faint">
            Esc
          </kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-fg-faint">
              No results.
            </div>
          ) : (
            results.map((result, index) => (
              <button
                key={
                  result.type === "issue"
                    ? `issue:${result.id}`
                    : result.type === "project"
                      ? `project:${result.id}`
                      : `action:${result.key}`
                }
                type="button"
                data-result-index={index}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => void runResult(result)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] transition-colors",
                  index === activeIndex
                    ? "bg-surface text-fg"
                    : "text-fg-muted hover:bg-surface/60 hover:text-fg",
                )}
              >
                <span className="grid size-5 shrink-0 place-items-center text-fg-faint">
                  {result.type === "issue" ? (
                    <IssueGlyph />
                  ) : result.type === "project" ? (
                    <ProjectIcon
                      color={result.color}
                      icon={result.icon}
                      name={result.title}
                      size="sm"
                    />
                  ) : (
                    <ActionGlyph />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {result.type === "issue" ? (
                    <>
                      <span className="font-mono text-[11px] text-fg-faint">
                        P-{result.id.slice(0, 4).toUpperCase()}
                      </span>{" "}
                      <span>{result.title}</span>
                    </>
                  ) : result.type === "project" ? (
                    <>
                      <span>{result.title}</span>
                      {result.issueCount > 0 ? (
                        <span className="ml-2 text-[11px] tabular-nums text-fg-faint">
                          {result.doneCount}/{result.issueCount}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    result.label
                  )}
                </span>
                {result.type === "action" && result.hint ? (
                  <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-fg-faint">
                    {result.hint}
                  </kbd>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M11 11l-2.4-2.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}


function IssueGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect
        x="2.5"
        y="2.5"
        width="9"
        height="9"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function ActionGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3 7l3 3 5-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
