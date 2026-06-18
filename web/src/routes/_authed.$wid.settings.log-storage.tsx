import { createFileRoute, redirect } from "@tanstack/react-router";
import { CheckCircle2, Database, PauseCircle, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "#/lib/toast";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { Input } from "../components/Input";
import { PageActions } from "../components/PageLayout";
import { Spinner } from "#/components/ui/spinner";
import {
  adminLogBucketsQuery,
  meQuery,
  useAdminLogBuckets,
  useCreateLogBucket,
  useDeleteLogBucket,
  useUpdateLogBucket,
} from "../lib/queries";
import type { AdminLogBucket } from "../lib/types";
import { LOGS_ENABLED } from "#/lib/features";
import { lastSeen } from "../lib/status";

export const Route = createFileRoute("/_authed/$wid/settings/log-storage")({
  staticData: {
    title: "Settings",
    description: "S3-compatible log storage buckets and project assignment capacity.",
  },
  beforeLoad: async ({ context, params }) => {
    if (!LOGS_ENABLED) {
      throw redirect({ to: "/$wid/settings", params: { wid: params.wid } });
    }
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me.is_admin) {
      throw redirect({ to: "/$wid", params: { wid: params.wid } });
    }
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(adminLogBucketsQuery),
  component: LogStorageSettingsPage,
});

function LogStorageSettingsPage() {
  const buckets = useAdminLogBuckets();
  const create = useCreateLogBucket();
  const update = useUpdateLogBucket();
  const remove = useDeleteLogBucket();
  const [form, setForm] = useState({
    name: "",
    bucket_name: "",
    prefix: "logs",
    region: "",
    endpoint: "",
    access_key_id: "",
    secret_access_key: "",
    max_projects: "100",
    enabled: true,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AdminLogBucket | null>(null);

  const sorted = useMemo(
    () =>
      [...(buckets.data ?? [])].sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        if (a.project_count !== b.project_count) return a.project_count - b.project_count;
        return a.name.localeCompare(b.name);
      }),
    [buckets.data],
  );

  const totalCapacity = sorted.reduce((sum, bucket) => sum + bucket.max_projects, 0);
  const assignedProjects = sorted.reduce((sum, bucket) => sum + bucket.project_count, 0);

  function submit(event: FormEvent) {
    event.preventDefault();
    const name = form.name.trim();
    const bucketName = form.bucket_name.trim();
    if (!name || !bucketName) {
      toast.error("Name and bucket name are required");
      return;
    }
    const storageUri = storageUriForBucket(bucketName, form.prefix);
    create.mutate(
      {
        name,
        storage_uri: storageUri,
        region: nullable(form.region),
        endpoint: nullable(form.endpoint),
        access_key_id: nullable(form.access_key_id),
        secret_access_key: nullable(form.secret_access_key),
        max_projects: Number.parseInt(form.max_projects, 10) || 100,
        enabled: form.enabled,
      },
      {
        onSuccess: () => {
          toast.success("Log bucket added");
          setCreateOpen(false);
          setForm({
            name: "",
            bucket_name: "",
            prefix: "logs",
            region: "",
            endpoint: "",
            access_key_id: "",
            secret_access_key: "",
            max_projects: "100",
            enabled: true,
          });
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  return (
    <>
      <PageActions>
        <Button type="button" variant="default" size="sm" onClick={() => setCreateOpen((v) => !v)}>
          <Plus size={14} /> Add bucket
        </Button>
      </PageActions>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Metric label="Buckets" value={String(sorted.length)} />
          <Metric label="Enabled" value={String(sorted.filter((b) => b.enabled).length)} />
          <Metric label="Assigned" value={`${assignedProjects}/${totalCapacity || 0}`} />
        </div>

        {createOpen && (
          <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 shadow-[var(--shadow-sm)]">
            <form id="create-log-bucket" onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
              <Input
                label="Name"
                value={form.name}
                onChange={(event) => setFormValue(setForm, "name", event.target.value)}
                placeholder="EU logs primary"
                required
              />
              <Input
                label="Bucket name"
                value={form.bucket_name}
                onChange={(event) => setFormValue(setForm, "bucket_name", event.target.value)}
                placeholder="expandable-stand"
                className="mono"
                required
              />
              <Input
                label="Region"
                value={form.region}
                onChange={(event) => setFormValue(setForm, "region", event.target.value)}
                placeholder="eu-west-1"
              />
              <Input
                label="Endpoint"
                value={form.endpoint}
                onChange={(event) => {
                  const endpoint = event.target.value;
                  setForm((current) => ({
                    ...current,
                    endpoint,
                    bucket_name: current.bucket_name || bucketNameFromEndpoint(endpoint),
                  }));
                }}
                placeholder="https://s3.eu-west-1.amazonaws.com"
              />
              <Input
                label="Path prefix"
                value={form.prefix}
                onChange={(event) => setFormValue(setForm, "prefix", event.target.value)}
                placeholder="logs"
                className="mono"
              />
              <Input
                label="Access key ID"
                value={form.access_key_id}
                onChange={(event) => setFormValue(setForm, "access_key_id", event.target.value)}
                className="mono"
              />
              <Input
                label="Secret access key"
                type="password"
                value={form.secret_access_key}
                onChange={(event) => setFormValue(setForm, "secret_access_key", event.target.value)}
                className="mono"
              />
              <Input
                label="Project capacity"
                type="number"
                min={1}
                max={10000}
                value={form.max_projects}
                onChange={(event) => setFormValue(setForm, "max_projects", event.target.value)}
              />
              <label className="flex h-full min-h-16 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 text-[13px] text-[var(--color-fg-muted)]">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) => setFormValue(setForm, "enabled", event.target.checked)}
                />
                Enabled for new projects
              </label>
              <div className="lg:col-span-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
                  Storage URI
                </div>
                <div className="mono mt-1 truncate text-[12px] text-[var(--color-fg-muted)]">
                  {form.bucket_name.trim()
                    ? storageUriForBucket(form.bucket_name, form.prefix)
                    : "s3://<bucket>/logs"}
                </div>
              </div>
              <div className="flex justify-end gap-2 lg:col-span-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={create.isPending}
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="default" size="sm" disabled={create.isPending}>
                  {create.isPending && <Spinner className="size-3" />}
                  Save bucket
                </Button>
              </div>
            </form>
          </section>
        )}

        {buckets.isLoading ? (
          <div className="flex h-40 items-center justify-center text-[13px] text-[var(--color-fg-muted)]">
            <Spinner className="size-3.75" />
            <span className="ml-2">loading buckets...</span>
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={Database}
            title="No log buckets"
            description="Projects will use the default log storage URI until a bucket is added."
            action={
              <Button type="button" variant="default" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus size={14} /> Add bucket
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]">
            <div className="grid grid-cols-[minmax(210px,1.2fr)_minmax(240px,1.4fr)_120px_190px] border-b border-[var(--color-border)] bg-[var(--color-bg-row)] px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)] max-lg:hidden">
              <span>Bucket</span>
              <span>Storage</span>
              <span>Capacity</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {sorted.map((bucket) => (
                <BucketRow
                  key={bucket.id}
                  bucket={bucket}
                  pending={update.isPending || remove.isPending}
                  onToggle={(enabled) =>
                    update.mutate(
                      { id: bucket.id, enabled },
                      {
                        onSuccess: () =>
                          toast.success(enabled ? "Bucket enabled" : "Bucket disabled"),
                        onError: (err) => toast.error((err as Error).message),
                      },
                    )
                  }
                  onCapacity={(max_projects) =>
                    update.mutate(
                      { id: bucket.id, max_projects },
                      {
                        onSuccess: () => toast.success("Bucket capacity updated"),
                        onError: (err) => toast.error((err as Error).message),
                      },
                    )
                  }
                  onDelete={() => setToDelete(bucket)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title={`Delete "${toDelete?.name}"?`}
        description="Buckets with assigned log projects cannot be deleted."
        confirmLabel="Delete bucket"
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          if (!toDelete) return;
          remove.mutate(toDelete.id, {
            onSuccess: () => {
              toast.success("Log bucket deleted");
              setToDelete(null);
            },
            onError: (err) => toast.error((err as Error).message),
          });
        }}
      />
    </>
  );
}

function BucketRow({
  bucket,
  pending,
  onToggle,
  onCapacity,
  onDelete,
}: {
  bucket: AdminLogBucket;
  pending: boolean;
  onToggle: (enabled: boolean) => void;
  onCapacity: (maxProjects: number) => void;
  onDelete: () => void;
}) {
  const [capacity, setCapacity] = useState(String(bucket.max_projects));
  const full = bucket.project_count >= bucket.max_projects;
  const dirty = Number.parseInt(capacity, 10) !== bucket.max_projects;

  return (
    <div className="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[minmax(210px,1.2fr)_minmax(240px,1.4fr)_120px_190px] lg:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {bucket.enabled ? (
            <CheckCircle2 size={14} className="text-[var(--color-ok)]" />
          ) : (
            <PauseCircle size={14} className="text-[var(--color-fg-dim)]" />
          )}
          <span className="truncate text-[13px] font-medium text-[var(--color-fg)]">
            {bucket.name}
          </span>
          {full && (
            <span className="rounded-full bg-[var(--color-bg-row)] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--color-warn)]">
              full
            </span>
          )}
        </div>
        <div className="mt-1 text-[12px] text-[var(--color-fg-muted)]">
          Updated {lastSeen(bucket.updated_at)}
        </div>
      </div>

      <div className="min-w-0">
        <div className="mono truncate text-[12px] text-[var(--color-fg)]">{bucket.storage_uri}</div>
        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--color-fg-muted)]">
          {bucket.region && <span>{bucket.region}</span>}
          {bucket.endpoint && <span className="mono truncate">{bucket.endpoint}</span>}
          {bucket.access_key_id && <span className="mono">{bucket.access_key_id}</span>}
          <span>{bucket.secret_configured ? "secret set" : "credential chain"}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input
          aria-label={`${bucket.name} project capacity`}
          type="number"
          min={1}
          max={10000}
          value={capacity}
          onChange={(event) => setCapacity(event.target.value)}
          className="h-8 text-[12px]"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!dirty || pending}
          onClick={() => onCapacity(Number.parseInt(capacity, 10) || bucket.max_projects)}
        >
          Save
        </Button>
        <span className="text-[12px] text-[var(--color-fg-muted)]">
          {bucket.project_count}/{bucket.max_projects}
        </span>
      </div>

      <div className="flex justify-start gap-2 lg:justify-end">
        {bucket.enabled ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={() => onToggle(false)}
          >
            Disable
          </Button>
        ) : (
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={pending}
            onClick={() => onToggle(true)}
          >
            Enable
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending || bucket.project_count > 0}
          onClick={onDelete}
          aria-label={`Delete ${bucket.name}`}
        >
          <Trash2 size={13} />
        </Button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3 shadow-[var(--shadow-sm)]">
      <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
        {label}
      </div>
      <div className="mt-1 text-[22px] font-medium text-[var(--color-fg)]">{value}</div>
    </div>
  );
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function storageUriForBucket(bucketName: string, prefix: string): string {
  const bucket = bucketName
    .trim()
    .replace(/^s3:\/\//, "")
    .replace(/^\/+|\/+$/g, "");
  const cleanPrefix = prefix.trim().replace(/^\/+|\/+$/g, "");
  return cleanPrefix ? `s3://${bucket}/${cleanPrefix}` : `s3://${bucket}`;
}

function bucketNameFromEndpoint(endpoint: string): string {
  try {
    const value = endpoint.trim();
    if (!value) return "";
    const host = new URL(value.includes("://") ? value : `https://${value}`).hostname;
    if (host.endsWith(".t3.storageapi.dev")) {
      return host.slice(0, -".t3.storageapi.dev".length);
    }
  } catch {
    return "";
  }
  return "";
}

function setFormValue<K extends keyof LogBucketForm>(
  setForm: (next: (current: LogBucketForm) => LogBucketForm) => void,
  key: K,
  value: LogBucketForm[K],
) {
  setForm((current) => ({ ...current, [key]: value }));
}

type LogBucketForm = {
  name: string;
  bucket_name: string;
  prefix: string;
  region: string;
  endpoint: string;
  access_key_id: string;
  secret_access_key: string;
  max_projects: string;
  enabled: boolean;
};
