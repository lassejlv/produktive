import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  type InvitationLookup,
  acceptInvitation,
  lookupInvitation,
} from "@/lib/api";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const session = useSession();
  const [lookup, setLookup] = useState<InvitationLookup | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    void lookupInvitation(token)
      .then((response) => {
        if (mounted) setLookup(response);
      })
      .catch(() => {
        if (mounted) setLookup(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [token]);

  const accept = async () => {
    setBusy(true);
    try {
      await acceptInvitation(token);
      toast.success("Welcome to the workspace");
      window.location.assign("/issues");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not accept invitation",
      );
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-bg px-6">
      <div className="bg-dotgrid" aria-hidden />
      <div
        className={cn(
          "w-full max-w-[440px] rounded-[14px] border border-border-subtle bg-bg/80 p-8 backdrop-blur-md",
          "shadow-[0_18px_60px_rgba(0,0,0,0.45)] animate-fade-up",
        )}
      >
        <div className="mb-5 flex items-center gap-2.5">
          <div className="grid size-7 place-items-center rounded-md bg-fg text-[12px] font-semibold tracking-tight text-bg">
            P
          </div>
          <span className="text-[14px] font-medium tracking-tight text-fg">
            Produktive
          </span>
        </div>

        <Body
          loading={loading}
          lookup={lookup}
          token={token}
          session={session}
          busy={busy}
          onAccept={accept}
          onNavigate={navigate}
        />
      </div>
    </main>
  );
}

function Body({
  loading,
  lookup,
  token,
  session,
  busy,
  onAccept,
}: {
  loading: boolean;
  lookup: InvitationLookup | null;
  token: string;
  session: ReturnType<typeof useSession>;
  busy: boolean;
  onAccept: () => void;
  onNavigate: ReturnType<typeof useNavigate>;
}) {
  if (loading) {
    return (
      <p className="text-[13px] text-fg-faint">Looking up invitation…</p>
    );
  }
  if (!lookup) {
    return <ErrorState message="We couldn't find this invitation." />;
  }
  if (lookup.revoked) {
    return <ErrorState message="This invitation was revoked." />;
  }
  if (lookup.accepted) {
    return <ErrorState message="This invitation has already been accepted." />;
  }
  if (lookup.expired) {
    return (
      <ErrorState message="This invitation has expired. Ask the workspace owner to send a new one." />
    );
  }

  const inviteEmail = lookup.email ?? "";
  const orgName = lookup.organizationName ?? "this workspace";
  const inviterName = lookup.inviterName ?? "A teammate";

  const sessionUser = session.data?.user;

  if (!sessionUser) {
    const params = new URLSearchParams({
      invite: token,
      email: inviteEmail,
    });
    return (
      <>
        <h1 className="m-0 text-[20px] font-semibold tracking-[-0.01em] text-fg">
          Join {orgName}
        </h1>
        <p className="mt-2 text-[13px] text-fg-muted">
          {inviterName} invited <span className="text-fg">{inviteEmail}</span>{" "}
          to join {orgName} on Produktive.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            to="/login"
            search={Object.fromEntries(params.entries()) as never}
            className="inline-flex h-10 items-center justify-center rounded-md bg-fg px-4 text-[13px] font-medium text-bg transition-colors hover:bg-white"
          >
            Create your account
          </Link>
          <Link
            to="/login"
            search={
              Object.fromEntries(
                new URLSearchParams({
                  invite: token,
                  email: inviteEmail,
                  mode: "signin",
                }).entries(),
              ) as never
            }
            className="inline-flex h-10 items-center justify-center rounded-md border border-border-subtle bg-transparent px-4 text-[13px] text-fg-muted transition-colors hover:border-border hover:text-fg"
          >
            I already have an account
          </Link>
        </div>
      </>
    );
  }

  const emailMatches =
    sessionUser.email.toLowerCase() === inviteEmail.toLowerCase();

  if (!emailMatches) {
    return (
      <>
        <h1 className="m-0 text-[20px] font-semibold tracking-[-0.01em] text-fg">
          Wrong account
        </h1>
        <p className="mt-2 text-[13px] text-fg-muted">
          You're signed in as{" "}
          <span className="text-fg">{sessionUser.email}</span>, but this
          invitation is for <span className="text-fg">{inviteEmail}</span>.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={async () => {
              await signOut();
              window.location.reload();
            }}
            className="inline-flex h-10 items-center justify-center rounded-md bg-fg px-4 text-[13px] font-medium text-bg transition-colors hover:bg-white"
          >
            Sign out
          </button>
          <Link
            to="/issues"
            className="inline-flex h-10 items-center justify-center rounded-md border border-border-subtle bg-transparent px-4 text-[13px] text-fg-muted transition-colors hover:border-border hover:text-fg"
          >
            Back to my workspace
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="m-0 text-[20px] font-semibold tracking-[-0.01em] text-fg">
        Join {orgName}
      </h1>
      <p className="mt-2 text-[13px] text-fg-muted">
        {inviterName} invited you to join {orgName} on Produktive.
      </p>
      <div className="mt-6">
        <button
          type="button"
          onClick={onAccept}
          disabled={busy}
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-fg px-4 text-[13px] font-medium text-bg transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Joining…" : "Accept and open workspace"}
        </button>
      </div>
    </>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <>
      <h1 className="m-0 text-[18px] font-medium text-fg">Invitation unavailable</h1>
      <p className="mt-2 text-[13px] text-fg-muted">{message}</p>
      <Link
        to="/"
        className="mt-6 inline-flex h-9 items-center justify-center rounded-md border border-border-subtle bg-transparent px-4 text-[12.5px] text-fg-muted transition-colors hover:border-border hover:text-fg"
      >
        Back to home
      </Link>
    </>
  );
}
