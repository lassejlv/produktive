import { cn } from "#/lib/cn";
import {
  BUCKET_ACCESS_LABEL,
  BUCKET_STATUS_COLOR,
  BUCKET_STATUS_LABEL,
  formatObjectStorageRegion,
} from "#/lib/object-storage";
import type { ObjectStorageBucket } from "#/lib/types";

export function ObjectStorageCard({
  bucket,
  onClick,
}: {
  bucket: ObjectStorageBucket;
  onClick: () => void;
}) {
  const color = BUCKET_STATUS_COLOR[bucket.status] ?? "var(--color-unknown)";
  const active = bucket.status === "ready";

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 text-left shadow-[var(--shadow-xs)] transition hover:border-[var(--color-border-hi)] hover:shadow-[var(--shadow-sm)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn("inline-block h-2 w-2 shrink-0 rounded-full", active && "pulse-dot")}
              style={{
                background: color,
                boxShadow: active
                  ? `0 0 8px color-mix(in srgb, ${color} 50%, transparent)`
                  : undefined,
              }}
            />
            <h3 className="truncate text-[14px] font-medium text-[var(--color-fg)]">
              {bucket.name}
            </h3>
          </div>
          <p className="mt-1 truncate font-mono text-[11px] text-[var(--color-fg-dim)]">
            {bucket.provider_bucket_name}
          </p>
        </div>
        <span className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.05em] text-[var(--color-fg-muted)]">
          {BUCKET_ACCESS_LABEL[bucket.access as keyof typeof BUCKET_ACCESS_LABEL] ?? bucket.access}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--color-fg-muted)]">
        <span>{formatObjectStorageRegion(bucket.region)}</span>
        <span>{BUCKET_STATUS_LABEL[bucket.status] ?? bucket.status}</span>
      </div>
    </button>
  );
}

export function ObjectStorageRow({
  bucket,
  onClick,
}: {
  bucket: ObjectStorageBucket;
  onClick: () => void;
}) {
  const color = BUCKET_STATUS_COLOR[bucket.status] ?? "var(--color-unknown)";

  return (
    <button
      type="button"
      onClick={onClick}
      className="grid w-full grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.6fr)_minmax(0,0.6fr)] gap-3 border-b border-[var(--color-border)] px-4 py-3 text-left text-[13px] transition hover:bg-[var(--color-bg-row)] sm:px-6"
    >
      <span className="truncate font-medium text-[var(--color-fg)]">{bucket.name}</span>
      <span className="truncate text-[var(--color-fg-muted)]">
        {formatObjectStorageRegion(bucket.region)}
      </span>
      <span className="truncate capitalize text-[var(--color-fg-muted)]">{bucket.access}</span>
      <span className="inline-flex items-center gap-2 text-[var(--color-fg-muted)]">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
        {BUCKET_STATUS_LABEL[bucket.status] ?? bucket.status}
      </span>
    </button>
  );
}
