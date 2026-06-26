import { createFileRoute } from "@tanstack/react-router";
import { Database, LayoutGrid, LayoutList, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "#/components/ui/input-group";
import { EmptyState } from "#/components/EmptyState";
import { Skeleton } from "#/components/ui/skeleton";
import { CreateBucketDialog } from "#/components/object-storage/CreateBucketDialog";
import {
  ObjectStorageCard,
  ObjectStorageRow,
} from "#/components/object-storage/ObjectStorageCard";
import { BucketSheet } from "#/components/object-storage/BucketSheet";
import { cn } from "#/lib/cn";
import { DEPLOYMENTS_ENABLED, OBJECT_STORAGE_ENABLED } from "#/lib/features";
import { toast } from "#/lib/toast";
import {
  deployAccessQuery,
  useCreateObjectStorageBucket,
  useDeleteObjectStorageBucket,
  useDeployAccess,
  useObjectStorageBuckets,
} from "#/lib/queries";
import { RequestAccessOverlay } from "./_authed.$wid.deployments";

export const Route = createFileRoute("/_authed/$wid/object-storage")({
  staticData: {
    title: "Object Storage",
    description: "S3-compatible buckets powered by Tigris.",
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(deployAccessQuery(params.wid)),
  component: ObjectStoragePage,
});

function ObjectStoragePage() {
  const { wid } = Route.useParams();

  if (!DEPLOYMENTS_ENABLED || !OBJECT_STORAGE_ENABLED) {
    return (
      <EmptyState
        icon={Database}
        title="Object storage not available"
        description="Object storage is not enabled in this build."
      />
    );
  }

  return <ObjectStorageContent wid={wid} />;
}

function ObjectStorageContent({ wid }: { wid: string }) {
  const access = useDeployAccess(wid);
  const approved = access.data?.status === "approved";
  const buckets = useObjectStorageBuckets(wid, approved);
  const create = useCreateObjectStorageBucket(wid);
  const remove = useDeleteObjectStorageBucket(wid);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = buckets.data ?? [];
    if (!needle) return rows;
    return rows.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        item.slug.toLowerCase().includes(needle) ||
        item.provider_bucket_name.toLowerCase().includes(needle),
    );
  }, [query, buckets.data]);

  const selected = selectedId
    ? ((buckets.data ?? []).find((item) => item.id === selectedId) ?? null)
    : null;

  return (
    <div className="relative">
      <div
        className={cn(
          "transition-opacity",
          !approved && "pointer-events-none select-none opacity-35 blur-[2px]",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-[18px] font-medium tracking-tight text-[var(--color-fg)]">
              Object Storage
            </h1>
            <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">
              S3-compatible buckets on Tigris with per-bucket credentials.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <InputGroup className="w-full min-w-[220px] sm:w-64">
              <InputGroupAddon>
                <Search size={14} />
              </InputGroupAddon>
              <InputGroupInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search buckets"
              />
            </InputGroup>
            <div className="flex rounded-[var(--radius-sm)] border border-[var(--color-border)] p-0.5">
              <button
                type="button"
                onClick={() => setView("grid")}
                className={cn(
                  "rounded-[var(--radius-sm)] p-1.5",
                  view === "grid"
                    ? "bg-[var(--color-bg-row)] text-[var(--color-fg)]"
                    : "text-[var(--color-fg-muted)]",
                )}
                aria-label="Grid view"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                className={cn(
                  "rounded-[var(--radius-sm)] p-1.5",
                  view === "list"
                    ? "bg-[var(--color-bg-row)] text-[var(--color-fg)]"
                    : "text-[var(--color-fg-muted)]",
                )}
                aria-label="List view"
              >
                <LayoutList size={14} />
              </button>
            </div>
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)} disabled={!approved}>
              <Plus size={14} />
              Create bucket
            </Button>
          </div>
        </div>

        {buckets.isLoading ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 sm:p-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-32 rounded-[var(--radius-lg)]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Database}
            title={query ? "No buckets match your search" : "No buckets yet"}
            description={
              query
                ? "Try a different search term."
                : "Create a bucket to store files with S3-compatible tools."
            }
            action={
              !query ? (
                <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus size={14} />
                  Create bucket
                </Button>
              ) : undefined
            }
          />
        ) : view === "grid" ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 sm:p-6">
            {filtered.map((bucket) => (
              <ObjectStorageCard
                key={bucket.id}
                bucket={bucket}
                onClick={() => {
                  setCreatedSecret(null);
                  setSelectedId(bucket.id);
                }}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[760px] border-b border-[var(--color-border)] px-4 py-2 text-[11px] uppercase tracking-[0.06em] text-[var(--color-fg-dim)] sm:px-6">
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.6fr)_minmax(0,0.6fr)] gap-3">
                <span>Name</span>
                <span>Region</span>
                <span>Access</span>
                <span>Status</span>
              </div>
            </div>
            {filtered.map((bucket) => (
              <ObjectStorageRow
                key={bucket.id}
                bucket={bucket}
                onClick={() => {
                  setCreatedSecret(null);
                  setSelectedId(bucket.id);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {!approved && access.data && (
        <RequestAccessOverlay wid={wid} status={access.data.status} />
      )}

      <CreateBucketDialog
        open={createOpen}
        pending={create.isPending}
        onOpenChange={setCreateOpen}
        onSubmit={(body) =>
          create.mutate(body, {
            onSuccess: (created) => {
              toast.success("Bucket created");
              setCreateOpen(false);
              setCreatedSecret(created.secret_access_key);
              setSelectedId(created.id);
            },
            onError: (error) => toast.error((error as Error).message),
          })
        }
      />

      <BucketSheet
        open={!!selected}
        bucket={selected}
        createdSecret={createdSecret}
        deleting={remove.isPending}
        onClose={() => {
          setSelectedId(null);
          setCreatedSecret(null);
        }}
        onDelete={() => {
          if (!selected) return;
          remove.mutate(selected.id, {
            onSuccess: () => {
              toast.success("Bucket deleted");
              setSelectedId(null);
              setCreatedSecret(null);
            },
            onError: (error) => toast.error((error as Error).message),
          });
        }}
      />
    </div>
  );
}
