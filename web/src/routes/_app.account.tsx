import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
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
import {
  type AccountSession,
  deleteAccount,
  listAccountSessions,
  refreshSession,
  revokeAccountSession,
  revokeOtherAccountSessions,
  useSession,
} from "@/lib/auth-client";
import {
  type ThemeName,
  THEMES,
  applyTheme,
  readStoredTheme,
} from "@/lib/theme";
import { useUserPreferences } from "@/lib/use-user-preferences";
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
    <div className="mx-auto w-full max-w-[520px] px-6 py-10">
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
          Profile, preferences, and sessions.
        </p>
      </header>

      <div className="divide-y divide-border-subtle">
      <Section title="Profile">
        {!user ? (
          <LoadingTip compact />
        ) : (
          <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-y-2 text-[13px]">
            <dt className="text-[11px] uppercase tracking-[0.08em] text-fg-faint">Name</dt>
            <dd className="text-fg">{user.name}</dd>
            <dt className="text-[11px] uppercase tracking-[0.08em] text-fg-faint">Email</dt>
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

      <AppearanceSection />

      <NotificationPrefsSection />

      <SessionsSection />

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
    </div>
  );
}

function SessionsSection() {
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await listAccountSessions();
      setSessions(response.sessions);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load sessions",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    void listAccountSessions()
      .then((response) => {
        if (mounted) setSessions(response.sessions);
      })
      .catch((error) => {
        toast.error(
          error instanceof Error ? error.message : "Failed to load sessions",
        );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const revoke = async (sessionId: string) => {
    setBusy(sessionId);
    try {
      await revokeAccountSession(sessionId);
      setSessions((items) => items.filter((item) => item.id !== sessionId));
      toast.success("Session revoked");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to revoke session",
      );
    } finally {
      setBusy(null);
    }
  };

  const revokeOthers = async () => {
    setBusy("others");
    try {
      await revokeOtherAccountSessions();
      await load();
      toast.success("Other sessions revoked");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to revoke sessions",
      );
    } finally {
      setBusy(null);
    }
  };

  const otherSessions = sessions.filter((session) => !session.current);

  return (
    <Section
      title="Sessions"
      description="Review active sign-ins and revoke sessions you no longer use."
    >
      {loading ? (
        <LoadingTip compact />
      ) : sessions.length === 0 ? (
        <p className="m-0 text-[12.5px] text-fg-muted">No active sessions.</p>
      ) : (
        <div className="grid gap-2">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={otherSessions.length === 0 || busy !== null}
              onClick={() => void revokeOthers()}
            >
              {busy === "others" ? "Revoking…" : "Sign out others"}
            </Button>
          </div>

          <div className="divide-y divide-border-subtle rounded-md border border-border-subtle">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-fg">
                      {session.activeOrganizationName ?? "Unknown workspace"}
                    </span>
                    {session.current ? (
                      <span className="rounded-[4px] border border-accent/30 bg-accent/10 px-1.5 py-px text-[10px] uppercase tracking-[0.06em] text-accent">
                        Current
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 grid gap-1 text-[12px] text-fg-muted sm:grid-cols-2">
                    <span>Created {formatDateTime(session.createdAt)}</span>
                    <span>Expires {formatDateTime(session.expiresAt)}</span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-fg-faint">
                    {shortSessionId(session.id)}
                  </div>
                </div>

                {session.current ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void revoke(session.id)}
                  >
                    {busy === session.id ? "Revoking…" : "Revoke"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
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

function AppearanceSection() {
  const [current, setCurrent] = useState<ThemeName>(() => readStoredTheme());
  const qc = useQueryClient();
  const { prefs } = useUserPreferences();
  const [tabsEnabledLocal, setTabsEnabledLocal] = useState<boolean | null>(null);

  useEffect(() => {
    if (prefs && tabsEnabledLocal === null) {
      setTabsEnabledLocal(prefs.tabsEnabled);
    }
  }, [prefs, tabsEnabledLocal]);

  const choose = (next: ThemeName) => {
    setCurrent(next);
    applyTheme(next);
  };

  const toggleTabs = async (next: boolean) => {
    const previous = tabsEnabledLocal;
    setTabsEnabledLocal(next);
    try {
      const updated = await updateMyPreferences({ tabsEnabled: next });
      qc.setQueryData(["user-preferences"], updated);
    } catch (error) {
      setTabsEnabledLocal(previous);
      toast.error(
        error instanceof Error ? error.message : "Failed to update",
      );
    }
  };

  return (
    <Section
      title="Appearance"
      description="Pick the theme and toggle the tab bar."
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {THEMES.map((theme) => {
          const active = current === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => choose(theme.id)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-accent bg-surface"
                  : "border-border-subtle bg-bg/40 hover:border-border hover:bg-surface/60",
              )}
            >
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-md border border-border-subtle"
                style={{ backgroundColor: theme.swatchBg }}
              >
                <span
                  className="block size-4 rounded-full"
                  style={{ backgroundColor: theme.swatchAccent }}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-fg">
                  {theme.label}
                </span>
                <span className="block text-[11.5px] text-fg-muted">
                  {theme.hint}
                </span>
              </span>
              {active ? (
                <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-accent">
                  Active
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        <ToggleRow
          label="Tab bar"
          hint="Show a bottom tab bar that tracks the issues, projects, and chats you've opened."
          checked={tabsEnabledLocal ?? prefs?.tabsEnabled ?? true}
          disabled={tabsEnabledLocal === null && !prefs}
          onChange={(value) => void toggleTabs(value)}
        />
      </div>
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
        <div className="divide-y divide-border-subtle">
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
          <ToggleRow
            label="Progress recap"
            hint="A short personal recap of what you closed and what's still on your plate. Sent on a random day each week so it never feels routine."
            checked={prefs.emailProgress}
            disabled={prefs.emailPaused}
            onChange={(value) => void apply({ emailProgress: value })}
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
        "flex items-center justify-between gap-4 py-3",
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function shortSessionId(value: string) {
  return `Session ${value.slice(0, 8)}`;
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
    <section className="py-5 first:pt-0 last:pb-0">
      <h2
        className={cn(
          "m-0 text-[11px] font-medium uppercase tracking-[0.1em]",
          tone === "danger" ? "text-danger" : "text-fg-faint",
        )}
      >
        {title}
      </h2>
      {description ? (
        <p className="mb-4 mt-1.5 text-[13px] leading-relaxed text-fg-muted">
          {description}
        </p>
      ) : (
        <div className="mb-4" />
      )}
      {children}
    </section>
  );
}
