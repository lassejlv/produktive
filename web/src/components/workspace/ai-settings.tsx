import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { SettingRow, SettingsSkeleton } from "@/components/workspace/setting-row";
import {
  type McpServer,
  createMcpServer,
  deleteMcpServer,
  listMcpServers,
  refreshMcpServerTools,
  startMcpServerOAuth,
  updateMcpServer,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type McpTemplate = {
  id: "produktive" | "notra" | "railway" | "context7";
  name: string;
  url: string;
  auth: "token" | "oauth";
  meta: string;
  tokenPlaceholder?: string;
};

const MCP_TEMPLATES: McpTemplate[] = [
  {
    id: "produktive",
    name: "Produktive",
    url: "https://mcp.produktive.app/mcp",
    auth: "oauth",
    meta: "OAuth",
  },
  {
    id: "notra",
    name: "Notra",
    url: "https://mcp.usenotra.com/mcp",
    auth: "token",
    meta: "API key",
  },
  {
    id: "railway",
    name: "Railway",
    url: "https://mcp.railway.com/",
    auth: "oauth",
    meta: "OAuth",
  },
  {
    id: "context7",
    name: "Context7",
    url: "https://mcp.context7.com/mcp/oauth",
    auth: "oauth",
    meta: "OAuth",
  },
];

export function AiSettings() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const { confirm, dialog } = useConfirmDialog();

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const result = search.get("mcp");
    if (result === "oauth_connected") toast.success("MCP server connected");
    if (result === "oauth_error") {
      toast.error(search.get("message") ?? "MCP OAuth failed");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void listMcpServers()
      .then((response) => {
        if (mounted) setServers(response.servers);
      })
      .catch((error) => {
        toast.error(formatError(error, "Failed to load MCP servers"));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const upsertServer = (server: McpServer) => {
    setServers((current) => {
      const index = current.findIndex((item) => item.id === server.id);
      if (index === -1) return [...current, server];
      const next = [...current];
      next[index] = server;
      return next;
    });
  };

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!url.trim()) return;
    setBusy("create");
    try {
      const response = await createMcpServer({
        url: url.trim(),
        name: name.trim() || undefined,
        accessToken: accessToken.trim() || undefined,
      });
      upsertServer(response.server);
      setUrl("");
      setName("");
      setAccessToken("");
      if (response.oauthUrl) {
        toast.message("OAuth required. Opening provider...");
        window.location.assign(response.oauthUrl);
      } else if (response.server.authStatus === "needs_oauth") {
        toast.message("OAuth required. Use Connect to continue.");
      } else if (response.server.authStatus === "needs_token") {
        toast.message("API key required. Use Add key to connect.");
      } else if (response.server.authStatus === "connected") {
        toast.success("MCP server connected");
      } else {
        toast.error(cleanMcpError(response.server.lastError) ?? "MCP server could not connect");
      }
    } catch (error) {
      toast.error(formatError(error, "Failed to add MCP server"));
    } finally {
      setBusy(null);
    }
  };

  const onToggle = async (server: McpServer) => {
    setBusy(server.id);
    try {
      const response = await updateMcpServer(server.id, {
        enabled: !server.enabled,
      });
      upsertServer(response.server);
    } catch (error) {
      toast.error(formatError(error, "Failed to update server"));
    } finally {
      setBusy(null);
    }
  };

  const onRefresh = async (server: McpServer) => {
    setBusy(server.id);
    try {
      const response = await refreshMcpServerTools(server.id);
      upsertServer(response.server);
      if (response.oauthUrl) {
        toast.message("OAuth required. Use Connect to continue.");
      } else if (response.server.authStatus === "needs_oauth") {
        toast.message("OAuth required. Use Connect to continue.");
      } else if (response.server.authStatus === "needs_token") {
        toast.message("API key required. Use Add key to connect.");
      } else {
        toast.success("MCP tools refreshed");
      }
    } catch (error) {
      toast.error(formatError(error, "Failed to refresh tools"));
    } finally {
      setBusy(null);
    }
  };

  const onConnect = async (server: McpServer) => {
    setBusy(server.id);
    try {
      const response = await startMcpServerOAuth(server.id);
      window.location.assign(response.url);
    } catch (error) {
      toast.error(formatError(error, "Failed to start OAuth"));
      setBusy(null);
    }
  };

  const onAddToken = async (server: McpServer, accessToken: string) => {
    setBusy(server.id);
    try {
      const response = await updateMcpServer(server.id, { accessToken });
      upsertServer(response.server);
      if (response.server.authStatus === "connected") {
        toast.success("MCP server connected");
      } else {
        toast.error(cleanMcpError(response.server.lastError) ?? "MCP API key was not accepted");
      }
    } catch (error) {
      toast.error(formatError(error, "Failed to add MCP API key"));
    } finally {
      setBusy(null);
    }
  };

  const onDelete = (server: McpServer) => {
    confirm({
      title: `Delete ${server.name}?`,
      description: "Chats will stop seeing its tools immediately. You can reconnect later.",
      confirmLabel: "Delete server",
      destructive: true,
      onConfirm: async () => {
        setBusy(server.id);
        try {
          await deleteMcpServer(server.id);
          setServers((current) => current.filter((item) => item.id !== server.id));
          toast.success("MCP server deleted");
        } catch (error) {
          toast.error(formatError(error, "Failed to delete server"));
        } finally {
          setBusy(null);
        }
      },
    });
  };

  if (loading) return <SettingsSkeleton rows={3} />;

  return (
    <div>
      {dialog}
      <SettingRow label="Remote MCPs">
        <form className="grid gap-2" onSubmit={(event) => void onCreate(event)}>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/mcp"
            className="h-9 rounded-md border border-border bg-surface px-3 text-[13px] outline-none transition-colors placeholder:text-fg-faint focus:border-fg-muted"
          />
          <div className="grid gap-2 md:grid-cols-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
              className="h-9 rounded-md border border-border bg-surface px-3 text-[13px] outline-none transition-colors placeholder:text-fg-faint focus:border-fg-muted"
            />
            <input
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              placeholder="Bearer token, optional"
              type="password"
              className="h-9 rounded-md border border-border bg-surface px-3 text-[13px] outline-none transition-colors placeholder:text-fg-faint focus:border-fg-muted"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={busy !== null}>
              {busy === "create" ? "Adding..." : "Add server"}
            </Button>
          </div>
        </form>
      </SettingRow>

      {servers.length === 0 ? (
        <SettingRow label="Servers">
          <span className="text-fg-muted">No remote MCP servers connected.</span>
        </SettingRow>
      ) : (
        <div className="pt-2">
          {servers.map((server) => (
            <ServerRow
              key={server.id}
              server={server}
              busy={busy === server.id}
              onToggle={() => void onToggle(server)}
              onRefresh={() => void onRefresh(server)}
              onConnect={() => void onConnect(server)}
              onAddToken={(accessToken) => void onAddToken(server, accessToken)}
              onDelete={() => onDelete(server)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function McpTemplatesSettings() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<McpTemplate["id"] | null>(null);
  const [accessToken, setAccessToken] = useState("");

  useEffect(() => {
    let mounted = true;
    void listMcpServers()
      .then((response) => {
        if (mounted) setServers(response.servers);
      })
      .catch((error) => {
        toast.error(formatError(error, "Failed to load MCP servers"));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const upsertServer = (server: McpServer) => {
    setServers((current) => {
      const index = current.findIndex((item) => item.id === server.id);
      if (index === -1) return [...current, server];
      const next = [...current];
      next[index] = server;
      return next;
    });
  };

  const onUseTemplate = async (template: McpTemplate) => {
    if (template.auth === "token" && selectedTemplate !== template.id) {
      setSelectedTemplate(template.id);
      setAccessToken("");
      return;
    }
    if (template.auth === "token" && !accessToken.trim()) {
      toast.error(`${template.name} requires an API key`);
      return;
    }

    setBusy(template.id);
    try {
      const response = await createMcpServer({
        name: template.name,
        url: template.url,
        accessToken: template.auth === "token" ? accessToken.trim() : undefined,
      });
      upsertServer(response.server);
      setSelectedTemplate(null);
      setAccessToken("");

      if (response.server.authStatus === "needs_oauth") {
        const oauth = await startMcpServerOAuth(response.server.id);
        window.location.assign(oauth.url);
        return;
      }
      if (response.server.authStatus === "connected") {
        toast.success(`${template.name} connected`);
      } else {
        toast.error(cleanMcpError(response.server.lastError) ?? "MCP server could not connect");
      }
    } catch (error) {
      toast.error(formatError(error, `Failed to add ${template.name}`));
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <SettingsSkeleton rows={3} />;

  return (
    <div>
      <SettingRow label="Templates">
        <div className="grid gap-1.5">
          {MCP_TEMPLATES.map((template) => {
            const connected = servers.some((server) => sameMcpUrl(server.url, template.url));
            const active = selectedTemplate === template.id;
            return (
              <div
                key={template.id}
                className={cn(
                  "rounded-md border border-border-subtle bg-transparent transition-colors",
                  active ? "border-fg-muted bg-surface" : "",
                  connected ? "opacity-70" : "",
                )}
              >
                <button
                  type="button"
                  disabled={connected || busy !== null}
                  onClick={() => void onUseTemplate(template)}
                  className="grid min-h-13 w-full grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 px-3 text-left disabled:cursor-default"
                >
                  <TemplateIcon id={template.id} />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-fg">
                      {template.name}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-fg-faint">
                      {template.url}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]",
                      connected
                        ? "bg-success/10 text-success"
                        : template.auth === "oauth"
                          ? "bg-accent/10 text-accent"
                          : "bg-warning/10 text-warning",
                    )}
                  >
                    {connected ? "live" : busy === template.id ? "adding" : template.meta}
                  </span>
                </button>

                {active && template.auth === "token" && !connected ? (
                  <div className="grid gap-2 border-t border-border-subtle p-3">
                    <input
                      value={accessToken}
                      onChange={(event) => setAccessToken(event.target.value)}
                      placeholder={template.tokenPlaceholder ?? `${template.name} API key`}
                      type="password"
                      className="h-9 rounded-md border border-border bg-bg px-3 text-[13px] outline-none transition-colors placeholder:text-fg-faint focus:border-fg-muted"
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => void onUseTemplate(template)}
                      >
                        Add {template.name}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </SettingRow>
    </div>
  );
}

function ServerRow({
  server,
  busy,
  onToggle,
  onRefresh,
  onConnect,
  onAddToken,
  onDelete,
}: {
  server: McpServer;
  busy: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  onConnect: () => void;
  onAddToken: (accessToken: string) => void;
  onDelete: () => void;
}) {
  const [accessToken, setAccessToken] = useState("");
  const onSubmitToken = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = accessToken.trim();
    if (!trimmed) {
      toast.error("MCP API key is required");
      return;
    }
    onAddToken(trimmed);
  };

  return (
    <div className="border-b border-border-subtle py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium text-fg">{server.name}</span>
            <StatusPill server={server} />
          </div>
          <div className="mt-1 truncate font-mono text-[12px] text-fg-faint">{server.url}</div>
          <div className="mt-1 text-[12px] text-fg-muted">
            {server.tools.length} tools
            {server.transport ? ` · ${server.transport}` : ""}
          </div>
          {server.lastError ? (
            <div className="mt-1 max-w-150 text-[12px] leading-snug text-danger">
              {cleanMcpError(server.lastError)}
            </div>
          ) : null}
          {server.tools.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {server.tools.slice(0, 8).map((tool) => (
                <span
                  key={tool.displayName}
                  className="rounded-[5px] border border-border-subtle px-1.5 py-1 font-mono text-[11px] text-fg-muted"
                  title={tool.description || tool.displayName}
                >
                  {tool.displayName}
                </span>
              ))}
            </div>
          ) : null}
          {server.authStatus === "needs_token" ? (
            <form
              className="mt-3 grid max-w-150 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
              onSubmit={onSubmitToken}
            >
              <input
                value={accessToken}
                onChange={(event) => setAccessToken(event.target.value)}
                placeholder="MCP API key"
                type="password"
                className="h-9 rounded-md border border-border bg-bg px-3 text-[13px] outline-none transition-colors placeholder:text-fg-faint focus:border-fg-muted"
              />
              <Button type="submit" variant="outline" size="sm" disabled={busy}>
                Add key
              </Button>
            </form>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {server.authStatus === "needs_oauth" ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onConnect}>
              Connect
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRefresh}>
            Refresh
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onToggle}>
            {server.enabled ? "Disable" : "Enable"}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

function TemplateIcon({ id }: { id: McpTemplate["id"] }) {
  return (
    <span
      className={cn(
        "grid size-9 place-items-center rounded-md border border-border-subtle bg-bg text-fg",
        id === "produktive" ? "bg-[#EDF3EC] font-serif text-[17px] font-semibold" : "",
        id === "notra" ? "bg-[#c8b2ee]" : "",
      )}
      aria-hidden="true"
    >
      {id === "produktive" ? "P" : null}
      {id === "notra" ? <NotraIcon /> : null}
      {id === "railway" ? <RailwayIcon /> : null}
      {id === "context7" ? <Context7Icon /> : null}
    </span>
  );
}

function NotraIcon() {
  return (
    <svg viewBox="0 0 800 800" className="size-6" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M572.881 462.223c-12.712 43.22-290.678 105.932-394.068 83.898l-48.305-10.169 48.305-78.814 68.644-104.237 73.729-106.78 251.695-127.119 78.814-22.881 17.796 17.796h10.17c17.796 35.593 3.945 147.458-12.712 195.763-25.424 73.729-124.576 96.61-177.966 114.407-4.064 1.355 96.61-5.085 83.898 38.136Z"
        fill="#c8b2ee"
        stroke="#1e1e1e"
        strokeLinecap="round"
        strokeWidth="35"
      />
      <path
        d="M700 96.111c-162.712-4.237-510.508 111.356-600 607.627"
        stroke="#1e1e1e"
        strokeLinecap="round"
        strokeWidth="75"
      />
    </svg>
  );
}

function RailwayIcon() {
  return (
    <img src="https://railway.com/brand/logo-light.svg" alt="" className="size-5 object-contain" />
  );
}

function Context7Icon() {
  return <img src="https://context7.com/favicon.ico" alt="" className="size-5 object-contain" />;
}

function formatError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  return cleanMcpError(error.message) ?? fallback;
}

function cleanMcpError(message: string | null) {
  if (!message) return null;
  if (
    message.includes("/.well-known/oauth-protected-resource") ||
    message.includes("oauth-protected-resource")
  ) {
    return "Connect with OAuth to authorize this MCP server.";
  }
  const jsonStart = message.indexOf("{");
  if (jsonStart === -1) return message;
  try {
    const parsed = JSON.parse(message.slice(jsonStart));
    const protocolMessage = parsed?.error?.message;
    if (typeof protocolMessage === "string" && protocolMessage) {
      return protocolMessage;
    }
  } catch {
    return message;
  }
  return message;
}

function sameMcpUrl(a: string, b: string) {
  return normalizeMcpUrl(a) === normalizeMcpUrl(b);
}

function normalizeMcpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim().replace(/\/$/, "");
  }
}

function StatusPill({ server }: { server: McpServer }) {
  const ok = server.enabled && server.authStatus === "connected";
  const waitingForAuth = server.authStatus === "needs_oauth" || server.authStatus === "needs_token";
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]",
        ok
          ? "bg-success/10 text-success"
          : waitingForAuth
            ? "bg-warning/10 text-warning"
            : "bg-danger/10 text-danger",
      )}
    >
      {!server.enabled
        ? "off"
        : server.authStatus === "connected"
          ? "live"
          : server.authStatus.replace("_", " ")}
    </span>
  );
}
