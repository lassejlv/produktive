import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { LoadingTip } from "@/components/ui/loading-tip";
import { AiSettings, McpTemplatesSettings } from "@/components/workspace/ai-settings";
import { BillingSettings } from "@/components/workspace/billing-settings";
import { DangerSettings } from "@/components/workspace/danger-settings";
import { MembersSettings } from "@/components/workspace/members-settings";
import { SettingRow, SettingsSkeleton } from "@/components/workspace/setting-row";
import {
  type Invitation,
  type McpApiKey,
  type Member,
  createMcpApiKey,
  listMcpApiKeys,
  listInvitations,
  listMembers,
  revokeMcpApiKey,
} from "@/lib/api";
import { refreshSession, updateActiveOrganization, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/workspace/settings")({
  component: WorkspaceSettingsPage,
});

type SettingsSectionId = "general" | "members" | "billing" | "mcp" | "ai" | "templates" | "danger";

type SettingsSection = {
  id: SettingsSectionId;
  label: string;
  description: string;
  group: "main" | "danger";
};

const settingsSections: SettingsSection[] = [
  {
    id: "general",
    label: "General",
    description: "Workspace name and identity",
    group: "main",
  },
  {
    id: "members",
    label: "Members",
    description: "Invite and manage teammates",
    group: "main",
  },
  {
    id: "billing",
    label: "Billing",
    description: "Plan, payment, and invoices",
    group: "main",
  },
  {
    id: "mcp",
    label: "MCP keys",
    description: "API keys for the Produktive MCP server",
    group: "main",
  },
  {
    id: "ai",
    label: "AI",
    description: "Models and connected MCP servers",
    group: "main",
  },
  {
    id: "templates",
    label: "Templates",
    description: "Reusable prompt templates",
    group: "main",
  },
  {
    id: "danger",
    label: "Danger zone",
    description: "Irreversible actions",
    group: "danger",
  },
];

const isSettingsSectionId = (value: string): value is SettingsSectionId =>
  settingsSections.some((item) => item.id === value);

function WorkspaceSettingsPage() {
  const session = useSession();
  const navigate = useNavigate();
  const organization = session.data?.organization;
  const currentUserEmail = session.data?.user.email ?? null;
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("general");
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  useEffect(() => {
    const section = new URLSearchParams(window.location.search).get("section");
    if (section && isSettingsSectionId(section)) {
      setActiveSection(section);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void Promise.all([listMembers(), listInvitations()])
      .then(([membersResponse, invitationsResponse]) => {
        if (!mounted) return;
        setMembers(membersResponse.members);
        setInvitations(invitationsResponse.invitations);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setMembersLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const onSelectSection = (id: SettingsSectionId) => {
    setActiveSection(id);
    void navigate({
      to: "/workspace/settings",
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

  const currentRole = useMemo(() => {
    if (!currentUserEmail) return null;
    return members.find((member) => member.email === currentUserEmail)?.role ?? null;
  }, [members, currentUserEmail]);

  const canEditWorkspace = currentRole === "owner";
  const activeMeta = settingsSections.find((s) => s.id === activeSection);

  const mainSections = settingsSections.filter((s) => s.group === "main");
  const dangerSections = settingsSections.filter((s) => s.group === "danger");

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
        <h1 className="m-0 text-[22px] font-semibold tracking-[-0.02em] text-fg">Settings</h1>
        <p className="mt-1 text-[13px] text-fg-muted">{organization?.name ?? "This workspace"}</p>
      </header>

      <div className="grid gap-8 md:grid-cols-[180px_minmax(0,1fr)] md:gap-12">
        <nav
          role="tablist"
          aria-label="Settings sections"
          aria-orientation="vertical"
          className="flex flex-col gap-0.5 md:sticky md:top-10 md:self-start"
        >
          <SectionGroup>
            {mainSections.map((section) => {
              return (
                <SectionButton
                  key={section.id}
                  section={section}
                  active={activeSection === section.id}
                  onSelect={onSelectSection}
                  trailing={
                    section.id === "members" && !membersLoading && members.length > 0 ? (
                      <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-surface-2 px-1.5 text-[10.5px] font-medium tabular-nums text-fg-muted">
                        {members.length}
                      </span>
                    ) : null
                  }
                />
              );
            })}
          </SectionGroup>
          {dangerSections.length > 0 ? (
            <>
              <div className="my-1 h-px bg-border-subtle" />
              <SectionGroup>
                {dangerSections.map((section) => (
                  <SectionButton
                    key={section.id}
                    section={section}
                    active={activeSection === section.id}
                    onSelect={onSelectSection}
                    danger
                  />
                ))}
              </SectionGroup>
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

          {activeSection === "general" ? (
            <GeneralSettings organization={organization} canEdit={canEditWorkspace} />
          ) : null}
          {activeSection === "members" ? (
            <MembersSettings
              loading={membersLoading}
              members={members}
              invitations={invitations}
              setInvitations={setInvitations}
            />
          ) : null}
          {activeSection === "billing" ? <BillingSettings /> : null}
          {activeSection === "mcp" ? <McpKeySettings /> : null}
          {activeSection === "ai" ? <AiSettings /> : null}
          {activeSection === "templates" ? <McpTemplatesSettings /> : null}
          {activeSection === "danger" ? (
            organization ? (
              <DangerSettings organization={organization} canEdit={canEditWorkspace} />
            ) : (
              <LoadingTip compact />
            )
          ) : null}
        </main>
      </div>
    </div>
  );
}

function McpKeySettings() {
  const [keys, setKeys] = useState<McpApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const { confirm, dialog } = useConfirmDialog();
  const serverUrl = getMcpServerUrl();

  useEffect(() => {
    let mounted = true;
    void listMcpApiKeys()
      .then((response) => {
        if (!mounted) return;
        setKeys(response.keys);
        if (response.keys.filter((key) => !key.revokedAt).length === 0) {
          setComposerOpen(true);
        }
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to load MCP keys");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const onCopy = async (value: string, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(label);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const onCreate = async (input: { name: string; expiresInDays: number }) => {
    setBusy("create");
    try {
      const response = await createMcpApiKey({
        name: input.name.trim() || undefined,
        expiresInDays: input.expiresInDays,
      });
      setKeys((current) => [response.key, ...current]);
      setNewToken(response.token);
      setComposerOpen(false);
      toast.success("MCP key created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create MCP key");
    } finally {
      setBusy(null);
    }
  };

  const onRevoke = (key: McpApiKey) => {
    confirm({
      title: `Revoke ${key.name}?`,
      description:
        "Any client using this key will lose access immediately. This cannot be undone.",
      confirmLabel: "Revoke key",
      destructive: true,
      onConfirm: async () => {
        setBusy(key.id);
        try {
          await revokeMcpApiKey(key.id);
          setKeys((current) =>
            current.map((item) =>
              item.id === key.id ? { ...item, revokedAt: new Date().toISOString() } : item,
            ),
          );
          toast.success("MCP key revoked");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to revoke MCP key");
        } finally {
          setBusy(null);
        }
      },
    });
  };

  if (loading) {
    return <SettingsSkeleton rows={4} />;
  }

  const activeKeys = keys.filter((key) => !key.revokedAt);
  const revokedKeys = keys.filter((key) => key.revokedAt);

  return (
    <div className="space-y-6">
      {dialog}

      {newToken ? (
        <NewTokenReveal
          token={newToken}
          onDismiss={() => setNewToken(null)}
          onCopy={() => void onCopy(newToken, "MCP key copied")}
        />
      ) : null}

      <EndpointCard
        url={serverUrl}
        onCopy={() => void onCopy(serverUrl, "Endpoint copied")}
      />

      <div>
        {activeKeys.length > 0 || composerOpen ? (
          <div className="mb-2 flex items-end justify-between gap-3">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-faint">
              Active keys
              {activeKeys.length > 0 ? ` · ${activeKeys.length}` : ""}
            </div>
            {!composerOpen ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setComposerOpen(true)}
              >
                + New key
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3">
          {composerOpen ? (
            <KeyComposer
              busy={busy === "create"}
              onCancel={() => setComposerOpen(false)}
              onCreate={(input) => void onCreate(input)}
            />
          ) : null}

          {activeKeys.length === 0 && !composerOpen ? (
            <EmptyKeysState onCreate={() => setComposerOpen(true)} />
          ) : null}

          {activeKeys.length > 0 ? (
            <div className="space-y-2">
              {activeKeys.map((key) => (
                <ActiveKeyCard
                  key={key.id}
                  item={key}
                  busy={busy === key.id}
                  onRevoke={() => onRevoke(key)}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {revokedKeys.length > 0 ? <RevokedSection items={revokedKeys} /> : null}
    </div>
  );
}

function NewTokenReveal({
  token,
  onDismiss,
  onCopy,
}: {
  token: string;
  onDismiss: () => void;
  onCopy: () => void;
}) {
  const [revealed, setRevealed] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="animate-fade-up">
      <div className="animate-pulse-glow relative overflow-hidden rounded-md border border-accent/30 bg-surface p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at top left, color-mix(in srgb, var(--color-accent) 16%, transparent), transparent 55%)",
          }}
        />
        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
              New key · shown once
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="text-[11.5px] text-fg-faint transition-colors hover:text-fg"
            >
              Done
            </button>
          </div>

          <h3 className="m-0 mt-2 text-[15px] font-medium text-fg">Save this key now</h3>
          <p className="mt-1 max-w-[40rem] text-[12.5px] leading-5 text-fg-muted">
            Produktive only displays the full token on this screen. Store it in your MCP client or
            password manager before navigating away.
          </p>

          <div className="mt-4 flex items-stretch gap-2">
            <div className="flex flex-1 items-center break-all rounded border border-border-subtle bg-bg px-3 py-2.5 font-mono text-[12.5px] leading-5 text-fg">
              {revealed ? token : "•".repeat(Math.min(token.length, 48))}
            </div>
            <button
              type="button"
              onClick={() => setRevealed((value) => !value)}
              aria-label={revealed ? "Hide key" : "Reveal key"}
              className="shrink-0 rounded border border-border-subtle bg-bg px-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-muted transition-colors hover:border-border hover:text-fg"
            >
              {revealed ? "Hide" : "Reveal"}
            </button>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleCopy}
              className={cn(copied ? "bg-success text-bg hover:bg-success" : "")}
            >
              {copied ? "Copied ✓" : "Copy key"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EndpointCard({ url, onCopy }: { url: string; onCopy: () => void }) {
  return (
    <div className="rounded-md border border-border-subtle bg-surface/50 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-faint">
          Endpoint
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="text-[11px] text-fg-muted transition-colors hover:text-fg"
        >
          Copy
        </button>
      </div>
      <div className="truncate rounded border border-border-subtle bg-bg px-3 py-2 font-mono text-[12.5px] text-fg">
        {url}
      </div>
      <p className="mt-2 text-[11.5px] leading-5 text-fg-faint">
        Send your token as{" "}
        <code className="font-mono text-fg-muted">Authorization: Bearer &lt;your-key&gt;</code>.
      </p>
    </div>
  );
}

const EXPIRY_PRESETS: Array<{ label: string; days: number }> = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
  { label: "2 years", days: 730 },
];

function KeyComposer({
  busy,
  onCancel,
  onCreate,
}: {
  busy: boolean;
  onCancel: () => void;
  onCreate: (input: { name: string; expiresInDays: number }) => void;
}) {
  const [name, setName] = useState("Desktop MCP");
  const [expiresInDays, setExpiresInDays] = useState("365");

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = Number.parseInt(expiresInDays, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      toast.error("Expiration must be at least 1 day.");
      return;
    }
    onCreate({ name, expiresInDays: parsed });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="animate-fade-in rounded-md border border-border-subtle bg-surface/50 p-4"
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint">
            Name
          </label>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Desktop MCP"
            disabled={busy}
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint">
            Expires (days)
          </label>
          <Input
            value={expiresInDays}
            onChange={(event) => setExpiresInDays(event.target.value)}
            inputMode="numeric"
            disabled={busy}
            aria-label="Expiration in days"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {EXPIRY_PRESETS.map((preset) => {
          const active = expiresInDays === String(preset.days);
          return (
            <button
              key={preset.days}
              type="button"
              onClick={() => setExpiresInDays(String(preset.days))}
              disabled={busy}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                active
                  ? "border-border bg-surface-2 text-fg"
                  : "border-border-subtle bg-transparent text-fg-muted hover:border-border hover:text-fg",
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-fg-faint">
          Keys are scoped to the active workspace.
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Creating…" : "Create key"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function ActiveKeyCard({
  item,
  busy,
  onRevoke,
}: {
  item: McpApiKey;
  busy: boolean;
  onRevoke: () => void;
}) {
  const status = getKeyStatus(item);
  const stripColor =
    status.tone === "success"
      ? "bg-success"
      : status.tone === "warning"
        ? "bg-warning"
        : "bg-danger";

  return (
    <div className="group relative overflow-hidden rounded-md border border-border-subtle bg-surface/40 p-4 transition-colors hover:border-border hover:bg-surface">
      <span
        aria-hidden
        className={cn("absolute left-0 top-0 h-full w-[2px]", stripColor)}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-fg">{item.name}</span>
            <KeyStatusPill tone={status.tone} label={status.label} />
          </div>
          <span className="mt-2 inline-block rounded border border-border-subtle bg-bg/60 px-2 py-1 font-mono text-[11.5px] text-fg-muted">
            {item.tokenPrefix}…
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRevoke}
          disabled={busy}
        >
          {busy ? "Revoking…" : "Revoke"}
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <KeyMetaCell
          label="Created"
          value={formatRelative(item.createdAt)}
          title={formatDate(item.createdAt)}
        />
        <KeyMetaCell
          label="Last used"
          value={item.lastUsedAt ? formatRelative(item.lastUsedAt) : "Never"}
          title={item.lastUsedAt ? formatDate(item.lastUsedAt) : undefined}
          dim={!item.lastUsedAt}
        />
        <KeyMetaCell
          label="Expires"
          value={item.expiresAt ? formatRelative(item.expiresAt) : "Never"}
          title={item.expiresAt ? formatDate(item.expiresAt) : undefined}
          dim={!item.expiresAt}
        />
      </div>
    </div>
  );
}

function KeyMetaCell({
  label,
  value,
  title,
  dim = false,
}: {
  label: string;
  value: string;
  title?: string;
  dim?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 truncate text-[12px]",
          dim ? "text-fg-faint" : "text-fg-muted",
        )}
        title={title}
      >
        {value}
      </div>
    </div>
  );
}

function KeyStatusPill({
  tone,
  label,
}: {
  tone: "success" | "warning" | "danger";
  label: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]",
        tone === "success" && "bg-success/10 text-success",
        tone === "warning" && "bg-warning/10 text-warning",
        tone === "danger" && "bg-danger/10 text-danger",
      )}
    >
      {label}
    </span>
  );
}

function EmptyKeysState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-md border border-dashed border-border-subtle px-6 py-12 text-center">
      <div className="font-mono text-[26px] tracking-[-0.02em] text-fg-faint">[ key ]</div>
      <h3 className="m-0 mt-3 text-[14px] font-medium text-fg">No keys yet</h3>
      <p className="mx-auto mt-1 max-w-[28rem] text-[12px] leading-5 text-fg-muted">
        Create your first MCP key to connect Claude Desktop, Cursor, or any other MCP client to
        this workspace.
      </p>
      <div className="mt-4 flex justify-center">
        <Button type="button" size="sm" onClick={onCreate}>
          Create MCP key
        </Button>
      </div>
    </div>
  );
}

function RevokedSection({ items }: { items: McpApiKey[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-faint transition-colors hover:text-fg-muted"
      >
        <span>
          {open ? "Hide" : "Show"} {items.length} revoked{" "}
          {items.length === 1 ? "key" : "keys"}
        </span>
        <span aria-hidden className="text-[9px]">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open ? (
        <div className="mt-2 divide-y divide-border-subtle rounded-md border border-border-subtle opacity-60">
          {items.map((key) => (
            <div
              key={key.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-[12.5px] text-fg-muted">{key.name}</span>
                <KeyStatusPill tone="danger" label="revoked" />
                <span className="font-mono text-[11px] text-fg-faint">
                  {key.tokenPrefix}…
                </span>
              </div>
              <span className="text-[11px] text-fg-faint">
                Revoked {key.revokedAt ? formatRelative(key.revokedAt) : "—"}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatRelative(value: string): string {
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return "—";
  const diffMs = target - Date.now();
  const future = diffMs > 0;
  const absMs = Math.abs(diffMs);
  const sec = Math.floor(absMs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  const month = Math.floor(day / 30);
  const year = Math.floor(day / 365);

  if (sec < 30) return "just now";
  if (day === 1) return future ? "tomorrow" : "yesterday";

  let phrase: string;
  if (min < 1) phrase = `${sec}s`;
  else if (hr < 1) phrase = `${min} min`;
  else if (day < 1) phrase = `${hr} hr`;
  else if (day < 30) phrase = `${day} days`;
  else if (month < 12) phrase = `${month} mo`;
  else phrase = `${year} yr`;

  return future ? `in ${phrase}` : `${phrase} ago`;
}

function getKeyStatus(item: McpApiKey): {
  tone: "success" | "warning" | "danger";
  label: string;
} {
  if (item.expiresAt) {
    const expires = new Date(item.expiresAt).getTime();
    const now = Date.now();
    if (expires <= now) {
      return { tone: "danger", label: "expired" };
    }
    const daysLeft = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 14) {
      return { tone: "warning", label: `expires in ${daysLeft}d` };
    }
  }
  return { tone: "success", label: "active" };
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getMcpServerUrl() {
  if (typeof window === "undefined") return "https://mcp.produktive.app/mcp";
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return "http://localhost:3001/mcp";
  }
  return `${window.location.origin.replace(/^https?:\/\/(www\.)?/, "https://mcp.")}/mcp`;
}

function SectionGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-0.5">{children}</div>;
}

function SectionButton({
  section,
  active,
  onSelect,
  danger = false,
  trailing,
}: {
  section: SettingsSection;
  active: boolean;
  onSelect: (id: SettingsSectionId) => void;
  danger?: boolean;
  trailing?: React.ReactNode;
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
      {trailing}
    </button>
  );
}

function GeneralSettings({
  organization,
  canEdit,
}: {
  organization?: { name: string; slug: string } | null;
  canEdit: boolean;
}) {
  const [draftName, setDraftName] = useState(organization?.name ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setDraftName(organization?.name ?? "");
  }, [organization?.name]);

  if (!organization) return <LoadingTip compact />;

  const trimmed = draftName.trim();
  const dirty = trimmed !== organization.name;
  const tooLong = trimmed.length > 64;
  const canSave = canEdit && dirty && trimmed.length > 0 && !tooLong && !submitting;

  const onSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    setSubmitting(true);
    try {
      await updateActiveOrganization({ name: trimmed });
      await refreshSession();
      toast.success("Workspace renamed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename workspace");
    } finally {
      setSubmitting(false);
    }
  };

  const onReset = () => setDraftName(organization.name);

  return (
    <form onSubmit={onSave}>
      <SettingRow label="Name">
        <Input
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          disabled={!canEdit || submitting}
          maxLength={80}
          aria-invalid={tooLong || undefined}
        />
        <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-fg-faint">
          <span>
            {canEdit
              ? "Visible to teammates and on shared links."
              : "Only owners can rename the workspace."}
          </span>
          <span className={cn("tabular-nums", tooLong ? "text-danger" : "text-fg-faint")}>
            {trimmed.length}/64
          </span>
        </div>
      </SettingRow>
      <SettingRow label="Slug">
        <span className="font-mono text-[12px] text-fg-muted">{organization.slug}</span>
        <p className="mt-1 text-[11.5px] text-fg-faint">
          Used in URLs and integrations. Slugs are permanent.
        </p>
      </SettingRow>

      {canEdit ? (
        <div className="flex justify-end gap-2 pt-3">
          {dirty ? (
            <Button type="button" variant="ghost" size="sm" onClick={onReset} disabled={submitting}>
              Reset
            </Button>
          ) : null}
          <Button type="submit" size="sm" disabled={!canSave}>
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
