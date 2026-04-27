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

function StatusDot({ status }: { status: string }) {
  const color =
    status === "done"
      ? "bg-emerald-400"
      : status === "in-progress"
        ? "bg-blue-400"
        : status === "todo"
          ? "bg-neutral-400"
          : "bg-amber-400";

  return (
    <span
      className={cn("inline-block size-1.5 rounded-full", color)}
      aria-hidden="true"
    />
  );
}

function PriorityIndicator({ priority }: { priority: string }) {
  const level =
    priority === "urgent" ? 4 : priority === "high" ? 3 : priority === "medium" ? 2 : 1;

  return (
    <span className="flex items-center gap-0.5" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "block h-2.5 w-[3px] rounded-full",
            i < level
              ? priority === "urgent" || priority === "high"
                ? "bg-red-400/80"
                : "bg-neutral-500"
              : "bg-neutral-800",
          )}
        />
      ))}
    </span>
  );
}

function Mark({ className }: { className?: string }) {
  return (
    <span
      className={cn("size-1.5 shrink-0 border border-neutral-600 bg-neutral-900", className)}
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

  const scrollToCreate = () => {
    const element = document.getElementById("create-issue-panel");
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (session.isPending) {
    return (
      <main className="grid min-h-screen place-items-center bg-background font-mono text-xs text-muted-foreground animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="size-4 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-300" />
          Loading workspace...
        </div>
      </main>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg border border-neutral-700 bg-neutral-100 text-[11px] font-bold text-black">
              P
            </div>
            <div className="min-w-0">
              <strong className="block truncate text-xs font-semibold tracking-tight text-white">Produktive</strong>
              <span className="block truncate text-[11px] text-muted-foreground">
                Open source Linear
              </span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item, index) => (
              <SidebarMenuItem key={item}>
                <SidebarMenuButton
                  className={cn(
                    item === "Issues" &&
                      "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_#818cf8]",
                  )}
                  style={{
                    animationDelay: `${index * 50}ms`,
                  }}
                >
                  <Mark
                    className={cn(
                      item === "Issues" ? "border-indigo-400 bg-indigo-950" : undefined,
                    )}
                  />
                  {item}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg border border-neutral-800 bg-neutral-950 text-[10px] font-medium text-neutral-200">
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
        <header className="sticky top-0 z-10 flex min-h-14 items-center justify-between gap-4 border-b border-border bg-background/80 px-4 py-2.5 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger />
            <div>
              <p className="font-mono text-[10px] leading-4 text-muted-foreground">produktive.app</p>
              <h1 className="text-lg font-semibold leading-none tracking-tight text-white">
                Issues
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="hidden w-[260px] rounded-lg border border-border bg-neutral-950/80 px-2.5 py-2 text-xs leading-none text-neutral-500 md:block transition-colors hover:border-neutral-700 hover:text-neutral-400">
              Search or jump to...
            </div>
            <Button className="h-8 text-xs shadow-sm" form="new-issue-form" type="submit" disabled={isSaving} size="sm">
              {isSaving ? "Saving..." : "New issue"}
            </Button>
          </div>
        </header>

        {isLoading ? (
          <DashboardSkeleton />
        ) : (
          <main className="grid gap-3.5 p-4 animate-fade-in">
            {error ? (
              <div className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/20 px-3 py-2.5 text-xs text-red-200 animate-fade-in">
                <Mark className="border-red-400 bg-red-950" />
                {error}
                <button
                  className="ml-auto text-[11px] text-red-300 underline underline-offset-2 hover:text-red-200"
                  onClick={() => setError(null)}
                >
                  Dismiss
                </button>
              </div>
            ) : null}

            <section className="grid grid-cols-2 rounded-xl border border-border bg-card md:grid-cols-4 overflow-hidden" aria-label="Issue metrics">
              {[
                { label: "Total", value: issues.length, color: "text-white" },
                { label: "Open", value: openCount, color: "text-blue-300" },
                { label: "In progress", value: progressCount, color: "text-indigo-300" },
                { label: "Backlog", value: backlogCount, color: "text-amber-300" },
              ].map(({ label, value, color }, index) => (
                <div
                  className={cn(
                    "flex min-w-0 items-center justify-between border-border px-3.5 py-3 transition-colors hover:bg-neutral-900/30",
                    index < 2 && "border-b md:border-b-0",
                    index !== 1 && index !== 3 && "border-r",
                    index === 1 && "md:border-r",
                  )}
                  key={label}
                  style={{ animationDelay: `${index * 75}ms` }}
                >
                  <span className="truncate text-[11px] text-muted-foreground">{label}</span>
                  <strong className={cn("font-mono text-sm font-semibold tabular-nums", color)}>
                    {value}
                  </strong>
                </div>
              ))}
            </section>

            <section className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,392px)]">
              <Card className="overflow-hidden rounded-xl border-border bg-card transition-shadow hover:shadow-lg hover:shadow-black/20">
                <CardHeader className="flex-row items-center justify-between gap-4 space-y-0 border-b border-border p-3.5">
                  <div>
                    <CardTitle className="text-[13px] font-medium tracking-tight text-white">
                      All issues
                    </CardTitle>
                    <CardDescription className="mt-1 text-[11px]">
                      {`${issues.length} total issues`}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1.5 font-mono text-[10px] text-muted-foreground">
                    <span className="rounded-md border border-border bg-neutral-950 px-2 py-1 transition-colors hover:border-neutral-700">
                      {openCount} open
                    </span>
                    <span className="rounded-md border border-border bg-neutral-950 px-2 py-1 transition-colors hover:border-neutral-700">
                      {doneCount} done
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  {issues.length === 0 ? (
                    <EmptyState onCreate={scrollToCreate} />
                  ) : (
                    issues.map((issue, index) => (
                      <button
                        className={cn(
                          "grid w-full grid-cols-[78px_minmax(0,1fr)_98px] items-center gap-2.5 border-b border-border px-3.5 py-2.5 text-left transition-all duration-200 last:border-b-0",
                          "hover:bg-neutral-950/80 active:scale-[0.998]",
                          selectedIssue?.id === issue.id
                            ? "bg-neutral-950 shadow-[inset_2px_0_0_#818cf8]"
                            : undefined,
                        )}
                        data-selected={selectedIssue?.id === issue.id}
                        key={issue.id}
                        onClick={() => setSelectedIssueId(issue.id)}
                        type="button"
                        style={{ animationDelay: `${index * 30}ms` }}
                      >
                        <span className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                          <Mark
                            className={cn(
                              selectedIssue?.id === issue.id &&
                                "border-indigo-400 bg-indigo-950",
                            )}
                          />
                          P-{issue.id.slice(0, 4).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-xs font-normal tracking-tight text-neutral-100">
                            {issue.title}
                          </strong>
                          <small className="mt-0.5 block truncate text-[11px] text-neutral-500">
                            {issue.description ?? "No description"}
                          </small>
                        </span>
                        <span className="flex items-center gap-1.5 w-fit rounded-md border border-border bg-neutral-950 px-2 py-1 font-mono text-[10px] leading-none text-muted-foreground">
                          <StatusDot status={issue.status} />
                          {issue.status}
                        </span>
                        <span className="hidden items-center gap-1.5 lg:flex">
                          <PriorityIndicator priority={issue.priority} />
                          <span className="rounded-md border border-border bg-neutral-950 px-2 py-1 font-mono text-[10px] leading-none text-muted-foreground">
                            {issue.priority}
                          </span>
                        </span>
                        <span className="hidden font-mono text-[10px] text-muted-foreground lg:inline">
                          {formatDate(issue.updatedAt)}
                        </span>
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>

              <aside id="create-issue-panel" className="sticky top-[72px] grid gap-3.5 rounded-xl border border-border bg-card p-3.5 max-lg:static animate-slide-in-left">
                <form id="new-issue-form" className="grid gap-3" onSubmit={handleCreateIssue}>
                  <div className="flex items-center justify-between gap-2.5">
                    <h2 className="text-[13px] font-medium tracking-tight text-white">Create issue</h2>
                    <span className="rounded-md border border-border bg-neutral-950 px-1.5 py-1 font-mono text-[10px] text-muted-foreground">
                      cmd K
                    </span>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-[11px] font-normal text-neutral-300" htmlFor="issue-title">
                      Title
                    </Label>
                    <Input
                      className="h-9 text-xs"
                      id="issue-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Something that should exist"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-[11px] font-normal text-neutral-300" htmlFor="issue-description">
                      Description
                    </Label>
                    <textarea
                      className="min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-xs leading-relaxed text-foreground outline-none transition-all duration-200 placeholder:text-neutral-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-neutral-500 hover:border-neutral-600"
                      id="issue-description"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Context, constraints, notes"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="grid gap-2">
                      <Label className="text-[11px] font-normal text-neutral-300" htmlFor="issue-status">
                        Status
                      </Label>
                      <select
                        className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-[11px] text-neutral-200 outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-neutral-500 hover:border-neutral-600"
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
                    <div className="grid gap-2">
                      <Label className="text-[11px] font-normal text-neutral-300" htmlFor="issue-priority">
                        Priority
                      </Label>
                      <select
                        className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-[11px] text-neutral-200 outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-neutral-500 hover:border-neutral-600"
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
                  <Card className="rounded-xl border-border bg-card overflow-hidden">
                    <CardHeader className="p-3.5 pb-2">
                      <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground mb-1">
                        <Mark className="border-indigo-400/50 bg-indigo-950/50" />
                        P-{selectedIssue.id.slice(0, 4).toUpperCase()}
                      </div>
                      <CardTitle className="text-base font-medium leading-snug tracking-tight text-white">
                        {selectedIssue.title}
                      </CardTitle>
                      <CardDescription className="text-[11px] leading-relaxed mt-1.5">
                        {selectedIssue.description ?? "No description yet."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 p-3.5 pt-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-neutral-950 px-2 py-1 font-mono text-[10px] text-muted-foreground">
                          <StatusDot status={selectedIssue.status} />
                          {selectedIssue.status}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-neutral-950 px-2 py-1 font-mono text-[10px] text-muted-foreground">
                          <PriorityIndicator priority={selectedIssue.priority} />
                          {selectedIssue.priority}
                        </span>
                      </div>
                      <div className="grid grid-cols-[1fr_auto] gap-2.5 max-sm:grid-cols-1">
                        <select
                          aria-label="Selected issue status"
                          className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-[11px] text-neutral-200 outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-neutral-500 hover:border-neutral-600"
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
                          className="h-9 text-xs"
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
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
