import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

const statusOptions = ["backlog", "todo", "in-progress", "done"];
const priorityOptions = ["low", "medium", "high", "urgent"];
const navItems = ["Issues", "Inbox", "Roadmaps", "Settings"];

function Mark({ className }: { className?: string }) {
  return (
    <span
      className={cn("size-1.5 shrink-0 border border-neutral-500 bg-neutral-950", className)}
      aria-hidden="true"
    />
  );
}

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
    return (
      <main className="grid min-h-screen place-items-center bg-background font-mono text-xs text-muted-foreground">
        Loading workspace...
      </main>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid size-7 place-items-center border border-neutral-700 bg-white text-[11px] font-bold text-black">
              P
            </div>
            <div className="min-w-0">
              <strong className="block truncate text-xs font-medium text-white">Produktive</strong>
              <span className="block truncate text-[11px] text-muted-foreground">
                Open source Linear
              </span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item}>
                <SidebarMenuButton
                  className={
                    item === "Issues"
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_#fff]"
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
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid size-7 place-items-center border border-neutral-800 bg-neutral-950 text-[10px] font-medium text-neutral-200">
              {currentUser?.name?.slice(0, 2).toUpperCase() ?? "P"}
            </div>
            <div className="min-w-0">
              <strong className="block truncate text-xs font-medium text-white">
                {currentUser?.name ?? "Produktive user"}
              </strong>
              <span className="block truncate text-[11px] text-muted-foreground">
                {currentUser?.email}
              </span>
            </div>
          </div>
          <Button
            className="mt-3 h-8 w-full text-xs"
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
        <header className="sticky top-0 z-10 flex min-h-14 items-center justify-between gap-4 border-b border-border bg-background/85 px-4 py-2.5 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger />
            <div>
              <p className="font-mono text-[10px] leading-4 text-muted-foreground">produktive.app</p>
              <h1 className="text-lg font-semibold leading-none tracking-[-0.025em] text-white">
                Issues
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="hidden w-[260px] border border-border bg-neutral-950 px-2.5 py-2 text-xs leading-none text-neutral-500 md:block">
              Search or jump to...
            </div>
            <Button className="h-8 text-xs" form="new-issue-form" type="submit" disabled={isSaving} size="sm">
              New issue
            </Button>
          </div>
        </header>

        <main className="grid gap-3.5 p-4">
          {error ? (
            <div className="flex items-center gap-2 border border-border bg-red-950/30 px-3 py-2 text-xs text-red-200">
              <Mark className="border-red-400 bg-red-950" />
              {error}
            </div>
          ) : null}

          <section className="grid grid-cols-2 border border-border bg-card md:grid-cols-4" aria-label="Issue metrics">
            {[
              ["Total", issues.length],
              ["Open", openCount],
              ["In progress", progressCount],
              ["Backlog", backlogCount],
            ].map(([label, value], index) => (
              <div
                className={cn(
                  "flex min-w-0 items-center justify-between border-border px-3 py-2.5",
                  index < 2 && "border-b md:border-b-0",
                  index !== 1 && index !== 3 && "border-r",
                  index === 1 && "md:border-r",
                )}
                key={label}
              >
                <span className="truncate text-[11px] text-muted-foreground">{label}</span>
                <strong className="font-mono text-xs font-medium text-white">{value}</strong>
              </div>
            ))}
          </section>

          <section className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,392px)]">
            <Card className="overflow-hidden rounded-none border-border bg-card">
              <CardHeader className="flex-row items-center justify-between gap-4 space-y-0 border-b border-border p-3.5">
                <div>
                  <CardTitle className="text-[13px] font-medium tracking-[-0.01em] text-white">
                    All issues
                  </CardTitle>
                  <CardDescription className="mt-1 text-[11px]">
                    {isLoading ? "Syncing..." : `${issues.length} total issues`}
                  </CardDescription>
                </div>
                <div className="flex gap-1.5 font-mono text-[10px] text-muted-foreground">
                  <span className="border border-border bg-neutral-950 px-1.5 py-1">{openCount} open</span>
                  <span className="border border-border bg-neutral-950 px-1.5 py-1">{doneCount} done</span>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {issues.map((issue) => (
                  <button
                    className="grid w-full grid-cols-[78px_minmax(0,1fr)_98px] items-center gap-2.5 border-b border-border px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-neutral-950 data-[selected=true]:bg-neutral-950 data-[selected=true]:shadow-[inset_2px_0_0_#fff] lg:grid-cols-[78px_minmax(0,1fr)_98px_74px_56px]"
                    data-selected={selectedIssue?.id === issue.id}
                    key={issue.id}
                    onClick={() => setSelectedIssueId(issue.id)}
                    type="button"
                  >
                    <span className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                      <Mark />
                      P-{issue.id.slice(0, 4).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <strong className="block truncate text-xs font-normal tracking-[-0.005em] text-neutral-100">
                        {issue.title}
                      </strong>
                      <small className="mt-0.5 block truncate text-[11px] text-neutral-500">
                        {issue.description ?? "No description"}
                      </small>
                    </span>
                    <span
                      className={cn(
                        "w-fit border border-border bg-neutral-950 px-1.5 py-1 font-mono text-[10px] leading-none text-muted-foreground",
                        issue.status === "done" && "text-green-300",
                        issue.status === "in-progress" && "text-blue-300",
                        issue.status === "todo" && "text-neutral-200",
                      )}
                    >
                      {issue.status}
                    </span>
                    <span
                      className={cn(
                        "hidden w-fit border border-border bg-neutral-950 px-1.5 py-1 font-mono text-[10px] leading-none text-muted-foreground lg:inline-block",
                        (issue.priority === "urgent" || issue.priority === "high") && "text-red-300",
                      )}
                    >
                      {issue.priority}
                    </span>
                    <span className="hidden font-mono text-[10px] text-muted-foreground lg:inline">
                      {formatDate(issue.updatedAt)}
                    </span>
                  </button>
                ))}

                {!isLoading && issues.length === 0 ? (
                  <div className="px-6 py-8 text-xs text-muted-foreground">
                    No issues yet. Create the first one.
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <aside className="sticky top-[72px] grid gap-3.5 border border-border bg-card p-3.5 max-lg:static">
              <form id="new-issue-form" className="grid gap-2.5" onSubmit={handleCreateIssue}>
                <div className="flex items-center justify-between gap-2.5">
                  <h2 className="text-[13px] font-medium tracking-[-0.01em] text-white">Create issue</h2>
                  <span className="border border-border bg-neutral-950 px-1.5 py-1 font-mono text-[10px] text-muted-foreground">
                    cmd K
                  </span>
                </div>
                <div className="grid gap-2.5">
                  <Label className="text-[11px] font-normal text-neutral-300" htmlFor="issue-title">
                    Title
                  </Label>
                  <Input
                    className="h-8 rounded-none bg-black text-xs"
                    id="issue-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Something that should exist"
                    required
                  />
                </div>
                <div className="grid gap-2.5">
                  <Label className="text-[11px] font-normal text-neutral-300" htmlFor="issue-description">
                    Description
                  </Label>
                  <textarea
                    className="min-h-24 w-full resize-y border border-input bg-black px-2.5 py-2 text-xs leading-relaxed text-foreground outline-none placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
                    id="issue-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Context, constraints, notes"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="grid gap-2.5">
                    <Label className="text-[11px] font-normal text-neutral-300" htmlFor="issue-status">
                      Status
                    </Label>
                    <select
                      className="h-8 w-full border border-input bg-black px-2 text-[11px] text-neutral-200 outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
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
                  <div className="grid gap-2.5">
                    <Label className="text-[11px] font-normal text-neutral-300" htmlFor="issue-priority">
                      Priority
                    </Label>
                    <select
                      className="h-8 w-full border border-input bg-black px-2 text-[11px] text-neutral-200 outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
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
                <Card className="rounded-none border-border bg-card">
                  <CardHeader className="p-3.5">
                    <CardDescription className="font-mono text-[10px]">
                      P-{selectedIssue.id.slice(0, 4).toUpperCase()}
                    </CardDescription>
                    <CardTitle className="text-base font-medium leading-snug tracking-[-0.02em] text-white">
                      {selectedIssue.title}
                    </CardTitle>
                    <CardDescription className="text-[11px] leading-relaxed">
                      {selectedIssue.description ?? "No description yet."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3.5 p-3.5 pt-0">
                    <div className="grid grid-cols-[1fr_auto] gap-2.5 max-sm:grid-cols-1">
                      <select
                        aria-label="Selected issue status"
                        className="h-8 w-full border border-input bg-black px-2 text-[11px] text-neutral-200 outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
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
                        className="h-8 text-xs"
                        type="button"
                        variant="outline"
                        onClick={() => void handleDeleteIssue(selectedIssue)}
                      >
                        Delete
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                      <Mark />
                      <span>Updated {formatDate(selectedIssue.updatedAt)}</span>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </aside>
          </section>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
