import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ONBOARDING_SKIP_FLAG,
  useOnboarding,
} from "@/components/onboarding/onboarding-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingTip } from "@/components/ui/loading-tip";
import {
  type NotificationPreferences,
  getMyPreferences,
  markOnboarding,
  updateMyPreferences,
} from "@/lib/api";
import { deleteAccount, refreshSession, useSession } from "@/lib/auth-client";
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
          Personal account
        </h1>
        <p className="mt-1 text-[13px] text-fg-muted">
          Manage your profile, notifications, and account data.
        </p>
      </header>

      <Section title="Profile">
        {!user ? (
          <LoadingTip compact />
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

      <NotificationPrefsSection />

      <ProductTourSection />

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

function ProductTourSection() {
  const navigate = useNavigate();
  const onboarding = useOnboarding();
  const [busy, setBusy] = useState(false);

  const replay = async () => {
    setBusy(true);
    try {
      await markOnboarding({ completed: false, step: "welcome" });
      await refreshSession();
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(ONBOARDING_SKIP_FLAG);
      }
      await navigate({ to: "/issues" });
      onboarding.start("welcome");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to restart tour",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Product tour"
      description="Replay the welcome tour any time to revisit the basics."
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void replay()}
      >
        {busy ? "Starting…" : "Replay product tour"}
      </Button>
    </Section>
  );
}

function NotificationPrefsSection() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void getMyPreferences()
      .then((response) => {
        if (mounted) setPrefs(response);
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const apply = async (patch: Partial<NotificationPreferences>) => {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, ...patch });
    try {
      const next = await updateMyPreferences(patch);
      setPrefs(next);
    } catch (error) {
      setPrefs(previous);
      toast.error(
        error instanceof Error ? error.message : "Failed to update",
      );
    }
  };

  return (
    <Section
      title="Email notifications"
      description="Choose which events should also send you an email. Inbox notifications are always on."
    >
      {loading || !prefs ? (
        <LoadingTip compact />
      ) : (
        <div className="flex flex-col gap-2">
          <ToggleRow
            label="Pause all"
            hint="Don't send any email notifications until I unpause."
            checked={prefs.emailPaused}
            onChange={(value) => void apply({ emailPaused: value })}
          />
          <ToggleRow
            label="Assignments"
            hint="Email me when an issue is assigned to me."
            checked={prefs.emailAssignments}
            disabled={prefs.emailPaused}
            onChange={(value) => void apply({ emailAssignments: value })}
          />
          <ToggleRow
            label="Comments"
            hint="Email me when someone comments on an issue I subscribe to."
            checked={prefs.emailComments}
            disabled={prefs.emailPaused}
            onChange={(value) => void apply({ emailComments: value })}
          />
        </div>
      )}
    </Section>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-md border border-border-subtle bg-bg/40 px-3 py-2.5",
        disabled && "opacity-60",
      )}
    >
      <div className="min-w-0">
        <div className="text-[13px] text-fg">{label}</div>
        <div className="text-[12px] text-fg-muted">{hint}</div>
      </div>
      <Toggle
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        ariaLabel={label}
      />
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-accent" : "bg-surface-2",
        disabled && "cursor-not-allowed",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "block size-4 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-[2px]",
        )}
      />
    </button>
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
