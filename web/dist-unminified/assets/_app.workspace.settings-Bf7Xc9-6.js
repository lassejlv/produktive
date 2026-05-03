import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { n as require_react_dom } from "./initial-DwS9pZ8K.js";
import { a as useQueryClient, g as useNavigate, n as queryOptions, r as useQuery, s as keepPreviousData, t as useMutation } from "./initial-BUIQ08st.js";
import { v as toast } from "./initial-BjZJRI-E.js";
import { Bt as deleteIssueStatus, Cn as searchGithubRepositories, Dt as createGithubRepository, Gt as deleteRole, Ht as deleteMcpApiKey, It as createRole, Jt as getGithubConnection, Kt as disconnectGithub, Ln as updateRole, Nn as updateMcpServer, Nt as createMcpApiKey, Ot as createInvitation, Pn as updateMemberRole, Pt as createMcpServer, Qt as importGithubRepositoryIssues, Sn as revokeMcpApiKey, St as useSession, Tn as startMcpServerOAuth, Ut as deleteMcpServer, Vn as cn, _n as refreshMcpServerTools, at as queryKeys, bt as uploadActiveOrganizationIcon, en as listGithubRepositories, hn as previewGithubRepositoryImport, i as useIssueStatuses, jn as updateIssueStatus, jt as createIssueStatus, kn as updateGithubRepository, ln as listRoles, lt as deleteActiveOrganization, nn as listInvitations, on as listMcpServers, pt as refreshSession, sn as listMembers, ut as leaveActiveOrganization, vn as removeMember, vt as updateActiveOrganization, wn as startGithubOAuth, xn as revokeInvitation, yn as resendInvitation, zt as deleteGithubRepository } from "./initial-BOT0Y-sv.js";
import { A as CheckIcon, E as AtIcon, M as DotsIcon, O as CaretIcon, P as GithubIcon, X as Button, _ as Avatar, a as SelectTrigger, et as Popover, i as SelectItem, m as LoadingTip, n as Select, nt as PopoverTrigger, o as SelectValue, r as SelectContent, tt as PopoverContent, v as useConfirmDialog } from "./initial-BWSisseh.js";
import { t as useMcpKeysQuery } from "./mcp-Dq1M87f2.js";
import { t as Input } from "./input-DAlWfusE.js";
import { t as Skeleton } from "./skeleton-bPEvTUQb.js";
//#region src/components/workspace/setting-row.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
function SettingRow({ label, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-2 border-b border-border-subtle py-3 text-[13px] md:grid-cols-[140px_minmax(0,1fr)]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "text-fg-faint",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "min-w-0 text-fg",
			children
		})]
	});
}
function SettingsSkeleton({ rows = 3 }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		"aria-hidden": true,
		children: Array.from({ length: rows }).map((_, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-2 border-b border-border-subtle py-3 md:grid-cols-[140px_minmax(0,1fr)]",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-3.5 w-20" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-4 w-3/5" })]
		}, index))
	});
}
//#endregion
//#region src/components/workspace/ai-settings.tsx
var MCP_TEMPLATES = [
	{
		id: "produktive",
		name: "Produktive",
		url: "https://mcp.produktive.app/mcp",
		auth: "oauth",
		meta: "OAuth"
	},
	{
		id: "notra",
		name: "Notra",
		url: "https://mcp.usenotra.com/mcp",
		auth: "token",
		meta: "API key"
	},
	{
		id: "railway",
		name: "Railway",
		url: "https://mcp.railway.com/",
		auth: "oauth",
		meta: "OAuth"
	},
	{
		id: "context7",
		name: "Context7",
		url: "https://mcp.context7.com/mcp/oauth",
		auth: "oauth",
		meta: "OAuth"
	}
];
function AiSettings() {
	const [servers, setServers] = (0, import_react.useState)([]);
	const [loading, setLoading] = (0, import_react.useState)(true);
	const [busy, setBusy] = (0, import_react.useState)(null);
	const [url, setUrl] = (0, import_react.useState)("");
	const [name, setName] = (0, import_react.useState)("");
	const [accessToken, setAccessToken] = (0, import_react.useState)("");
	const { confirm, dialog } = useConfirmDialog();
	(0, import_react.useEffect)(() => {
		const search = new URLSearchParams(window.location.search);
		const result = search.get("mcp");
		if (result === "oauth_connected") toast.success("MCP server connected");
		if (result === "oauth_error") toast.error(search.get("message") ?? "MCP OAuth failed");
	}, []);
	(0, import_react.useEffect)(() => {
		let mounted = true;
		listMcpServers().then((response) => {
			if (mounted) setServers(response.servers);
		}).catch((error) => {
			toast.error(formatError(error, "Failed to load MCP servers"));
		}).finally(() => {
			if (mounted) setLoading(false);
		});
		return () => {
			mounted = false;
		};
	}, []);
	const upsertServer = (server) => {
		setServers((current) => {
			const index = current.findIndex((item) => item.id === server.id);
			if (index === -1) return [...current, server];
			const next = [...current];
			next[index] = server;
			return next;
		});
	};
	const onCreate = async (event) => {
		event.preventDefault();
		if (!url.trim()) return;
		setBusy("create");
		try {
			const response = await createMcpServer({
				url: url.trim(),
				name: name.trim() || void 0,
				accessToken: accessToken.trim() || void 0
			});
			upsertServer(response.server);
			setUrl("");
			setName("");
			setAccessToken("");
			if (response.oauthUrl) {
				toast.message("OAuth required. Opening provider...");
				window.location.assign(response.oauthUrl);
			} else if (response.server.authStatus === "needs_oauth") toast.message("OAuth required. Use Connect to continue.");
			else if (response.server.authStatus === "needs_token") toast.message("API key required. Use Add key to connect.");
			else if (response.server.authStatus === "connected") toast.success("MCP server connected");
			else toast.error(cleanMcpError(response.server.lastError) ?? "MCP server could not connect");
		} catch (error) {
			toast.error(formatError(error, "Failed to add MCP server"));
		} finally {
			setBusy(null);
		}
	};
	const onToggle = async (server) => {
		setBusy(server.id);
		try {
			upsertServer((await updateMcpServer(server.id, { enabled: !server.enabled })).server);
		} catch (error) {
			toast.error(formatError(error, "Failed to update server"));
		} finally {
			setBusy(null);
		}
	};
	const onRefresh = async (server) => {
		setBusy(server.id);
		try {
			const response = await refreshMcpServerTools(server.id);
			upsertServer(response.server);
			if (response.oauthUrl) toast.message("OAuth required. Use Connect to continue.");
			else if (response.server.authStatus === "needs_oauth") toast.message("OAuth required. Use Connect to continue.");
			else if (response.server.authStatus === "needs_token") toast.message("API key required. Use Add key to connect.");
			else toast.success("MCP tools refreshed");
		} catch (error) {
			toast.error(formatError(error, "Failed to refresh tools"));
		} finally {
			setBusy(null);
		}
	};
	const onConnect = async (server) => {
		setBusy(server.id);
		try {
			const response = await startMcpServerOAuth(server.id);
			window.location.assign(response.url);
		} catch (error) {
			toast.error(formatError(error, "Failed to start OAuth"));
			setBusy(null);
		}
	};
	const onAddToken = async (server, accessToken) => {
		setBusy(server.id);
		try {
			const response = await updateMcpServer(server.id, { accessToken });
			upsertServer(response.server);
			if (response.server.authStatus === "connected") toast.success("MCP server connected");
			else toast.error(cleanMcpError(response.server.lastError) ?? "MCP API key was not accepted");
		} catch (error) {
			toast.error(formatError(error, "Failed to add MCP API key"));
		} finally {
			setBusy(null);
		}
	};
	const onDelete = (server) => {
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
			}
		});
	};
	if (loading) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingsSkeleton, { rows: 3 });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		dialog,
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingRow, {
			label: "Remote MCPs",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: "grid gap-2",
				onSubmit: (event) => void onCreate(event),
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						value: url,
						onChange: (event) => setUrl(event.target.value),
						placeholder: "https://example.com/mcp",
						className: "h-9 rounded-md border border-border bg-surface px-3 text-[13px] outline-none transition-colors placeholder:text-fg-faint focus:border-fg-muted"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid gap-2 md:grid-cols-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: name,
							onChange: (event) => setName(event.target.value),
							placeholder: "Name",
							className: "h-9 rounded-md border border-border bg-surface px-3 text-[13px] outline-none transition-colors placeholder:text-fg-faint focus:border-fg-muted"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: accessToken,
							onChange: (event) => setAccessToken(event.target.value),
							placeholder: "Bearer token, optional",
							type: "password",
							className: "h-9 rounded-md border border-border bg-surface px-3 text-[13px] outline-none transition-colors placeholder:text-fg-faint focus:border-fg-muted"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex justify-end",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "submit",
							size: "sm",
							disabled: busy !== null,
							children: busy === "create" ? "Adding..." : "Add server"
						})
					})
				]
			})
		}),
		servers.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingRow, {
			label: "Servers",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-fg-muted",
				children: "No remote MCP servers connected."
			})
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "pt-2",
			children: servers.map((server) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ServerRow, {
				server,
				busy: busy === server.id,
				onToggle: () => void onToggle(server),
				onRefresh: () => void onRefresh(server),
				onConnect: () => void onConnect(server),
				onAddToken: (accessToken) => void onAddToken(server, accessToken),
				onDelete: () => onDelete(server)
			}, server.id))
		})
	] });
}
function McpTemplatesSettings() {
	const [servers, setServers] = (0, import_react.useState)([]);
	const [loading, setLoading] = (0, import_react.useState)(true);
	const [busy, setBusy] = (0, import_react.useState)(null);
	const [selectedTemplate, setSelectedTemplate] = (0, import_react.useState)(null);
	const [accessToken, setAccessToken] = (0, import_react.useState)("");
	(0, import_react.useEffect)(() => {
		let mounted = true;
		listMcpServers().then((response) => {
			if (mounted) setServers(response.servers);
		}).catch((error) => {
			toast.error(formatError(error, "Failed to load MCP servers"));
		}).finally(() => {
			if (mounted) setLoading(false);
		});
		return () => {
			mounted = false;
		};
	}, []);
	const upsertServer = (server) => {
		setServers((current) => {
			const index = current.findIndex((item) => item.id === server.id);
			if (index === -1) return [...current, server];
			const next = [...current];
			next[index] = server;
			return next;
		});
	};
	const onUseTemplate = async (template) => {
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
				accessToken: template.auth === "token" ? accessToken.trim() : void 0
			});
			upsertServer(response.server);
			setSelectedTemplate(null);
			setAccessToken("");
			if (response.server.authStatus === "needs_oauth") {
				const oauth = await startMcpServerOAuth(response.server.id);
				window.location.assign(oauth.url);
				return;
			}
			if (response.server.authStatus === "connected") toast.success(`${template.name} connected`);
			else toast.error(cleanMcpError(response.server.lastError) ?? "MCP server could not connect");
		} catch (error) {
			toast.error(formatError(error, `Failed to add ${template.name}`));
		} finally {
			setBusy(null);
		}
	};
	if (loading) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingsSkeleton, { rows: 3 });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingRow, {
		label: "Templates",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "grid gap-1.5",
			children: MCP_TEMPLATES.map((template) => {
				const connected = servers.some((server) => sameMcpUrl(server.url, template.url));
				const active = selectedTemplate === template.id;
				return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: cn("rounded-md border border-border-subtle bg-transparent transition-colors", active ? "border-fg-muted bg-surface" : "", connected ? "opacity-70" : ""),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						disabled: connected || busy !== null,
						onClick: () => void onUseTemplate(template),
						className: "grid min-h-13 w-full grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 px-3 text-left disabled:cursor-default",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TemplateIcon, { id: template.id }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "min-w-0",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "block truncate text-[13px] font-medium text-fg",
									children: template.name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "block truncate font-mono text-[11px] text-fg-faint",
									children: template.url
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]", connected ? "bg-success/10 text-success" : template.auth === "oauth" ? "bg-accent/10 text-accent" : "bg-warning/10 text-warning"),
								children: connected ? "live" : busy === template.id ? "adding" : template.meta
							})
						]
					}), active && template.auth === "token" && !connected ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid gap-2 border-t border-border-subtle p-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: accessToken,
							onChange: (event) => setAccessToken(event.target.value),
							placeholder: template.tokenPlaceholder ?? `${template.name} API key`,
							type: "password",
							className: "h-9 rounded-md border border-border bg-bg px-3 text-[13px] outline-none transition-colors placeholder:text-fg-faint focus:border-fg-muted"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex justify-end",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								type: "button",
								size: "sm",
								disabled: busy !== null,
								onClick: () => void onUseTemplate(template),
								children: ["Add ", template.name]
							})
						})]
					}) : null]
				}, template.id);
			})
		})
	}) });
}
function ServerRow({ server, busy, onToggle, onRefresh, onConnect, onAddToken, onDelete }) {
	const [accessToken, setAccessToken] = (0, import_react.useState)("");
	const onSubmitToken = (event) => {
		event.preventDefault();
		const trimmed = accessToken.trim();
		if (!trimmed) {
			toast.error("MCP API key is required");
			return;
		}
		onAddToken(trimmed);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "border-b border-border-subtle py-4",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-start justify-between gap-4",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "truncate text-[13px] font-medium text-fg",
							children: server.name
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusPill, { server })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-1 truncate font-mono text-[12px] text-fg-faint",
						children: server.url
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-1 text-[12px] text-fg-muted",
						children: [
							server.tools.length,
							" tools",
							server.transport ? ` · ${server.transport}` : ""
						]
					}),
					server.lastError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-1 max-w-150 text-[12px] leading-snug text-danger",
						children: cleanMcpError(server.lastError)
					}) : null,
					server.tools.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-2 flex flex-wrap gap-1",
						children: server.tools.slice(0, 8).map((tool) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "rounded-[5px] border border-border-subtle px-1.5 py-1 font-mono text-[11px] text-fg-muted",
							title: tool.description || tool.displayName,
							children: tool.displayName
						}, tool.displayName))
					}) : null,
					server.authStatus === "needs_token" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						className: "mt-3 grid max-w-150 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]",
						onSubmit: onSubmitToken,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: accessToken,
							onChange: (event) => setAccessToken(event.target.value),
							placeholder: "MCP API key",
							type: "password",
							className: "h-9 rounded-md border border-border bg-bg px-3 text-[13px] outline-none transition-colors placeholder:text-fg-faint focus:border-fg-muted"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "submit",
							variant: "outline",
							size: "sm",
							disabled: busy,
							children: "Add key"
						})]
					}) : null
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex shrink-0 flex-wrap justify-end gap-1.5",
				children: [
					server.authStatus === "needs_oauth" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						variant: "outline",
						size: "sm",
						disabled: busy,
						onClick: onConnect,
						children: "Connect"
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						variant: "outline",
						size: "sm",
						disabled: busy,
						onClick: onRefresh,
						children: "Refresh"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						variant: "outline",
						size: "sm",
						disabled: busy,
						onClick: onToggle,
						children: server.enabled ? "Disable" : "Enable"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						variant: "outline",
						size: "sm",
						disabled: busy,
						onClick: onDelete,
						children: "Delete"
					})
				]
			})]
		})
	});
}
function TemplateIcon({ id }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: cn("grid size-9 place-items-center rounded-md border border-border-subtle bg-bg text-fg", id === "produktive" ? "bg-[#EDF3EC] font-serif text-[17px] font-semibold" : "", id === "notra" ? "bg-[#c8b2ee]" : ""),
		"aria-hidden": "true",
		children: [
			id === "produktive" ? "P" : null,
			id === "notra" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NotraIcon, {}) : null,
			id === "railway" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RailwayIcon, {}) : null,
			id === "context7" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Context7Icon, {}) : null
		]
	});
}
function NotraIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		viewBox: "0 0 800 800",
		className: "size-6",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M572.881 462.223c-12.712 43.22-290.678 105.932-394.068 83.898l-48.305-10.169 48.305-78.814 68.644-104.237 73.729-106.78 251.695-127.119 78.814-22.881 17.796 17.796h10.17c17.796 35.593 3.945 147.458-12.712 195.763-25.424 73.729-124.576 96.61-177.966 114.407-4.064 1.355 96.61-5.085 83.898 38.136Z",
			fill: "#c8b2ee",
			stroke: "#1e1e1e",
			strokeLinecap: "round",
			strokeWidth: "35"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M700 96.111c-162.712-4.237-510.508 111.356-600 607.627",
			stroke: "#1e1e1e",
			strokeLinecap: "round",
			strokeWidth: "75"
		})]
	});
}
function RailwayIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
		src: "https://railway.com/brand/logo-light.svg",
		alt: "",
		className: "size-5 object-contain"
	});
}
function Context7Icon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
		src: "https://context7.com/favicon.ico",
		alt: "",
		className: "size-5 object-contain"
	});
}
function formatError(error, fallback) {
	if (!(error instanceof Error)) return fallback;
	return cleanMcpError(error.message) ?? fallback;
}
function cleanMcpError(message) {
	if (!message) return null;
	if (message.includes("/.well-known/oauth-protected-resource") || message.includes("oauth-protected-resource")) return "Connect with OAuth to authorize this MCP server.";
	const jsonStart = message.indexOf("{");
	if (jsonStart === -1) return message;
	try {
		const protocolMessage = JSON.parse(message.slice(jsonStart))?.error?.message;
		if (typeof protocolMessage === "string" && protocolMessage) return protocolMessage;
	} catch {
		return message;
	}
	return message;
}
function sameMcpUrl(a, b) {
	return normalizeMcpUrl(a) === normalizeMcpUrl(b);
}
function normalizeMcpUrl(value) {
	try {
		const url = new URL(value.trim());
		url.hash = "";
		url.search = "";
		return url.toString().replace(/\/$/, "");
	} catch {
		return value.trim().replace(/\/$/, "");
	}
}
function StatusPill({ server }) {
	const ok = server.enabled && server.authStatus === "connected";
	const waitingForAuth = server.authStatus === "needs_oauth" || server.authStatus === "needs_token";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]", ok ? "bg-success/10 text-success" : waitingForAuth ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger"),
		children: !server.enabled ? "off" : server.authStatus === "connected" ? "live" : server.authStatus.replace("_", " ")
	});
}
//#endregion
//#region src/components/workspace/danger-settings.tsx
function DangerSettings({ organization, canEdit }) {
	return canEdit ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeleteWorkspace, { organization }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LeaveWorkspace, { organization });
}
function DeleteWorkspace({ organization }) {
	const navigate = useNavigate();
	const [confirmName, setConfirmName] = (0, import_react.useState)("");
	const [submitting, setSubmitting] = (0, import_react.useState)(false);
	const canDelete = confirmName.trim() === organization.name && !submitting;
	const onDelete = async (event) => {
		event.preventDefault();
		if (!canDelete) return;
		setSubmitting(true);
		try {
			await deleteActiveOrganization({ confirm: confirmName.trim() });
			await refreshSession();
			toast.success("Workspace deleted");
			navigate({ to: "/issues" });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to delete workspace");
			setSubmitting(false);
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("form", {
		onSubmit: onDelete,
		className: "rounded-md border border-danger/30 bg-danger/[0.04]",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SettingRow, {
			label: "Delete workspace",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "m-0 text-[12.5px] leading-relaxed text-fg-muted",
					children: [
						"Permanently delete",
						" ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
							className: "text-fg",
							children: organization.name
						}),
						" and everything in it — issues, projects, chats, members, and connected MCP servers. This cannot be undone."
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-[12px] text-fg-faint",
					children: "Type the workspace name to confirm."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-3 flex flex-wrap items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						value: confirmName,
						onChange: (event) => setConfirmName(event.target.value),
						placeholder: organization.name,
						disabled: submitting,
						autoComplete: "off",
						spellCheck: false,
						className: "flex-1 min-w-[180px]"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "submit",
						variant: "danger",
						size: "sm",
						disabled: !canDelete,
						children: submitting ? "Deleting…" : "Delete workspace"
					})]
				})
			]
		})
	});
}
function LeaveWorkspace({ organization }) {
	const navigate = useNavigate();
	const { confirm, dialog } = useConfirmDialog();
	const [submitting, setSubmitting] = (0, import_react.useState)(false);
	const onLeave = () => {
		confirm({
			title: `Leave ${organization.name}?`,
			description: "You'll lose access to this workspace's issues, projects, and chats. An owner can re-invite you later.",
			confirmLabel: "Leave workspace",
			destructive: true,
			onConfirm: async () => {
				setSubmitting(true);
				try {
					await leaveActiveOrganization();
					await refreshSession();
					toast.success("Left workspace");
					navigate({ to: "/issues" });
				} catch (error) {
					toast.error(error instanceof Error ? error.message : "Failed to leave workspace");
					setSubmitting(false);
				}
			}
		});
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-md border border-danger/30 bg-danger/[0.04]",
		children: [dialog, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SettingRow, {
			label: "Leave workspace",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "m-0 text-[12.5px] leading-relaxed text-fg-muted",
				children: [
					"Remove yourself from",
					" ",
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
						className: "text-fg",
						children: organization.name
					}),
					". Your account stays active and you keep any other workspaces you belong to."
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-3 flex justify-start",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					variant: "danger",
					size: "sm",
					disabled: submitting,
					onClick: onLeave,
					children: submitting ? "Leaving…" : "Leave workspace"
				})
			})]
		})]
	});
}
//#endregion
//#region src/lib/queries/github.ts
var import_react_dom = /* @__PURE__ */ __toESM(require_react_dom(), 1);
var githubConnectionQueryOptions = () => queryOptions({
	queryKey: queryKeys.github.connection,
	queryFn: getGithubConnection,
	staleTime: 5 * 6e4
});
var githubRepositoriesQueryOptions = (enabled = true) => queryOptions({
	queryKey: queryKeys.github.repositories,
	queryFn: () => listGithubRepositories().then((r) => r.repositories),
	staleTime: 6e4,
	enabled
});
var githubRepositorySearchQueryOptions = (query, enabled = true) => queryOptions({
	queryKey: queryKeys.github.repositorySearch(query),
	queryFn: () => searchGithubRepositories({ q: query }).then((r) => r.repositories),
	staleTime: 3e4,
	enabled,
	placeholderData: keepPreviousData
});
var useGithubConnectionQuery = () => useQuery(githubConnectionQueryOptions());
var useGithubRepositoriesQuery = (enabled = true) => useQuery(githubRepositoriesQueryOptions(enabled));
var useGithubRepositorySearchQuery = (query, enabled = true) => useQuery(githubRepositorySearchQueryOptions(query, enabled));
//#endregion
//#region src/components/workspace/github-repo-picker.tsx
var POPOVER_WIDTH = 340;
var TRIGGER_GAP = 6;
var VIEWPORT_PADDING = 8;
var REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
var MAX_RESULTS = 15;
function GithubRepoPicker({ selected, excludedKeys, disabled, onSelect }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [query, setQuery] = (0, import_react.useState)("");
	const [coords, setCoords] = (0, import_react.useState)(null);
	const [activeIndex, setActiveIndex] = (0, import_react.useState)(0);
	const triggerRef = (0, import_react.useRef)(null);
	const popoverRef = (0, import_react.useRef)(null);
	const inputRef = (0, import_react.useRef)(null);
	const searchQuery = useGithubRepositorySearchQuery("", open);
	const trimmedQuery = query.trim();
	const lowerQuery = trimmedQuery.toLowerCase();
	const visible = (0, import_react.useMemo)(() => {
		const repos = searchQuery.data ?? [];
		return (lowerQuery ? repos.filter((r) => {
			return `${r.owner}/${r.repo}`.toLowerCase().includes(lowerQuery);
		}) : repos).filter((r) => !excludedKeys.has(`${r.owner}/${r.repo}`.toLowerCase())).slice(0, MAX_RESULTS);
	}, [
		searchQuery.data,
		lowerQuery,
		excludedKeys
	]);
	const manualMatch = REPO_PATTERN.test(trimmedQuery) && !visible.some((r) => `${r.owner}/${r.repo}`.toLowerCase() === lowerQuery) && !excludedKeys.has(lowerQuery) ? trimmedQuery : null;
	const totalOptions = visible.length + (manualMatch ? 1 : 0);
	(0, import_react.useEffect)(() => {
		setActiveIndex(0);
	}, [lowerQuery, totalOptions]);
	(0, import_react.useLayoutEffect)(() => {
		if (!open) return;
		const update = () => {
			const rect = triggerRef.current?.getBoundingClientRect();
			if (!rect) return;
			const maxLeft = window.innerWidth - POPOVER_WIDTH - VIEWPORT_PADDING;
			setCoords({
				left: Math.min(Math.max(rect.left, VIEWPORT_PADDING), maxLeft),
				top: rect.bottom + TRIGGER_GAP
			});
		};
		update();
		window.addEventListener("resize", update);
		window.addEventListener("scroll", update, true);
		return () => {
			window.removeEventListener("resize", update);
			window.removeEventListener("scroll", update, true);
		};
	}, [open]);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		const onPointerDown = (event) => {
			const target = event.target;
			if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
			setOpen(false);
		};
		const onKey = (event) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);
	(0, import_react.useEffect)(() => {
		if (!open) {
			setQuery("");
			return;
		}
		requestAnimationFrame(() => inputRef.current?.focus());
	}, [open]);
	const choose = (value) => {
		onSelect(value);
		setOpen(false);
	};
	const onKeyDown = (event) => {
		if (totalOptions === 0) return;
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setActiveIndex((i) => (i + 1) % totalOptions);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setActiveIndex((i) => (i - 1 + totalOptions) % totalOptions);
		} else if (event.key === "Enter") {
			event.preventDefault();
			if (activeIndex < visible.length) {
				const item = visible[activeIndex];
				choose({
					owner: item.owner,
					repo: item.repo
				});
			} else if (manualMatch) {
				const [owner, repo] = manualMatch.split("/");
				choose({
					owner,
					repo
				});
			}
		}
	};
	const triggerLabel = selected ? `${selected.owner}/${selected.repo}` : "Choose a repository…";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		ref: triggerRef,
		disabled,
		onClick: () => setOpen((v) => !v),
		className: cn("flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-left text-sm text-fg outline-none transition-colors", "hover:bg-surface-2", "focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent", "disabled:cursor-not-allowed disabled:opacity-50"),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: cn("min-w-0 truncate", selected ? "font-mono text-fg" : "text-fg-faint"),
			children: triggerLabel
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-fg-faint",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaretIcon, {})
		})]
	}), open && coords ? (0, import_react_dom.createPortal)(/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		ref: popoverRef,
		role: "dialog",
		style: {
			position: "fixed",
			left: coords.left,
			top: coords.top,
			width: POPOVER_WIDTH
		},
		className: "z-50 overflow-hidden rounded-[10px] border border-border bg-surface shadow-[0_18px_40px_rgba(0,0,0,0.45)] animate-fade-up",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "border-b border-border-subtle p-2",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				ref: inputRef,
				type: "text",
				value: query,
				onChange: (event) => setQuery(event.target.value),
				onKeyDown,
				placeholder: "Search owner/repo…",
				className: "h-8 w-full rounded-[7px] border border-border bg-bg px-2.5 text-[12px] text-fg placeholder:text-fg-faint outline-none focus:border-fg-muted"
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex max-h-[280px] flex-col overflow-auto py-1",
			children: [
				searchQuery.isPending && !searchQuery.data ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "px-3 py-2 text-[12px] text-fg-faint",
					children: "Loading…"
				}) : null,
				searchQuery.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "px-3 py-2 text-[12px] text-danger",
					children: searchQuery.error?.message ?? "Failed to load repositories"
				}) : null,
				visible.map((repo, index) => {
					const key = `${repo.owner}/${repo.repo}`;
					const isActive = index === activeIndex;
					const isSelected = selected?.owner === repo.owner && selected.repo === repo.repo;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onMouseEnter: () => setActiveIndex(index),
						onClick: () => choose({
							owner: repo.owner,
							repo: repo.repo
						}),
						className: cn("flex h-9 items-center gap-2.5 px-3 text-left text-[13px] transition-colors", isActive ? "bg-surface-2 text-fg" : "text-fg-muted"),
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "min-w-0 flex-1 truncate font-mono",
								children: key
							}),
							repo.private ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "rounded-full border border-border-subtle px-1.5 text-[10px] text-fg-faint",
								children: "Private"
							}) : null,
							isSelected ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-fg",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CheckIcon, { size: 12 })
							}) : null
						]
					}, key);
				}),
				manualMatch ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onMouseEnter: () => setActiveIndex(visible.length),
					onClick: () => {
						const [owner, repo] = manualMatch.split("/");
						choose({
							owner,
							repo
						});
					},
					className: cn("flex h-9 items-center gap-2.5 border-t border-border-subtle px-3 text-left text-[13px] transition-colors", activeIndex === visible.length ? "bg-surface-2 text-fg" : "text-fg-muted"),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-fg-faint",
						children: "Use"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-mono",
						children: manualMatch
					})]
				}) : null,
				!searchQuery.isPending && !searchQuery.isError && visible.length === 0 && !manualMatch ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "px-3 py-2 text-[12px] text-fg-faint",
					children: trimmedQuery ? "No matching repositories. Type owner/repo to add manually." : "No repositories found."
				}) : null
			]
		})]
	}), document.body) : null] });
}
//#endregion
//#region src/components/workspace/members-settings.tsx
function MembersSettings({ loading, members, setMembers, invitations, setInvitations, roles, setRoles, permissions, currentUserEmail, currentRole, currentPermissions }) {
	const [inviteEmail, setInviteEmail] = (0, import_react.useState)("");
	const [inviteRole, setInviteRole] = (0, import_react.useState)("member");
	const [inviteSubmitting, setInviteSubmitting] = (0, import_react.useState)(false);
	const { confirm, dialog } = useConfirmDialog();
	const roleByKey = (0, import_react.useMemo)(() => new Map(roles.map((role) => [role.key, role])), [roles]);
	const canInvite = currentPermissions.has("members.invite");
	const canRemove = currentPermissions.has("members.remove");
	const canAssignRole = currentPermissions.has("members.assign_role");
	const canManageRoles = currentRole === "owner";
	const onInvite = async (event) => {
		event.preventDefault();
		if (inviteSubmitting || !canInvite) return;
		const email = inviteEmail.trim();
		if (!email) return;
		setInviteSubmitting(true);
		try {
			const invitation = await createInvitation(email, inviteRole);
			setInvitations((current) => [invitation, ...current]);
			setInviteEmail("");
			toast.success(`Invite sent to ${invitation.email}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to send invite");
		} finally {
			setInviteSubmitting(false);
		}
	};
	const onRevoke = (invitationId, email) => {
		confirm({
			title: "Revoke invitation?",
			description: `${email} will no longer be able to accept this invite.`,
			confirmLabel: "Revoke invite",
			destructive: true,
			onConfirm: async () => {
				try {
					setInvitations((await revokeInvitation(invitationId)).invitations);
					toast.success("Invitation revoked");
				} catch (error) {
					toast.error(error instanceof Error ? error.message : "Failed to revoke");
				}
			}
		});
	};
	const onResend = async (invitationId) => {
		try {
			const updated = await resendInvitation(invitationId);
			setInvitations((current) => current.map((inv) => inv.id === updated.id ? updated : inv));
			toast.success(`Invitation resent to ${updated.email}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to resend");
		}
	};
	const onChangeMemberRole = async (member, role) => {
		const previous = member.role;
		setMembers((current) => current.map((item) => item.id === member.id ? {
			...item,
			role
		} : item));
		try {
			await updateMemberRole(member.id, role);
			toast.success("Member role updated");
		} catch (error) {
			setMembers((current) => current.map((item) => item.id === member.id ? {
				...item,
				role: previous
			} : item));
			toast.error(error instanceof Error ? error.message : "Failed to update role");
		}
	};
	const onRemoveMember = (member) => {
		confirm({
			title: "Remove member?",
			description: `${member.name} will lose access to this workspace.`,
			confirmLabel: "Remove member",
			destructive: true,
			onConfirm: async () => {
				try {
					await removeMember(member.id);
					setMembers((current) => current.filter((item) => item.id !== member.id));
					toast.success("Member removed");
				} catch (error) {
					toast.error(error instanceof Error ? error.message : "Failed to remove member");
				}
			}
		});
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		dialog,
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionEyebrow, {
			label: "Members",
			count: members.length
		}),
		canInvite ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
			onSubmit: onInvite,
			className: "flex flex-wrap items-center gap-2 border-b border-border-subtle pb-3",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					type: "email",
					required: true,
					placeholder: "alice@example.com",
					value: inviteEmail,
					onChange: (event) => setInviteEmail(event.target.value),
					disabled: inviteSubmitting,
					className: "h-8 min-w-0 flex-1 basis-[220px]"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoleSelect, {
					value: inviteRole,
					roles,
					disabled: inviteSubmitting,
					currentRole,
					onChange: setInviteRole
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "submit",
					size: "sm",
					disabled: !inviteEmail.trim() || inviteSubmitting,
					children: inviteSubmitting ? "Sending…" : "Send invite"
				})
			]
		}) : null,
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MembersList, {
			loading,
			members,
			roles,
			currentRole,
			currentUserEmail,
			canAssignRole,
			canRemove,
			onChangeRole: onChangeMemberRole,
			onRemove: onRemoveMember
		}),
		invitations.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionEyebrow, {
			label: "Pending",
			count: invitations.length,
			className: "mt-8"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
			className: "flex flex-col",
			children: invitations.map((invitation) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
				className: "group flex items-center gap-3 border-b border-border-subtle/60 px-2 py-2.5 last:border-b-0 hover:bg-surface/50",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "grid size-6 shrink-0 place-items-center rounded-full border border-border-subtle text-fg-faint",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AtIcon, { size: 11 })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "m-0 truncate text-[13px] text-fg",
							children: invitation.email
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "m-0 mt-0.5 truncate text-[11px] text-fg-faint",
							children: [
								roleByKey.get(invitation.role)?.name ?? invitation.role,
								" · invited",
								" ",
								formatRelative$1(invitation.createdAt),
								" · expires",
								" ",
								formatRelative$1(invitation.expiresAt)
							]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => void onResend(invitation.id),
						className: "rounded px-1.5 py-1 text-[11px] text-fg-muted opacity-0 transition-colors hover:text-fg group-hover:opacity-100 focus-visible:opacity-100",
						children: "Resend"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => onRevoke(invitation.id, invitation.email),
						className: "rounded px-1.5 py-1 text-[11px] text-fg-muted opacity-0 transition-colors hover:text-danger group-hover:opacity-100 focus-visible:opacity-100",
						children: "Revoke"
					})
				]
			}, invitation.id))
		})] }) : null,
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoleManager, {
			roles,
			setRoles,
			permissions,
			canManageRoles
		})
	] });
}
function SectionEyebrow({ label, count, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("mb-2 flex items-baseline gap-2", className),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-faint",
			children: label
		}), typeof count === "number" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "font-mono text-[10.5px] tabular-nums text-fg-faint",
			children: count
		}) : null]
	});
}
function MembersList({ loading, members, roles, currentRole, currentUserEmail, canAssignRole, canRemove, onChangeRole, onRemove }) {
	const roleByKey = (0, import_react.useMemo)(() => new Map(roles.map((role) => [role.key, role])), [roles]);
	if (loading) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
		"aria-hidden": true,
		className: "flex flex-col",
		children: Array.from({ length: 3 }).map((_, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
			className: "flex items-center gap-3 border-b border-border-subtle/60 px-2 py-2.5 last:border-b-0",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "size-7 rounded-full" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex-1 space-y-1.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-3.5 w-32" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-3 w-48" })]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-7 w-24" })
			]
		}, index))
	});
	if (members.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "px-2 py-3 text-[12px] text-fg-faint",
		children: "No members yet."
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
		className: "flex flex-col",
		children: members.map((member) => {
			const isSelf = currentUserEmail === member.email;
			const isPrivileged = isPrivilegedRole(member.role);
			const canTouchPrivileged = currentRole === "owner";
			const canEditThisRole = canAssignRole && (!isPrivileged || canTouchPrivileged);
			const canRemoveThis = canRemove && !isSelf && (!isPrivileged || canTouchPrivileged);
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
				className: "group flex items-center gap-3 border-b border-border-subtle/60 px-2 py-2.5 last:border-b-0 hover:bg-surface/50",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, {
						name: member.name,
						image: member.image
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "m-0 truncate text-[13px] text-fg",
							children: [member.name, isSelf ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "ml-1.5 text-fg-faint",
								children: "(you)"
							}) : null]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "m-0 mt-0.5 truncate text-[11px] text-fg-muted",
							children: member.email
						})]
					}),
					canEditThisRole ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoleSelect, {
						value: member.role,
						roles,
						currentRole,
						onChange: (role) => onChangeRole(member, role)
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-mono text-[11px] uppercase tracking-[0.06em] text-fg-faint",
						children: roleByKey.get(member.role)?.name ?? member.role
					}),
					canRemoveThis ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MemberRowMenu, { onRemove: () => onRemove(member) }) : null
				]
			}, member.id);
		})
	});
}
function MemberRowMenu({ onRemove }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, {
		open,
		onOpenChange: setOpen,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
			asChild: true,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				"aria-label": "Member actions",
				className: cn("grid size-7 shrink-0 place-items-center rounded-md text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent", open ? "bg-surface-2 text-fg opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DotsIcon, { size: 13 })
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverContent, {
			align: "end",
			sideOffset: 4,
			className: "w-44 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RowMenuItem, {
				danger: true,
				onClick: () => {
					setOpen(false);
					onRemove();
				},
				children: "Remove member"
			})
		})]
	});
}
function RowMenuItem({ children, onClick, danger }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		className: cn("flex h-8 w-full items-center px-2.5 text-left text-[12.5px] transition-colors hover:bg-surface-2", danger ? "text-danger" : "text-fg"),
		onClick,
		children
	});
}
function RoleManager({ roles, setRoles, permissions, canManageRoles }) {
	const [name, setName] = (0, import_react.useState)("");
	const [description, setDescription] = (0, import_react.useState)("");
	const [selectedPermissions, setSelectedPermissions] = (0, import_react.useState)([]);
	const [editingId, setEditingId] = (0, import_react.useState)(null);
	const [saving, setSaving] = (0, import_react.useState)(false);
	const customRoles = roles.filter((role) => !role.isSystem);
	const reset = () => {
		setName("");
		setDescription("");
		setSelectedPermissions([]);
		setEditingId(null);
	};
	const editRole = (role) => {
		setName(role.name);
		setDescription(role.description ?? "");
		setSelectedPermissions(role.permissions);
		setEditingId(role.id);
	};
	const togglePermission = (permission) => {
		setSelectedPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]);
	};
	const saveRole = async (event) => {
		event.preventDefault();
		if (!canManageRoles || saving) return;
		setSaving(true);
		try {
			const payload = {
				name,
				description,
				permissions: selectedPermissions
			};
			const response = editingId ? await updateRole(editingId, payload) : await createRole(payload);
			setRoles((current) => {
				if (!editingId) return [...current, response.role];
				return current.map((role) => role.id === response.role.id ? response.role : role);
			});
			reset();
			toast.success(editingId ? "Role updated" : "Role created");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to save role");
		} finally {
			setSaving(false);
		}
	};
	const archiveRole = async (role) => {
		try {
			await deleteRole(role.id);
			setRoles((current) => current.filter((item) => item.id !== role.id));
			toast.success("Role archived");
			if (editingId === role.id) reset();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to archive role");
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "mt-8",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-2 flex items-baseline gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-faint",
					children: "Roles"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-mono text-[10.5px] tabular-nums text-fg-faint",
					children: roles.length
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "flex flex-col",
				children: roles.map((role) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "group flex items-center gap-3 border-b border-border-subtle/60 px-2 py-2.5 last:border-b-0 hover:bg-surface/50",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "m-0 truncate text-[13px] text-fg",
							children: role.name
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "m-0 mt-0.5 truncate font-mono text-[11px] text-fg-faint",
							children: role.isSystem ? "system role" : `${role.permissions.length} permission${role.permissions.length === 1 ? "" : "s"}`
						})]
					}), !role.isSystem && canManageRoles ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoleRowMenu, {
						onEdit: () => editRole(role),
						onArchive: () => void archiveRole(role)
					}) : null]
				}, role.id))
			}),
			customRoles.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "px-2 py-2 text-[12px] text-fg-faint",
				children: "No custom roles yet."
			}) : null,
			canManageRoles ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				onSubmit: saveRole,
				className: "mt-4 border-t border-border-subtle pt-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid gap-2 sm:grid-cols-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							value: name,
							onChange: (event) => setName(event.target.value),
							placeholder: "Role name",
							required: true
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							value: description,
							onChange: (event) => setDescription(event.target.value),
							placeholder: "Description"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-3 grid gap-px sm:grid-cols-2",
						children: permissions.map((permission) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-fg-muted hover:bg-surface/50",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: selectedPermissions.includes(permission.key),
									onChange: () => togglePermission(permission.key),
									className: "h-3.5 w-3.5 accent-fg"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "min-w-0 flex-1 truncate text-fg",
									children: permission.label
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-[10px] text-fg-faint",
									children: permission.group
								})
							]
						}, permission.key))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-3 flex items-center justify-end gap-2",
						children: [editingId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: reset,
							className: "rounded-md px-2 py-1 text-[12px] text-fg-muted hover:bg-surface-2 hover:text-fg",
							children: "Cancel"
						}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "submit",
							size: "sm",
							disabled: saving || !name.trim(),
							children: saving ? "Saving…" : editingId ? "Save role" : "Create role"
						})]
					})
				]
			}) : null
		]
	});
}
function RoleRowMenu({ onEdit, onArchive }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, {
		open,
		onOpenChange: setOpen,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
			asChild: true,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				"aria-label": "Role actions",
				className: cn("grid size-7 shrink-0 place-items-center rounded-md text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent", open ? "bg-surface-2 text-fg opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DotsIcon, { size: 13 })
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PopoverContent, {
			align: "end",
			sideOffset: 4,
			className: "w-40 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RowMenuItem, {
					onClick: () => {
						setOpen(false);
						onEdit();
					},
					children: "Edit"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "my-1 h-px bg-border-subtle" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RowMenuItem, {
					danger: true,
					onClick: () => {
						setOpen(false);
						onArchive();
					},
					children: "Archive"
				})
			]
		})]
	});
}
function RoleSelect({ value, roles, currentRole, disabled, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
		value,
		onValueChange: onChange,
		disabled,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
			className: "h-7 w-32",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, {
			align: "end",
			children: roles.map((role) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
				value: role.key,
				disabled: isPrivilegedRole(role.key) && currentRole !== "owner",
				children: role.name
			}, role.key))
		})]
	});
}
function isPrivilegedRole(role) {
	return role === "owner" || role === "admin";
}
function formatRelative$1(value) {
	const diffMs = new Date(value).getTime() - Date.now();
	const absMin = Math.abs(Math.floor(diffMs / 6e4));
	const future = diffMs > 0;
	if (absMin < 1) return "just now";
	if (absMin < 60) return future ? `in ${absMin}m` : `${absMin}m ago`;
	const hours = Math.floor(absMin / 60);
	if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return future ? `in ${days}d` : `${days}d ago`;
	return new Date(value).toLocaleDateString();
}
//#endregion
//#region src/lib/mutations/github.ts
function useStartGithubOAuth() {
	return useMutation({ mutationFn: startGithubOAuth });
}
function useDisconnectGithub() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: disconnectGithub,
		onSuccess: () => {
			qc.setQueryData(queryKeys.github.connection, {
				connected: false,
				login: null,
				scope: null,
				connectedAt: null
			});
		}
	});
}
function useCreateGithubRepository() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input) => createGithubRepository(input).then((r) => r.repository),
		onSuccess: (repository) => {
			qc.setQueryData(queryKeys.github.repositories, (old) => old ? [repository, ...old] : [repository]);
		}
	});
}
function useUpdateGithubRepository() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, patch }) => updateGithubRepository(id, patch).then((r) => r.repository),
		onMutate: async ({ id, patch }) => {
			await qc.cancelQueries({ queryKey: queryKeys.github.repositories });
			const prev = qc.getQueryData(queryKeys.github.repositories);
			qc.setQueryData(queryKeys.github.repositories, (old) => old?.map((r) => r.id === id ? {
				...r,
				...patch
			} : r));
			return { prev };
		},
		onError: (_err, _vars, ctx) => {
			if (ctx?.prev) qc.setQueryData(queryKeys.github.repositories, ctx.prev);
		},
		onSuccess: (repository) => {
			qc.setQueryData(queryKeys.github.repositories, (old) => old?.map((r) => r.id === repository.id ? repository : r));
		}
	});
}
function useDeleteGithubRepository() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: deleteGithubRepository,
		onMutate: async (id) => {
			await qc.cancelQueries({ queryKey: queryKeys.github.repositories });
			const prev = qc.getQueryData(queryKeys.github.repositories);
			qc.setQueryData(queryKeys.github.repositories, (old) => old?.filter((r) => r.id !== id));
			return { prev };
		},
		onError: (_err, _id, ctx) => {
			if (ctx?.prev) qc.setQueryData(queryKeys.github.repositories, ctx.prev);
		}
	});
}
function usePreviewGithubRepository() {
	return useMutation({ mutationFn: previewGithubRepositoryImport });
}
function useImportGithubRepository() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: importGithubRepositoryIssues,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.github.repositories });
			qc.invalidateQueries({ queryKey: queryKeys.issues.all });
		}
	});
}
//#endregion
//#region src/lib/mutations/mcp.ts
function useCreateMcpApiKey() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: createMcpApiKey,
		onSuccess: ({ key }) => {
			qc.setQueryData(queryKeys.mcp.keys, (old) => old ? [key, ...old] : [key]);
		}
	});
}
function useRevokeMcpApiKey() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: revokeMcpApiKey,
		onSuccess: (_data, id) => {
			qc.setQueryData(queryKeys.mcp.keys, (old) => old?.map((item) => item.id === id ? {
				...item,
				revokedAt: (/* @__PURE__ */ new Date()).toISOString()
			} : item));
		}
	});
}
function useDeleteMcpApiKey() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: deleteMcpApiKey,
		onSuccess: (_data, id) => {
			qc.setQueryData(queryKeys.mcp.keys, (old) => old?.filter((item) => item.id !== id));
		}
	});
}
//#endregion
//#region src/routes/_app.workspace.settings.tsx?tsr-split=component
var PRODUKTIVE_MCP_ENDPOINT = "https://mcp.produktive.app/mcp";
var settingsSections = [
	{
		id: "general",
		label: "General",
		description: "Workspace name and identity",
		group: "main"
	},
	{
		id: "members",
		label: "Members",
		description: "Invite and manage teammates",
		group: "main"
	},
	{
		id: "statuses",
		label: "Statuses",
		description: "Customize issue workflow columns",
		group: "main"
	},
	{
		id: "integrations",
		label: "Integrations",
		description: "GitHub, Discord, MCP, and API keys",
		group: "main"
	},
	{
		id: "ai",
		label: "AI",
		description: "Models and connected MCP servers",
		group: "main"
	},
	{
		id: "templates",
		label: "Templates",
		description: "Reusable prompt templates",
		group: "main"
	},
	{
		id: "danger",
		label: "Danger zone",
		description: "Irreversible actions",
		group: "danger"
	}
];
var LEGACY_SECTION_TO_INTEGRATIONS = new Set([
	"github",
	"discord",
	"mcp"
]);
var settingsNavGroups = [
	{
		label: "Workspace",
		ids: [
			"general",
			"members",
			"statuses"
		]
	},
	{
		label: "Integrations",
		ids: ["integrations"]
	},
	{
		label: "Automation",
		ids: ["ai", "templates"]
	}
];
var isSettingsSectionId = (value) => settingsSections.some((item) => item.id === value);
function settingsSectionMeta(id) {
	return settingsSections.find((s) => s.id === id);
}
function WorkspaceSettingsPage() {
	const session = useSession();
	const navigate = useNavigate();
	const organization = session.data?.organization;
	const currentUserEmail = session.data?.user.email ?? null;
	const [activeSection, setActiveSection] = (0, import_react.useState)("general");
	const [members, setMembers] = (0, import_react.useState)([]);
	const [invitations, setInvitations] = (0, import_react.useState)([]);
	const [roles, setRoles] = (0, import_react.useState)([]);
	const [permissions, setPermissions] = (0, import_react.useState)([]);
	const [membersLoading, setMembersLoading] = (0, import_react.useState)(true);
	(0, import_react.useEffect)(() => {
		const raw = new URLSearchParams(window.location.search).get("section");
		if (raw && LEGACY_SECTION_TO_INTEGRATIONS.has(raw)) {
			setActiveSection("integrations");
			navigate({
				to: "/workspace/settings",
				search: { section: "integrations" },
				replace: true
			});
			return;
		}
		if (raw && isSettingsSectionId(raw)) setActiveSection(raw);
	}, [navigate]);
	(0, import_react.useEffect)(() => {
		let mounted = true;
		Promise.all([
			listMembers(),
			listInvitations(),
			listRoles()
		]).then(([membersResponse, invitationsResponse, rolesResponse]) => {
			if (!mounted) return;
			setMembers(membersResponse.members);
			setInvitations(invitationsResponse.invitations);
			setRoles(rolesResponse.roles);
			setPermissions(rolesResponse.permissions);
		}).catch(() => {}).finally(() => {
			if (mounted) setMembersLoading(false);
		});
		return () => {
			mounted = false;
		};
	}, []);
	const onSelectSection = (id) => {
		setActiveSection(id);
		navigate({
			to: "/workspace/settings",
			search: { section: id },
			replace: true
		});
	};
	const handleBack = () => {
		if (typeof window !== "undefined" && window.history.length > 1) {
			window.history.back();
			return;
		}
		navigate({ to: "/issues" });
	};
	const currentRole = (0, import_react.useMemo)(() => {
		if (!currentUserEmail) return null;
		return members.find((member) => member.email === currentUserEmail)?.role ?? null;
	}, [members, currentUserEmail]);
	const currentPermissions = (0, import_react.useMemo)(() => {
		const role = roles.find((role) => role.key === currentRole);
		return new Set(role?.permissions ?? []);
	}, [roles, currentRole]);
	const hasPermission = (permission) => currentPermissions.has(permission);
	const canEditWorkspace = hasPermission("workspace.rename");
	const activeMeta = settingsSections.find((s) => s.id === activeSection);
	const dangerSections = settingsSections.filter((s) => s.group === "danger");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto w-full max-w-[880px] px-6 py-10",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "mb-8",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: handleBack,
					className: "mb-4 inline-flex items-center gap-1 rounded-[3px] text-[12px] text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
					children: "← Back"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "m-0 text-[22px] font-semibold tracking-[-0.02em] text-fg",
					children: "Settings"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-[13px] text-fg-muted",
					children: organization?.name ?? "This workspace"
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-8 md:grid-cols-[180px_minmax(0,1fr)] md:gap-12",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
				role: "tablist",
				"aria-label": "Settings sections",
				"aria-orientation": "vertical",
				className: "flex flex-col gap-0.5 md:sticky md:top-10 md:self-start",
				children: [settingsNavGroups.map((group, groupIndex) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: cn(groupIndex > 0 && "mt-4"),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mb-1 px-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-fg-faint",
						children: group.label
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionGroup, { children: group.ids.map((id) => {
						return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionButton, {
							section: settingsSectionMeta(id),
							active: activeSection === id,
							onSelect: onSelectSection
						}, id);
					}) })]
				}, group.label)), dangerSections.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "my-1 h-px bg-border-subtle" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionGroup, { children: dangerSections.map((section) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionButton, {
					section,
					active: activeSection === section.id,
					onSelect: onSelectSection,
					danger: true
				}, section.id)) })] }) : null]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
				className: "min-w-0",
				children: [
					activeMeta ? activeSection === "integrations" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						id: "integrations-main-heading",
						className: "sr-only",
						children: activeMeta.label
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
						className: "mb-5 border-b border-border-subtle pb-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "m-0 text-[15px] font-medium text-fg",
							children: activeMeta.label
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-[12.5px] text-fg-faint",
							children: activeMeta.description
						})]
					}) : null,
					activeSection === "general" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GeneralSettings, {
						organization,
						canEdit: canEditWorkspace
					}) : null,
					activeSection === "members" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MembersSettings, {
						loading: membersLoading,
						members,
						setMembers,
						invitations,
						setInvitations,
						roles,
						setRoles,
						permissions,
						currentUserEmail,
						currentRole,
						currentPermissions
					}) : null,
					activeSection === "statuses" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusSettings, { canEdit: hasPermission("issue_statuses.manage") }) : null,
					activeSection === "integrations" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IntegrationsSettings, { canEditGithub: hasPermission("integrations.github.manage") }) : null,
					activeSection === "ai" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AiSettings, {}) : null,
					activeSection === "templates" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(McpTemplatesSettings, {}) : null,
					activeSection === "danger" ? organization ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DangerSettings, {
						organization,
						canEdit: canEditWorkspace
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoadingTip, { compact: true }) : null
				]
			})]
		})]
	});
}
var DISCORD_INSTALL_URL = "https://discord.com/oauth2/authorize?client_id=1500101363303059456&permissions=277025459200&integration_type=0&scope=bot";
var statusCategories = [
	{
		value: "backlog",
		label: "Backlog"
	},
	{
		value: "active",
		label: "Active"
	},
	{
		value: "done",
		label: "Done"
	},
	{
		value: "canceled",
		label: "Canceled"
	}
];
var statusColors = [
	"gray",
	"blue",
	"purple",
	"green",
	"red",
	"yellow",
	"pink"
];
function StatusSettings({ canEdit }) {
	const { statuses, setStatuses, refresh } = useIssueStatuses();
	const [name, setName] = (0, import_react.useState)("");
	const [category, setCategory] = (0, import_react.useState)("active");
	const [color, setColor] = (0, import_react.useState)("gray");
	const [saving, setSaving] = (0, import_react.useState)(false);
	const [replacementByStatus, setReplacementByStatus] = (0, import_react.useState)({});
	const sorted = (0, import_react.useMemo)(() => [...statuses].sort((a, b) => a.sortOrder - b.sortOrder), [statuses]);
	const createStatus = async (event) => {
		event.preventDefault();
		if (!canEdit || saving || !name.trim()) return;
		setSaving(true);
		try {
			const response = await createIssueStatus({
				name,
				category,
				color
			});
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
	const updateLocal = (status, patch) => {
		setStatuses(statuses.map((item) => item.id === status.id ? {
			...item,
			...patch
		} : item));
	};
	const saveStatus = async (status, patch) => {
		if (!canEdit || status.isSystem) return;
		const next = {
			...status,
			...patch
		};
		updateLocal(status, patch);
		try {
			updateLocal(status, (await updateIssueStatus(status.id, {
				name: next.name,
				color: next.color,
				category: next.category
			})).status);
			toast.success("Status updated");
		} catch (error) {
			updateLocal(status, status);
			toast.error(error instanceof Error ? error.message : "Failed to update status");
		}
	};
	const archiveStatus = async (status) => {
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
	function replacementFor(status) {
		return sorted.find((item) => item.id !== status.id && item.category === status.category) ?? sorted.find((item) => item.id !== status.id);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-8",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
			className: "m-0 text-[13px] font-medium text-fg",
			children: "Issue workflow"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-3 overflow-hidden rounded-md border border-border-subtle",
			children: sorted.map((status, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: cn("grid gap-2 px-3 py-2.5 text-[13px] md:grid-cols-[minmax(0,1fr)_120px_110px_140px_auto]", index !== sorted.length - 1 && "border-b border-border-subtle"),
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex min-w-0 items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusColor, { color: status.color }), status.isSystem || !canEdit ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "truncate text-fg",
							children: status.name
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							value: status.name,
							onChange: (event) => updateLocal(status, { name: event.target.value }),
							onBlur: () => void saveStatus(status, { name: status.name }),
							className: "h-8"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
						value: status.category,
						disabled: status.isSystem || !canEdit,
						onValueChange: (value) => void saveStatus(status, { category: value }),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
							className: "h-8",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, {
							align: "start",
							children: statusCategories.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: option.value,
								children: option.label
							}, option.value))
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
						value: status.color,
						disabled: status.isSystem || !canEdit,
						onValueChange: (value) => void saveStatus(status, { color: value }),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
							className: "h-8",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, {
							align: "start",
							children: statusColors.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: item,
								children: item
							}, item))
						})]
					}),
					!status.isSystem && canEdit ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
						"aria-label": "Replacement status",
						value: replacementByStatus[status.id] ?? replacementFor(status)?.key ?? "",
						onValueChange: (value) => setReplacementByStatus((current) => ({
							...current,
							[status.id]: value
						})),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
							className: "h-8",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, {
							align: "start",
							children: sorted.filter((item) => item.id !== status.id).map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectItem, {
								value: item.key,
								children: ["Move to ", item.name]
							}, item.key))
						})]
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "hidden md:block" }),
					!status.isSystem && canEdit ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => void archiveStatus(status),
						className: "rounded-md px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-danger/10 hover:text-danger",
						children: "Archive"
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[11px] text-fg-faint",
						children: status.isSystem ? "System" : ""
					})
				]
			}, status.id))
		})] }), canEdit ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
			className: "m-0 text-[13px] font-medium text-fg",
			children: "Create status"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
			onSubmit: createStatus,
			className: "mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_110px_auto]",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					value: name,
					onChange: (event) => setName(event.target.value),
					placeholder: "Ready for review",
					disabled: saving
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
					value: category,
					onValueChange: (value) => setCategory(value),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, {
						align: "start",
						children: statusCategories.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: option.value,
							children: option.label
						}, option.value))
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
					value: color,
					onValueChange: setColor,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, {
						align: "start",
						children: statusColors.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: item,
							children: item
						}, item))
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "submit",
					size: "sm",
					disabled: saving || !name.trim(),
					children: saving ? "Creating..." : "Create"
				})
			]
		})] }) : null]
	});
}
function StatusColor({ color }) {
	const colors = {
		gray: "bg-fg-faint",
		blue: "bg-accent",
		purple: "bg-purple-400",
		green: "bg-success",
		red: "bg-danger",
		yellow: "bg-warning",
		pink: "bg-pink-400"
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("size-2 rounded-full", colors[color] ?? colors.gray),
		"aria-hidden": true
	});
}
var INTEGRATION_SUBTABS = [
	{
		id: "github",
		label: "GitHub"
	},
	{
		id: "discord",
		label: "Discord"
	},
	{
		id: "mcp",
		label: "MCP"
	},
	{
		id: "rest",
		label: "REST API"
	}
];
function IntegrationSubtabBar({ active, onSelect }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
		"aria-label": "Integration types",
		className: "-mx-px -mt-px flex flex-nowrap items-end gap-x-px overflow-x-auto border-border-subtle border-b [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-x-8 [&::-webkit-scrollbar]:hidden",
		role: "tablist",
		children: INTEGRATION_SUBTABS.map(({ id, label }) => {
			const selected = active === id;
			return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				id: `integrations-subtab-${id}`,
				type: "button",
				role: "tab",
				"aria-selected": selected,
				tabIndex: selected ? 0 : -1,
				onClick: () => onSelect(id),
				className: cn("-mb-px shrink-0 border-b-[1.5px] border-transparent px-2 pb-3 pt-1 text-[13px] tracking-[-0.01em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-offset-2 sm:px-0", selected ? "border-fg font-medium text-fg" : "text-fg-muted hover:text-fg"),
				children: label
			}, id);
		})
	});
}
function IntegrationsSettings({ canEditGithub }) {
	const [sub, setSub] = (0, import_react.useState)("github");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-w-0",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IntegrationSubtabBar, {
			active: sub,
			onSelect: setSub
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			role: "tabpanel",
			"aria-labelledby": `integrations-subtab-${sub}`,
			className: "min-w-0 pt-8",
			children: [
				sub === "github" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GithubSettings, { canEdit: canEditGithub }) : null,
				sub === "discord" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DiscordSettings, {}) : null,
				sub === "mcp" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HostedMcpSettingsRows, {}) : null,
				sub === "rest" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(McpKeySettings, {}) : null
			]
		})]
	});
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
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingRow, {
			label: "Server URL",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
					href: PRODUKTIVE_MCP_ENDPOINT,
					target: "_blank",
					rel: "noreferrer",
					className: "min-w-0 flex-1 break-all font-mono text-[12px] text-accent hover:underline",
					children: PRODUKTIVE_MCP_ENDPOINT
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					variant: "outline",
					size: "sm",
					onClick: () => void onCopyEndpoint(),
					children: "Copy"
				})]
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingRow, {
			label: "Authentication",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-[13px] text-fg-muted",
				children: "OAuth. Complete Produktive sign-in when your MCP client opens the browser."
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingRow, {
			label: "Documentation",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				asChild: true,
				variant: "outline",
				size: "sm",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
					href: PRODUKTIVE_MCP_ENDPOINT,
					target: "_blank",
					rel: "noreferrer",
					children: "Open MCP reference"
				})
			})
		})
	] });
}
function DiscordSettings() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingRow, {
		label: "Install bot",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-center gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				asChild: true,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
					href: DISCORD_INSTALL_URL,
					target: "_blank",
					rel: "noreferrer",
					children: "Add to Discord"
				})
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-[12px] text-fg-muted",
				children: "Opens Discord to install the Produktive bot in a server."
			})]
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingRow, {
		label: "After install",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "text-fg-muted",
			children: [
				"Run ",
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-mono text-fg",
					children: "/produktive login"
				}),
				" in Discord to link a workspace."
			]
		})
	})] });
}
function GithubSettings({ canEdit }) {
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
	const [busy, setBusy] = (0, import_react.useState)(null);
	const [owner, setOwner] = (0, import_react.useState)("");
	const [repo, setRepo] = (0, import_react.useState)("");
	const [intervalMinutes, setIntervalMinutes] = (0, import_react.useState)("360");
	const [autoImportEnabled, setAutoImportEnabled] = (0, import_react.useState)(false);
	const [preview, setPreview] = (0, import_react.useState)(null);
	const [previewRepoId, setPreviewRepoId] = (0, import_react.useState)(null);
	const [editingInterval, setEditingInterval] = (0, import_react.useState)(null);
	const { confirm, dialog } = useConfirmDialog();
	(0, import_react.useEffect)(() => {
		const params = new URLSearchParams(window.location.search);
		const github = params.get("github");
		const message = params.get("message");
		if (github === "oauth_connected") toast.success("GitHub connected");
		else if (github === "oauth_error") toast.error(message || "GitHub connection failed");
	}, []);
	(0, import_react.useEffect)(() => {
		const queryError = connectionQuery.error ?? repositoriesQuery.error;
		if (queryError) toast.error(queryError.message || "Failed to load GitHub settings");
	}, [connectionQuery.error, repositoriesQuery.error]);
	const normalizedOwner = owner.trim();
	const normalizedRepo = repo.trim();
	const parsedInterval = Number.parseInt(intervalMinutes, 10);
	const canCreateRepository = canEdit && connection?.connected && normalizedOwner.length > 0 && normalizedRepo.length > 0 && Number.isFinite(parsedInterval) && parsedInterval >= 15 && busy === null;
	const excludedKeys = (0, import_react.useMemo)(() => new Set(repositories.map((r) => `${r.owner}/${r.repo}`.toLowerCase())), [repositories]);
	const pickerSelection = normalizedOwner.length > 0 && normalizedRepo.length > 0 ? {
		owner: normalizedOwner,
		repo: normalizedRepo
	} : null;
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
			}
		});
	};
	const onCreateRepository = async (event) => {
		event.preventDefault();
		if (!canCreateRepository) return;
		setBusy("create-repository");
		try {
			await createRepo.mutateAsync({
				owner: normalizedOwner,
				repo: normalizedRepo,
				autoImportEnabled,
				importIntervalMinutes: parsedInterval
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
	const onPreview = async (repository) => {
		if (!canEdit || busy !== null) return;
		setBusy(`preview:${repository.id}`);
		try {
			setPreview(await previewRepo.mutateAsync(repository.id));
			setPreviewRepoId(repository.id);
		} catch (error) {
			setPreview(null);
			setPreviewRepoId(null);
			toast.error(error instanceof Error ? error.message : "Failed to preview import");
		} finally {
			setBusy(null);
		}
	};
	const onImport = async (repository) => {
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
	const onUpdateRepository = async (repository, patch) => {
		if (!canEdit || busy !== null) return;
		setBusy(`update:${repository.id}`);
		try {
			await updateRepo.mutateAsync({
				id: repository.id,
				patch
			});
			toast.success("GitHub repository updated");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to update repository");
		} finally {
			setBusy(null);
		}
	};
	const onDeleteRepository = (repository) => {
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
			}
		});
	};
	if (connectionQuery.isPending || connection?.connected && repositoriesQuery.isPending) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingsSkeleton, { rows: 4 });
	const inputsDisabled = !canEdit || !connection?.connected || busy !== null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		dialog,
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-3 border-b border-border-subtle py-3",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "grid size-8 shrink-0 place-items-center rounded-md border border-border-subtle bg-surface/40 text-fg-muted",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GithubIcon, { size: 14 })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "min-w-0 flex-1",
					children: connection?.connected ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "m-0 text-[13px] text-fg",
						children: ["Connected as ", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "font-mono",
							children: ["@", connection.login]
						})]
					}), connection.connectedAt ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "m-0 mt-0.5 text-[11.5px] text-fg-faint",
						children: ["since ", formatDate(connection.connectedAt)]
					}) : null] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "m-0 text-[13px] text-fg-muted",
						children: canEdit ? "Not connected" : "Missing permission to connect GitHub"
					})
				}),
				canEdit ? connection?.connected ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					variant: "outline",
					size: "sm",
					disabled: busy !== null,
					onClick: onDisconnect,
					children: busy === "disconnect" ? "Disconnecting…" : "Disconnect"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					size: "sm",
					disabled: busy === "connect",
					onClick: () => void onConnect(),
					children: busy === "connect" ? "Opening…" : "Connect GitHub"
				}) : null
			]
		}),
		connection?.connected ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-2 mt-6 flex items-baseline gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-faint",
					children: "Repositories"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-mono text-[10.5px] tabular-nums text-fg-faint",
					children: repositories.length
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				onSubmit: (event) => void onCreateRepository(event),
				className: "flex flex-wrap items-center gap-2 border-b border-border-subtle pb-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "min-w-0 flex-1 basis-[260px]",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GithubRepoPicker, {
							selected: pickerSelection,
							excludedKeys,
							disabled: inputsDisabled,
							onSelect: ({ owner: nextOwner, repo: nextRepo }) => {
								setOwner(nextOwner);
								setRepo(nextRepo);
								setPreview(null);
							}
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "inline-flex h-8 items-center gap-1.5 text-[12px] text-fg-muted",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: autoImportEnabled,
							disabled: inputsDisabled,
							onChange: (event) => setAutoImportEnabled(event.target.checked),
							className: "h-3.5 w-3.5 accent-fg"
						}), "Auto"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "inline-flex items-center gap-1.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							value: intervalMinutes,
							onChange: (event) => setIntervalMinutes(event.target.value),
							inputMode: "numeric",
							placeholder: "360",
							"aria-label": "Auto import interval in minutes",
							disabled: inputsDisabled,
							className: "h-8 w-16"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-mono text-[11px] text-fg-faint",
							children: "min"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "submit",
						size: "sm",
						disabled: !canCreateRepository,
						children: busy === "create-repository" ? "Adding…" : "Add"
					})
				]
			}),
			repositories.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col items-center px-6 py-10 text-center",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mb-3 grid size-10 place-items-center rounded-[10px] border border-border-subtle bg-surface/40 text-fg-muted",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GithubIcon, { size: 16 })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "m-0 text-[13px] text-fg-muted",
					children: "No repositories yet — add one above."
				})]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "flex flex-col",
				children: repositories.map((repository) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GithubRepositoryRow, {
					repository,
					canEdit,
					busy,
					preview: previewRepoId === repository.id ? preview : null,
					editingInterval: editingInterval?.id === repository.id ? editingInterval.value : null,
					onPreview,
					onImport,
					onToggleAutoImport: (repo) => void onUpdateRepository(repo, { autoImportEnabled: !repo.autoImportEnabled }),
					onStartEditInterval: (repo) => setEditingInterval({
						id: repo.id,
						value: String(repo.importIntervalMinutes)
					}),
					onChangeEditInterval: (value) => setEditingInterval((current) => current ? {
						...current,
						value
					} : current),
					onCancelEditInterval: () => setEditingInterval(null),
					onSaveEditInterval: (repo) => {
						if (!editingInterval || editingInterval.id !== repo.id) return;
						const parsed = Number.parseInt(editingInterval.value, 10);
						if (!Number.isFinite(parsed) || parsed < 15) return;
						onUpdateRepository(repo, { importIntervalMinutes: parsed });
						setEditingInterval(null);
					},
					onDelete: onDeleteRepository
				}, repository.id))
			})
		] }) : null
	] });
}
function GithubRepositoryRow({ repository, canEdit, busy, preview, editingInterval, onPreview, onImport, onToggleAutoImport, onStartEditInterval, onChangeEditInterval, onCancelEditInterval, onSaveEditInterval, onDelete }) {
	const isErrored = repository.lastImportStatus === "error";
	const metaParts = [];
	metaParts.push(repository.autoImportEnabled ? "auto" : "manual");
	if (repository.autoImportEnabled) metaParts.push(`every ${formatInterval(repository.importIntervalMinutes)}`);
	metaParts.push(repository.lastImportedAt ? `synced ${formatRelative(repository.lastImportedAt)}` : "never synced");
	const metaString = metaParts.join(" · ");
	const editingDraft = editingInterval;
	const parsedDraft = editingDraft ? Number.parseInt(editingDraft, 10) : NaN;
	const draftValid = Number.isFinite(parsedDraft) && parsedDraft >= 15;
	const draftDirty = parsedDraft !== repository.importIntervalMinutes;
	const rowBusy = busy !== null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
		className: "border-b border-border-subtle/60 last:border-b-0",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "group flex items-center gap-3 px-2 py-2.5 transition-colors hover:bg-surface/50",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(GithubStatusDot, {
						autoEnabled: repository.autoImportEnabled,
						errored: isErrored
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "m-0 min-w-0 flex-1 truncate font-mono text-[13px] text-fg",
						children: [
							repository.owner,
							"/",
							repository.repo
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "hidden shrink-0 font-mono text-[11px] tabular-nums text-fg-faint sm:inline",
						children: metaString
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						size: "sm",
						disabled: !canEdit || rowBusy,
						onClick: () => onImport(repository),
						children: busy === `import:${repository.id}` ? "Importing…" : "Import"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(GithubRowMenu, {
						repository,
						canEdit,
						busy,
						onPreview: () => onPreview(repository),
						onToggleAuto: () => onToggleAutoImport(repository),
						onEditInterval: () => onStartEditInterval(repository),
						onDelete: () => onDelete(repository)
					})
				]
			}),
			isErrored && repository.lastImportError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "border-t border-border-subtle/60 px-2 py-1.5 text-[11.5px] text-danger",
				children: repository.lastImportError
			}) : null,
			preview ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "border-t border-border-subtle/60 bg-surface/30 px-2 py-2 font-mono text-[11.5px] text-fg-muted",
				children: [
					preview.total,
					" issues · ",
					preview.newIssues,
					" new · ",
					preview.updateIssues,
					" updates ·",
					" ",
					preview.labels,
					" labels · ",
					preview.skippedPullRequests,
					" PRs skipped"
				]
			}) : null,
			editingDraft !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center gap-2 border-t border-border-subtle/60 bg-surface/30 px-2 py-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-faint",
						children: "Interval"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						value: editingDraft,
						onChange: (event) => onChangeEditInterval(event.target.value),
						inputMode: "numeric",
						disabled: !canEdit || rowBusy,
						"aria-label": `Import interval for ${repository.owner}/${repository.repo}`,
						className: "h-7 w-20"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-mono text-[11px] text-fg-faint",
						children: "min"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "flex-1" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						variant: "ghost",
						size: "sm",
						onClick: onCancelEditInterval,
						children: "Cancel"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						size: "sm",
						disabled: !canEdit || rowBusy || !draftValid || !draftDirty,
						onClick: () => onSaveEditInterval(repository),
						children: busy === `update:${repository.id}` ? "Saving…" : "Save"
					})
				]
			}) : null
		]
	});
}
function GithubStatusDot({ autoEnabled, errored }) {
	if (errored) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-[8px] shrink-0 rounded-full bg-danger" });
	if (autoEnabled) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-[8px] shrink-0 rounded-full bg-success" });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-[8px] shrink-0 rounded-full border border-fg-faint" });
}
function GithubRowMenu({ repository, canEdit, busy, onPreview, onToggleAuto, onEditInterval, onDelete }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const close = () => setOpen(false);
	const previewing = busy === `preview:${repository.id}`;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, {
		open,
		onOpenChange: setOpen,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
			asChild: true,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				"aria-label": "Repository actions",
				disabled: !canEdit || busy !== null,
				className: cn("grid size-7 shrink-0 place-items-center rounded-md text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50", open ? "bg-surface-2 text-fg opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DotsIcon, { size: 13 })
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PopoverContent, {
			align: "end",
			sideOffset: 4,
			className: "w-48 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(GithubMenuItem, {
					onClick: () => {
						close();
						onPreview();
					},
					children: previewing ? "Previewing…" : "Preview import"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(GithubMenuItem, {
					onClick: () => {
						close();
						onToggleAuto();
					},
					children: repository.autoImportEnabled ? "Disable auto-import" : "Enable auto-import"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(GithubMenuItem, {
					onClick: () => {
						close();
						onEditInterval();
					},
					children: "Edit interval…"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "my-1 h-px bg-border-subtle" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(GithubMenuItem, {
					danger: true,
					onClick: () => {
						close();
						onDelete();
					},
					children: "Remove"
				})
			]
		})]
	});
}
function GithubMenuItem({ children, onClick, danger }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		className: cn("flex h-8 w-full items-center px-2.5 text-left text-[12.5px] transition-colors hover:bg-surface-2", danger ? "text-danger" : "text-fg"),
		onClick,
		children
	});
}
function McpKeySettings() {
	const keysQuery = useMcpKeysQuery();
	const keys = keysQuery.data ?? [];
	const createKey = useCreateMcpApiKey();
	const revokeKey = useRevokeMcpApiKey();
	const deleteKey = useDeleteMcpApiKey();
	const [name, setName] = (0, import_react.useState)("Workspace API");
	const [expiresInDays, setExpiresInDays] = (0, import_react.useState)("365");
	const [busy, setBusy] = (0, import_react.useState)(null);
	const [newToken, setNewToken] = (0, import_react.useState)(null);
	const { confirm, dialog } = useConfirmDialog();
	const onCopy = async (value, label = "Copied") => {
		try {
			await navigator.clipboard.writeText(value);
			toast.success(label);
		} catch {
			toast.error("Could not copy to clipboard");
		}
	};
	const onCreate = async (event) => {
		event.preventDefault();
		const parsed = Number.parseInt(expiresInDays, 10);
		if (!Number.isFinite(parsed) || parsed < 1) {
			toast.error("Expiration must be at least 1 day.");
			return;
		}
		setBusy("create");
		try {
			setNewToken((await createKey.mutateAsync({
				name: name.trim() || void 0,
				expiresInDays: parsed
			})).token);
			toast.success("API key created");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to create API key");
		} finally {
			setBusy(null);
		}
	};
	const onRevoke = (key) => {
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
			}
		});
	};
	const onDelete = (key) => {
		const isActive = !key.revokedAt;
		confirm({
			title: `Delete ${key.name}?`,
			description: isActive ? "This permanently removes the key from this workspace and revokes remote access first. Clients using it will stop working immediately." : "This permanently removes the revoked key from this workspace. It will no longer appear in the API key history.",
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
			}
		});
	};
	if (keysQuery.isPending) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingsSkeleton, { rows: 4 });
	const activeKeys = keys.filter((key) => !key.revokedAt);
	const revokedKeys = keys.filter((key) => key.revokedAt);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		dialog,
		newToken ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SettingRow, {
			label: "New key",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "m-0 text-fg-muted",
				children: "Save this token now — it won't be shown again."
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-2 flex items-stretch gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", {
					className: "min-w-0 flex-1 break-all rounded border border-border bg-bg px-3 py-2 font-mono text-[12px] text-fg",
					children: newToken
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					variant: "outline",
					size: "sm",
					onClick: () => void onCopy(newToken, "API key copied"),
					children: "Copy"
				})]
			})]
		}) : null,
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingRow, {
			label: "Endpoint",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", {
					className: "min-w-0 flex-1 truncate font-mono text-fg-muted",
					children: getPublicApiUrl()
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					variant: "outline",
					size: "sm",
					onClick: () => void onCopy(getPublicApiUrl(), "REST endpoint copied"),
					children: "Copy"
				})]
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("form", {
			onSubmit: (event) => void onCreate(event),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SettingRow, {
				label: "Create key",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-2 md:grid-cols-[minmax(0,1fr)_120px]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						value: name,
						onChange: (event) => setName(event.target.value),
						placeholder: "Workspace API",
						disabled: busy === "create"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						value: expiresInDays,
						onChange: (event) => setExpiresInDays(event.target.value),
						inputMode: "numeric",
						disabled: busy === "create",
						"aria-label": "Expiration in days"
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-2 flex items-center justify-between gap-2 text-[11.5px] text-fg-faint",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Days until expiry." }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "submit",
						size: "sm",
						disabled: busy === "create",
						children: busy === "create" ? "Creating…" : "Create"
					})]
				})]
			})
		}),
		activeKeys.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingRow, {
			label: "Keys",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-fg-muted",
				children: "No active REST API keys."
			})
		}) : activeKeys.map((key) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeyRow, {
			item: key,
			busy: busy === key.id,
			onRevoke: () => onRevoke(key),
			onDelete: () => onDelete(key)
		}, key.id)),
		revokedKeys.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-1",
			children: revokedKeys.map((key) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeyRow, {
				item: key,
				busy: busy === key.id,
				revoked: true,
				onDelete: () => onDelete(key)
			}, key.id))
		}) : null
	] });
}
function KeyRow({ item, busy = false, revoked = false, onRevoke, onDelete }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("grid gap-3 border-b border-border-subtle py-4 text-[13px] transition-colors md:grid-cols-[140px_minmax(0,1fr)]", revoked ? "text-fg-muted" : "hover:border-border"),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: cn("inline-flex h-6 items-center rounded-full border px-2 font-mono text-[10.5px] uppercase tracking-[0.08em]", revoked ? "border-border-subtle text-fg-faint" : "border-accent/30 bg-accent/10 text-accent"),
			children: revoked ? "Revoked" : "Active"
		}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex min-w-0 flex-wrap items-start justify-between gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: cn("text-[14px] font-medium", revoked ? "text-fg-muted" : "text-fg"),
						children: item.name
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-1 font-mono text-[11.5px] text-fg-muted",
						children: [item.tokenPrefix, "…"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-1 flex flex-wrap text-[11.5px] text-fg-faint",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Created ", formatDate(item.createdAt)] }),
							item.expiresAt ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "before:mx-2 before:content-['·']",
								children: ["Expires ", formatDate(item.expiresAt)]
							}) : null,
							item.lastUsedAt ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "before:mx-2 before:content-['·']",
								children: ["Last used ", formatDate(item.lastUsedAt)]
							}) : null
						]
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex shrink-0 items-center gap-2",
				children: [!revoked && onRevoke ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					variant: "outline",
					size: "sm",
					disabled: busy,
					onClick: onRevoke,
					children: busy ? "Working…" : "Revoke"
				}) : null, onDelete ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					variant: revoked ? "ghost" : "outline",
					size: "sm",
					disabled: busy,
					onClick: onDelete,
					className: cn("text-danger hover:text-danger", revoked ? "hover:bg-danger/10" : "border-danger/30 hover:border-danger/60"),
					children: busy ? "Deleting…" : "Delete"
				}) : null]
			})]
		})]
	});
}
function formatDate(value) {
	return new Date(value).toLocaleDateString("en", {
		month: "short",
		day: "numeric",
		year: "numeric"
	});
}
function formatRelative(value) {
	const then = new Date(value).getTime();
	const diffMs = Date.now() - then;
	const minutes = Math.floor(diffMs / 6e4);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	return new Date(value).toLocaleDateString(void 0, {
		month: "short",
		day: "numeric"
	});
}
function formatInterval(minutes) {
	if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h`;
	return `${minutes}m`;
}
function getPublicApiUrl() {
	if (typeof window === "undefined") return "https://produktive.app/api/v1";
	if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") return "http://localhost:3000/api/v1";
	return `${window.location.origin}/api/v1`;
}
function SectionGroup({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex flex-col gap-0.5",
		children
	});
}
function SectionButton({ section, active, onSelect, danger = false }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		role: "tab",
		"aria-selected": active,
		onClick: () => onSelect(section.id),
		className: cn("flex h-8 items-center rounded-md px-2.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent", active ? danger ? "bg-danger/10 text-danger" : "bg-surface text-fg" : `${danger ? "text-danger/80 hover:text-danger" : "text-fg-muted hover:text-fg"} hover:bg-surface/60`),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "truncate",
			children: section.label
		})
	});
}
function GeneralSettings({ organization, canEdit }) {
	const [draftName, setDraftName] = (0, import_react.useState)(organization?.name ?? "");
	const [submitting, setSubmitting] = (0, import_react.useState)(false);
	const [uploadingIcon, setUploadingIcon] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		setDraftName(organization?.name ?? "");
	}, [organization?.name]);
	if (!organization) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoadingTip, { compact: true });
	const trimmed = draftName.trim();
	const dirty = trimmed !== organization.name;
	const tooLong = trimmed.length > 64;
	const canSave = canEdit && dirty && trimmed.length > 0 && !tooLong && !submitting;
	const onSave = async (event) => {
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
	const onIconFile = async (event) => {
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
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
		onSubmit: onSave,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingRow, {
				label: "Icon",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(WorkspaceIcon, {
						name: organization.name,
						image: organization.image
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: cn("inline-flex h-8 items-center rounded-md border border-border-subtle bg-bg px-3 text-[12px] text-fg transition-colors", canEdit ? "cursor-pointer hover:border-border" : "cursor-not-allowed opacity-60"),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "file",
							accept: "image/png,image/jpeg,image/webp,image/gif",
							className: "sr-only",
							disabled: !canEdit || uploadingIcon,
							onChange: (event) => void onIconFile(event)
						}), uploadingIcon ? "Uploading..." : "Upload icon"]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-[11.5px] text-fg-faint",
						children: "PNG, JPEG, WebP, or GIF. Max 2 MB."
					})] })]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SettingRow, {
				label: "Name",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					value: draftName,
					onChange: (event) => setDraftName(event.target.value),
					disabled: !canEdit || submitting,
					maxLength: 80,
					"aria-invalid": tooLong || void 0
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-1.5 flex items-center justify-between text-[11.5px] text-fg-faint",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: canEdit ? "Visible to teammates and on shared links." : "Missing permission to rename the workspace." }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: cn("tabular-nums", tooLong ? "text-danger" : "text-fg-faint"),
						children: [trimmed.length, "/64"]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SettingRow, {
				label: "Slug",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-mono text-[12px] text-fg-muted",
					children: organization.slug
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-[11.5px] text-fg-faint",
					children: "Used in URLs and integrations. Slugs are permanent."
				})]
			}),
			canEdit ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex justify-end gap-2 pt-3",
				children: [dirty ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					variant: "ghost",
					size: "sm",
					onClick: onReset,
					disabled: submitting,
					children: "Reset"
				}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "submit",
					size: "sm",
					disabled: !canSave,
					children: submitting ? "Saving…" : "Save changes"
				})]
			}) : null
		]
	});
}
function WorkspaceIcon({ name, image }) {
	if (image) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
		src: image,
		alt: "",
		className: "size-10 rounded-[9px] border border-border object-cover"
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "grid size-10 place-items-center rounded-[9px] border border-border bg-fg text-[14px] font-semibold text-bg",
		children: name.trim().charAt(0).toUpperCase() || "W"
	});
}
//#endregion
export { WorkspaceSettingsPage as component };

//# sourceMappingURL=_app.workspace.settings-Bf7Xc9-6.js.map