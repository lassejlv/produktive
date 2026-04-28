import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteAccount, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/account")({
  component: AccountPage,
});

function AccountPage() {
  const session = useSession();
  const navigate = useNavigate();
  const user = session.data?.user;

  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const canDelete = !!user && confirm.trim() === user.email && !busy;

  const handleDelete = async () => {
    if (!user || !canDelete) return;
    setBusy(true);
    try {
      await deleteAccount(confirm.trim());
      toast.success("Account deleted");
      window.location.assign("/");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete account",
      );
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[640px] px-6 py-10">
      <header className="mb-8">
        <button
          type="button"
          onClick={() => void navigate({ to: "/issues" })}
          className="mb-4 inline-flex items-center gap-1 text-[12px] text-fg-muted transition-colors hover:text-fg"
        >
          ← Back
        </button>
        <h1 className="m-0 text-[22px] font-semibold tracking-[-0.02em] text-fg">
          Account
        </h1>
        <p className="mt-1 text-[13px] text-fg-muted">
          Manage your profile and your data.
        </p>
      </header>

      <Section title="Profile">
        {!user ? (
          <p className="text-[13px] text-fg-muted">Loading…</p>
        ) : (
          <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-y-2 text-[13px]">
            <dt className="text-fg-faint">Name</dt>
            <dd className="text-fg">{user.name}</dd>
            <dt className="text-fg-faint">Email</dt>
            <dd className="text-fg">
              {user.email}
              {user.emailVerified ? null : (
                <span className="ml-2 rounded-[4px] border border-warning/40 bg-warning/10 px-1.5 py-px text-[10px] uppercase tracking-[0.06em] text-warning">
                  Unverified
                </span>
              )}
            </dd>
          </dl>
        )}
      </Section>

      <Section
        title="Delete account"
        tone="danger"
        description="Permanently delete your account, sessions, memberships, and pinned items. This cannot be undone."
      >
        <label className="block">
          <span className="mb-1.5 block text-[12px] text-fg-muted">
            Type your email{" "}
            <span className="font-mono text-fg">{user?.email ?? "…"}</span> to
            confirm
          </span>
          <Input
            type="email"
            autoComplete="off"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            disabled={busy || !user}
            placeholder={user?.email ?? ""}
            className={cn(
              "max-w-[360px]",
              confirm.length > 0 &&
                confirm.trim() !== user?.email &&
                "border-danger/50 focus-visible:border-danger focus-visible:ring-danger",
            )}
          />
        </label>
        <div className="mt-3">
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={!canDelete}
            onClick={() => void handleDelete()}
          >
            {busy ? "Deleting…" : "Delete my account"}
          </Button>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  tone = "default",
  children,
}: {
  title: string;
  description?: string;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "mb-6 rounded-[10px] border bg-surface/40 p-4",
        tone === "danger" ? "border-danger/30" : "border-border-subtle",
      )}
    >
      <h2
        className={cn(
          "m-0 text-[13px] font-medium",
          tone === "danger" ? "text-danger" : "text-fg",
        )}
      >
        {title}
      </h2>
      {description ? (
        <p className="mb-3 mt-1 text-[12.5px] text-fg-muted">{description}</p>
      ) : (
        <div className="mt-3" />
      )}
      {children}
    </section>
  );
}
