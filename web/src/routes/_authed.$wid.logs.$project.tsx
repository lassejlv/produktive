import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Bell,
  Copy,
  KeyRound,
  MoreHorizontal,
  RefreshCcw,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "#/lib/toast";
import { Button } from "#/components/ui/button";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet";
import { Skeleton } from "#/components/ui/skeleton";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Input } from "../components/Input";
import { Spinner } from "#/components/ui/spinner";
import {
  logProjectsQuery,
  useCreateLogAlert,
  useCreateLogToken,
  useDeleteLogAlert,
  useDeleteLogProject,
  useLogAlerts,
  useLogProjects,
  useLogSearch,
  useLogTokens,
  useRevokeLogToken,
} from "../lib/queries";
import type { LogAlertRule, LogProject, LogSearchEvent } from "../lib/types";
import { lastSeen } from "../lib/status";
import { cn } from "#/lib/cn";

const fieldControlClass =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-hi)] bg-[var(--color-bg-elev)] px-3 text-[13px] text-[var(--color-fg)] shadow-[var(--shadow-xs)] outline-none transition-[border-color,box-shadow] focus:border-[var(--color-accent)] focus:shadow-[var(--ring-accent)]";

type LevelFilter = "all" | "trace" | "debug" | "info" | "warn" | "error" | "fatal";
type TimeRange = "15m" | "1h" | "6h" | "24h";
type ToolsSheet = "tokens" | "alerts" | "project" | null;
type LogExplorerSearch = {
  q?: string;
  level?: LevelFilter;
  service?: string;
  range?: TimeRange;
  event?: string;
};
type LogExplorerFilters = {
  q: string;
  level: LevelFilter;
  service: string;
  range: TimeRange;
  event?: string;
};

const LEVELS: LevelFilter[] = ["all", "trace", "debug", "info", "warn", "error", "fatal"];
const RANGES: Array<{ value: TimeRange; label: string; ms: number }> = [
  { value: "15m", label: "15m", ms: 15 * 60 * 1000 },
  { value: "1h", label: "1h", ms: 60 * 60 * 1000 },
  { value: "6h", label: "6h", ms: 6 * 60 * 60 * 1000 },
  { value: "24h", label: "24h", ms: 24 * 60 * 60 * 1000 },
];

export const Route = createFileRoute("/_authed/$wid/logs/$project")({
  validateSearch: (search: Record<string, unknown>): LogExplorerSearch => ({
    q: readSearchString(search.q),
    level: isLevelFilter(search.level) ? search.level : undefined,
    service: readSearchString(search.service),
    range: isTimeRange(search.range) ? search.range : undefined,
    event: readSearchString(search.event),
  }),
  staticData: {
    title: "Log explorer",
    layout: "bleed",
    parent: { label: "Logs", to: "/$wid/logs" },
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(logProjectsQuery(params.wid)),
  component: LogExplorerRoute,
});

function LogExplorerRoute() {
  const { wid, project: projectParam } = Route.useParams();
  const searchParams = Route.useSearch();
  const navigate = useNavigate();
  const projects = useLogProjects(wid);
  const deleteProject = useDeleteLogProject(wid);
  const [activeSheet, setActiveSheet] = useState<ToolsSheet>(null);
  const [toDelete, setToDelete] = useState<LogProject | null>(null);

  const sorted = useMemo(
    () => [...(projects.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [projects.data],
  );
  const project =
    sorted.find((item) => item.slug === projectParam || item.id === projectParam) ?? null;

  if (projects.isLoading) return <LogExplorerSkeleton />;

  if (!project) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-[15px] font-medium text-[var(--color-fg)]">Log project not found</div>
        <Link
          to="/$wid/logs"
          params={{ wid }}
          className="text-[13px] text-[var(--color-link)] no-underline hover:underline"
        >
          Back to logs
        </Link>
      </div>
    );
  }

  return (
    <>
      <LogExplorer
        wid={wid}
        project={project}
        searchParams={searchParams}
        activeSheet={activeSheet}
        onSheetChange={setActiveSheet}
        onDeleteProject={() => setToDelete(project)}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title={`Delete "${toDelete?.name}"?`}
        description="The project, tokens, usage rollups, alert rules, and alert firing records will be deleted. Existing object storage files are not removed."
        confirmLabel="Delete project"
        destructive
        pending={deleteProject.isPending}
        onConfirm={() => {
          if (!toDelete) return;
          deleteProject.mutate(toDelete.slug, {
            onSuccess: () => {
              toast.success("Log project deleted");
              setToDelete(null);
              navigate({ to: "/$wid/logs", params: { wid } });
            },
            onError: (err) => toast.error((err as Error).message),
          });
        }}
      />
    </>
  );
}

function LogExplorer({
  wid,
  project,
  searchParams,
  activeSheet,
  onSheetChange,
  onDeleteProject,
}: {
  wid: string;
  project: LogProject;
  searchParams: LogExplorerSearch;
  activeSheet: ToolsSheet;
  onSheetChange: (sheet: ToolsSheet) => void;
  onDeleteProject: () => void;
}) {
  const navigate = useNavigate();
  const filters = useMemo(
    () => normalizeLogExplorerSearch(searchParams),
    [
      searchParams.event,
      searchParams.level,
      searchParams.q,
      searchParams.range,
      searchParams.service,
    ],
  );
  const [draft, setDraft] = useState<LogExplorerFilters>(filters);
  const [submittedAt, setSubmittedAt] = useState(() => Date.now());

  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  const updateSearch = useCallback(
    (next: LogExplorerFilters, replace = true) => {
      navigate({
        to: "/$wid/logs/$project",
        params: { wid, project: project.slug },
        search: compactLogExplorerSearch(next),
        replace,
      });
    },
    [navigate, project.slug, wid],
  );

  const updateSelectedEvent = useCallback(
    (eventId?: string, replace = true) => {
      updateSearch({ ...filters, event: eventId }, replace);
    },
    [filters, updateSearch],
  );

  const input = useMemo(() => {
    const range = RANGES.find((item) => item.value === filters.range) ?? RANGES[1];
    return {
      q: filters.q || undefined,
      level: filters.level,
      service: filters.service || undefined,
      from: new Date(submittedAt - range.ms).toISOString(),
      limit: 250,
    };
  }, [filters, submittedAt]);

  const search = useLogSearch(wid, project.slug, input);
  const events = search.data?.events ?? [];
  const selectedEvent =
    events.find((event) => event.event_id === filters.event) ?? events[0] ?? null;

  useEffect(() => {
    if (!events.length) {
      if (filters.event) updateSelectedEvent(undefined);
      return;
    }
    if (!filters.event || !events.some((event) => event.event_id === filters.event)) {
      updateSelectedEvent(events[0].event_id);
    }
  }, [events, filters.event, updateSelectedEvent]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmittedAt(Date.now());
    updateSearch({ ...draft, event: undefined }, false);
  }

  return (
    <div className="fade-in flex min-h-0 flex-1 flex-col bg-[var(--color-bg)]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            render={<Link to="/$wid/logs" params={{ wid }} />}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Back to log projects"
          >
            <ArrowLeft size={15} />
          </Button>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate text-[16px] font-medium text-[var(--color-fg)]">
                {project.name}
              </h1>
              <span className="mono rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-fg-muted)]">
                {project.slug}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--color-fg-muted)]">
              <span>{formatCompact(project.event_count_24h)} events in 24h</span>
              <span>{formatBytes(project.bytes_ingested_24h)} in 24h</span>
              <span>
                {project.last_ingested_at
                  ? `last ${lastSeen(project.last_ingested_at)}`
                  : "no events yet"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ToolButton
            tool="tokens"
            icon={KeyRound}
            label="Tokens"
            onClick={() => onSheetChange("tokens")}
          />
          <ToolButton
            tool="alerts"
            icon={Bell}
            label="Alerts"
            onClick={() => onSheetChange("alerts")}
          />
          <ToolButton
            tool="project"
            icon={MoreHorizontal}
            label="Project"
            onClick={() => onSheetChange("project")}
          />
        </div>
      </header>

      <form
        onSubmit={submit}
        className="grid shrink-0 gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] p-3 lg:grid-cols-[minmax(240px,1fr)_120px_150px_120px_auto]"
      >
        <Input
          aria-label="Search query"
          value={draft.q}
          onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))}
          placeholder="message, request id, trace id"
          leading={<Search size={14} />}
        />
        <select
          aria-label="Level"
          value={draft.level}
          onChange={(event) =>
            setDraft((current) => ({ ...current, level: event.target.value as LevelFilter }))
          }
          className={cn(fieldControlClass, "h-9")}
        >
          {LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
        <Input
          aria-label="Service"
          value={draft.service}
          onChange={(event) => setDraft((current) => ({ ...current, service: event.target.value }))}
          placeholder="service"
        />
        <select
          aria-label="Time range"
          value={draft.range}
          onChange={(event) =>
            setDraft((current) => ({ ...current, range: event.target.value as TimeRange }))
          }
          className={cn(fieldControlClass, "h-9")}
        >
          {RANGES.map((range) => (
            <option key={range.value} value={range.value}>
              {range.label}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Button type="submit" variant="default" size="sm" disabled={search.isFetching}>
            {search.isFetching && <Spinner className="size-3" />}
            Search
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={search.isFetching}
            onClick={() => {
              setSubmittedAt(Date.now());
              search.refetch();
            }}
            aria-label="Refresh logs"
          >
            <RefreshCcw size={13} />
          </Button>
        </div>
      </form>

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px]">
        <EventStream
          loading={search.isLoading}
          fetching={search.isFetching}
          events={events}
          selectedEventId={selectedEvent?.event_id ?? null}
          onSelect={(eventId) => updateSelectedEvent(eventId)}
        />
        <EventInspector event={selectedEvent} storage={search.data?.storage} />
      </div>

      <ExplorerSheet
        open={activeSheet === "tokens"}
        onOpenChange={(open) => onSheetChange(open ? "tokens" : null)}
      >
        <TokensSheet wid={wid} project={project} />
      </ExplorerSheet>
      <ExplorerSheet
        open={activeSheet === "alerts"}
        onOpenChange={(open) => onSheetChange(open ? "alerts" : null)}
      >
        <AlertsSheet wid={wid} project={project} />
      </ExplorerSheet>
      <ExplorerSheet
        open={activeSheet === "project"}
        onOpenChange={(open) => onSheetChange(open ? "project" : null)}
      >
        <ProjectSheet project={project} onDelete={onDeleteProject} />
      </ExplorerSheet>
    </div>
  );
}

function EventStream({
  loading,
  fetching,
  events,
  selectedEventId,
  onSelect,
}: {
  loading: boolean;
  fetching: boolean;
  events: LogSearchEvent[];
  selectedEventId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col">
      <div className="grid shrink-0 grid-cols-[150px_86px_150px_minmax(0,1fr)] border-b border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)] max-md:hidden">
        <span>Time</span>
        <span>Level</span>
        <span>Service</span>
        <span>Message</span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {fetching && !loading && (
          <div className="absolute right-3 top-3 z-10 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-1 text-[11px] text-[var(--color-fg-muted)] shadow-[var(--shadow-sm)]">
            updating
          </div>
        )}
        {loading ? (
          <EventStreamSkeleton />
        ) : events.length ? (
          <div className="divide-y divide-[var(--color-border)]">
            {events.map((event) => (
              <EventRow
                key={event.event_id}
                event={event}
                selected={event.event_id === selectedEventId}
                onClick={() => onSelect(event.event_id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-72 items-center justify-center px-6 text-center text-[13px] text-[var(--color-fg-muted)]">
            No events matched this search.
          </div>
        )}
      </div>
    </section>
  );
}

function EventRow({
  event,
  selected,
  onClick,
}: {
  event: LogSearchEvent;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "grid w-full gap-2 px-3 py-2.5 text-left transition-colors md:grid-cols-[150px_86px_150px_minmax(0,1fr)]",
        selected ? "bg-[var(--color-accent-soft)]" : "hover:bg-[var(--color-bg-row)]",
      )}
    >
      <div className="mono text-[11px] text-[var(--color-fg-dim)]">
        {new Date(event.timestamp).toLocaleTimeString()}
      </div>
      <div>
        <LevelBadge level={event.level} />
      </div>
      <div className="min-w-0 truncate text-[12px] text-[var(--color-fg-muted)]">
        {event.service ?? "unknown"}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[13px] text-[var(--color-fg)]">{event.message}</div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--color-fg-muted)]">
          {event.environment && <span>{event.environment}</span>}
          {event.operation && <span>{event.operation}</span>}
          {event.request_id && <span className="mono">request {event.request_id}</span>}
          {event.trace_id && <span className="mono">trace {event.trace_id}</span>}
        </div>
      </div>
    </button>
  );
}

function EventInspector({
  event,
  storage,
}: {
  event: LogSearchEvent | null;
  storage?: { storage_uri: string; backend: string };
}) {
  return (
    <aside className="hidden min-h-0 min-w-0 overflow-hidden border-l border-[var(--color-border)] bg-[var(--color-bg-elev)] xl:flex xl:flex-col">
      <div className="shrink-0 border-b border-[var(--color-border)] px-4 py-3">
        <div className="text-[13px] font-medium text-[var(--color-fg)]">Event detail</div>
        {storage && (
          <div className="mono mt-1 overflow-x-auto whitespace-nowrap text-[10px] text-[var(--color-fg-muted)]">
            {storage.backend}: {storage.storage_uri}
          </div>
        )}
      </div>
      {event ? (
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
          <div className="min-w-0 space-y-4">
            <InspectorGroup
              rows={[
                ["timestamp", new Date(event.timestamp).toLocaleString()],
                ["received", new Date(event.received_at).toLocaleString()],
                ["level", event.level],
                ["service", event.service],
                ["environment", event.environment],
                ["operation", event.operation],
                ["request", event.request_id],
                ["trace", event.trace_id],
              ]}
            />
            <JsonBlock title="Fields" value={event.fields} />
            <JsonBlock title="Event" value={event.event} />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-[13px] text-[var(--color-fg-muted)]">
          Select an event.
        </div>
      )}
    </aside>
  );
}

function InspectorGroup({ rows }: { rows: Array<[string, string | null]> }) {
  return (
    <div className="min-w-0 divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
      {rows
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label} className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] gap-3 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
              {label}
            </div>
            <div className="mono min-w-0 overflow-x-auto whitespace-nowrap text-[11px] text-[var(--color-fg)]">
              {value}
            </div>
          </div>
        ))}
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
        {title}
      </div>
      <pre className="mono max-h-[42vh] max-w-full overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] p-3 text-[11px] leading-5 text-[var(--color-fg)]">
        {formatJson(value)}
      </pre>
    </div>
  );
}

function ExplorerSheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPopup side="right" className="max-w-xl">
        {children}
      </SheetPopup>
    </Sheet>
  );
}

function TokensSheet({ wid, project }: { wid: string; project: LogProject }) {
  const tokens = useLogTokens(wid, project.slug);
  const create = useCreateLogToken(wid, project.slug);
  const revoke = useRevokeLogToken(wid, project.slug);
  const [name, setName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed },
      {
        onSuccess: (result) => {
          toast.success("Token created");
          setCreatedToken(result.token);
          setName("");
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Ingest tokens</SheetTitle>
        <SheetDescription>{project.name}</SheetDescription>
      </SheetHeader>
      <SheetPanel>
        <form onSubmit={submit} className="flex gap-2">
          <Input
            aria-label="Token name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="prod api"
          />
          <Button
            type="submit"
            variant="default"
            size="sm"
            disabled={create.isPending || !name.trim()}
          >
            {create.isPending && <Spinner className="size-3" />}
            Create
          </Button>
        </form>

        {createdToken && (
          <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] p-3">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
              New token
            </div>
            <div className="mt-2 flex items-center gap-2">
              <code className="mono min-w-0 flex-1 truncate rounded-[var(--radius-sm)] bg-[var(--color-bg-elev)] px-2 py-1 text-[12px] text-[var(--color-fg)]">
                {createdToken}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(createdToken);
                  toast.success("Token copied");
                }}
              >
                <Copy size={13} /> Copy
              </Button>
            </div>
          </div>
        )}

        <div className="mt-5 divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
          {tokens.isLoading ? (
            <SheetListSkeleton />
          ) : tokens.data?.length ? (
            tokens.data.map((token) => (
              <div key={token.id} className="flex items-center justify-between gap-3 px-3 py-3">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-[var(--color-fg)]">
                    {token.name}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--color-fg-muted)]">
                    <span className="mono">{token.token_prefix}...</span>
                    <span>
                      {token.last_used_at ? `used ${lastSeen(token.last_used_at)}` : "never used"}
                    </span>
                    {token.revoked_at && <span>revoked {lastSeen(token.revoked_at)}</span>}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={revoke.isPending || !!token.revoked_at}
                  onClick={() =>
                    revoke.mutate(token.id, {
                      onSuccess: () => toast.success("Token revoked"),
                      onError: (err) => toast.error((err as Error).message),
                    })
                  }
                  aria-label={`Revoke token ${token.name}`}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ))
          ) : (
            <EmptyPanel label="No ingest tokens." />
          )}
        </div>
      </SheetPanel>
    </>
  );
}

function AlertsSheet({ wid, project }: { wid: string; project: LogProject }) {
  const alerts = useLogAlerts(wid, project.slug);
  const create = useCreateLogAlert(wid, project.slug);
  const remove = useDeleteLogAlert(wid, project.slug);
  const [form, setForm] = useState({
    name: "",
    query: "",
    level: "error" as LevelFilter,
    threshold_count: "1",
    window_seconds: "300",
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    create.mutate(
      {
        name,
        query: form.query.trim(),
        level: form.level === "all" ? null : form.level,
        threshold_count: Number.parseInt(form.threshold_count, 10) || 1,
        window_seconds: Number.parseInt(form.window_seconds, 10) || 300,
        enabled: true,
      },
      {
        onSuccess: () => {
          toast.success("Alert rule created");
          setForm({
            name: "",
            query: "",
            level: "error",
            threshold_count: "1",
            window_seconds: "300",
          });
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Alert rules</SheetTitle>
        <SheetDescription>{project.name}</SheetDescription>
      </SheetHeader>
      <SheetPanel>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Input
            aria-label="Alert name"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="error burst"
            required
          />
          <select
            aria-label="Level"
            value={form.level}
            onChange={(event) =>
              setForm((current) => ({ ...current, level: event.target.value as LevelFilter }))
            }
            className={cn(fieldControlClass, "h-9")}
          >
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
          <Input
            aria-label="Alert query"
            value={form.query}
            onChange={(event) => setForm((current) => ({ ...current, query: event.target.value }))}
            placeholder="checkout"
          />
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Input
              aria-label="Threshold"
              type="number"
              min={1}
              value={form.threshold_count}
              onChange={(event) =>
                setForm((current) => ({ ...current, threshold_count: event.target.value }))
              }
            />
            <Input
              aria-label="Window seconds"
              type="number"
              min={60}
              value={form.window_seconds}
              onChange={(event) =>
                setForm((current) => ({ ...current, window_seconds: event.target.value }))
              }
            />
            <Button type="submit" variant="default" size="sm" disabled={create.isPending}>
              {create.isPending && <Spinner className="size-3" />}
              Add
            </Button>
          </div>
        </form>

        <div className="mt-5 divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
          {alerts.isLoading ? (
            <SheetListSkeleton />
          ) : alerts.data?.length ? (
            alerts.data.map((rule) => (
              <AlertRow
                key={rule.id}
                rule={rule}
                pending={remove.isPending}
                onDelete={() =>
                  remove.mutate(rule.id, {
                    onSuccess: () => toast.success("Alert rule deleted"),
                    onError: (err) => toast.error((err as Error).message),
                  })
                }
              />
            ))
          ) : (
            <EmptyPanel label="No alert rules." />
          )}
        </div>
      </SheetPanel>
    </>
  );
}

function ProjectSheet({ project, onDelete }: { project: LogProject; onDelete: () => void }) {
  return (
    <>
      <SheetHeader>
        <SheetTitle>Project</SheetTitle>
        <SheetDescription>{project.name}</SheetDescription>
      </SheetHeader>
      <SheetPanel>
        <div className="space-y-4">
          <InspectorGroup
            rows={[
              ["slug", project.slug],
              ["retention", `${project.retention_days} days`],
              ["bucket", project.bucket_name ?? "Default log storage"],
              ["storage", project.bucket_storage_uri ?? "LOG_STORAGE_URI"],
              ["created", new Date(project.created_at).toLocaleString()],
              ["updated", new Date(project.updated_at).toLocaleString()],
            ]}
          />
          <div className="grid grid-cols-2 gap-2">
            <Metric label="24h events" value={formatCompact(project.event_count_24h)} />
            <Metric label="24h bytes" value={formatBytes(project.bytes_ingested_24h)} />
          </div>
          <Button type="button" variant="destructive-outline" size="sm" onClick={onDelete}>
            <Trash2 size={13} /> Delete project
          </Button>
        </div>
      </SheetPanel>
    </>
  );
}

function AlertRow({
  rule,
  pending,
  onDelete,
}: {
  rule: LogAlertRule;
  pending: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-[var(--color-fg)]">{rule.name}</div>
        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--color-fg-muted)]">
          <span>{rule.level ?? "any level"}</span>
          <span>
            {rule.threshold_count} in {rule.window_seconds}s
          </span>
          {rule.query && <span className="mono truncate">{rule.query}</span>}
          {!rule.enabled && <span>disabled</span>}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        onClick={onDelete}
        aria-label={`Delete alert ${rule.name}`}
      >
        <Trash2 size={13} />
      </Button>
    </div>
  );
}

function ToolButton({
  tool,
  icon: Icon,
  label,
  onClick,
}: {
  tool: "tokens" | "alerts" | "project";
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={onClick}
      data-testid={`log-tool-${tool}`}
    >
      <Icon size={13} /> {label}
    </Button>
  );
}

function LevelBadge({ level }: { level: string }) {
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]"
      style={{
        color: levelColor(level),
        background: `color-mix(in srgb, ${levelColor(level)} 10%, transparent)`,
      }}
    >
      {level}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
        {label}
      </div>
      <div className="mt-1 text-[15px] font-medium text-[var(--color-fg)]">{value}</div>
    </div>
  );
}

function LogExplorerSkeleton() {
  return (
    <div className="fade-in flex min-h-0 flex-1 flex-col bg-[var(--color-bg)]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-72" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </header>
      <div className="grid shrink-0 gap-2 border-b border-[var(--color-border)] p-3 lg:grid-cols-[minmax(240px,1fr)_120px_150px_120px_auto]">
        <Skeleton className="h-9 rounded-lg" />
        <Skeleton className="h-9 rounded-lg" />
        <Skeleton className="h-9 rounded-lg" />
        <Skeleton className="h-9 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px]">
        <EventStreamSkeleton />
        <aside className="hidden border-l border-[var(--color-border)] bg-[var(--color-bg-elev)] xl:block">
          <div className="space-y-3 border-b border-[var(--color-border)] p-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-full" />
          </div>
          <div className="space-y-4 p-4">
            <Skeleton className="h-48 rounded-lg" />
            <Skeleton className="h-36 rounded-lg" />
          </div>
        </aside>
      </div>
    </div>
  );
}

function EventStreamSkeleton() {
  return (
    <div className="min-h-72 divide-y divide-[var(--color-border)]">
      {Array.from({ length: 12 }).map((_, index) => (
        <div
          key={index}
          className="grid gap-2 px-3 py-3 md:grid-cols-[150px_86px_150px_minmax(0,1fr)]"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-3 w-20" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SheetListSkeleton() {
  return (
    <div className="divide-y divide-[var(--color-border)]">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="space-y-2 px-3 py-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-56" />
        </div>
      ))}
    </div>
  );
}

function EmptyPanel({ label }: { label: string }) {
  return (
    <div className="px-4 py-8 text-center text-[13px] text-[var(--color-fg-muted)]">{label}</div>
  );
}

function readSearchString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function isLevelFilter(value: unknown): value is LevelFilter {
  return typeof value === "string" && LEVELS.includes(value as LevelFilter);
}

function isTimeRange(value: unknown): value is TimeRange {
  return typeof value === "string" && RANGES.some((range) => range.value === value);
}

function normalizeLogExplorerSearch(search: LogExplorerSearch): LogExplorerFilters {
  return {
    q: search.q ?? "",
    level: search.level ?? "all",
    service: search.service ?? "",
    range: search.range ?? "1h",
    event: search.event,
  };
}

function compactLogExplorerSearch(filters: LogExplorerFilters): LogExplorerSearch {
  return {
    q: filters.q.trim() || undefined,
    level: filters.level === "all" ? undefined : filters.level,
    service: filters.service.trim() || undefined,
    range: filters.range === "1h" ? undefined : filters.range,
    event: filters.event,
  };
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let n = value / 1024;
  for (const unit of units) {
    if (n < 1024) return `${n.toFixed(n >= 10 ? 0 : 1)} ${unit}`;
    n /= 1024;
  }
  return `${n.toFixed(1)} PB`;
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(value);
}

function levelColor(level: string): string {
  if (level === "error" || level === "fatal") return "var(--color-err)";
  if (level === "warn" || level === "warning") return "var(--color-warn)";
  if (level === "debug" || level === "trace") return "var(--color-fg-muted)";
  return "var(--color-accent)";
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return "{}";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
