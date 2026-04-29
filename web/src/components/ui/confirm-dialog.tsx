import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
}: ConfirmDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) setSubmitting(false);
  }, [open]);

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} className="max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      {description ? (
        <DialogContent>
          <p className="m-0 text-[13px] leading-relaxed text-fg-muted">
            {description}
          </p>
        </DialogContent>
      ) : null}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={submitting}
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={destructive ? "danger" : "default"}
          size="sm"
          onClick={() => void handleConfirm()}
          disabled={submitting}
        >
          {submitting ? "…" : confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

export function useConfirmDialog() {
  const [state, setState] = useState<{
    open: boolean;
    props: Omit<ConfirmDialogProps, "open" | "onClose"> | null;
  }>({ open: false, props: null });

  const confirm = (props: Omit<ConfirmDialogProps, "open" | "onClose">) => {
    setState({ open: true, props });
  };

  const close = () => setState((current) => ({ ...current, open: false }));

  const dialog = state.props ? (
    <ConfirmDialog
      open={state.open}
      onClose={close}
      onConfirm={async () => {
        await state.props!.onConfirm();
        close();
      }}
      title={state.props.title}
      description={state.props.description}
      confirmLabel={state.props.confirmLabel}
      cancelLabel={state.props.cancelLabel}
      destructive={state.props.destructive}
    />
  ) : null;

  return { confirm, dialog };
}
