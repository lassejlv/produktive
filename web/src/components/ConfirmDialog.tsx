import type { ReactNode } from "react";
import { Button } from "#/components/Button";
import { Dialog, DialogContent } from "#/components/Dialog";
import { Spinner } from "#/components/Spinner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  pending,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title={title}
        description={description}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={destructive ? "danger" : "primary"}
              onClick={onConfirm}
              disabled={pending}
            >
              {pending && <Spinner size={12} thickness={2} />}
              {confirmLabel}
            </Button>
          </>
        }
      />
    </Dialog>
  );
}
