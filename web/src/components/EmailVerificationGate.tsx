import { useEffect } from "react";
import {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { toast } from "#/lib/toast";
import { useMe, useResendVerificationEmail } from "#/lib/queries";

export function EmailVerificationGate() {
  const me = useMe();
  const resend = useResendVerificationEmail();
  const needsVerification = me.data ? !me.data.email_verified_at : false;

  // While the gate is up, poll for verification: the user confirms by clicking
  // the emailed link (typically in another tab), and global refetch-on-focus is
  // disabled, so without this the modal would not clear when they return.
  const { refetch } = me;
  useEffect(() => {
    if (!needsVerification) return;
    const id = window.setInterval(() => {
      void refetch();
    }, 4000);
    return () => window.clearInterval(id);
  }, [needsVerification, refetch]);

  if (!needsVerification) return null;

  return (
    <AlertDialog open onOpenChange={() => {}}>
      <AlertDialogPopup className="max-w-[420px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Verify your email</AlertDialogTitle>
          <AlertDialogDescription>
            We sent a verification link to{" "}
            <span className="font-medium text-[var(--color-fg)]">{me.data?.email}</span>. Click
            the link to finish setting up your account.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="px-6 pb-5 text-sm text-[var(--color-fg-muted)]">
          This page will continue automatically once your email is verified. Check your spam
          folder if it has not arrived.
        </div>

        <AlertDialogFooter variant="bare">
          <Button
            type="button"
            variant="default"
            loading={resend.isPending}
            disabled={resend.isPending}
            onClick={() => {
              resend.mutate(undefined, {
                onSuccess: () => toast.success("Verification email sent"),
                onError: (err) => toast.error((err as Error).message),
              });
            }}
          >
            Resend email
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
