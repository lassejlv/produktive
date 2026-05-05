import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState } from "react";
import * as QRCode from "qrcode";
import { toast } from "sonner";
import { ONBOARDING_SKIP_FLAG, useOnboarding } from "@/components/onboarding/onboarding-context";
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
  type TrustedTwoFactorDevice,
  type TwoFactorSetup,
  type TwoFactorStatus,
  deleteAccount,
  disableTwoFactor,
  enableTwoFactor,
  getTwoFactorStatus,
  listAccountSessions,
  listTrustedTwoFactorDevices,
  regenerateTwoFactorBackupCodes,
  refreshSession,
  revokeAccountSession,
  revokeOtherAccountSessions,
  revokeTrustedTwoFactorDevice,
  setupTwoFactor,
  uploadAccountIcon,
  useSession,
} from "@/lib/auth-client";
import { type ThemeName, THEMES, applyTheme, readStoredTheme } from "@/lib/theme";
import { useUserPreferences } from "@/lib/use-user-preferences";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/account")({
  component: AccountPage,
});

type AccountSectionId =
  | "profile"
  | "appearance"
  | "notifications"
  | "security"
  | "sessions"
  | "tour"
  | "danger";

type AccountSection = {
  id: AccountSectionId;
  label: string;
  description: string;
  group: "main" | "danger";
};

const accountSections: AccountSection[] = [
  {
    id: "profile",
    label: "Profile",
    description: "Icon, name, and email.",
    group: "main",
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme and tab bar.",
    group: "main",
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Email for assignments, comments, and recap. Inbox alerts stay on.",
    group: "main",
  },
  {
    id: "security",
    label: "Security",
    description: "Two-factor authentication and recovery codes.",
    group: "main",
  },
  {
    id: "sessions",
    label: "Sessions",
    description: "Active sign-ins across workspaces.",
    group: "main",
  },
  {
    id: "tour",
    label: "Product tour",
    description: "Replay the welcome walkthrough.",
    group: "main",
  },
  {
    id: "danger",
    label: "Danger zone",
    description: "Irreversible account actions.",
    group: "danger",
  },
];

const isAccountSectionId = (value: string): value is AccountSectionId =>
  accountSections.some((item) => item.id === value);

const accountNavGroups: { label: string; ids: AccountSectionId[] }[] = [
  { label: "Settings", ids: ["profile", "appearance", "notifications", "security", "sessions"] },
  { label: "Help", ids: ["tour"] },
];

function sectionById(id: AccountSectionId): AccountSection {
  return accountSections.find((item) => item.id === id)!;
}

function AccountPaneSections({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col [&>section+section]:border-t [&>section+section]:border-border-subtle [&>section+section]:pt-9">
      {children}
    </div>
  );
}

function AccountSectionBlock({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const headingId = `${id}-heading`;

  return (
    <section aria-labelledby={headingId}>
      <h3
        id={headingId}
        className="m-0 text-[11px] font-medium uppercase tracking-[0.1em] text-fg-faint"
      >
        {title}
      </h3>
      {description ? (
        <p className="mt-1.5 max-w-xl text-[12px] leading-relaxed text-fg-muted">{description}</p>
      ) : null}
      <div className={description ? "mt-4" : "mt-3"}>{children}</div>
    </section>
  );
}

function AccountPage() {
  const session = useSession();
  const navigate = useNavigate();
  const user = session.data?.user;

  const [activeSection, setActiveSection] = useState<AccountSectionId>("profile");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const section = new URLSearchParams(window.location.search).get("section");
    if (section && isAccountSectionId(section)) {
      setActiveSection(section);
    }
  }, []);

  const onSelectSection = (id: AccountSectionId) => {
    setActiveSection(id);
    void navigate({
      to: "/account",
      search: { section: id },
      replace: true,
    });
  };

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    void navigate({ to: "/issues" });
  };

  const canDelete = !!user && confirm.trim() === user.email && !busy;

  const handleDelete = async () => {
    if (!user || !canDelete) return;
    setBusy(true);
    try {
      await deleteAccount(confirm.trim());
      toast.success("Account deleted");
      window.location.assign("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete account");
      setBusy(false);
    }
  };

  const activeMeta = accountSections.find((item) => item.id === activeSection);
  const dangerSections = accountSections.filter((section) => section.group === "danger");

  return (
    <div className="mx-auto w-full max-w-[880px] px-6 py-10">
      <header className="mb-8">
        <button
          type="button"
          onClick={handleBack}
          className="mb-4 inline-flex items-center gap-1 rounded-[3px] text-[12px] text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          ← Back
        </button>
        <h1 className="m-0 text-[22px] font-semibold tracking-[-0.02em] text-fg">Account</h1>
        <p className="mt-1 text-[13px] text-fg-muted">
          Profile, preferences, security, and sessions.
        </p>
      </header>

      <div className="grid gap-8 md:grid-cols-[180px_minmax(0,1fr)] md:gap-12">
        <nav
          role="tablist"
          aria-label="Account sections"
          aria-orientation="vertical"
          className="flex flex-col gap-0.5 md:sticky md:top-10 md:self-start"
        >
          {accountNavGroups.map((group, groupIndex) => (
            <div key={group.label} className={cn(groupIndex > 0 && "mt-4")}>
              <p className="mb-1 px-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-fg-faint">
                {group.label}
              </p>
              <AccountSectionGroup>
                {group.ids.map((id) => {
                  const section = sectionById(id);
                  return (
                    <AccountSectionNavButton
                      key={id}
                      section={section}
                      active={activeSection === id}
                      onSelect={onSelectSection}
                    />
                  );
                })}
              </AccountSectionGroup>
            </div>
          ))}
          {dangerSections.length > 0 ? (
            <>
              <div className="my-1 h-px bg-border-subtle" />
              <AccountSectionGroup>
                {dangerSections.map((section) => (
                  <AccountSectionNavButton
                    key={section.id}
                    section={section}
                    active={activeSection === section.id}
                    onSelect={onSelectSection}
                    danger
                  />
                ))}
              </AccountSectionGroup>
            </>
          ) : null}
        </nav>

        <main className="min-w-0">
          {activeMeta ? (
            <header className="mb-5 border-b border-border-subtle pb-4">
              <h2 className="m-0 text-[15px] font-medium text-fg">{activeMeta.label}</h2>
              <p className="mt-1 text-[12.5px] text-fg-faint">{activeMeta.description}</p>
            </header>
          ) : null}

          {activeSection === "profile" ? (
            !user ? (
              <LoadingTip compact />
            ) : (
              <AccountPaneSections>
                <AccountSectionBlock
                  title="Photo"
                  description="Shown next to your name in the workspace."
                >
                  <ProfileIconUpload user={user} />
                </AccountSectionBlock>
                <AccountSectionBlock
                  title="Account"
                  description="Name and email from your sign-in."
                >
                  <dl className="m-0 grid grid-cols-[100px_minmax(0,1fr)] gap-y-2 text-[13px]">
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
                </AccountSectionBlock>
              </AccountPaneSections>
            )
          ) : null}

          {activeSection === "appearance" ? <AppearanceSectionBody /> : null}
          {activeSection === "notifications" ? <NotificationPrefsSectionBody /> : null}
          {activeSection === "security" ? <SecuritySectionBody /> : null}
          {activeSection === "sessions" ? <SessionsSectionBody /> : null}
          {activeSection === "tour" ? <ProductTourSectionBody /> : null}

          {activeSection === "danger" ? (
            <AccountPaneSections>
              <AccountSectionBlock
                title="Confirmation"
                description="Permanently removes this account, its sessions and memberships, and pinned items. This cannot be undone."
              >
                <label className="block">
                  <span className="mb-1.5 block text-[12px] text-fg-muted">
                    Type <span className="font-mono text-fg">{user?.email ?? "…"}</span> to confirm
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
                <div className="mt-4">
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
              </AccountSectionBlock>
            </AccountPaneSections>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function AccountSectionGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-0.5">{children}</div>;
}

function AccountSectionNavButton({
  section,
  active,
  onSelect,
  danger = false,
}: {
  section: AccountSection;
  active: boolean;
  onSelect: (id: AccountSectionId) => void;
  danger?: boolean;
}) {
  const baseColor = danger ? "text-danger/80 hover:text-danger" : "text-fg-muted hover:text-fg";
  const activeColor = danger ? "bg-danger/10 text-danger" : "bg-surface text-fg";

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(section.id)}
      className={cn(
        "flex h-8 items-center justify-between gap-2 rounded-md px-2.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
        active ? activeColor : `${baseColor} hover:bg-surface/60`,
      )}
    >
      <span className="truncate">{section.label}</span>
    </button>
  );
}

function ProfileIconUpload({ user }: { user: { name: string; image: string | null } }) {
  const [uploading, setUploading] = useState(false);

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploading) return;
    setUploading(true);
    try {
      await uploadAccountIcon(file);
      await refreshSession();
      toast.success("Profile icon updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload icon");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <ProfileIcon name={user.name} image={user.image} />
      <div>
        <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-border-subtle bg-bg px-3 text-[12px] text-fg transition-colors hover:border-border disabled:opacity-60">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => void onFile(event)}
          />
          {uploading ? "Uploading..." : "Upload icon"}
        </label>
        <p className="mt-1 text-[11.5px] text-fg-faint">PNG, JPEG, WebP, or GIF. Max 2 MB.</p>
      </div>
    </div>
  );
}

function ProfileIcon({ name, image }: { name: string; image?: string | null }) {
  if (image) {
    return (
      <img src={image} alt="" className="size-10 rounded-full border border-border object-cover" />
    );
  }
  return (
    <div className="grid size-10 place-items-center rounded-full border border-border bg-surface-2 text-[13px] font-medium text-fg">
      {name.slice(0, 2).toUpperCase() || "U"}
    </div>
  );
}

function SecuritySectionBody() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [trustedDevices, setTrustedDevices] = useState<TrustedTwoFactorDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [nextStatus, nextTrustedDevices] = await Promise.all([
        getTwoFactorStatus(),
        listTrustedTwoFactorDevices(),
      ]);
      setStatus(nextStatus);
      setTrustedDevices(nextTrustedDevices.devices);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load security settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    let alive = true;
    if (!setup) {
      setQrDataUrl(null);
      return;
    }
    void QRCode.toDataURL(setup.totpUri, {
      margin: 1,
      width: 184,
      color: { dark: "#111111", light: "#ffffff" },
    }).then((dataUrl) => {
      if (alive) setQrDataUrl(dataUrl);
    });
    return () => {
      alive = false;
    };
  }, [setup]);

  const resetInputs = () => {
    setPassword("");
    setCode("");
  };

  const startSetup = async () => {
    if (!password.trim()) {
      toast.error("Enter your password first");
      return;
    }
    setBusy("setup");
    try {
      setSetup(await setupTwoFactor(password));
      setBackupCodes(null);
      setCode("");
      toast.success("Scan the code in your authenticator app");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start setup");
    } finally {
      setBusy(null);
    }
  };

  const finishSetup = async () => {
    if (!setup || !code.trim()) return;
    setBusy("enable");
    try {
      const response = await enableTwoFactor(code);
      setBackupCodes(response.backupCodes);
      setSetup(null);
      resetInputs();
      await refreshSession();
      await load();
      toast.success("Two-factor authentication enabled");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to enable two-factor authentication",
      );
    } finally {
      setBusy(null);
    }
  };

  const regenerate = async () => {
    if (!password.trim() || !code.trim()) {
      toast.error("Enter your password and authentication code");
      return;
    }
    setBusy("regenerate");
    try {
      const response = await regenerateTwoFactorBackupCodes({ password, code });
      setBackupCodes(response.backupCodes);
      resetInputs();
      await load();
      toast.success("Backup codes regenerated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to regenerate backup codes");
    } finally {
      setBusy(null);
    }
  };

  const disable = async () => {
    if (!password.trim() || !code.trim()) {
      toast.error("Enter your password and authentication code");
      return;
    }
    setBusy("disable");
    try {
      await disableTwoFactor({ password, code });
      setSetup(null);
      setBackupCodes(null);
      resetInputs();
      await refreshSession();
      await load();
      toast.success("Two-factor authentication disabled");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to disable two-factor authentication",
      );
    } finally {
      setBusy(null);
    }
  };

  const revokeTrustedDevice = async (deviceId: string) => {
    setBusy(deviceId);
    try {
      await revokeTrustedTwoFactorDevice(deviceId);
      setTrustedDevices((devices) => devices.filter((device) => device.id !== deviceId));
      toast.success("Trusted device revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to revoke trusted device");
    } finally {
      setBusy(null);
    }
  };

  if (loading || !status) {
    return <LoadingTip compact />;
  }

  return (
    <AccountPaneSections>
      <AccountSectionBlock
        title="Authenticator app"
        description="Require a short-lived code whenever this account signs in."
      >
        <div className="rounded-md border border-border-subtle">
          <ToggleRow
            label={status.enabled ? "Enabled" : "Disabled"}
            hint={
              status.enabled
                ? "Sign-ins require an authenticator or backup code."
                : "Add an authenticator app before this protection is active."
            }
            checked={status.enabled}
            disabled
            className="px-4 py-3.5"
            onChange={() => {}}
          />
        </div>
      </AccountSectionBlock>

      {!status.enabled ? (
        <AccountSectionBlock
          title="Setup"
          description="Verify your password, scan the QR code, then enter the first code."
        >
          <div className="grid gap-4">
            <SecurityField
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              disabled={busy !== null}
            />
            {!setup ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => void startSetup()}
              >
                {busy === "setup" ? "Starting…" : "Start setup"}
              </Button>
            ) : (
              <div className="grid gap-4 rounded-md border border-border-subtle p-4">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="grid size-[184px] place-items-center rounded-md bg-white">
                    {qrDataUrl ? (
                      <img src={qrDataUrl} alt="" className="size-[184px]" />
                    ) : (
                      <LoadingTip compact />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-[12px] leading-relaxed text-fg-muted">
                      Scan the QR code or enter this secret manually.
                    </p>
                    <code className="mt-2 block break-all rounded-md border border-border-subtle bg-bg p-2 font-mono text-[11px] text-fg">
                      {setup.secret}
                    </code>
                  </div>
                </div>
                <SecurityField
                  label="Authentication code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={setCode}
                  disabled={busy !== null}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy !== null || !code.trim()}
                    onClick={() => void finishSetup()}
                  >
                    {busy === "enable" ? "Enabling…" : "Enable two-factor"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => {
                      setSetup(null);
                      setCode("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </AccountSectionBlock>
      ) : (
        <>
          <AccountSectionBlock
            title="Backup codes"
            description={`${status.backupCodesRemaining} unused recovery code${
              status.backupCodesRemaining === 1 ? "" : "s"
            } remain.`}
          >
            <div className="grid gap-3">
              <SecurityField
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={setPassword}
                disabled={busy !== null}
              />
              <SecurityField
                label="Authentication or backup code"
                autoComplete="one-time-code"
                value={code}
                onChange={setCode}
                disabled={busy !== null}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => void regenerate()}
              >
                {busy === "regenerate" ? "Regenerating…" : "Regenerate backup codes"}
              </Button>
            </div>
          </AccountSectionBlock>

          <AccountSectionBlock
            title="Disable"
            description="Removes the authenticator requirement and deletes all backup codes."
          >
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={busy !== null}
              onClick={() => void disable()}
            >
              {busy === "disable" ? "Disabling…" : "Disable two-factor"}
            </Button>
          </AccountSectionBlock>

          <AccountSectionBlock
            title="Trusted devices"
            description="Browsers that can skip 2FA until their trust expires."
          >
            {trustedDevices.length === 0 ? (
              <p className="m-0 text-[12.5px] text-fg-muted">No trusted devices.</p>
            ) : (
              <ul
                className="m-0 list-none divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle p-0"
                aria-label="Trusted two-factor devices"
              >
                {trustedDevices.map((device) => (
                  <TrustedTwoFactorDeviceListItem
                    key={device.id}
                    device={device}
                    busy={busy}
                    onRevoke={revokeTrustedDevice}
                  />
                ))}
              </ul>
            )}
          </AccountSectionBlock>
        </>
      )}

      {backupCodes ? (
        <AccountSectionBlock
          title="Save these backup codes"
          description="Each code works once. Store them somewhere safe before leaving this page."
        >
          <BackupCodesPanel codes={backupCodes} />
        </AccountSectionBlock>
      ) : null}
    </AccountPaneSections>
  );
}

function SecurityField({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  inputMode,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  inputMode?: React.ComponentProps<"input">["inputMode"];
  disabled?: boolean;
}) {
  return (
    <label className="block max-w-[360px]">
      <span className="mb-1.5 block text-[12px] text-fg-muted">{label}</span>
      <Input
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    </label>
  );
}

function BackupCodesPanel({ codes }: { codes: string[] }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      toast.success("Backup codes copied");
    } catch {
      toast.error("Could not copy backup codes");
    }
  };

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2 rounded-md border border-border-subtle p-3 sm:grid-cols-3">
        {codes.map((code) => (
          <code
            key={code}
            className="rounded bg-bg px-2 py-1.5 text-center font-mono text-[12px] text-fg"
          >
            {code}
          </code>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
        Copy codes
      </Button>
    </div>
  );
}

function TrustedTwoFactorDeviceListItem({
  device,
  busy,
  onRevoke,
}: {
  device: TrustedTwoFactorDevice;
  busy: string | null;
  onRevoke: (id: string) => void | Promise<void>;
}) {
  return (
    <li className="px-4 py-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(78px,max-content)] sm:gap-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[13px] font-medium tracking-[-0.01em] text-fg">
              Trusted browser
            </span>
            {device.current ? (
              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-fg-faint">
                Current
              </span>
            ) : null}
          </div>
          <p className="mt-2 mb-0 font-mono text-[11px] leading-relaxed tracking-tight text-fg-muted">
            <span className="tabular-nums">
              last used {device.lastUsedAt ? formatDateTime(device.lastUsedAt) : "never"}
            </span>
            <MetaSep />
            <span className="tabular-nums">expires {formatDateTime(device.expiresAt)}</span>
            <MetaSep />
            <span title={device.id} className="text-fg-faint tabular-nums">
              id {sessionIdShort(device.id)}
            </span>
          </p>
        </div>
        <div className="flex items-start pt-px sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            className="-mr-2 h-8 px-2 text-[12px] font-medium text-fg-muted hover:bg-transparent hover:text-danger"
            onClick={() => void onRevoke(device.id)}
          >
            {busy === device.id ? "Revoking…" : "Revoke"}
          </Button>
        </div>
      </div>
    </li>
  );
}

function SessionsSectionBody() {
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await listAccountSessions();
      setSessions(response.sessions);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load sessions");
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
        toast.error(error instanceof Error ? error.message : "Failed to load sessions");
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
      toast.error(error instanceof Error ? error.message : "Failed to revoke session");
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
      toast.error(error instanceof Error ? error.message : "Failed to revoke sessions");
    } finally {
      setBusy(null);
    }
  };

  const otherSessions = sessions.filter((session) => !session.current);
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        if (a.current === b.current) return 0;
        return a.current ? -1 : 1;
      }),
    [sessions],
  );

  return (
    <>
      {loading ? (
        <LoadingTip compact />
      ) : sessions.length === 0 ? (
        <p className="m-0 text-[12.5px] text-fg-muted">No active sessions.</p>
      ) : (
        <AccountPaneSections>
          <AccountSectionBlock
            title="Overview"
            description="End every session except this browser."
          >
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
              <p className="m-0 text-[12px] tabular-nums tracking-tight text-fg-muted">
                {sessions.length} session{sessions.length === 1 ? "" : "s"}
              </p>
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
          </AccountSectionBlock>

          <AccountSectionBlock title="Signed in">
            <ul
              className="m-0 list-none divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle p-0"
              aria-label="Sessions"
            >
              {sortedSessions.map((session) => (
                <SessionListItem key={session.id} session={session} busy={busy} onRevoke={revoke} />
              ))}
            </ul>
          </AccountSectionBlock>
        </AccountPaneSections>
      )}
    </>
  );
}

function SessionListItem({
  session,
  busy,
  onRevoke,
}: {
  session: AccountSession;
  busy: string | null;
  onRevoke: (id: string) => void | Promise<void>;
}) {
  const workspace = session.activeOrganizationName ?? "Unknown workspace";

  return (
    <li className="px-4 py-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(78px,max-content)] sm:gap-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[13px] font-medium tracking-[-0.01em] text-fg">{workspace}</span>
            {session.current ? (
              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-fg-faint">
                Current
              </span>
            ) : null}
          </div>
          <p className="mt-2 mb-0 font-mono text-[11px] leading-relaxed tracking-tight text-fg-muted">
            <span className="tabular-nums">created {formatDateTime(session.createdAt)}</span>
            <MetaSep />
            <span className="tabular-nums">expires {formatDateTime(session.expiresAt)}</span>
            <MetaSep />
            <span title={session.id} className="text-fg-faint tabular-nums">
              id {sessionIdShort(session.id)}
            </span>
          </p>
        </div>
        <div className="flex items-start pt-px sm:justify-end">
          {session.current ? (
            <div className="min-h-8 sm:min-w-[4rem]" aria-hidden />
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              className="-mr-2 h-8 px-2 text-[12px] font-medium text-fg-muted hover:bg-transparent hover:text-danger"
              onClick={() => void onRevoke(session.id)}
            >
              {busy === session.id ? "Revoking…" : "Revoke"}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function MetaSep() {
  return (
    <span aria-hidden className="text-fg-faint">
      &nbsp;·&nbsp;
    </span>
  );
}

function sessionIdShort(id: string) {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…`;
}

function ProductTourSectionBody() {
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
      toast.error(error instanceof Error ? error.message : "Failed to restart tour");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountPaneSections>
      <AccountSectionBlock
        title="Walkthrough"
        description="Rebuilds onboarding on the Issues view whenever you replay it."
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
      </AccountSectionBlock>
    </AccountPaneSections>
  );
}

function AppearanceSectionBody() {
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
      toast.error(error instanceof Error ? error.message : "Failed to update");
    }
  };

  return (
    <AccountPaneSections>
      <AccountSectionBlock
        title="Color theme"
        description="Stored in this browser; does not sync to other devices."
      >
        <ul
          role="radiogroup"
          aria-label="Color theme choices"
          className="m-0 list-none divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle p-0"
        >
          {THEMES.map((theme) => {
            const active = current === theme.id;
            return (
              <li key={theme.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => choose(theme.id)}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-4 text-left transition-colors",
                    "hover:bg-surface/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
                  )}
                >
                  <span
                    aria-hidden
                    className="mt-[6px] size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: theme.swatchAccent }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-[13px] font-medium tracking-[-0.01em] text-fg">
                        {theme.label}
                      </span>
                      {active ? (
                        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-fg-faint">
                          Current
                        </span>
                      ) : (
                        <span
                          className="font-mono text-[10px] leading-none tracking-tight text-fg-faint"
                          aria-hidden
                        >
                          {theme.id}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-fg-muted">
                      {theme.hint}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </AccountSectionBlock>

      <AccountSectionBlock
        title="Bottom tab bar"
        description="Keeps Issues, Projects, and Chats reachable while you work."
      >
        <div className="flex justify-end">
          <Toggle
            checked={tabsEnabledLocal ?? prefs?.tabsEnabled ?? true}
            disabled={tabsEnabledLocal === null && !prefs}
            onChange={(value) => void toggleTabs(value)}
            ariaLabel="Bottom tab bar"
          />
        </div>
      </AccountSectionBlock>
    </AccountPaneSections>
  );
}

function NotificationPrefsSectionBody() {
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
      toast.error(error instanceof Error ? error.message : "Failed to update");
    }
  };

  return (
    <>
      {loading || !prefs ? (
        <LoadingTip compact />
      ) : (
        <AccountPaneSections>
          <AccountSectionBlock title="Quiet mode">
            <div className="overflow-hidden rounded-md border border-border-subtle">
              <ToggleRow
                label="Pause all"
                hint="Hold every outbound email notification until unpaused."
                checked={prefs.emailPaused}
                className="px-4 py-3.5"
                onChange={(value) => void apply({ emailPaused: value })}
              />
            </div>
          </AccountSectionBlock>

          <AccountSectionBlock
            title="Issue activity"
            description="Emails for events on issues tied to your account."
          >
            <div className="divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle">
              <ToggleRow
                label="Assignments"
                hint="Someone assigns an issue to you."
                checked={prefs.emailAssignments}
                disabled={prefs.emailPaused}
                className="px-4 py-3.5"
                onChange={(value) => void apply({ emailAssignments: value })}
              />
              <ToggleRow
                label="Comments"
                hint="Someone comments on an issue you follow."
                checked={prefs.emailComments}
                disabled={prefs.emailPaused}
                className="px-4 py-3.5"
                onChange={(value) => void apply({ emailComments: value })}
              />
            </div>
          </AccountSectionBlock>

          <AccountSectionBlock
            title="Digest"
            description="One weekly recap of what moved and what's left."
          >
            <div className="overflow-hidden rounded-md border border-border-subtle">
              <ToggleRow
                label="Progress recap"
                hint="Queued on different weekdays so mail never feels scripted."
                checked={prefs.emailProgress}
                disabled={prefs.emailPaused}
                className="px-4 py-3.5"
                onChange={(value) => void apply({ emailProgress: value })}
              />
            </div>
          </AccountSectionBlock>
        </AccountPaneSections>
      )}
    </>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  className,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  className?: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 py-3",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="text-[13px] text-fg">{label}</div>
        <div className="text-[12px] text-fg-muted">{hint}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} ariaLabel={label} />
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
