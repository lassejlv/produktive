import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  const [name, setName] = useState("Desktop MCP");
  const [expiresInDays, setExpiresInDays] = useState("365");
  const [busy, setBusy] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const serverUrl = getMcpServerUrl();

  useEffect(() => {
    let mounted = true;
    void listMcpApiKeys()
      .then((response) => {
        if (mounted) setKeys(response.keys);
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

  const onCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedDays = Number.parseInt(expiresInDays, 10);
    if (!Number.isFinite(parsedDays) || parsedDays < 1) {
      toast.error("Expiration must be at least 1 day.");
      return;
    }
    setBusy("create");
    try {
      const response = await createMcpApiKey({
        name: name.trim() || undefined,
        expiresInDays: parsedDays,
      });
      setKeys((current) => [response.key, ...current]);
      setNewToken(response.token);
      toast.success("MCP key created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create MCP key");
    } finally {
      setBusy(null);
    }
  };

  const onCopy = async (value: string, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(label);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const onRevoke = async (key: McpApiKey) => {
    if (!window.confirm(`Revoke ${key.name}? This cannot be undone.`)) return;
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
  };

  if (loading) {
    return <SettingsSkeleton rows={4} />;
  }

  const activeKeys = keys.filter((key) => !key.revokedAt);
  const revokedKeys = keys.filter((key) => key.revokedAt);

  return (
    <div className="space-y-5">
      {newToken ? (
        <div className="border border-[#EAEAEA] bg-[#FBFBFA] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-serif text-[18px] leading-tight tracking-[-0.03em] text-[#111111]">
                Copy this key now
              </div>
              <p className="mt-1 max-w-[38rem] text-[12.5px] leading-5 text-[#787774]">
                Produktive only shows the full token once. Store it in your MCP client or password
                manager before leaving this page.
              </p>
            </div>
            <Button type="button" size="sm" onClick={() => void onCopy(newToken, "MCP key copied")}>
              Copy key
            </Button>
          </div>
          <code className="mt-3 block overflow-x-auto border border-[#EAEAEA] bg-white px-3 py-2 font-mono text-[11.5px] leading-5 text-[#2F3437]">
            {newToken}
          </code>
        </div>
      ) : null}

      <form onSubmit={(event) => void onCreate(event)}>
        <SettingRow label="Create key">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px]">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Desktop MCP"
              disabled={busy === "create"}
            />
            <Input
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(event.target.value)}
              inputMode="numeric"
              disabled={busy === "create"}
              aria-label="Expiration in days"
            />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-fg-faint">
            <span>Keys are scoped to the active workspace.</span>
            <span className="font-mono">days until expiry</span>
          </div>
          <div className="mt-3 flex justify-end">
            <Button type="submit" size="sm" disabled={busy === "create"}>
              {busy === "create" ? "Creating..." : "Create MCP key"}
            </Button>
          </div>
        </SettingRow>
      </form>

      <SettingRow label="Server">
        <div className="grid gap-2">
          <div className="flex min-w-0 items-center justify-between gap-2 border border-[#EAEAEA] bg-white px-3 py-2">
            <code className="truncate font-mono text-[12px] text-[#2F3437]">{serverUrl}</code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void onCopy(serverUrl, "Server URL copied")}
            >
              Copy
            </Button>
          </div>
          <p className="text-[11.5px] leading-5 text-fg-faint">
            Use this endpoint with the token as a Bearer key.
          </p>
        </div>
      </SettingRow>

      <div>
        {activeKeys.length === 0 ? (
          <SettingRow label="Active keys">
            <span className="text-fg-muted">No active MCP keys.</span>
          </SettingRow>
        ) : (
          <div className="border-t border-border-subtle">
            {activeKeys.map((key) => (
              <McpKeyRow
                key={key.id}
                item={key}
                busy={busy === key.id}
                onRevoke={() => void onRevoke(key)}
              />
            ))}
          </div>
        )}

        {revokedKeys.length > 0 ? (
          <div className="mt-5">
            <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-faint">
              Revoked
            </div>
            <div className="border-t border-border-subtle opacity-70">
              {revokedKeys.map((key) => (
                <McpKeyRow key={key.id} item={key} revoked />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function McpKeyRow({
  item,
  busy = false,
  revoked = false,
  onRevoke,
}: {
  item: McpApiKey;
  busy?: boolean;
  revoked?: boolean;
  onRevoke?: () => void;
}) {
  return (
    <div className="grid gap-2 border-b border-border-subtle py-3 text-[13px] md:grid-cols-[140px_minmax(0,1fr)]">
      <div className="text-fg-faint">{revoked ? "Revoked key" : "Active key"}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-fg">{item.name}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]",
                  revoked ? "bg-[#FDEBEC] text-[#9F2F2D]" : "bg-[#EDF3EC] text-[#346538]",
                )}
              >
                {revoked ? "revoked" : "active"}
              </span>
            </div>
            <div className="mt-1 font-mono text-[11.5px] text-fg-muted">{item.tokenPrefix}...</div>
            <div className="mt-1 text-[11.5px] text-fg-faint">
              Created {formatDate(item.createdAt)}
              {item.expiresAt ? ` · Expires ${formatDate(item.expiresAt)}` : ""}
              {item.lastUsedAt ? ` · Last used ${formatDate(item.lastUsedAt)}` : ""}
            </div>
          </div>
          {!revoked && onRevoke ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRevoke}>
              {busy ? "Revoking..." : "Revoke"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
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
