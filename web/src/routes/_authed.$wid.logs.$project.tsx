import { Link, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
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
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "#/lib/toast";
import { Button } from "#/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "#/components/ui/input-group";
import { Input as UIInput } from "#/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
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
  logAccessQuery,
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

const toolbarControlClass = cn(
  "h-8 min-w-0 rounded-[var(--radius-md)]",
  "border-[var(--color-border-hi)] bg-[var(--color-bg-elev)]",
  "!shadow-none !before:hidden",
  "focus-within:border-[var(--color-accent)] focus-within:!ring-2 focus-within:ring-[var(--ring-accent)]",
  "focus-visible:border-[var(--color-accent)] focus-visible:!ring-2 focus-visible:ring-[var(--ring-accent)]",
);

const fieldControlClass = cn(
  "h-8 w-full rounded-[var(--radius-md)] border border-[var(--color-border-hi)] bg-[var(--color-bg-elev)]",
  "px-2.5 text-[12px] text-[var(--color-fg)] shadow-[var(--shadow-xs)] outline-none",
  "focus:border-[var(--color-accent)] focus:shadow-[var(--ring-accent)]",
);

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
  loader: async ({ context, params }) => {
    const access = await context.queryClient.ensureQueryData(logAccessQuery(params.wid));
    if (access.status !== "approved") {
      throw redirect({ to: "/$wid/logs", params: { wid: params.wid } });
    }
    return context.queryClient.ensureQueryData(logProjectsQuery(params.wid));
  },
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
  const selectedEvent = filters.event
    ? (events.find((event) => event.event_id === filters.event) ?? null)
    : null;

  useEffect(() => {
    if (!events.length) {
      if (filters.event) updateSelectedEvent(undefined);
      return;
    }
    if (filters.event && !events.some((event) => event.event_id === filters.event)) {
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
      <header className="shrink-0 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <Link
                to="/$wid/logs"
                params={{ wid }}
                className="shrink-0 text-[var(--color-fg-muted)] no-underline hover:text-[var(--color-fg)]"
                aria-label="Back to log projects"
              >
                <ArrowLeft size={14} />
              </Link>
              <h1 className="truncate text-[15px] font-medium text-[var(--color-fg)]">
                {project.name}
              </h1>
            </div>
            <p className="mt-1 text-[12px] text-[var(--color-fg-dim)]">
              {formatCompact(project.event_count_24h)} events · {formatBytes(project.bytes_ingested_24h)}
              {project.last_ingested_at
                ? ` · last ${lastSeen(project.last_ingested_at)}`
                : " · no events yet"}
              <span className="text-[var(--color-fg-dim)]"> · beta</span>
            </p>
          </div>
          <div className="flex items-center gap-0.5">
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
        </div>
      </header>

      <form
        onSubmit={submit}
        className="grid shrink-0 grid-cols-2 gap-2 border-b border-[var(--color-border)] px-4 py-2 sm:grid-cols-[minmax(0,1fr)_6rem_7rem_5rem_auto_auto] sm:items-center"
      >
        <InputGroup className={cn(toolbarControlClass, "col-span-2 sm:col-span-1")}>
          <InputGroupAddon>
            <Search size={13} className="text-[var(--color-fg-dim)]" />
          </InputGroupAddon>
          <InputGroupInput
            size="sm"
            aria-label="Search query"
            value={draft.q}
            onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))}
            placeholder="Search logs…"
          />
        </InputGroup>

        <Select
          value={draft.level}
          onValueChange={(value) => {
            if (!value || !isLevelFilter(value)) return;
            setDraft((current) => ({ ...current, level: value }));
          }}
        >
          <SelectTrigger size="sm" className={cn(toolbarControlClass, "w-full")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEVELS.map((level) => (
              <SelectItem key={level} value={level}>
                {level}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <UIInput
          size="sm"
          aria-label="Service"
          value={draft.service}
          onChange={(event) => setDraft((current) => ({ ...current, service: event.target.value }))}
          placeholder="service"
          className={cn(toolbarControlClass, "w-full")}
        />

        <Select
          value={draft.range}
          onValueChange={(value) => {
            if (!value || !isTimeRange(value)) return;
            setDraft((current) => ({ ...current, range: value }));
          }}
        >
          <SelectTrigger size="sm" className={cn(toolbarControlClass, "w-full")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((range) => (
              <SelectItem key={range.value} value={range.value}>
                {range.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={search.isFetching}
          className="col-span-2 sm:col-span-1"
        >
          {search.isFetching ? <Spinner className="size-3" /> : "Run"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={search.isFetching}
          className="justify-self-end text-[var(--color-fg-muted)] sm:justify-self-auto"
          onClick={() => {
            setSubmittedAt(Date.now());
            search.refetch();
          }}
          aria-label="Refresh logs"
        >
          <RefreshCcw size={13} />
        </Button>
      </form>

      <div className="relative min-h-0 min-w-0 flex-1">
        <EventStream
          loading={search.isLoading}
          fetching={search.isFetching}
          events={events}
          selectedEventId={selectedEvent?.event_id ?? null}
          onSelect={(eventId) => updateSelectedEvent(eventId)}
        />
        {selectedEvent && (
          <>
            <button
              type="button"
              className="fade-in absolute inset-0 z-10 hidden bg-[color-mix(in_srgb,var(--color-bg)_55%,transparent)] xl:block"
              onClick={() => updateSelectedEvent(undefined)}
              aria-label="Close event details"
            />
            <EventInspector
              event={selectedEvent}
              onClose={() => updateSelectedEvent(undefined)}
            />
          </>
        )}
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
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {fetching && !loading && (
          <div className="absolute right-3 top-2 z-10 text-[11px] text-[var(--color-fg-dim)]">
            updating…
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
        "mono flex w-full min-w-0 items-baseline gap-2 px-4 py-1.5 text-left text-[12px] transition-colors",
        selected ? "bg-[var(--color-bg-row)]" : "hover:bg-[var(--color-bg-row)]/60",
      )}
    >
      <span className="shrink-0 tabular text-[var(--color-fg-dim)]">
        {new Date(event.timestamp).toLocaleTimeString()}
      </span>
      <LevelBadge level={event.level} />
      {event.service && (
        <span className="shrink-0 truncate text-[var(--color-fg-dim)]">{event.service}</span>
      )}
      <span className="min-w-0 truncate text-[var(--color-fg)]">{event.message}</span>
    </button>
  );
}

function EventInspector({
  event,
  onClose,
}: {
  event: LogSearchEvent;
  onClose: () => void;
}) {
  const payload = eventPayload(event);
  const meta = [
    ["received", new Date(event.received_at).toLocaleString()],
    ["environment", event.environment],
    ["operation", event.operation],
    ["request", event.request_id],
    ["trace", event.trace_id],
  ].filter(([, value]) => value) as Array<[string, string]>;

  return (
    <aside className="fade-in pointer-events-auto absolute bottom-4 right-4 top-4 z-20 hidden w-[min(400px,42vw)] xl:flex xl:flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-strong)] bg-[color-mix(in_srgb,var(--color-bg-elev)_90%,transparent)] shadow-[var(--shadow-pop)] ring-1 ring-[color-mix(in_srgb,var(--color-fg)_8%,transparent)] backdrop-blur-xl">
        <div className="flex items-start gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <LevelBadge level={event.level} />
              {event.service && (
                <span className="mono truncate text-[11px] text-[var(--color-fg-dim)]">
                  {event.service}
                </span>
              )}
            </div>
            <p className="mt-2 text-[13px] leading-snug text-[var(--color-fg)]">{event.message}</p>
            <p className="mono mt-1.5 text-[11px] text-[var(--color-fg-dim)]">
              {new Date(event.timestamp).toLocaleString()}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-[var(--color-fg-muted)]"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={14} />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            {meta.length > 0 && (
              <dl className="grid gap-2">
                {meta.map(([label, value]) => (
                  <div
                    key={label}
                    className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] gap-2 text-[11px]"
                  >
                    <dt className="text-[var(--color-fg-dim)]">{label}</dt>
                    <dd className="mono min-w-0 overflow-x-auto whitespace-nowrap text-[var(--color-fg)]">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {payload && <JsonBlock title={payload.title} value={payload.value} />}
          </div>
        </div>
      </div>
    </aside>
  );
}

function eventPayload(event: LogSearchEvent): { title: string; value: unknown } | null {
  const fieldsJson = hasJsonContent(event.fields) ? formatJson(event.fields) : null;
  const eventJson = hasJsonContent(event.event) ? formatJson(event.event) : null;

  if (fieldsJson && eventJson) {
    if (fieldsJson === eventJson) return { title: "Payload", value: event.fields };
    return { title: "Event", value: event.event };
  }
  if (fieldsJson) return { title: "Fields", value: event.fields };
  if (eventJson) return { title: "Event", value: event.event };
  return null;
}

function hasJsonContent(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.keys(value as object).length > 0;
  }
  return true;
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
        {title}
      </div>
      <pre className="mono max-h-[38vh] max-w-full overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-[11px] leading-5 text-[var(--color-fg)]">
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
          <div className="mt-4 rounded-[var(--radius-md)] bg-[var(--color-bg-row)] p-3">
            <div className="text-[11px] text-[var(--color-fg-dim)]">New token</div>
            <div className="mt-2 flex items-center gap-2">
              <code className="mono min-w-0 flex-1 truncate text-[12px] text-[var(--color-fg)]">
                {createdToken}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  navigator.clipboard.writeText(createdToken);
                  toast.success("Token copied");
                }}
              >
                <Copy size={12} /> Copy
              </Button>
            </div>
          </div>
        )}

        <div className="mt-5 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
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

        <div className="mt-5 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
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
      variant="ghost"
      size="xs"
      className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      onClick={onClick}
      data-testid={`log-tool-${tool}`}
    >
      <Icon size={12} /> {label}
    </Button>
  );
}

function LevelBadge({ level }: { level: string }) {
  return (
    <span
      className="mono shrink-0 pt-0.5 text-[10px] font-medium uppercase"
      style={{ color: levelColor(level) }}
    >
      {level}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-1">
      <div className="text-[11px] text-[var(--color-fg-dim)]">{label}</div>
      <div className="mt-0.5 text-[14px] text-[var(--color-fg)]">{value}</div>
    </div>
  );
}

function LogExplorerSkeleton() {
  return (
    <div className="fade-in flex min-h-0 flex-1 flex-col bg-[var(--color-bg)]">
      <header className="shrink-0 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-56" />
          </div>
          <div className="flex gap-1">
            <Skeleton className="h-7 w-16 rounded-md" />
            <Skeleton className="h-7 w-16 rounded-md" />
            <Skeleton className="h-7 w-16 rounded-md" />
          </div>
        </div>
      </header>
      <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-[var(--color-border)] px-4 py-2 sm:grid-cols-[minmax(0,1fr)_6rem_7rem_5rem_auto_auto]">
        <Skeleton className="col-span-2 h-8 rounded-[var(--radius-md)] sm:col-span-1" />
        <Skeleton className="h-8 rounded-[var(--radius-md)]" />
        <Skeleton className="h-8 rounded-[var(--radius-md)]" />
        <Skeleton className="h-8 rounded-[var(--radius-md)]" />
        <Skeleton className="col-span-2 h-8 rounded-[var(--radius-md)] sm:col-span-1" />
        <Skeleton className="size-8 justify-self-end rounded-[var(--radius-md)] sm:justify-self-auto" />
      </div>
      <div className="relative min-h-0 flex-1">
        <EventStreamSkeleton />
      </div>
    </div>
  );
}

function EventStreamSkeleton() {
  return (
    <div className="min-h-72 divide-y divide-[var(--color-border)]">
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className="flex gap-3 px-4 py-2">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-10" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-full" />
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
