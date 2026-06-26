import { Sheet, SheetPopup } from "#/components/ui/sheet";
import { BucketDetail } from "#/components/object-storage/BucketDetail";
import type { ObjectStorageBucket } from "#/lib/types";

export function BucketSheet({
  open,
  bucket,
  createdSecret,
  deleting,
  onClose,
  onDelete,
}: {
  open: boolean;
  bucket: ObjectStorageBucket | null;
  createdSecret?: string | null;
  deleting?: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetPopup
        side="right"
        className="flex h-full max-h-full min-h-0 w-full max-w-lg flex-col border-0 border-s border-[var(--color-border)] bg-[var(--color-bg-elev)] p-0 shadow-none"
      >
        {bucket ? (
          <BucketDetail
            bucket={bucket}
            createdSecret={createdSecret}
            deleting={deleting}
            onDelete={onDelete}
          />
        ) : null}
      </SheetPopup>
    </Sheet>
  );
}
