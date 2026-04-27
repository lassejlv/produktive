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

const navItems = [
  { label: "Issues", glyph: "§", active: true },
  { label: "Inbox", glyph: "¶", active: false },
  { label: "Roadmaps", glyph: "※", active: false },
  { label: "Settings", glyph: "✦", active: false },
];

const statusGlyph = (status: string) => {
  switch (status) {
    case "done":
      return { mark: "✓", color: "text-moss", border: "border-moss" };
    case "in-progress":
      return { mark: "◐", color: "text-storm", border: "border-storm" };
    case "todo":
      return { mark: "○", color: "text-ink", border: "border-ink" };
    case "backlog":
    default:
      return { mark: "·", color: "text-gold", border: "border-gold" };
  }
};

function PriorityBars({ priority }: { priority: string }) {
  const level =
    priority === "urgent"
      ? 4
      : priority === "high"
      ? 3
      : priority === "medium"
      ? 2
      : 1;
  const isHot = priority === "urgent" || priority === "high";

  return (
    <span className="flex items-end gap-[2px]" aria-hidden="true">
      {[3, 6, 9, 12].map((h, i) => (
        <span
          key={i}
          className={cn(
            "block w-[2px] transition-colors",
            i < level
              ? isHot
                ? "bg-vermilion"
                : "bg-ink"
              : "bg-ink/20",
          )}
          style={{ height: `${h}px` }}
        />
      ))}
    </span>
  );
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));

const formatLong = (value: string) =>
  new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(value));

const today = formatLong(new Date().toISOString());

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
      <main className="grid min-h-screen place-items-center text-ink animate-ink-bleed">
        <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">
          <span className="inline-block size-3 animate-mark-spin border-2 border-ink/30 border-t-vermilion" />
          Opening the workshop…
        </div>
      </main>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex min-w-0 items-baseline justify-between gap-2.5">
            <div>
              <p className="eyebrow">Workshop</p>
              <strong
                className="serif-tight mt-1 block text-[26px] font-medium leading-none tracking-tight text-ink"
                style={{ fontWeight: 500 }}
              >
                Produk
                <span className="text-vermilion">·</span>
                <span className="serif-italic">tive</span>
              </strong>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
              v.001
            </span>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <p className="eyebrow mb-2 px-2">Sections</p>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton
                  className={cn(
                    item.active &&
                      "bg-paper text-ink before:absolute before:left-0 before:top-1/2 before:h-[60%] before:w-[3px] before:-translate-y-1/2 before:bg-vermilion",
                  )}
                >
                  <span
                    className={cn(
                      "font-serif text-[18px] leading-none",
                      item.active ? "text-vermilion" : "text-ink-muted",
                    )}
                    aria-hidden="true"
                  >
                    {item.glyph}
                  </span>
                  <span className="font-serif italic text-[15px]">{item.label}</span>
                  {item.active ? (
                    <span className="ml-auto font-mono text-[10px] tracking-[0.14em] text-ink-muted">
                      {issues.length.toString().padStart(2, "0")}
                    </span>
                  ) : null}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>

          <div className="mt-8 border-t border-ink/15 pt-5">
            <p className="eyebrow mb-3 px-2">Today's tally</p>
            <dl className="grid grid-cols-2 gap-px bg-ink/15">
              {[
                { label: "Open", value: openCount, color: "text-storm" },
                { label: "Doing", value: progressCount, color: "text-vermilion" },
                { label: "Backlog", value: backlogCount, color: "text-gold" },
                { label: "Shipped", value: doneCount, color: "text-moss" },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between bg-paper-deep px-3 py-2.5"
                >
                  <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-muted">
                    {label}
                  </dt>
                  <dd
                    className={cn(
                      "font-serif text-[22px] tabular-nums leading-none",
                      color,
                    )}
                    style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </SidebarContent>

        <SidebarFooter>
          <div className="flex min-w-0 items-center gap-3 border border-ink/15 bg-paper-soft p-3">
            <div className="grid size-9 shrink-0 place-items-center border border-ink bg-paper text-[10px] font-medium uppercase tracking-widest text-ink">
              {currentUser?.name?.slice(0, 2).toUpperCase() ?? "P"}
            </div>
            <div className="min-w-0">
              <strong className="block truncate text-[13px] font-medium text-ink">
                {currentUser?.name ?? "Produktive user"}
              </strong>
              <span className="block truncate font-mono text-[10px] text-ink-muted">
                {currentUser?.email}
              </span>
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
            Sign out ↗
          </Button>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        {/* Newspaper masthead */}
        <header className="masthead-shadow sticky top-0 z-10 border-b border-ink bg-paper/95 backdrop-blur-sm">
          <div className="flex min-h-16 items-center justify-between gap-4 px-6 py-3">
            <div className="flex min-w-0 items-center gap-4">
              <SidebarTrigger />
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                  {today} · Issues Edition
                </p>
                <h1
                  className="serif-tight text-[28px] font-medium leading-none tracking-tight text-ink"
                  style={{ fontWeight: 500 }}
                >
                  The <span className="serif-italic text-vermilion">Ledger</span>
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden h-9 w-[260px] items-center gap-2 border border-ink/30 bg-paper-soft px-3 text-[12px] text-ink-muted transition-colors hover:border-ink md:flex">
                <span className="font-mono text-[11px]">⌘K</span>
                <span className="font-serif italic">Search the ledger…</span>
              </div>
              <Button
                form="new-issue-form"
                type="submit"
                disabled={isSaving}
                size="sm"
              >
                {isSaving ? "Setting type…" : "+ New issue"}
              </Button>
            </div>
          </div>
        </header>

        {isLoading ? (
          <DashboardSkeleton />
        ) : (
          <main className="animate-ink-bleed grid gap-8 px-6 py-6 lg:px-10 lg:py-8">
            {error ? (
              <div className="flex items-center gap-3 border-l-2 border-vermilion bg-vermilion/[0.06] px-4 py-3 text-[12px] text-vermilion animate-ink-bleed">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
                  Erratum
                </span>
                <span className="font-serif italic text-ink-soft">{error}</span>
                <button
                  className="ml-auto font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted underline underline-offset-4 hover:text-vermilion"
                  onClick={() => setError(null)}
                >
                  Dismiss
                </button>
              </div>
            ) : null}

            {/* Big tally bar — like newspaper headline stats */}
            <section
              className="grid grid-cols-2 border border-ink bg-paper-soft md:grid-cols-4"
              aria-label="Issue metrics"
            >
              {[
                { label: "Total Issues", value: issues.length, accent: "text-ink" },
                { label: "Open", value: openCount, accent: "text-storm" },
                { label: "In progress", value: progressCount, accent: "text-vermilion" },
                { label: "Backlog", value: backlogCount, accent: "text-gold" },
              ].map(({ label, value, accent }, index) => (
                <div
                  key={label}
                  className={cn(
                    "row-hover relative flex items-baseline justify-between px-5 py-5",
                    index !== 0 && "md:border-l md:border-ink/15",
                    index >= 2 && "border-t border-ink/15 md:border-t-0",
                    index === 1 && "border-l border-ink/15",
                  )}
                >
                  <div>
                    <p className="eyebrow mb-2">{label}</p>
                    <p
                      className={cn(
                        "serif-tight text-[44px] leading-[0.9] tabular-nums",
                        accent,
                      )}
                      style={{ fontWeight: 500 }}
                    >
                      {value.toString().padStart(2, "0")}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                    №{(index + 1).toString().padStart(2, "0")}
                  </span>
                </div>
              ))}
            </section>

            {/* Two columns — ledger + side panel */}
            <section className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
              {/* The Ledger */}
              <div className="border border-ink bg-paper-soft">
                <div className="flex items-baseline justify-between gap-4 border-b border-ink/15 px-5 py-4">
                  <div>
                    <p className="eyebrow mb-1.5">Section A · The Ledger</p>
                    <h2
                      className="serif-tight text-[22px] font-medium leading-none tracking-tight text-ink"
                      style={{ fontWeight: 500 }}
                    >
                      All <span className="serif-italic text-vermilion">issues</span>,
                      set in order.
                    </h2>
                  </div>
                  <div className="flex gap-2 font-mono text-[10px] uppercase tracking-[0.16em]">
                    <span className="border border-ink/40 px-2 py-1 text-ink-muted">
                      {openCount.toString().padStart(2, "0")} open
                    </span>
                    <span className="border border-ink/40 px-2 py-1 text-ink-muted">
                      {doneCount.toString().padStart(2, "0")} done
                    </span>
                  </div>
                </div>

                {/* Column headers */}
                {issues.length > 0 ? (
                  <div className="grid grid-cols-[40px_84px_minmax(0,1fr)_104px_94px_70px] items-center gap-3 border-b border-ink/15 bg-paper-deep px-4 py-2 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-muted">
                    <span>Nº</span>
                    <span>Mark</span>
                    <span>Title</span>
                    <span>Status</span>
                    <span className="hidden lg:inline">Priority</span>
                    <span className="hidden lg:inline">Updated</span>
                  </div>
                ) : null}

                <div>
                  {issues.length === 0 ? (
                    <EmptyState onCreate={scrollToCreate} />
                  ) : (
                    issues.map((issue, index) => {
                      const meta = statusGlyph(issue.status);
                      const isSelected = selectedIssue?.id === issue.id;
                      return (
                        <button
                          key={issue.id}
                          type="button"
                          data-selected={isSelected}
                          onClick={() => setSelectedIssueId(issue.id)}
                          className={cn(
                            "row-hover relative grid w-full grid-cols-[40px_84px_minmax(0,1fr)_104px_94px_70px] items-center gap-3 border-b border-ink/10 px-4 py-3 text-left last:border-b-0",
                            isSelected && "bg-paper-deep",
                          )}
                        >
                          {/* Selection indicator stroke */}
                          {isSelected ? (
                            <span className="absolute left-0 top-0 h-full w-[3px] bg-vermilion" />
                          ) : null}

                          <span className="font-mono text-[10px] tabular-nums text-ink-muted">
                            {(index + 1).toString().padStart(3, "0")}
                          </span>

                          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">
                            P-{issue.id.slice(0, 4).toUpperCase()}
                          </span>

                          <span className="min-w-0">
                            <strong className="block truncate font-serif text-[16px] font-normal leading-snug tracking-tight text-ink">
                              {issue.title}
                            </strong>
                            <small className="mt-0.5 block truncate text-[12px] italic text-ink-muted">
                              {issue.description ?? "— no description —"}
                            </small>
                          </span>

                          <span
                            className={cn(
                              "inline-flex items-center gap-2 border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]",
                              meta.border,
                              meta.color,
                            )}
                          >
                            <span aria-hidden="true">{meta.mark}</span>
                            {issue.status}
                          </span>

                          <span className="hidden items-center gap-2 lg:flex">
                            <PriorityBars priority={issue.priority} />
                            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">
                              {issue.priority}
                            </span>
                          </span>

                          <span className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted lg:inline">
                            {formatDate(issue.updatedAt)}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Side panel — composing room + selection */}
              <aside
                id="create-issue-panel"
                className="grid gap-6 lg:sticky lg:top-[88px]"
              >
                {/* Composing room */}
                <div className="border border-ink bg-paper-soft">
                  <div className="flex items-baseline justify-between border-b border-ink/15 px-5 py-4">
                    <div>
                      <p className="eyebrow mb-1.5">Section B · Composing Room</p>
                      <h2
                        className="serif-tight text-[20px] font-medium leading-none tracking-tight text-ink"
                        style={{ fontWeight: 500 }}
                      >
                        File a <span className="serif-italic text-vermilion">new</span>{" "}
                        issue
                      </h2>
                    </div>
                    <span className="border border-ink/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                      ⌘K
                    </span>
                  </div>

                  <form
                    id="new-issue-form"
                    className="grid gap-5 px-5 py-5"
                    onSubmit={handleCreateIssue}
                  >
                    <div className="grid gap-2">
                      <Label htmlFor="issue-title">Title</Label>
                      <Input
                        id="issue-title"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Something that should exist"
                        required
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="issue-description">Description</Label>
                      <textarea
                        id="issue-description"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="Context, constraints, notes…"
                        className="min-h-28 w-full resize-y border border-ink/30 bg-paper-soft px-3 py-2.5 font-serif text-[14px] italic leading-relaxed text-ink outline-none transition-all duration-200 placeholder:text-ink-faint hover:border-ink focus-visible:border-vermilion focus-visible:ring-1 focus-visible:ring-vermilion"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="issue-status">Status</Label>
                        <select
                          id="issue-status"
                          value={status}
                          onChange={(event) => setStatus(event.target.value)}
                          className="h-10 w-full rounded-none border-0 border-b border-ink/40 bg-transparent px-1 font-mono text-[12px] uppercase tracking-[0.1em] text-ink outline-none transition-all duration-200 focus-visible:border-b-2 focus-visible:border-b-vermilion hover:border-b-ink"
                        >
                          {statusOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="issue-priority">Priority</Label>
                        <select
                          id="issue-priority"
                          value={priority}
                          onChange={(event) => setPriority(event.target.value)}
                          className="h-10 w-full rounded-none border-0 border-b border-ink/40 bg-transparent px-1 font-mono text-[12px] uppercase tracking-[0.1em] text-ink outline-none transition-all duration-200 focus-visible:border-b-2 focus-visible:border-b-vermilion hover:border-b-ink"
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

                {/* Selected issue card */}
                {selectedIssue ? (
                  <div className="border border-ink bg-paper-soft">
                    <div className="border-b border-ink/15 px-5 py-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                          Selected · P-{selectedIssue.id.slice(0, 4).toUpperCase()}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                          Folio
                        </span>
                      </div>
                      <h3
                        className="serif-tight text-[24px] font-medium leading-snug tracking-tight text-ink"
                        style={{ fontWeight: 500 }}
                      >
                        {selectedIssue.title}
                      </h3>
                      <p className="mt-2 font-serif text-[14px] italic leading-relaxed text-ink-muted">
                        {selectedIssue.description ?? "No description recorded yet."}
                      </p>
                    </div>

                    <div className="grid gap-4 px-5 py-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-2 border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]",
                            statusGlyph(selectedIssue.status).border,
                            statusGlyph(selectedIssue.status).color,
                          )}
                        >
                          <span aria-hidden="true">
                            {statusGlyph(selectedIssue.status).mark}
                          </span>
                          {selectedIssue.status}
                        </span>
                        <span className="inline-flex items-center gap-2 border border-ink/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">
                          <PriorityBars priority={selectedIssue.priority} />
                          {selectedIssue.priority}
                        </span>
                      </div>

                      <div className="grid grid-cols-[1fr_auto] gap-3 max-sm:grid-cols-1">
                        <select
                          aria-label="Selected issue status"
                          value={selectedIssue.status}
                          onChange={(event) =>
                            void handleStatusChange(selectedIssue, event.target.value)
                          }
                          className="h-10 w-full border border-ink/30 bg-paper px-3 font-mono text-[12px] uppercase tracking-[0.1em] text-ink outline-none transition-all duration-200 hover:border-ink focus-visible:border-vermilion focus-visible:ring-1 focus-visible:ring-vermilion"
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

                      <div className="ornament-rule pt-1">
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
                          Updated {formatDate(selectedIssue.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </aside>
            </section>

            {/* Colophon at the bottom */}
            <footer className="ornament-rule pt-2">
              <span className="font-serif italic text-[13px]">
                End of edition. Tomorrow's ledger reads itself.
              </span>
            </footer>
          </main>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
