import { Copy, Trash2 } from "lucide-react";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/cn";
import {
  BUCKET_ACCESS_LABEL,
  BUCKET_STATUS_COLOR,
  BUCKET_STATUS_LABEL,
  formatObjectStorageRegion,
} from "#/lib/object-storage";
import { toast } from "#/lib/toast";
import type { ObjectStorageBucket } from "#/lib/types";

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-[0.06em] text-[var(--color-fg-dim)]">
          {label}
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] text-[var(--color-link)]"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            toast.success("Copied");
          }}
        >
          <Copy size={12} />
          Copy
        </button>
      </div>
      <p className="mt-2 break-all font-mono text-[12px] text-[var(--color-fg)]">{value}</p>
    </div>
  );
}

export function BucketDetail({
  bucket,
  createdSecret,
  deleting,
  onDelete,
}: {
  bucket: ObjectStorageBucket;
  createdSecret?: string | null;
  deleting?: boolean;
  onDelete: () => void;
}) {
  const statusColor = BUCKET_STATUS_COLOR[bucket.status] ?? "var(--color-unknown)";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[var(--color-border)] px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[16px] font-medium text-[var(--color-fg)]">
              {bucket.name}
            </h2>
            <p className="mt-1 font-mono text-[12px] text-[var(--color-fg-dim)]">
              {bucket.provider_bucket_name}
            </p>
          </div>
          <Button type="button" size="sm" variant="secondary" disabled={deleting} onClick={onDelete}>
            <Trash2 size={14} />
            Delete
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-[var(--color-fg-muted)]">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: statusColor }} />
            {BUCKET_STATUS_LABEL[bucket.status] ?? bucket.status}
          </span>
          <span>{formatObjectStorageRegion(bucket.region)}</span>
          <span>{BUCKET_ACCESS_LABEL[bucket.access as keyof typeof BUCKET_ACCESS_LABEL] ?? bucket.access}</span>
        </div>
        {bucket.failure_message && (
          <p className="mt-3 text-[12px] text-[var(--color-err)]">{bucket.failure_message}</p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <h3 className="text-[13px] font-medium text-[var(--color-fg)]">Connection</h3>
        <p className="mt-1 text-[12px] text-[var(--color-fg-muted)]">
          Use these credentials with any S3-compatible SDK. Region is always{" "}
          <span className="font-mono">auto</span> in client config.
        </p>

        {createdSecret && (
          <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-warn)] bg-[color-mix(in_srgb,var(--color-warn)_8%,transparent)] p-3">
            <p className="text-[12px] font-medium text-[var(--color-fg)]">
              Save the secret access key now
            </p>
            <p className="mt-1 text-[12px] text-[var(--color-fg-muted)]">
              It is only shown once at creation.
            </p>
            <CopyField label="Secret access key" value={createdSecret} />
          </div>
        )}

        <div className="mt-4 space-y-3">
          <CopyField label="Endpoint" value={bucket.endpoint} />
          <CopyField label="Bucket name" value={bucket.provider_bucket_name} />
          <CopyField label="Region (SDK)" value="auto" />
          {bucket.access_key_id && (
            <CopyField label="Access key ID" value={bucket.access_key_id} />
          )}
        </div>

        <div className="mt-6">
          <h4 className="text-[12px] font-medium text-[var(--color-fg)]">Example env vars</h4>
          <pre
            className={cn(
              "mt-2 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)]",
              "bg-[var(--color-bg-sunken)] p-3 font-mono text-[11px] leading-relaxed text-[var(--color-fg-muted)]",
            )}
          >
            {`AWS_ENDPOINT_URL_S3=${bucket.endpoint}
AWS_ACCESS_KEY_ID=${bucket.access_key_id ?? "<access-key-id>"}
AWS_SECRET_ACCESS_KEY=${createdSecret ?? "<secret>"}
AWS_REGION=auto
S3_BUCKET=${bucket.provider_bucket_name}`}
          </pre>
        </div>
      </div>
    </div>
  );
}
