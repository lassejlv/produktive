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
  type GithubConnection,
  type GithubImportPreview,
  type GithubRepository,
  type McpApiKey,
  type Member,
  createMcpApiKey,
  createGithubRepository,
  deleteGithubRepository,
  disconnectGithub,
  getGithubConnection,
  importGithubRepositoryIssues,
  listGithubRepositories,
  listMcpApiKeys,
  listInvitations,
  listMembers,
  previewGithubRepositoryImport,
  revokeMcpApiKey,
  startGithubOAuth,
  updateGithubRepository,
} from "@/lib/api";
import { refreshSession, updateActiveOrganization, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/workspace/settings")({
  component: WorkspaceSettingsPage,
});

type SettingsSectionId =
  | "general"
  | "members"
  | "billing"
  | "github"
  | "mcp"
  | "ai"
  | "templates"
  | "danger";

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
    id: "github",
    label: "GitHub",
    description: "Import repository issues",
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
          {activeSection === "github" ? <GithubSettings canEdit={canEditWorkspace} /> : null}
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

function GithubSettings({ canEdit }: { canEdit: boolean }) {
  const [connection, setConnection] = useState<GithubConnection | null>(null);
  const [repositories, setRepositories] = useState<GithubRepository[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState("360");
  const [autoImportEnabled, setAutoImportEnabled] = useState(false);
  const [preview, setPreview] = useState<GithubImportPreview | null>(null);
  const [previewRepoId, setPreviewRepoId] = useState<string | null>(null);
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
    let mounted = true;
    void Promise.all([getGithubConnection(), listGithubRepositories()])
      .then(([connectionResponse, repositoriesResponse]) => {
        if (!mounted) return;
        setConnection(connectionResponse);
        setRepositories(repositoriesResponse.repositories);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to load GitHub settings");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

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

  const onConnect = async () => {
    if (!canEdit) return;
    setBusy("connect");
    try {
      const response = await startGithubOAuth();
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
          await disconnectGithub();
          setConnection({ connected: false, login: null, scope: null, connectedAt: null });
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
      const response = await createGithubRepository({
        owner: normalizedOwner,
        repo: normalizedRepo,
        autoImportEnabled,
        importIntervalMinutes: parsedInterval,
      });
      setRepositories((current) => [response.repository, ...current]);
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
      const response = await previewGithubRepositoryImport(repository.id);
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
      const result = await importGithubRepositoryIssues(repository.id);
      const refreshed = await listGithubRepositories();
      setRepositories(refreshed.repositories);
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
      const response = await updateGithubRepository(repository.id, patch);
      setRepositories((current) =>
        current.map((item) => (item.id === repository.id ? response.repository : item)),
      );
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
          await deleteGithubRepository(repository.id);
          setRepositories((current) => current.filter((item) => item.id !== repository.id));
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

  if (loading) {
    return <SettingsSkeleton rows={4} />;
  }

  const inputsDisabled = !canEdit || !connection?.connected || busy !== null;

  return (
    <div>
      {dialog}

      <SettingRow label="Status">
        {connection?.connected ? (
          <>
            <span className="text-fg">Connected as {connection.login}</span>
            <div className="mt-0.5 text-[12px] text-fg-muted">
              {connection.connectedAt ? `Connected ${formatDate(connection.connectedAt)}` : null}
              {connection.scope ? ` · ${connection.scope}` : null}
            </div>
          </>
        ) : (
          <span className="text-fg-muted">
            {canEdit ? "Not connected." : "Only owners can connect GitHub."}
          </span>
        )}
      </SettingRow>

      <form onSubmit={(event) => void onCreateRepository(event)}>
        <SettingRow label="Add repo">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_100px]">
            <Input
              value={owner}
              onChange={(event) => {
                setOwner(event.target.value);
                setPreview(null);
              }}
              placeholder="owner"
              disabled={inputsDisabled}
            />
            <Input
              value={repo}
              onChange={(event) => {
                setRepo(event.target.value);
                setPreview(null);
              }}
              placeholder="repository"
              disabled={inputsDisabled}
            />
            <Input
              value={intervalMinutes}
              onChange={(event) => setIntervalMinutes(event.target.value)}
              inputMode="numeric"
              placeholder="min"
              aria-label="Auto import interval in minutes"
              disabled={inputsDisabled}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-[11.5px] text-fg-faint">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={autoImportEnabled}
                disabled={inputsDisabled}
                onChange={(event) => setAutoImportEnabled(event.target.checked)}
                className="h-3.5 w-3.5 accent-fg"
              />
              Auto import
            </label>
            <Button type="submit" size="sm" disabled={!canCreateRepository}>
              {busy === "create-repository" ? "Adding…" : "Add"}
            </Button>
          </div>
        </SettingRow>
      </form>

      {repositories.length === 0 ? (
        <SettingRow label="Repositories">
          <span className="text-fg-muted">No repositories added.</span>
        </SettingRow>
      ) : (
        repositories.map((repository) => (
          <GithubRepositoryRow
            key={repository.id}
            repository={repository}
            canEdit={canEdit}
            busy={busy}
            preview={previewRepoId === repository.id ? preview : null}
            onPreview={onPreview}
            onImport={onImport}
            onUpdate={onUpdateRepository}
            onDelete={onDeleteRepository}
          />
        ))
      )}

      {canEdit ? (
        <div className="flex flex-wrap justify-end gap-2 pt-4">
          {connection?.connected ? (
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
          )}
        </div>
      ) : null}
    </div>
  );
}

function GithubRepositoryRow({
  repository,
  canEdit,
  busy,
  preview,
  onPreview,
  onImport,
  onUpdate,
  onDelete,
}: {
  repository: GithubRepository;
  canEdit: boolean;
  busy: string | null;
  preview: GithubImportPreview | null;
  onPreview: (repository: GithubRepository) => void;
  onImport: (repository: GithubRepository) => void;
  onUpdate: (
    repository: GithubRepository,
    patch: { autoImportEnabled?: boolean; importIntervalMinutes?: number },
  ) => void;
  onDelete: (repository: GithubRepository) => void;
}) {
  const [intervalDraft, setIntervalDraft] = useState(String(repository.importIntervalMinutes));

  useEffect(() => {
    setIntervalDraft(String(repository.importIntervalMinutes));
  }, [repository.importIntervalMinutes]);

  const parsedInterval = Number.parseInt(intervalDraft, 10);
  const intervalValid = Number.isFinite(parsedInterval) && parsedInterval >= 15;
  const intervalDirty = parsedInterval !== repository.importIntervalMinutes;

  const statusLabel = repository.lastImportStatus === "error"
    ? "Error"
    : repository.autoImportEnabled
      ? "Auto"
      : "Manual";

  return (
    <div className="grid gap-2 border-b border-border-subtle py-3 text-[13px] md:grid-cols-[140px_minmax(0,1fr)]">
      <div className="text-fg-faint">{statusLabel}</div>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-fg">
            {repository.owner}/{repository.repo}
          </div>
          <div className="mt-0.5 text-[11.5px] text-fg-faint">
            {repository.lastImportedAt
              ? `Last import ${formatDate(repository.lastImportedAt)}`
              : "Never imported"}
            {repository.nextImportAt && repository.autoImportEnabled
              ? ` · Next ${formatDate(repository.nextImportAt)}`
              : ""}
          </div>
          {repository.lastImportStatus === "error" && repository.lastImportError ? (
            <div className="mt-0.5 text-[11.5px] text-danger">{repository.lastImportError}</div>
          ) : null}
          {preview ? (
            <div className="mt-1 text-[11.5px] text-fg-muted">
              {preview.total} issues · {preview.newIssues} new · {preview.updateIssues} updates ·{" "}
              {preview.labels} labels · {preview.skippedPullRequests} PRs skipped
            </div>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11.5px] text-fg-faint">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={repository.autoImportEnabled}
                disabled={!canEdit || busy !== null}
                onChange={(event) =>
                  onUpdate(repository, { autoImportEnabled: event.target.checked })
                }
                className="h-3.5 w-3.5 accent-fg"
              />
              Auto import
            </label>
            <span className="inline-flex items-center gap-1.5">
              <Input
                value={intervalDraft}
                onChange={(event) => setIntervalDraft(event.target.value)}
                inputMode="numeric"
                disabled={!canEdit || busy !== null}
                aria-label={`Import interval for ${repository.owner}/${repository.repo}`}
                className="h-7 w-16"
              />
              min
              {intervalDirty ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canEdit || busy !== null || !intervalValid}
                  onClick={() => onUpdate(repository, { importIntervalMinutes: parsedInterval })}
                >
                  {busy === `update:${repository.id}` ? "Saving…" : "Save"}
                </Button>
              ) : null}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit || busy !== null}
            onClick={() => onPreview(repository)}
          >
            {busy === `preview:${repository.id}` ? "Previewing…" : "Preview"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canEdit || busy !== null}
            onClick={() => onImport(repository)}
          >
            {busy === `import:${repository.id}` ? "Importing…" : "Import"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canEdit || busy !== null}
            onClick={() => onDelete(repository)}
          >
            {busy === `delete:${repository.id}` ? "Removing…" : "Remove"}
          </Button>
        </div>
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
  const { confirm, dialog } = useConfirmDialog();
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
      const response = await createMcpApiKey({
        name: name.trim() || undefined,
        expiresInDays: parsed,
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

  const onRevoke = (key: McpApiKey) => {
    confirm({
      title: `Revoke ${key.name}?`,
      description: "Any client using this key will lose access immediately. This cannot be undone.",
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
              onClick={() => void onCopy(newToken, "MCP key copied")}
            >
              Copy
            </Button>
          </div>
        </SettingRow>
      ) : null}

      <SettingRow label="Endpoint">
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate font-mono text-fg-muted">{serverUrl}</code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void onCopy(serverUrl, "Endpoint copied")}
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
          <span className="text-fg-muted">No active keys.</span>
        </SettingRow>
      ) : (
        activeKeys.map((key) => (
          <KeyRow key={key.id} item={key} busy={busy === key.id} onRevoke={() => onRevoke(key)} />
        ))
      )}

      {revokedKeys.length > 0 ? (
        <div className="opacity-60">
          {revokedKeys.map((key) => (
            <KeyRow key={key.id} item={key} revoked />
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
}: {
  item: McpApiKey;
  busy?: boolean;
  revoked?: boolean;
  onRevoke?: () => void;
}) {
  return (
    <div className="grid gap-2 border-b border-border-subtle py-3 text-[13px] md:grid-cols-[140px_minmax(0,1fr)]">
      <div className="text-fg-faint">{revoked ? "Revoked" : "Active"}</div>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-fg">{item.name}</div>
          <div className="mt-0.5 font-mono text-[11.5px] text-fg-muted">{item.tokenPrefix}…</div>
          <div className="mt-0.5 text-[11.5px] text-fg-faint">
            Created {formatDate(item.createdAt)}
            {item.expiresAt ? ` · Expires ${formatDate(item.expiresAt)}` : ""}
            {item.lastUsedAt ? ` · Last used ${formatDate(item.lastUsedAt)}` : ""}
          </div>
        </div>
        {!revoked && onRevoke ? (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRevoke}>
            {busy ? "Revoking…" : "Revoke"}
          </Button>
        ) : null}
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
