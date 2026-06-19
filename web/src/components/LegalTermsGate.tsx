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
import { useAcceptLegalTerms, useMe } from "#/lib/queries";

export function LegalTermsGate() {
  const me = useMe();
  const accept = useAcceptLegalTerms();
  const needsAcceptance = me.data ? !me.data.legal_terms_accepted_at : false;

  if (!needsAcceptance) return null;

  return (
    <AlertDialog open onOpenChange={() => {}}>
      <AlertDialogPopup className="max-w-[420px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Accept updated legal terms</AlertDialogTitle>
          <AlertDialogDescription>
            You need to accept the Terms of Service and Privacy Policy before continuing.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="px-6 pb-5 text-sm text-[var(--color-fg-muted)]">
          Review the{" "}
          <a className="link" href="/TERMS.md" rel="noreferrer" target="_blank">
            Terms of Service
          </a>{" "}
          and{" "}
          <a className="link" href="/PRIVACY.md" rel="noreferrer" target="_blank">
            Privacy Policy
          </a>
          . By continuing, you agree to both documents.
        </div>

        <AlertDialogFooter variant="bare">
          <Button
            type="button"
            variant="default"
            loading={accept.isPending}
            disabled={accept.isPending}
            onClick={() => {
              accept.mutate(undefined, {
                onError: (err) => toast.error((err as Error).message),
              });
            }}
          >
            Accept and continue
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
