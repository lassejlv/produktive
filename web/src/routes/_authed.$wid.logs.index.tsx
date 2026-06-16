import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Database, Lock, Plus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "#/lib/toast";
import { cn } from "#/lib/cn";
import { Button } from "#/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { Input } from "../components/Input";
import { PageActions } from "../components/PageLayout";
import { Spinner } from "#/components/ui/spinner";
import { Skeleton } from "#/components/ui/skeleton";
import {
  logAccessQuery,
  meQuery,
  useCreateLogProject,
  useLogAccess,
  useLogProjects,
  useMe,
  useRequestLogAccess,
} from "../lib/queries";
import type { LogAccessStatus, LogProject } from "../lib/types";
import { lastSeen } from "../lib/status";

export const Route = createFileRoute("/_authed/$wid/logs/")({
  staticData: {
    title: "Logs",
    description: "Log projects with dedicated search, ingest, and alerting workspaces.",
  },
  loader: async ({ context, params }) => {
    // Don't load projects here — the endpoint 403s without access. The page
    // resolves access first and only then fetches the project list.
    await Promise.all([
      context.queryClient.ensureQueryData(logAccessQuery(params.wid)),
      context.queryClient.ensureQueryData(meQuery),
    ]);
  },
  component: LogsPage,
});

function LogsPage() {
  const { wid } = Route.useParams();
  const navigate = useNavigate();
  const me = useMe();
  const access = useLogAccess(wid);
  const approved = access.data?.status === "approved";
  const projects = useLogProjects(wid, approved);
  const createProject = useCreateLogProject(wid);
  const [createOpen, setCreateOpen] = useState(false);

  const sorted = useMemo(
    () => [...(projects.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [projects.data],
  );

  return (
    <>
      <PageActions>
        <div className="flex flex-wrap items-center gap-2">
          {approved && me.data?.is_admin && (
            <Button
              render={<Link to="/$wid/settings/log-storage" params={{ wid }} />}
              type="button"
              variant="secondary"
              size="sm"
            >
              <Database size={14} /> Log storage
            </Button>
          )}
          {approved && (
            <Button type="button" variant="default" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={14} /> New project
            </Button>
          )}
        </div>
      </PageActions>

      <div className="relative">
        <div
          className={cn(
            "transition-opacity",
            !approved && "pointer-events-none select-none opacity-35 blur-[2px]",
          )}
          aria-hidden={!approved}
        >
          {!approved ? (
            <ProjectGridSkeleton />
          ) : projects.isLoading ? (
            <ProjectGridSkeleton />
          ) : sorted.length === 0 ? (
            <EmptyState
              icon={Database}
              title="No log projects"
              description="Create a project to receive log events through the ingest API."
              action={
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus size={14} /> New project
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sorted.map((project) => (
                <ProjectCard key={project.id} wid={wid} project={project} />
              ))}
            </div>
          )}
        </div>

        {access.isSuccess && !approved && (
          <RequestAccessOverlay wid={wid} status={access.data.status} />
        )}
      </div>

      <CreateProjectDialog
        open={createOpen}
        pending={createProject.isPending}
        onOpenChange={(open) => {
          if (!open && createProject.isPending) return;
          setCreateOpen(open);
        }}
        onSubmit={(body) =>
          createProject.mutate(body, {
            onSuccess: (project) => {
              toast.success("Log project created");
              setCreateOpen(false);
              navigate({ to: "/$wid/logs/$project", params: { wid, project: project.slug } });
            },
            onError: (err) => toast.error((err as Error).message),
          })
        }
      />
    </>
  );
}

function RequestAccessOverlay({ wid, status }: { wid: string; status: LogAccessStatus }) {
  const request = useRequestLogAccess(wid);
  const pending = status === "pending";
  const denied = status === "denied";

  const description = pending
    ? "Your request is in review. We'll unlock Logs for this workspace once it's approved."
    : denied
      ? "Your previous request was declined. You can submit a new request for review."
      : "Logs is in early access. Request access to start shipping, searching, and alerting on your logs.";

  return (
    <div className="absolute inset-0 z-10 flex items-start justify-center px-4 pt-10 sm:pt-16">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-6 text-center shadow-[var(--shadow-pop)]">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-row)] text-[var(--color-fg-muted)]">
          <Lock size={18} />
        </div>
        <h2 className="mt-4 text-[16px] font-medium text-[var(--color-fg)]">
          {pending ? "Access requested" : "Logs is in early access"}
        </h2>
        <p className="mt-2 text-[13px] leading-5 text-[var(--color-fg-muted)]">{description}</p>
        <div className="mt-5">
          {pending ? (
            <Button type="button" variant="secondary" size="sm" disabled>
              Request pending
            </Button>
          ) : (
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={request.isPending}
              onClick={() =>
                request.mutate(undefined, {
                  onSuccess: () => toast.success("Access requested"),
                  onError: (err) => toast.error((err as Error).message),
                })
              }
            >
              {request.isPending && <Spinner className="size-3" />}
              Request Access
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectGridSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="flex min-h-44 flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 shadow-[var(--shadow-sm)]"
        >
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-12 rounded-full" />
            </div>
            <Skeleton className="mt-4 h-3 w-2/3" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="col-span-2 h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectCard({ wid, project }: { wid: string; project: LogProject }) {
  return (
    <Link
      to="/$wid/logs/$project"
      params={{ wid, project: project.slug }}
      className="group flex min-h-44 flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 text-left no-underline shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-row)]"
    >
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-medium text-[var(--color-fg)]">
              {project.name}
            </h2>
            <div className="mono mt-1 truncate text-[11px] text-[var(--color-fg-muted)]">
              {project.slug}
            </div>
          </div>
          <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
            {project.retention_days}d
          </span>
        </div>
        {project.description && (
          <p className="mt-3 line-clamp-2 text-[12px] leading-5 text-[var(--color-fg-muted)]">
            {project.description}
          </p>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Metric label="24h events" value={formatCompact(project.event_count_24h)} />
        <Metric label="24h bytes" value={formatBytes(project.bytes_ingested_24h)} />
        <div className="col-span-2 truncate text-[11px] text-[var(--color-fg-muted)]">
          {project.last_ingested_at
            ? `last event ${lastSeen(project.last_ingested_at)}`
            : "no events yet"}
        </div>
      </div>
    </Link>
  );
}

function CreateProjectDialog({
  open,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: {
    name: string;
    slug?: string;
    description?: string;
    retention_days?: number;
  }) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    retention_days: "14",
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    onSubmit({
      name,
      slug: form.slug.trim() || undefined,
      description: form.description.trim() || undefined,
      retention_days: Number.parseInt(form.retention_days, 10) || 14,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New log project"
        size="lg"
        footer={
          <>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              form="create-log-project"
              variant="default"
              size="sm"
              disabled={pending}
            >
              {pending && <Spinner className="size-3" />}
              Create project
            </Button>
          </>
        }
      >
        <form id="create-log-project" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Name"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Production API"
            required
          />
          <Input
            label="Slug"
            value={form.slug}
            onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
            placeholder="prod-api"
            className="mono"
          />
          <Input
            label="Retention days"
            type="number"
            min={1}
            max={90}
            value={form.retention_days}
            onChange={(event) =>
              setForm((current) => ({ ...current, retention_days: event.target.value }))
            }
          />
          <Input
            label="Description"
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            placeholder="optional"
          />
        </form>
      </DialogContent>
    </Dialog>
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
