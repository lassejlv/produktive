import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DotsIcon, GithubIcon } from "@/components/chat/icons";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { LoadingTip } from "@/components/ui/loading-tip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AiSettings, McpTemplatesSettings } from "@/components/workspace/ai-settings";
import { DangerSettings } from "@/components/workspace/danger-settings";
import { GithubRepoPicker } from "@/components/workspace/github-repo-picker";
import { MembersSettings } from "@/components/workspace/members-settings";
import { SettingRow, SettingsSkeleton } from "@/components/workspace/setting-row";
import {
  type Invitation,
  type GithubImportPreview,
  type GithubRepository,
  type IssueStatus,
  type IssueStatusCategory,
  type McpApiKey,
  type Member,
  type PermissionInfo,
  type Role,
  type SecurityEvent,
  createIssueStatus,
  deleteIssueStatus,
  listInvitations,
  listMembers,
  listRoles,
  listSecurityEvents,
  sendTwoFactorNudges,
  updateIssueStatus,
} from "@/lib/api";
import { useGithubConnectionQuery, useGithubRepositoriesQuery } from "@/lib/queries/github";
import { useMcpKeysQuery } from "@/lib/queries/mcp";
import { useSlackConnectionQuery } from "@/lib/queries/slack";
import {
  useCreateGithubRepository,
  useDeleteGithubRepository,
  useDisconnectGithub,
  useImportGithubRepository,
  usePreviewGithubRepository,
  useStartGithubOAuth,
  useUpdateGithubRepository,
} from "@/lib/mutations/github";
import { useCreateMcpApiKey, useDeleteMcpApiKey, useRevokeMcpApiKey } from "@/lib/mutations/mcp";
import {
  useDisconnectSlack,
  useStartSlackOAuth,
  useUpdateSlackConnection,
} from "@/lib/mutations/slack";
import {
  refreshSession,
  updateActiveOrganization,
  uploadActiveOrganizationIcon,
  useSession,
} from "@/lib/auth-client";
import { requestFreshTwoFactorIfNeeded } from "@/lib/fresh-two-factor";
import { cn } from "@/lib/utils";
import { useIssueStatuses } from "@/lib/use-issue-statuses";

export const Route = createFileRoute("/_app/workspace/settings")({
  component: WorkspaceSettingsPage,
});

type SettingsSectionId =
  | "general"
  | "security"
  | "members"
  | "statuses"
  | "integrations"
  | "ai"
  | "templates"
  | "danger";

type SettingsSection = {
  id: SettingsSectionId;
  label: string;
  description: string;
  group: "main" | "danger";
};

const PRODUKTIVE_MCP_ENDPOINT = "https://mcp.produktive.app/mcp";

const settingsSections: SettingsSection[] = [
  {
    id: "general",
    label: "General",
    description: "Workspace name and identity",
    group: "main",
  },
  {
    id: "security",
    label: "Security",
    description: "2FA compliance and security activity",
    group: "main",
  },
  {
    id: "members",
    label: "Members",
    description: "Invite and manage teammates",
    group: "main",
  },
  {
    id: "statuses",
    label: "Statuses",
    description: "Customize issue workflow columns",
    group: "main",
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "GitHub, Discord, MCP, and API keys",
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

const LEGACY_SECTION_TO_INTEGRATIONS = new Set(["github", "discord", "mcp"]);

const settingsNavGroups: { label: string; ids: SettingsSectionId[] }[] = [
  { label: "Workspace", ids: ["general", "security", "members", "statuses"] },
  { label: "Integrations", ids: ["integrations"] },
  { label: "Automation", ids: ["ai", "templates"] },
];

const isSettingsSectionId = (value: string): value is SettingsSectionId =>
  settingsSections.some((item) => item.id === value);

function settingsSectionMeta(id: SettingsSectionId): SettingsSection {
  return settingsSections.find((s) => s.id === id)!;
}

function WorkspaceSettingsPage() {
  const session = useSession();
  const navigate = useNavigate();
  const organization = session.data?.organization;
  const currentUserEmail = session.data?.user.email ?? null;
  const currentUserTwoFactorEnabled = session.data?.user.twoFactorEnabled ?? false;
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("general");
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<PermissionInfo[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [securityEventsLoading, setSecurityEventsLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(true);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("section");
    if (raw && LEGACY_SECTION_TO_INTEGRATIONS.has(raw)) {
      setActiveSection("integrations");
      void navigate({
        to: "/workspace/settings",
        search: { section: "integrations" },
        replace: true,
      });
      return;
    }
    if (raw && isSettingsSectionId(raw)) {
      setActiveSection(raw);
    }
  }, [navigate]);

  useEffect(() => {
    let mounted = true;
    void Promise.all([listMembers(), listInvitations(), listRoles()])
      .then(([membersResponse, invitationsResponse, rolesResponse]) => {
        if (!mounted) return;
        setMembers(membersResponse.members);
        setInvitations(invitationsResponse.invitations);
        setRoles(rolesResponse.roles);
        setPermissions(rolesResponse.permissions);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setMembersLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void listSecurityEvents()
      .then((response) => {
        if (mounted) setSecurityEvents(response.events);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setSecurityEventsLoading(false);
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

  const currentPermissions = useMemo(() => {
    const role = roles.find((role) => role.key === currentRole);
    return new Set(role?.permissions ?? []);
  }, [roles, currentRole]);

  const hasPermission = (permission: string) => currentPermissions.has(permission);
  const canEditWorkspace = hasPermission("workspace.rename");
  const canEditSecurity = hasPermission("workspace.security");
  const activeMeta = settingsSections.find((s) => s.id === activeSection);
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
          {settingsNavGroups.map((group, groupIndex) => (
            <div key={group.label} className={cn(groupIndex > 0 && "mt-4")}>
              <p className="mb-1 px-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-fg-faint">
                {group.label}
              </p>
              <SectionGroup>
                {group.ids.map((id) => {
                  const section = settingsSectionMeta(id);
                  return (
                    <SectionButton
                      key={id}
                      section={section}
                      active={activeSection === id}
                      onSelect={onSelectSection}
                    />
                  );
                })}
              </SectionGroup>
            </div>
          ))}
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
            activeSection === "integrations" ? (
              <h2 id="integrations-main-heading" className="sr-only">
                {activeMeta.label}
              </h2>
            ) : (
              <header className="mb-5 border-b border-border-subtle pb-4">
                <h2 className="m-0 text-[15px] font-medium text-fg">{activeMeta.label}</h2>
                <p className="mt-1 text-[12.5px] text-fg-faint">{activeMeta.description}</p>
              </header>
            )
          ) : null}

          {activeSection === "general" ? (
            <GeneralSettings
              organization={organization}
              members={members}
              membersLoading={membersLoading}
              canEdit={canEditWorkspace}
              canEditSecurity={canEditSecurity}
              currentUserTwoFactorEnabled={currentUserTwoFactorEnabled}
            />
          ) : null}
          {activeSection === "members" ? (
            <MembersSettings
              loading={membersLoading}
              members={members}
              setMembers={setMembers}
              invitations={invitations}
              setInvitations={setInvitations}
              roles={roles}
              setRoles={setRoles}
              permissions={permissions}
              currentUserEmail={currentUserEmail}
              currentRole={currentRole}
              currentPermissions={currentPermissions}
              currentUserTwoFactorEnabled={currentUserTwoFactorEnabled}
            />
          ) : null}
          {activeSection === "security" ? (
            <SecuritySettings
              organization={organization}
              members={members}
              membersLoading={membersLoading}
              events={securityEvents}
              eventsLoading={securityEventsLoading}
              canEditSecurity={canEditSecurity}
              currentUserTwoFactorEnabled={currentUserTwoFactorEnabled}
              onEventsChange={setSecurityEvents}
            />
          ) : null}
          {activeSection === "statuses" ? (
            <StatusSettings canEdit={hasPermission("issue_statuses.manage")} />
          ) : null}
          {activeSection === "integrations" ? (
            <IntegrationsSettings
              canEditGithub={hasPermission("integrations.github.manage")}
              canEditSlack={hasPermission("integrations.slack.manage")}
            />
          ) : null}
          {activeSection === "ai" ? <AiSettings /> : null}
          {activeSection === "templates" ? <McpTemplatesSettings /> : null}
          {activeSection === "danger" ? (
            organization ? (
              <DangerSettings
                organization={organization}
                canEdit={canEditWorkspace}
                currentUserTwoFactorEnabled={currentUserTwoFactorEnabled}
              />
            ) : (
              <LoadingTip compact />
            )
          ) : null}
        </main>
      </div>
    </div>
  );
}

const DISCORD_INSTALL_URL =
  "https://discord.com/oauth2/authorize?client_id=1500101363303059456&permissions=277025459200&integration_type=0&scope=bot";

const statusCategories: { value: IssueStatusCategory; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "active", label: "Active" },
  { value: "done", label: "Done" },
  { value: "canceled", label: "Canceled" },
];

const statusColors = ["gray", "blue", "purple", "green", "red", "yellow", "pink"];

function StatusSettings({ canEdit }: { canEdit: boolean }) {
  const { statuses, setStatuses, refresh } = useIssueStatuses();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<IssueStatusCategory>("active");
  const [color, setColor] = useState("gray");
  const [saving, setSaving] = useState(false);
  const [replacementByStatus, setReplacementByStatus] = useState<Record<string, string>>({});

  const sorted = useMemo(() => [...statuses].sort((a, b) => a.sortOrder - b.sortOrder), [statuses]);

  const createStatus = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || saving || !name.trim()) return;
    setSaving(true);
    try {
      const response = await createIssueStatus({ name, category, color });
      setStatuses([...statuses, response.status].sort((a, b) => a.sortOrder - b.sortOrder));
      setName("");
      setCategory("active");
      setColor("gray");
      toast.success("Status created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create status");
    } finally {
      setSaving(false);
    }
  };

  const updateLocal = (status: IssueStatus, patch: Partial<IssueStatus>) => {
    setStatuses(statuses.map((item) => (item.id === status.id ? { ...item, ...patch } : item)));
  };

  const saveStatus = async (status: IssueStatus, patch: Partial<IssueStatus>) => {
    if (!canEdit || status.isSystem) return;
    const next = { ...status, ...patch };
    updateLocal(status, patch);
    try {
      const response = await updateIssueStatus(status.id, {
        name: next.name,
        color: next.color,
        category: next.category,
      });
      updateLocal(status, response.status);
      toast.success("Status updated");
    } catch (error) {
      updateLocal(status, status);
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    }
  };

  const archiveStatus = async (status: IssueStatus) => {
    if (!canEdit || status.isSystem) return;
    const replacement = replacementByStatus[status.id] ?? replacementFor(status)?.key;
    try {
      await deleteIssueStatus(status.id, replacement);
      setStatuses(statuses.filter((item) => item.id !== status.id));
      toast.success("Status archived");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to archive status");
    }
  };

  function replacementFor(status: IssueStatus) {
    return (
      sorted.find((item) => item.id !== status.id && item.category === status.category) ??
      sorted.find((item) => item.id !== status.id)
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h3 className="m-0 text-[13px] font-medium text-fg">Issue workflow</h3>
        <div className="mt-3 overflow-hidden rounded-md border border-border-subtle">
          {sorted.map((status, index) => (
            <div
              key={status.id}
              className={cn(
                "grid gap-2 px-3 py-2.5 text-[13px] md:grid-cols-[minmax(0,1fr)_120px_110px_140px_auto]",
                index !== sorted.length - 1 && "border-b border-border-subtle",
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <StatusColor color={status.color} />
                {status.isSystem || !canEdit ? (
                  <span className="truncate text-fg">{status.name}</span>
                ) : (
                  <Input
                    value={status.name}
                    onChange={(event) => updateLocal(status, { name: event.target.value })}
                    onBlur={() => void saveStatus(status, { name: status.name })}
                    className="h-8"
                  />
                )}
              </div>
              <Select
                value={status.category}
                disabled={status.isSystem || !canEdit}
                onValueChange={(value) =>
                  void saveStatus(status, {
                    category: value as IssueStatusCategory,
                  })
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  {statusCategories.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={status.color}
                disabled={status.isSystem || !canEdit}
                onValueChange={(value) => void saveStatus(status, { color: value })}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  {statusColors.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!status.isSystem && canEdit ? (
                <Select
                  aria-label="Replacement status"
                  value={replacementByStatus[status.id] ?? replacementFor(status)?.key ?? ""}
                  onValueChange={(value) =>
                    setReplacementByStatus((current) => ({
                      ...current,
                      [status.id]: value,
                    }))
                  }
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {sorted
                      .filter((item) => item.id !== status.id)
                      .map((item) => (
                        <SelectItem key={item.key} value={item.key}>
                          Move to {item.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="hidden md:block" />
              )}
              {!status.isSystem && canEdit ? (
                <button
                  type="button"
                  onClick={() => void archiveStatus(status)}
                  className="rounded-md px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  Archive
                </button>
              ) : (
                <span className="text-[11px] text-fg-faint">{status.isSystem ? "System" : ""}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {canEdit ? (
        <section>
          <h3 className="m-0 text-[13px] font-medium text-fg">Create status</h3>
          <form
            onSubmit={createStatus}
            className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_110px_auto]"
          >
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ready for review"
              disabled={saving}
            />
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as IssueStatusCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {statusCategories.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={color} onValueChange={setColor}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {statusColors.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" size="sm" disabled={saving || !name.trim()}>
              {saving ? "Creating..." : "Create"}
            </Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

function StatusColor({ color }: { color: string }) {
  const colors: Record<string, string> = {
    gray: "bg-fg-faint",
    blue: "bg-accent",
    purple: "bg-purple-400",
    green: "bg-success",
    red: "bg-danger",
    yellow: "bg-warning",
    pink: "bg-pink-400",
  };
  return <span className={cn("size-2 rounded-full", colors[color] ?? colors.gray)} aria-hidden />;
}

type IntegrationSubtabId = "github" | "slack" | "discord" | "mcp" | "rest";

const INTEGRATION_SUBTABS: { id: IntegrationSubtabId; label: string }[] = [
  { id: "github", label: "GitHub" },
  { id: "slack", label: "Slack" },
  { id: "discord", label: "Discord" },
  { id: "mcp", label: "MCP" },
  { id: "rest", label: "REST API" },
];

function IntegrationSubtabBar({
  active,
  onSelect,
}: {
  active: IntegrationSubtabId;
  onSelect: (id: IntegrationSubtabId) => void;
}) {
  return (
    <nav
      aria-label="Integration types"
      className="-mx-px -mt-px flex flex-nowrap items-end gap-x-px overflow-x-auto border-border-subtle border-b [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-x-8 [&::-webkit-scrollbar]:hidden"
      role="tablist"
    >
      {INTEGRATION_SUBTABS.map(({ id, label }) => {
        const selected = active === id;
        return (
          <button
            key={id}
            id={`integrations-subtab-${id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(id)}
            className={cn(
              "-mb-px shrink-0 border-b-[1.5px] border-transparent px-2 pb-3 pt-1 text-[13px] tracking-[-0.01em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-offset-2 sm:px-0",
              selected ? "border-fg font-medium text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}

function IntegrationsSettings({
  canEditGithub,
  canEditSlack,
}: {
  canEditGithub: boolean;
  canEditSlack: boolean;
}) {
  const [sub, setSub] = useState<IntegrationSubtabId>("github");

  return (
    <div className="min-w-0">
      <IntegrationSubtabBar active={sub} onSelect={setSub} />

      <div role="tabpanel" aria-labelledby={`integrations-subtab-${sub}`} className="min-w-0 pt-8">
        {sub === "github" ? <GithubSettings canEdit={canEditGithub} /> : null}
        {sub === "slack" ? <SlackSettings canEdit={canEditSlack} /> : null}
        {sub === "discord" ? <DiscordSettings /> : null}
        {sub === "mcp" ? <HostedMcpSettingsRows /> : null}
        {sub === "rest" ? <McpKeySettings /> : null}
      </div>
    </div>
  );
}

function HostedMcpSettingsRows() {
  const onCopyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(PRODUKTIVE_MCP_ENDPOINT);
      toast.success("MCP endpoint copied");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <>
      <SettingRow label="Server URL">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={PRODUKTIVE_MCP_ENDPOINT}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 break-all font-mono text-[12px] text-accent hover:underline"
          >
            {PRODUKTIVE_MCP_ENDPOINT}
          </a>
          <Button type="button" variant="outline" size="sm" onClick={() => void onCopyEndpoint()}>
            Copy
          </Button>
        </div>
      </SettingRow>
      <SettingRow label="Authentication">
        <span className="text-[13px] text-fg-muted">
          OAuth. Complete Produktive sign-in when your MCP client opens the browser.
        </span>
      </SettingRow>
      <SettingRow label="Documentation">
        <Button asChild variant="outline" size="sm">
          <a href={PRODUKTIVE_MCP_ENDPOINT} target="_blank" rel="noreferrer">
            Open MCP reference
          </a>
        </Button>
      </SettingRow>
    </>
  );
}

function DiscordSettings() {
  return (
    <div>
      <SettingRow label="Install bot">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <a href={DISCORD_INSTALL_URL} target="_blank" rel="noreferrer">
              Add to Discord
            </a>
          </Button>
          <span className="text-[12px] text-fg-muted">
            Opens Discord to install the Produktive bot in a server.
          </span>
        </div>
      </SettingRow>
      <SettingRow label="After install">
        <span className="text-fg-muted">
          Run <span className="font-mono text-fg">/produktive login</span> in Discord to link a
          workspace.
        </span>
      </SettingRow>
    </div>
  );
}

function SlackSettings({ canEdit }: { canEdit: boolean }) {
  const connectionQuery = useSlackConnectionQuery();
  const connection = connectionQuery.data ?? null;
  const startOAuth = useStartSlackOAuth();
  const updateConnection = useUpdateSlackConnection();
  const disconnect = useDisconnectSlack();
  const { confirm, dialog } = useConfirmDialog();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slack = params.get("slack");
    const message = params.get("message");
    if (slack === "oauth_connected") {
      toast.success("Slack connected");
    } else if (slack === "oauth_error") {
      toast.error(message || "Slack connection failed");
    }
  }, []);

  const onConnect = async () => {
    try {
      const response = await startOAuth.mutateAsync();
      window.location.href = response.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start Slack OAuth");
    }
  };

  const onToggleAgent = async (enabled: boolean) => {
    try {
      await updateConnection.mutateAsync({ agentEnabled: enabled });
      toast.success(enabled ? "Slack agent enabled" : "Slack agent disabled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update Slack");
    }
  };

  const onDisconnect = () => {
    confirm({
      title: "Disconnect Slack?",
      description:
        "Slack commands and mentions will stop working for this workspace until Slack is installed again.",
      confirmLabel: "Disconnect",
      destructive: true,
      onConfirm: async () => {
        try {
          await disconnect.mutateAsync();
          toast.success("Slack disconnected");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to disconnect Slack");
        }
      },
    });
  };

  const busy = startOAuth.isPending || updateConnection.isPending || disconnect.isPending;

  return (
    <div>
      {dialog}
      <SettingRow label="Workspace">
        {connectionQuery.isLoading ? (
          <span className="text-[13px] text-fg-muted">Loading Slack connection...</span>
        ) : connection?.connected ? (
          <div className="grid gap-1">
            <span className="text-[13px] text-fg">
              {connection.teamName ?? "Connected Slack workspace"}
            </span>
            <span className="font-mono text-[11px] text-fg-faint">{connection.teamId}</span>
          </div>
        ) : (
          <span className="text-[13px] text-fg-muted">Slack is not connected.</span>
        )}
      </SettingRow>
      <SettingRow label="Install app">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={onConnect} disabled={!canEdit || busy}>
            {connection?.connected ? "Reconnect Slack" : "Add to Slack"}
          </Button>
          <span className="text-[12px] text-fg-muted">
            Installs the Produktive bot with slash commands and app mentions.
          </span>
        </div>
      </SettingRow>
      <SettingRow label="User login">
        <span className="text-fg-muted">
          Run <span className="font-mono text-fg">/produktive login</span> in Slack before creating
          or updating issues.
        </span>
      </SettingRow>
      {connection?.connected ? (
        <>
          <SettingRow label="Agent">
            <label className="inline-flex items-center gap-2 text-[13px] text-fg-muted">
              <input
                type="checkbox"
                checked={connection.agentEnabled}
                disabled={!canEdit || busy}
                onChange={(event) => void onToggleAgent(event.target.checked)}
                className="h-3.5 w-3.5 accent-fg"
              />
              Allow <span className="font-mono text-fg">/agent ask</span> and non-issue mentions.
            </label>
          </SettingRow>
          <SettingRow label="Commands">
            <span className="text-fg-muted">
              Use <span className="font-mono text-fg">/issue create</span>,{" "}
              <span className="font-mono text-fg">/issue list</span>, and{" "}
              <span className="font-mono text-fg">/agent ask</span>.
            </span>
          </SettingRow>
          <SettingRow label="Disconnect">
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={!canEdit || busy}
              onClick={() => void onDisconnect()}
            >
              Disconnect Slack
            </Button>
          </SettingRow>
        </>
      ) : null}
    </div>
  );
}

function GithubSettings({ canEdit }: { canEdit: boolean }) {
  const connectionQuery = useGithubConnectionQuery();
  const connection = connectionQuery.data ?? null;
  const repositoriesQuery = useGithubRepositoriesQuery(connection?.connected === true);
  const repositories = repositoriesQuery.data ?? [];

  const startOAuth = useStartGithubOAuth();
  const disconnect = useDisconnectGithub();
  const createRepo = useCreateGithubRepository();
  const updateRepo = useUpdateGithubRepository();
  const deleteRepo = useDeleteGithubRepository();
  const previewRepo = usePreviewGithubRepository();
  const importRepo = useImportGithubRepository();

  const [busy, setBusy] = useState<string | null>(null);
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState("360");
  const [autoImportEnabled, setAutoImportEnabled] = useState(false);
  const [preview, setPreview] = useState<GithubImportPreview | null>(null);
  const [previewRepoId, setPreviewRepoId] = useState<string | null>(null);
  const [editingInterval, setEditingInterval] = useState<{
    id: string;
    value: string;
  } | null>(null);
  const { confirm, dialog } = useConfirmDialog();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const github = params.get("github");
    const message = params.get("message");
    if (github === "oauth_connected") {
      toast.success("GitHub connected");
    } else if (github === "oauth_error") {
      toast.error(message || "GitHub connection failed");
    }
  }, []);

  useEffect(() => {
    const queryError = connectionQuery.error ?? repositoriesQuery.error;
    if (queryError) {
      toast.error(queryError.message || "Failed to load GitHub settings");
    }
  }, [connectionQuery.error, repositoriesQuery.error]);

  const normalizedOwner = owner.trim();
  const normalizedRepo = repo.trim();
  const parsedInterval = Number.parseInt(intervalMinutes, 10);
  const canCreateRepository =
    canEdit &&
    connection?.connected &&
    normalizedOwner.length > 0 &&
    normalizedRepo.length > 0 &&
    Number.isFinite(parsedInterval) &&
    parsedInterval >= 15 &&
    busy === null;

  const excludedKeys = useMemo(
    () => new Set(repositories.map((r) => `${r.owner}/${r.repo}`.toLowerCase())),
    [repositories],
  );

  const pickerSelection =
    normalizedOwner.length > 0 && normalizedRepo.length > 0
      ? { owner: normalizedOwner, repo: normalizedRepo }
      : null;

  const onConnect = async () => {
    if (!canEdit) return;
    setBusy("connect");
    try {
      const response = await startOAuth.mutateAsync();
      window.location.href = response.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start GitHub OAuth");
      setBusy(null);
    }
  };

  const onDisconnect = () => {
    if (!canEdit) return;
    confirm({
      title: "Disconnect GitHub?",
      description: "Future imports will stop until an owner connects GitHub again.",
      confirmLabel: "Disconnect",
      destructive: true,
      onConfirm: async () => {
        setBusy("disconnect");
        try {
          await disconnect.mutateAsync();
          setPreview(null);
          setPreviewRepoId(null);
          toast.success("GitHub disconnected");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to disconnect GitHub");
        } finally {
          setBusy(null);
        }
      },
    });
  };

  const onCreateRepository = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreateRepository) return;
    setBusy("create-repository");
    try {
      await createRepo.mutateAsync({
        owner: normalizedOwner,
        repo: normalizedRepo,
        autoImportEnabled,
        importIntervalMinutes: parsedInterval,
      });
      setOwner("");
      setRepo("");
      setPreview(null);
      setPreviewRepoId(null);
      toast.success("GitHub repository added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add GitHub repository");
    } finally {
      setBusy(null);
    }
  };

  const onPreview = async (repository: GithubRepository) => {
    if (!canEdit || busy !== null) return;
    setBusy(`preview:${repository.id}`);
    try {
      const response = await previewRepo.mutateAsync(repository.id);
      setPreview(response);
      setPreviewRepoId(repository.id);
    } catch (error) {
      setPreview(null);
      setPreviewRepoId(null);
      toast.error(error instanceof Error ? error.message : "Failed to preview import");
    } finally {
      setBusy(null);
    }
  };

  const onImport = async (repository: GithubRepository) => {
    if (!canEdit || busy !== null) return;
    setBusy(`import:${repository.id}`);
    try {
      const result = await importRepo.mutateAsync(repository.id);
      setPreviewRepoId(null);
      setPreview(null);
      toast.success(`Imported ${result.imported}, updated ${result.updated}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import GitHub issues");
    } finally {
      setBusy(null);
    }
  };

  const onUpdateRepository = async (
    repository: GithubRepository,
    patch: {
      autoImportEnabled?: boolean;
      importIntervalMinutes?: number;
    },
  ) => {
    if (!canEdit || busy !== null) return;
    setBusy(`update:${repository.id}`);
    try {
      await updateRepo.mutateAsync({ id: repository.id, patch });
      toast.success("GitHub repository updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update repository");
    } finally {
      setBusy(null);
    }
  };

  const onDeleteRepository = (repository: GithubRepository) => {
    if (!canEdit) return;
    confirm({
      title: `Remove ${repository.owner}/${repository.repo}?`,
      description: "Imported Produktive issues stay in the workspace, but this repo stops syncing.",
      confirmLabel: "Remove repository",
      destructive: true,
      onConfirm: async () => {
        setBusy(`delete:${repository.id}`);
        try {
          await deleteRepo.mutateAsync(repository.id);
          if (previewRepoId === repository.id) {
            setPreview(null);
            setPreviewRepoId(null);
          }
          toast.success("GitHub repository removed");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to remove repository");
        } finally {
          setBusy(null);
        }
      },
    });
  };

  if (connectionQuery.isPending || (connection?.connected && repositoriesQuery.isPending)) {
    return <SettingsSkeleton rows={4} />;
  }

  const inputsDisabled = !canEdit || !connection?.connected || busy !== null;

  return (
    <div>
      {dialog}

      <div className="flex items-center gap-3 border-b border-border-subtle py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border-subtle bg-surface/40 text-fg-muted">
          <GithubIcon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          {connection?.connected ? (
            <>
              <p className="m-0 text-[13px] text-fg">
                Connected as <span className="font-mono">@{connection.login}</span>
              </p>
              {connection.connectedAt ? (
                <p className="m-0 mt-0.5 text-[11.5px] text-fg-faint">
                  since {formatDate(connection.connectedAt)}
                </p>
              ) : null}
            </>
          ) : (
            <p className="m-0 text-[13px] text-fg-muted">
              {canEdit ? "Not connected" : "Missing permission to connect GitHub"}
            </p>
          )}
        </div>
        {canEdit ? (
          connection?.connected ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={onDisconnect}
            >
              {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={busy === "connect"}
              onClick={() => void onConnect()}
            >
              {busy === "connect" ? "Opening…" : "Connect GitHub"}
            </Button>
          )
        ) : null}
      </div>

      {connection?.connected ? (
        <>
          <div className="mb-2 mt-6 flex items-baseline gap-2">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-faint">
              Repositories
            </span>
            <span className="font-mono text-[10.5px] tabular-nums text-fg-faint">
              {repositories.length}
            </span>
          </div>

          <form
            onSubmit={(event) => void onCreateRepository(event)}
            className="flex flex-wrap items-center gap-2 border-b border-border-subtle pb-3"
          >
            <div className="min-w-0 flex-1 basis-[260px]">
              <GithubRepoPicker
                selected={pickerSelection}
                excludedKeys={excludedKeys}
                disabled={inputsDisabled}
                onSelect={({ owner: nextOwner, repo: nextRepo }) => {
                  setOwner(nextOwner);
                  setRepo(nextRepo);
                  setPreview(null);
                }}
              />
            </div>
            <label className="inline-flex h-8 items-center gap-1.5 text-[12px] text-fg-muted">
              <input
                type="checkbox"
                checked={autoImportEnabled}
                disabled={inputsDisabled}
                onChange={(event) => setAutoImportEnabled(event.target.checked)}
                className="h-3.5 w-3.5 accent-fg"
              />
              Auto
            </label>
            <div className="inline-flex items-center gap-1.5">
              <Input
                value={intervalMinutes}
                onChange={(event) => setIntervalMinutes(event.target.value)}
                inputMode="numeric"
                placeholder="360"
                aria-label="Auto import interval in minutes"
                disabled={inputsDisabled}
                className="h-8 w-16"
              />
              <span className="font-mono text-[11px] text-fg-faint">min</span>
            </div>
            <Button type="submit" size="sm" disabled={!canCreateRepository}>
              {busy === "create-repository" ? "Adding…" : "Add"}
            </Button>
          </form>

          {repositories.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <div className="mb-3 grid size-10 place-items-center rounded-[10px] border border-border-subtle bg-surface/40 text-fg-muted">
                <GithubIcon size={16} />
              </div>
              <p className="m-0 text-[13px] text-fg-muted">No repositories yet — add one above.</p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {repositories.map((repository) => (
                <GithubRepositoryRow
                  key={repository.id}
                  repository={repository}
                  canEdit={canEdit}
                  busy={busy}
                  preview={previewRepoId === repository.id ? preview : null}
                  editingInterval={
                    editingInterval?.id === repository.id ? editingInterval.value : null
                  }
                  onPreview={onPreview}
                  onImport={onImport}
                  onToggleAutoImport={(repo) =>
                    void onUpdateRepository(repo, {
                      autoImportEnabled: !repo.autoImportEnabled,
                    })
                  }
                  onStartEditInterval={(repo) =>
                    setEditingInterval({
                      id: repo.id,
                      value: String(repo.importIntervalMinutes),
                    })
                  }
                  onChangeEditInterval={(value) =>
                    setEditingInterval((current) => (current ? { ...current, value } : current))
                  }
                  onCancelEditInterval={() => setEditingInterval(null)}
                  onSaveEditInterval={(repo) => {
                    if (!editingInterval || editingInterval.id !== repo.id) return;
                    const parsed = Number.parseInt(editingInterval.value, 10);
                    if (!Number.isFinite(parsed) || parsed < 15) return;
                    void onUpdateRepository(repo, {
                      importIntervalMinutes: parsed,
                    });
                    setEditingInterval(null);
                  }}
                  onDelete={onDeleteRepository}
                />
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}

function GithubRepositoryRow({
  repository,
  canEdit,
  busy,
  preview,
  editingInterval,
  onPreview,
  onImport,
  onToggleAutoImport,
  onStartEditInterval,
  onChangeEditInterval,
  onCancelEditInterval,
  onSaveEditInterval,
  onDelete,
}: {
  repository: GithubRepository;
  canEdit: boolean;
  busy: string | null;
  preview: GithubImportPreview | null;
  editingInterval: string | null;
  onPreview: (repository: GithubRepository) => void;
  onImport: (repository: GithubRepository) => void;
  onToggleAutoImport: (repository: GithubRepository) => void;
  onStartEditInterval: (repository: GithubRepository) => void;
  onChangeEditInterval: (value: string) => void;
  onCancelEditInterval: () => void;
  onSaveEditInterval: (repository: GithubRepository) => void;
  onDelete: (repository: GithubRepository) => void;
}) {
  const isErrored = repository.lastImportStatus === "error";
  const metaParts: string[] = [];
  metaParts.push(repository.autoImportEnabled ? "auto" : "manual");
  if (repository.autoImportEnabled) {
    metaParts.push(`every ${formatInterval(repository.importIntervalMinutes)}`);
  }
  metaParts.push(
    repository.lastImportedAt
      ? `synced ${formatRelative(repository.lastImportedAt)}`
      : "never synced",
  );
  const metaString = metaParts.join(" · ");

  const editingDraft = editingInterval;
  const parsedDraft = editingDraft ? Number.parseInt(editingDraft, 10) : NaN;
  const draftValid = Number.isFinite(parsedDraft) && parsedDraft >= 15;
  const draftDirty = parsedDraft !== repository.importIntervalMinutes;
  const rowBusy = busy !== null;

  return (
    <li className="border-b border-border-subtle/60 last:border-b-0">
      <div className="group flex items-center gap-3 px-2 py-2.5 transition-colors hover:bg-surface/50">
        <GithubStatusDot autoEnabled={repository.autoImportEnabled} errored={isErrored} />
        <p className="m-0 min-w-0 flex-1 truncate font-mono text-[13px] text-fg">
          {repository.owner}/{repository.repo}
        </p>
        <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-fg-faint sm:inline">
          {metaString}
        </span>
        <Button
          type="button"
          size="sm"
          disabled={!canEdit || rowBusy}
          onClick={() => onImport(repository)}
        >
          {busy === `import:${repository.id}` ? "Importing…" : "Import"}
        </Button>
        <GithubRowMenu
          repository={repository}
          canEdit={canEdit}
          busy={busy}
          onPreview={() => onPreview(repository)}
          onToggleAuto={() => onToggleAutoImport(repository)}
          onEditInterval={() => onStartEditInterval(repository)}
          onDelete={() => onDelete(repository)}
        />
      </div>
      {isErrored && repository.lastImportError ? (
        <div className="border-t border-border-subtle/60 px-2 py-1.5 text-[11.5px] text-danger">
          {repository.lastImportError}
        </div>
      ) : null}
      {preview ? (
        <div className="border-t border-border-subtle/60 bg-surface/30 px-2 py-2 font-mono text-[11.5px] text-fg-muted">
          {preview.total} issues · {preview.newIssues} new · {preview.updateIssues} updates ·{" "}
          {preview.labels} labels · {preview.skippedPullRequests} PRs skipped
        </div>
      ) : null}
      {editingDraft !== null ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle/60 bg-surface/30 px-2 py-2">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-faint">
            Interval
          </span>
          <Input
            value={editingDraft}
            onChange={(event) => onChangeEditInterval(event.target.value)}
            inputMode="numeric"
            disabled={!canEdit || rowBusy}
            aria-label={`Import interval for ${repository.owner}/${repository.repo}`}
            className="h-7 w-20"
          />
          <span className="font-mono text-[11px] text-fg-faint">min</span>
          <span className="flex-1" />
          <Button type="button" variant="ghost" size="sm" onClick={onCancelEditInterval}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canEdit || rowBusy || !draftValid || !draftDirty}
            onClick={() => onSaveEditInterval(repository)}
          >
            {busy === `update:${repository.id}` ? "Saving…" : "Save"}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function GithubStatusDot({ autoEnabled, errored }: { autoEnabled: boolean; errored: boolean }) {
  if (errored) {
    return <span className="size-[8px] shrink-0 rounded-full bg-danger" />;
  }
  if (autoEnabled) {
    return <span className="size-[8px] shrink-0 rounded-full bg-success" />;
  }
  return <span className="size-[8px] shrink-0 rounded-full border border-fg-faint" />;
}

function GithubRowMenu({
  repository,
  canEdit,
  busy,
  onPreview,
  onToggleAuto,
  onEditInterval,
  onDelete,
}: {
  repository: GithubRepository;
  canEdit: boolean;
  busy: string | null;
  onPreview: () => void;
  onToggleAuto: () => void;
  onEditInterval: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const previewing = busy === `preview:${repository.id}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Repository actions"
          disabled={!canEdit || busy !== null}
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-md text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50",
            open
              ? "bg-surface-2 text-fg opacity-100"
              : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          <DotsIcon size={13} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        className="w-48 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl"
      >
        <GithubMenuItem
          onClick={() => {
            close();
            onPreview();
          }}
        >
          {previewing ? "Previewing…" : "Preview import"}
        </GithubMenuItem>
        <GithubMenuItem
          onClick={() => {
            close();
            onToggleAuto();
          }}
        >
          {repository.autoImportEnabled ? "Disable auto-import" : "Enable auto-import"}
        </GithubMenuItem>
        <GithubMenuItem
          onClick={() => {
            close();
            onEditInterval();
          }}
        >
          Edit interval…
        </GithubMenuItem>
        <div className="my-1 h-px bg-border-subtle" />
        <GithubMenuItem
          danger
          onClick={() => {
            close();
            onDelete();
          }}
        >
          Remove
        </GithubMenuItem>
      </PopoverContent>
    </Popover>
  );
}

function GithubMenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-8 w-full items-center px-2.5 text-left text-[12.5px] transition-colors hover:bg-surface-2",
        danger ? "text-danger" : "text-fg",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function McpKeySettings() {
  const keysQuery = useMcpKeysQuery();
  const keys = keysQuery.data ?? [];
  const createKey = useCreateMcpApiKey();
  const revokeKey = useRevokeMcpApiKey();
  const deleteKey = useDeleteMcpApiKey();
  const [name, setName] = useState("Workspace API");
  const [expiresInDays, setExpiresInDays] = useState("365");
  const [busy, setBusy] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const { confirm, dialog } = useConfirmDialog();

  const onCopy = async (value: string, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(label);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = Number.parseInt(expiresInDays, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      toast.error("Expiration must be at least 1 day.");
      return;
    }
    setBusy("create");
    try {
      const response = await createKey.mutateAsync({
        name: name.trim() || undefined,
        expiresInDays: parsed,
      });
      setNewToken(response.token);
      toast.success("API key created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create API key");
    } finally {
      setBusy(null);
    }
  };

  const onRevoke = (key: McpApiKey) => {
    confirm({
      title: `Revoke ${key.name}?`,
      description: "Any client using this key will lose access immediately. This cannot be undone.",
      confirmLabel: "Revoke key",
      destructive: true,
      onConfirm: async () => {
        setBusy(key.id);
        try {
          await revokeKey.mutateAsync(key.id);
          toast.success("API key revoked");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to revoke API key");
        } finally {
          setBusy(null);
        }
      },
    });
  };

  const onDelete = (key: McpApiKey) => {
    const isActive = !key.revokedAt;
    confirm({
      title: `Delete ${key.name}?`,
      description: isActive
        ? "This permanently removes the key from this workspace and revokes remote access first. Clients using it will stop working immediately."
        : "This permanently removes the revoked key from this workspace. It will no longer appear in the API key history.",
      confirmLabel: "Delete key",
      destructive: true,
      onConfirm: async () => {
        setBusy(key.id);
        try {
          await deleteKey.mutateAsync(key.id);
          toast.success("API key deleted");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to delete API key");
        } finally {
          setBusy(null);
        }
      },
    });
  };

  if (keysQuery.isPending) {
    return <SettingsSkeleton rows={4} />;
  }

  const activeKeys = keys.filter((key) => !key.revokedAt);
  const revokedKeys = keys.filter((key) => key.revokedAt);

  return (
    <div>
      {dialog}

      {newToken ? (
        <SettingRow label="New key">
          <p className="m-0 text-fg-muted">Save this token now — it won't be shown again.</p>
          <div className="mt-2 flex items-stretch gap-2">
            <code className="min-w-0 flex-1 break-all rounded border border-border bg-bg px-3 py-2 font-mono text-[12px] text-fg">
              {newToken}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void onCopy(newToken, "API key copied")}
            >
              Copy
            </Button>
          </div>
        </SettingRow>
      ) : null}

      <SettingRow label="Endpoint">
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate font-mono text-fg-muted">
            {getPublicApiUrl()}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void onCopy(getPublicApiUrl(), "REST endpoint copied")}
          >
            Copy
          </Button>
        </div>
      </SettingRow>

      <form onSubmit={(event) => void onCreate(event)}>
        <SettingRow label="Create key">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px]">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Workspace API"
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
          <div className="mt-2 flex items-center justify-between gap-2 text-[11.5px] text-fg-faint">
            <span>Days until expiry.</span>
            <Button type="submit" size="sm" disabled={busy === "create"}>
              {busy === "create" ? "Creating…" : "Create"}
            </Button>
          </div>
        </SettingRow>
      </form>

      {activeKeys.length === 0 ? (
        <SettingRow label="Keys">
          <span className="text-fg-muted">No active REST API keys.</span>
        </SettingRow>
      ) : (
        activeKeys.map((key) => (
          <KeyRow
            key={key.id}
            item={key}
            busy={busy === key.id}
            onRevoke={() => onRevoke(key)}
            onDelete={() => onDelete(key)}
          />
        ))
      )}

      {revokedKeys.length > 0 ? (
        <div className="mt-1">
          {revokedKeys.map((key) => (
            <KeyRow
              key={key.id}
              item={key}
              busy={busy === key.id}
              revoked
              onDelete={() => onDelete(key)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function KeyRow({
  item,
  busy = false,
  revoked = false,
  onRevoke,
  onDelete,
}: {
  item: McpApiKey;
  busy?: boolean;
  revoked?: boolean;
  onRevoke?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 border-b border-border-subtle py-4 text-[13px] transition-colors md:grid-cols-[140px_minmax(0,1fr)]",
        revoked ? "text-fg-muted" : "hover:border-border",
      )}
    >
      <div>
        <span
          className={cn(
            "inline-flex h-6 items-center rounded-full border px-2 font-mono text-[10.5px] uppercase tracking-[0.08em]",
            revoked
              ? "border-border-subtle text-fg-faint"
              : "border-accent/30 bg-accent/10 text-accent",
          )}
        >
          {revoked ? "Revoked" : "Active"}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={cn("text-[14px] font-medium", revoked ? "text-fg-muted" : "text-fg")}>
            {item.name}
          </div>
          <div className="mt-1 font-mono text-[11.5px] text-fg-muted">{item.tokenPrefix}…</div>
          <div className="mt-1 flex flex-wrap text-[11.5px] text-fg-faint">
            <span>Created {formatDate(item.createdAt)}</span>
            {item.expiresAt ? (
              <span className="before:mx-2 before:content-['·']">
                Expires {formatDate(item.expiresAt)}
              </span>
            ) : null}
            {item.lastUsedAt ? (
              <span className="before:mx-2 before:content-['·']">
                Last used {formatDate(item.lastUsedAt)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!revoked && onRevoke ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRevoke}>
              {busy ? "Working…" : "Revoke"}
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              type="button"
              variant={revoked ? "ghost" : "outline"}
              size="sm"
              disabled={busy}
              onClick={onDelete}
              className={cn(
                "text-danger hover:text-danger",
                revoked ? "hover:bg-danger/10" : "border-danger/30 hover:border-danger/60",
              )}
            >
              {busy ? "Deleting…" : "Delete"}
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

function formatRelative(value: string) {
  const then = new Date(value).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatInterval(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours}h`;
  }
  return `${minutes}m`;
}

function getPublicApiUrl() {
  if (typeof window === "undefined") return "https://produktive.app/api/v1";
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return "http://localhost:3000/api/v1";
  }
  return `${window.location.origin}/api/v1`;
}

function SectionGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-0.5">{children}</div>;
}

function SectionButton({
  section,
  active,
  onSelect,
  danger = false,
}: {
  section: SettingsSection;
  active: boolean;
  onSelect: (id: SettingsSectionId) => void;
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
        "flex h-8 items-center rounded-md px-2.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
        active ? activeColor : `${baseColor} hover:bg-surface/60`,
      )}
    >
      <span className="truncate">{section.label}</span>
    </button>
  );
}

function SecuritySettings({
  organization,
  members,
  membersLoading,
  events,
  eventsLoading,
  canEditSecurity,
  currentUserTwoFactorEnabled,
  onEventsChange,
}: {
  organization?: { requireTwoFactor: boolean } | null;
  members: Member[];
  membersLoading: boolean;
  events: SecurityEvent[];
  eventsLoading: boolean;
  canEditSecurity: boolean;
  currentUserTwoFactorEnabled: boolean;
  onEventsChange: (events: SecurityEvent[]) => void;
}) {
  const [requireTwoFactor, setRequireTwoFactor] = useState(organization?.requireTwoFactor ?? false);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [refreshingEvents, setRefreshingEvents] = useState(false);
  const [sendingNudges, setSendingNudges] = useState(false);
  const membersWithTwoFactor = members.filter((member) => member.twoFactorEnabled);
  const membersMissingTwoFactor = members.filter((member) => !member.twoFactorEnabled);

  useEffect(() => {
    setRequireTwoFactor(organization?.requireTwoFactor ?? false);
  }, [organization?.requireTwoFactor]);

  if (!organization) return <LoadingTip compact />;

  const refreshEvents = async () => {
    setRefreshingEvents(true);
    try {
      const response = await listSecurityEvents();
      onEventsChange(response.events);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load security events");
    } finally {
      setRefreshingEvents(false);
    }
  };

  const onToggleRequireTwoFactor = async (next: boolean) => {
    if (!canEditSecurity || savingSecurity) return;
    const previous = requireTwoFactor;
    setRequireTwoFactor(next);
    setSavingSecurity(true);
    try {
      await requestFreshTwoFactorIfNeeded(currentUserTwoFactorEnabled);
      await updateActiveOrganization({ requireTwoFactor: next });
      await refreshSession();
      await refreshEvents();
      toast.success(next ? "Two-factor requirement enabled" : "Two-factor requirement disabled");
    } catch (error) {
      setRequireTwoFactor(previous);
      toast.error(error instanceof Error ? error.message : "Failed to update workspace security");
    } finally {
      setSavingSecurity(false);
    }
  };

  const onSendNudges = async () => {
    if (!canEditSecurity || sendingNudges || membersMissingTwoFactor.length === 0) return;
    setSendingNudges(true);
    try {
      const response = await sendTwoFactorNudges();
      await refreshEvents();
      toast.success(
        response.sent === 1
          ? "Sent 1 two-factor reminder"
          : `Sent ${response.sent} two-factor reminders`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send reminders");
    } finally {
      setSendingNudges(false);
    }
  };

  return (
    <div className="space-y-7">
      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <h3 className="m-0 text-[13px] font-medium text-fg">Require 2FA</h3>
            <p className="m-0 mt-1 text-[12px] text-fg-muted">
              Block workspace access until members enable account two-factor authentication.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={requireTwoFactor}
            aria-label="Require two-factor authentication"
            disabled={!canEditSecurity || savingSecurity}
            onClick={() => void onToggleRequireTwoFactor(!requireTwoFactor)}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
              requireTwoFactor ? "bg-accent" : "bg-surface-2",
              (!canEditSecurity || savingSecurity) && "cursor-not-allowed opacity-60",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "block size-4 rounded-full bg-white shadow transition-transform",
                requireTwoFactor ? "translate-x-[18px]" : "translate-x-[2px]",
              )}
            />
          </button>
        </div>
        <div className="space-y-3">
          <TwoFactorCompliancePanel
            loading={membersLoading}
            membersWithTwoFactor={membersWithTwoFactor}
            membersMissingTwoFactor={membersMissingTwoFactor}
            requireTwoFactor={requireTwoFactor}
          />
          {membersMissingTwoFactor.length > 0 ? (
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!canEditSecurity || sendingNudges}
                onClick={() => void onSendNudges()}
              >
                {sendingNudges ? "Sending..." : "Send reminders"}
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-border-subtle pb-3">
          <div>
            <h3 className="m-0 text-[13px] font-medium text-fg">Security event log</h3>
            <p className="m-0 mt-1 text-[12px] text-fg-muted">
              Recent 2FA, member, and workspace security activity.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void refreshEvents()}
            disabled={refreshingEvents}
          >
            Refresh
          </Button>
        </div>
        <SecurityEventList loading={eventsLoading} events={events} />
      </section>
    </div>
  );
}

function SecurityEventList({
  loading,
  events,
}: {
  loading: boolean;
  events: SecurityEvent[];
}) {
  if (loading) return <LoadingTip compact />;
  if (events.length === 0) {
    return <p className="px-2 py-3 text-[12px] text-fg-faint">No security events yet.</p>;
  }

  return (
    <ul className="flex flex-col">
      {events.map((event) => (
        <li
          key={event.id}
          className="border-b border-border-subtle/60 px-2 py-3 last:border-b-0"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 text-[12.5px] text-fg">{securityEventLabel(event)}</p>
              <p className="m-0 mt-0.5 truncate text-[11px] text-fg-faint">
                {event.actor?.email ?? "System"} {event.ipAddress ? `· ${event.ipAddress}` : ""}
              </p>
            </div>
            <span className="shrink-0 font-mono text-[10.5px] text-fg-faint">
              {formatRelative(event.createdAt)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function securityEventLabel(event: SecurityEvent) {
  const actor = event.actor?.name ?? "Someone";
  const target = event.target?.name ?? "a member";
  switch (event.eventType) {
    case "two_factor.enabled":
      return `${actor} enabled 2FA`;
    case "two_factor.disabled":
      return `${actor} disabled 2FA`;
    case "two_factor.backup_codes_regenerated":
      return `${actor} regenerated backup codes`;
    case "workspace.require_2fa_enabled":
      return `${actor} required 2FA for the workspace`;
    case "workspace.require_2fa_disabled":
      return `${actor} disabled the workspace 2FA requirement`;
    case "member.role_changed":
      return `${actor} changed ${target}'s role`;
    case "member.removed":
      return `${actor} removed ${target}`;
    case "login.2fa_failed":
      return `${target} failed a 2FA login challenge`;
    case "login.success":
      return `${target} signed in`;
    case "workspace.deleted":
      return `${actor} deleted a workspace`;
    case "account.deleted":
      return `${actor} deleted their account`;
    case "two_factor.nudge_sent":
      return `${actor} sent 2FA reminders`;
    case "two_factor.recovery_reset":
      return `${actor} reset ${target}'s 2FA`;
    default:
      return event.eventType.replace(/[_.]/g, " ");
  }
}

function GeneralSettings({
  organization,
  members,
  membersLoading,
  canEdit,
  canEditSecurity,
  currentUserTwoFactorEnabled,
}: {
  organization?: {
    name: string;
    slug: string;
    image: string | null;
    requireTwoFactor: boolean;
  } | null;
  members: Member[];
  membersLoading: boolean;
  canEdit: boolean;
  canEditSecurity: boolean;
  currentUserTwoFactorEnabled: boolean;
}) {
  const [draftName, setDraftName] = useState(organization?.name ?? "");
  const [requireTwoFactor, setRequireTwoFactor] = useState(organization?.requireTwoFactor ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);

  useEffect(() => {
    setDraftName(organization?.name ?? "");
  }, [organization?.name]);

  useEffect(() => {
    setRequireTwoFactor(organization?.requireTwoFactor ?? false);
  }, [organization?.requireTwoFactor]);

  if (!organization) return <LoadingTip compact />;

  const trimmed = draftName.trim();
  const dirty = trimmed !== organization.name;
  const tooLong = trimmed.length > 64;
  const canSave = canEdit && dirty && trimmed.length > 0 && !tooLong && !submitting;
  const membersWithTwoFactor = members.filter((member) => member.twoFactorEnabled);
  const membersMissingTwoFactor = members.filter((member) => !member.twoFactorEnabled);

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

  const onToggleRequireTwoFactor = async (next: boolean) => {
    if (!canEditSecurity || savingSecurity) return;
    const previous = requireTwoFactor;
    setRequireTwoFactor(next);
    setSavingSecurity(true);
    try {
      await requestFreshTwoFactorIfNeeded(currentUserTwoFactorEnabled);
      await updateActiveOrganization({ requireTwoFactor: next });
      await refreshSession();
      toast.success(next ? "Two-factor requirement enabled" : "Two-factor requirement disabled");
    } catch (error) {
      setRequireTwoFactor(previous);
      toast.error(error instanceof Error ? error.message : "Failed to update workspace security");
    } finally {
      setSavingSecurity(false);
    }
  };

  const onIconFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploadingIcon || !canEdit) return;
    setUploadingIcon(true);
    try {
      await uploadActiveOrganizationIcon(file);
      await refreshSession();
      toast.success("Workspace icon updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload icon");
    } finally {
      setUploadingIcon(false);
    }
  };

  return (
    <form onSubmit={onSave}>
      <SettingRow label="Icon">
        <div className="flex items-center gap-3">
          <WorkspaceIcon name={organization.name} image={organization.image} />
          <div>
            <label
              className={cn(
                "inline-flex h-8 items-center rounded-md border border-border-subtle bg-bg px-3 text-[12px] text-fg transition-colors",
                canEdit ? "cursor-pointer hover:border-border" : "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                disabled={!canEdit || uploadingIcon}
                onChange={(event) => void onIconFile(event)}
              />
              {uploadingIcon ? "Uploading..." : "Upload icon"}
            </label>
            <p className="mt-1 text-[11.5px] text-fg-faint">PNG, JPEG, WebP, or GIF. Max 2 MB.</p>
          </div>
        </div>
      </SettingRow>
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
              : "Missing permission to rename the workspace."}
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
      <SettingRow label="Require 2FA">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="m-0 text-[12px] text-fg-muted">
                Members must enable account two-factor authentication before using this workspace.
              </p>
              {!canEditSecurity ? (
                <p className="mt-1 text-[11.5px] text-fg-faint">
                  Missing permission to manage workspace security.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={requireTwoFactor}
              aria-label="Require two-factor authentication"
              disabled={!canEditSecurity || savingSecurity}
              onClick={() => void onToggleRequireTwoFactor(!requireTwoFactor)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                requireTwoFactor ? "bg-accent" : "bg-surface-2",
                (!canEditSecurity || savingSecurity) && "cursor-not-allowed opacity-60",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "block size-4 rounded-full bg-white shadow transition-transform",
                  requireTwoFactor ? "translate-x-[18px]" : "translate-x-[2px]",
                )}
              />
            </button>
          </div>
          <TwoFactorCompliancePanel
            loading={membersLoading}
            membersWithTwoFactor={membersWithTwoFactor}
            membersMissingTwoFactor={membersMissingTwoFactor}
            requireTwoFactor={requireTwoFactor}
          />
        </div>
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

function TwoFactorCompliancePanel({
  loading,
  membersWithTwoFactor,
  membersMissingTwoFactor,
  requireTwoFactor,
}: {
  loading: boolean;
  membersWithTwoFactor: Member[];
  membersMissingTwoFactor: Member[];
  requireTwoFactor: boolean;
}) {
  const total = membersWithTwoFactor.length + membersMissingTwoFactor.length;
  const compliantCount = membersWithTwoFactor.length;
  const percent = total === 0 ? 0 : Math.round((compliantCount / total) * 100);
  const previewMissing = membersMissingTwoFactor.slice(0, 6);
  const extraMissing = Math.max(0, membersMissingTwoFactor.length - previewMissing.length);
  const copyMissingEmails = async () => {
    const emails = membersMissingTwoFactor.map((member) => member.email).join(", ");
    try {
      await navigator.clipboard.writeText(emails);
      toast.success("Copied missing 2FA emails");
    } catch {
      toast.error("Failed to copy emails");
    }
  };

  if (loading) {
    return (
      <div className="rounded-md border border-border-subtle bg-surface/40 p-3">
        <div className="h-3 w-32 rounded bg-surface-2" />
        <div className="mt-3 h-2 rounded-full bg-surface-2" />
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border-subtle bg-surface/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-0 text-[12px] font-medium text-fg">2FA compliance</p>
          <p className="m-0 mt-0.5 text-[11.5px] text-fg-faint">
            {compliantCount} of {total} members have 2FA enabled.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {membersMissingTwoFactor.length > 0 ? (
            <button
              type="button"
              onClick={() => void copyMissingEmails()}
              className="rounded border border-border-subtle px-2 py-1 text-[11px] text-fg-muted transition-colors hover:border-border hover:text-fg"
            >
              Copy emails
            </button>
          ) : null}
          <span
            className={cn(
              "rounded border px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em]",
              membersMissingTwoFactor.length === 0
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
                : requireTwoFactor
                  ? "border-danger/20 bg-danger/10 text-danger"
                  : "border-amber-500/20 bg-amber-500/10 text-amber-700",
            )}
          >
            {membersMissingTwoFactor.length === 0
              ? "Ready"
              : requireTwoFactor
                ? `${membersMissingTwoFactor.length} blocked`
                : `${membersMissingTwoFactor.length} missing`}
          </span>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      {membersMissingTwoFactor.length > 0 ? (
        <div className="mt-3">
          <p className="m-0 text-[11.5px] text-fg-muted">
            {requireTwoFactor
              ? "These members need to enable 2FA before they can use this workspace."
              : "These members will be affected if you enable the requirement."}
          </p>
          <ul className="mt-2 flex flex-col">
            {previewMissing.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between gap-3 border-t border-border-subtle/60 py-2 first:border-t-0 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="m-0 truncate text-[12px] text-fg">{member.name}</p>
                  <p className="m-0 mt-0.5 truncate text-[11px] text-fg-faint">{member.email}</p>
                </div>
                <span className="shrink-0 rounded border border-border-subtle px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-faint">
                  {member.role}
                </span>
              </li>
            ))}
          </ul>
          {extraMissing > 0 ? (
            <p className="m-0 mt-2 text-[11px] text-fg-faint">
              +{extraMissing} more without 2FA
            </p>
          ) : null}
        </div>
      ) : (
        <p className="m-0 mt-3 text-[11.5px] text-fg-muted">
          Every current member is ready for a workspace 2FA requirement.
        </p>
      )}
    </div>
  );
}

function WorkspaceIcon({ name, image }: { name: string; image?: string | null }) {
  if (image) {
    return (
      <img src={image} alt="" className="size-10 rounded-[9px] border border-border object-cover" />
    );
  }
  return (
    <div className="grid size-10 place-items-center rounded-[9px] border border-border bg-fg text-[14px] font-semibold text-bg">
      {name.trim().charAt(0).toUpperCase() || "W"}
    </div>
  );
}
