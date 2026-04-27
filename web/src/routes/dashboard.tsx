import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { EmptyState } from "@/components/empty-state";
import { DashboardSkeleton } from "@/components/issue-skeleton";
import {
  type Issue,
  createIssue,
  deleteIssue,
  listIssues,
  updateIssue,
} from "@/lib/api";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

const statusOptions = ["backlog", "todo", "in-progress", "done"];
const priorityOptions = ["low", "medium", "high", "urgent"];
const navItems = ["Issues", "Inbox", "Roadmaps", "Settings"];

const statusColor = (status: string) => {
  switch (status) {
    case "done":
      return "bg-success";
    case "in-progress":
      return "bg-accent";
    case "todo":
      return "bg-fg-muted";
    case "backlog":
    default:
      return "bg-warning";
  }
};

const priorityColor = (priority: string) => {
  if (priority === "urgent" || priority === "high") return "text-danger";
  if (priority === "medium") return "text-fg";
  return "text-fg-muted";
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));

function DashboardPage() {
  const navigate = useNavigate();
  const session = useSession();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("backlog");
  const [priority, setPriority] = useState("medium");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const currentUser = session.data?.user;

  const selectedIssue = useMemo(
    () => issues.find((issue) => issue.id === selectedIssueId) ?? issues[0],
    [issues, selectedIssueId],
  );

  const backlogCount = issues.filter((issue) => issue.status === "backlog").length;
  const progressCount = issues.filter((issue) => issue.status === "in-progress").length;
  const openCount = issues.filter((issue) => issue.status !== "done").length;
  const doneCount = issues.filter((issue) => issue.status === "done").length;

  useEffect(() => {
    if (!session.isPending && !session.data) {
      void navigate({ to: "/login" });
    }
  }, [navigate, session.data, session.isPending]);

  useEffect(() => {
    if (!session.data) {
      return;
    }

    let isMounted = true;

    const loadIssues = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await listIssues();

        if (isMounted) {
          setIssues(response.issues);
          setSelectedIssueId(response.issues[0]?.id ?? null);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load issues",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadIssues();

    return () => {
      isMounted = false;
    };
  }, [session.data]);

  const handleCreateIssue = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const response = await createIssue({
        title,
        description: description || undefined,
        status,
        priority,
      });

      setIssues((currentIssues) => [response.issue, ...currentIssues]);
      setSelectedIssueId(response.issue.id);
      setTitle("");
      setDescription("");
      setStatus("backlog");
      setPriority("medium");
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Failed to create issue",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (issue: Issue, nextStatus: string) => {
    const previousIssues = issues;
    setIssues((currentIssues) =>
      currentIssues.map((currentIssue) =>
        currentIssue.id === issue.id
          ? { ...currentIssue, status: nextStatus }
          : currentIssue,
      ),
    );

    try {
      await updateIssue(issue.id, { status: nextStatus });
    } catch (updateError) {
      setIssues(previousIssues);
      setError(
        updateError instanceof Error ? updateError.message : "Failed to update issue",
      );
    }
  };

  const handleDeleteIssue = async (issue: Issue) => {
    const previousIssues = issues;
    setIssues((currentIssues) =>
      currentIssues.filter((currentIssue) => currentIssue.id !== issue.id),
    );

    try {
      await deleteIssue(issue.id);
    } catch (deleteError) {
      setIssues(previousIssues);
      setError(
        deleteError instanceof Error ? deleteError.message : "Failed to delete issue",
      );
    }
  };

  const scrollToCreate = () => {
    const element = document.getElementById("create-issue-panel");
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (session.isPending) {
    return (
      <main className="grid min-h-screen place-items-center text-fg-muted text-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block size-3 animate-spin rounded-full border-2 border-border border-t-fg" />
          Loading…
        </div>
      </main>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2">
            <div className="grid size-6 place-items-center rounded-md bg-fg text-[11px] font-semibold text-bg">
              P
            </div>
            <span className="text-sm font-medium text-fg">Produktive</span>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item}>
                <SidebarMenuButton
                  className={cn(
                    item === "Issues" && "bg-surface text-fg",
                  )}
                >
                  {item}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter>
          <div className="flex items-center gap-2.5">
            <div className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-surface text-[10px] font-medium text-fg">
              {currentUser?.name?.slice(0, 2).toUpperCase() ?? "P"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-fg">
                {currentUser?.name ?? "User"}
              </p>
              <p className="truncate text-[11px] text-fg-muted">
                {currentUser?.email}
              </p>
            </div>
          </div>
          <Button
            className="mt-3 w-full"
            variant="outline"
            size="sm"
            onClick={async () => {
              await signOut();
              await navigate({ to: "/login" });
            }}
          >
            Sign out
          </Button>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-12 items-center justify-between gap-3 border-b border-border-subtle bg-bg/80 px-5 backdrop-blur">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <h1 className="text-sm font-medium text-fg">Issues</h1>
            <span className="text-xs text-fg-muted">
              {issues.length}
            </span>
          </div>
          <Button
            form="new-issue-form"
            type="submit"
            disabled={isSaving}
            size="sm"
          >
            {isSaving ? "Saving…" : "New issue"}
          </Button>
        </header>

        {isLoading ? (
          <DashboardSkeleton />
        ) : (
          <main className="animate-fade-in p-5">
            {error ? (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                <span>{error}</span>
                <button
                  className="text-fg-muted hover:text-fg transition-colors"
                  onClick={() => setError(null)}
                >
                  Dismiss
                </button>
              </div>
            ) : null}

            <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Total", value: issues.length },
                { label: "Open", value: openCount },
                { label: "In progress", value: progressCount },
                { label: "Backlog", value: backlogCount },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-lg border border-border-subtle bg-surface px-4 py-3"
                >
                  <p className="text-xs text-fg-muted">{label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-fg">
                    {value}
                  </p>
                </div>
              ))}
            </section>

            <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-lg border border-border bg-surface">
                <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
                  <span className="text-sm font-medium text-fg">All issues</span>
                  <span className="text-xs text-fg-muted">
                    {openCount} open · {doneCount} done
                  </span>
                </div>

                {issues.length === 0 ? (
                  <EmptyState onCreate={scrollToCreate} />
                ) : (
                  <ul>
                    {issues.map((issue) => {
                      const isSelected = selectedIssue?.id === issue.id;
                      return (
                        <li key={issue.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedIssueId(issue.id)}
                            className={cn(
                              "flex w-full items-center gap-3 border-b border-border-subtle px-4 py-2.5 text-left transition-colors hover:bg-surface-2 last:border-b-0",
                              isSelected && "bg-surface-2",
                            )}
                          >
                            <span
                              className={cn(
                                "size-1.5 shrink-0 rounded-full",
                                statusColor(issue.status),
                              )}
                            />
                            <span className="font-mono text-[11px] text-fg-muted w-16 shrink-0">
                              P-{issue.id.slice(0, 4).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm text-fg">
                              {issue.title}
                            </span>
                            <span
                              className={cn(
                                "hidden text-xs sm:block",
                                priorityColor(issue.priority),
                              )}
                            >
                              {issue.priority}
                            </span>
                            <span className="hidden font-mono text-[11px] text-fg-muted sm:block">
                              {formatDate(issue.updatedAt)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <aside id="create-issue-panel" className="grid gap-5 lg:sticky lg:top-[68px]">
                <div className="rounded-lg border border-border bg-surface">
                  <div className="border-b border-border-subtle px-4 py-2.5">
                    <span className="text-sm font-medium text-fg">New issue</span>
                  </div>
                  <form
                    id="new-issue-form"
                    className="grid gap-3 p-4"
                    onSubmit={handleCreateIssue}
                  >
                    <div className="grid gap-1.5">
                      <Label htmlFor="issue-title">Title</Label>
                      <Input
                        id="issue-title"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Issue title"
                        required
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="issue-description">Description</Label>
                      <textarea
                        id="issue-description"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="Optional"
                        className="min-h-20 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-faint focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor="issue-status">Status</Label>
                        <select
                          id="issue-status"
                          value={status}
                          onChange={(event) => setStatus(event.target.value)}
                          className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg outline-none transition-colors focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent"
                        >
                          {statusOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="issue-priority">Priority</Label>
                        <select
                          id="issue-priority"
                          value={priority}
                          onChange={(event) => setPriority(event.target.value)}
                          className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg outline-none transition-colors focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent"
                        >
                          {priorityOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </form>
                </div>

                {selectedIssue ? (
                  <div className="rounded-lg border border-border bg-surface">
                    <div className="border-b border-border-subtle px-4 py-3">
                      <p className="font-mono text-[11px] text-fg-muted">
                        P-{selectedIssue.id.slice(0, 4).toUpperCase()}
                      </p>
                      <h3 className="mt-1 text-sm font-medium text-fg">
                        {selectedIssue.title}
                      </h3>
                      {selectedIssue.description ? (
                        <p className="mt-1 text-xs text-fg-muted">
                          {selectedIssue.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="grid gap-3 p-4">
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <select
                          aria-label="Selected issue status"
                          value={selectedIssue.status}
                          onChange={(event) =>
                            void handleStatusChange(selectedIssue, event.target.value)
                          }
                          className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg outline-none transition-colors focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent"
                        >
                          {statusOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="outline"
                          size="default"
                          type="button"
                          onClick={() => void handleDeleteIssue(selectedIssue)}
                        >
                          Delete
                        </Button>
                      </div>
                      <p className="text-xs text-fg-muted">
                        Updated {formatDate(selectedIssue.updatedAt)}
                      </p>
                    </div>
                  </div>
                ) : null}
              </aside>
            </section>
          </main>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
