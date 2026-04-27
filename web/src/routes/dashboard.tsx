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
import {
  type Issue,
  createIssue,
  deleteIssue,
  listIssues,
  updateIssue,
} from "@/lib/api";
import { signOut, useSession } from "@/lib/auth-client";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

const statusOptions = ["backlog", "todo", "in-progress", "done"];
const priorityOptions = ["low", "medium", "high", "urgent"];
const navItems = ["Dashboard", "Inbox", "Views", "Settings"];

function Mark({ className }: { className?: string }) {
  return <span className={className ?? "mark"} aria-hidden="true" />;
}

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
          setError(loadError instanceof Error ? loadError.message : "Failed to load issues");
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
      setError(createError instanceof Error ? createError.message : "Failed to create issue");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (issue: Issue, nextStatus: string) => {
    const previousIssues = issues;
    setIssues((currentIssues) =>
      currentIssues.map((currentIssue) =>
        currentIssue.id === issue.id ? { ...currentIssue, status: nextStatus } : currentIssue,
      ),
    );

    try {
      await updateIssue(issue.id, { status: nextStatus });
    } catch (updateError) {
      setIssues(previousIssues);
      setError(updateError instanceof Error ? updateError.message : "Failed to update issue");
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
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete issue");
    }
  };

  if (session.isPending) {
    return <main className="loading-screen">Loading workspace...</main>;
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="sidebar-brand">
            <div className="brand-mark">P</div>
            <div>
              <strong>Produktive</strong>
              <span>Issue workspace</span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item}>
                <SidebarMenuButton
                  className={
                    item === "Dashboard"
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : undefined
                  }
                >
                  <Mark />
                  {item}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <div className="sidebar-user">
            <div className="avatar">{currentUser?.name?.slice(0, 2).toUpperCase() ?? "P"}</div>
            <div>
              <strong>{currentUser?.name ?? "Produktive user"}</strong>
              <span>{currentUser?.email}</span>
            </div>
          </div>
          <Button
            className="mt-3 w-full"
            variant="outline"
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
        <header className="dashboard-header">
          <SidebarTrigger />
          <div>
            <p className="eyebrow">Produktive.app</p>
            <h1>Issues</h1>
          </div>
          <Button form="new-issue-form" type="submit" disabled={isSaving}>
            New issue
          </Button>
        </header>

        <main className="dashboard-main">
          {error ? (
            <div className="alert">
              <Mark className="mark mark-danger" />
              {error}
            </div>
          ) : null}

          <section className="dashboard-grid">
            <div className="issue-panel">
              <div className="panel-header">
                <div>
                  <h2>Issue queue</h2>
                  <p>{isLoading ? "Syncing..." : `${issues.length} total issues`}</p>
                </div>
                <div className="stats">
                  <span>{openCount} open</span>
                  <span>{doneCount} done</span>
                </div>
              </div>

              <div className="issue-list">
                {issues.map((issue) => (
                  <button
                    className="issue-card"
                    data-selected={selectedIssue?.id === issue.id}
                    key={issue.id}
                    onClick={() => setSelectedIssueId(issue.id)}
                    type="button"
                  >
                    <Mark />
                    <span>
                      <strong>{issue.title}</strong>
                      <small>
                        {issue.status} · {issue.priority}
                      </small>
                    </span>
                  </button>
                ))}

                {!isLoading && issues.length === 0 ? (
                  <div className="empty-state">No issues yet. Create the first one.</div>
                ) : null}
              </div>
            </div>

            <aside className="detail-panel">
              <form id="new-issue-form" className="issue-form" onSubmit={handleCreateIssue}>
                <h2>Create issue</h2>
                <div className="field">
                  <Label htmlFor="issue-title">Title</Label>
                  <Input
                    id="issue-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Something that should exist"
                    required
                  />
                </div>
                <div className="field">
                  <Label htmlFor="issue-description">Description</Label>
                  <textarea
                    id="issue-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Context, constraints, notes"
                  />
                </div>
                <div className="form-row">
                  <div className="field">
                    <Label htmlFor="issue-status">Status</Label>
                    <select
                      id="issue-status"
                      value={status}
                      onChange={(event) => setStatus(event.target.value)}
                    >
                      {statusOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <Label htmlFor="issue-priority">Priority</Label>
                    <select
                      id="issue-priority"
                      value={priority}
                      onChange={(event) => setPriority(event.target.value)}
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

              {selectedIssue ? (
                <div className="selected-card">
                  <div>
                    <p className="eyebrow">Selected issue</p>
                    <h2>{selectedIssue.title}</h2>
                    <p>{selectedIssue.description ?? "No description yet."}</p>
                  </div>
                  <div className="selected-actions">
                    <select
                      aria-label="Selected issue status"
                      value={selectedIssue.status}
                      onChange={(event) =>
                        void handleStatusChange(selectedIssue, event.target.value)
                      }
                    >
                      {statusOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleDeleteIssue(selectedIssue)}
                    >
                      Delete
                    </Button>
                  </div>
                  <div className="status-line">
                    <Mark />
                    <span>Updated {new Date(selectedIssue.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ) : null}
            </aside>
          </section>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
