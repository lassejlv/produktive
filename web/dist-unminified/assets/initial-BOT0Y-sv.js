import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react } from "./initial-DqBeajiO.js";
import { a as useQueryClient, n as queryOptions, r as useQuery, t as useMutation } from "./initial-BUIQ08st.js";
import { y as twMerge } from "./initial-BjZJRI-E.js";
import { x as clsx } from "./initial-C0EVeHlk.js";
//#region src/lib/utils.ts
var cn = (...inputs) => twMerge(clsx(inputs));
//#endregion
//#region src/lib/use-media-query.ts
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
function useMediaQuery(query) {
	const [matches, setMatches] = (0, import_react.useState)(() => {
		if (typeof window === "undefined") return false;
		return window.matchMedia(query).matches;
	});
	(0, import_react.useEffect)(() => {
		if (typeof window === "undefined") return;
		const mql = window.matchMedia(query);
		const onChange = (event) => setMatches(event.matches);
		setMatches(mql.matches);
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	}, [query]);
	return matches;
}
//#endregion
//#region src/lib/api.ts
var trimTrailingSlash = (value) => value.replace(/\/+$/, "");
var apiUrl = trimTrailingSlash(globalThis.location?.origin ?? "");
globalThis.__produktiveApiClientBuild = "2026-05-01.asset-cache-refresh";
var apiPath = (path) => {
	return `${apiUrl}${path.startsWith("/") ? path : `/${path}`}`;
};
var request = async (path, init) => {
	const response = await fetch(apiPath(path), {
		credentials: "include",
		headers: {
			"Content-Type": "application/json",
			...init?.headers
		},
		...init
	});
	if (!response.ok) {
		const error = await response.json().catch(() => null);
		throw new Error(error?.error ?? "Request failed");
	}
	if (response.status === 204) return;
	return response.json();
};
var listIssues = () => request("/api/issues");
var listIssueStatuses = () => request("/api/issue-statuses");
var createIssueStatus = (input) => request("/api/issue-statuses", {
	method: "POST",
	body: JSON.stringify(input)
});
var updateIssueStatus = (id, input) => request(`/api/issue-statuses/${id}`, {
	method: "PATCH",
	body: JSON.stringify(input)
});
var deleteIssueStatus = (id, replacementStatus) => request(`/api/issue-statuses/${id}`, {
	method: "DELETE",
	body: JSON.stringify({ replacementStatus })
});
var getIssue = (id) => request(`/api/issues/${id}`);
var getIssueHistory = (id) => request(`/api/issues/${id}/history`);
var listIssueComments = (id) => request(`/api/issues/${id}/comments`);
var createIssueComment = (id, body) => request(`/api/issues/${id}/comments`, {
	method: "POST",
	body: JSON.stringify({ body })
});
var listIssueSubscribers = (id) => request(`/api/issues/${id}/subscribers`);
var subscribeToIssue = (id) => request(`/api/issues/${id}/subscribers`, { method: "POST" });
var unsubscribeFromIssue = (id) => request(`/api/issues/${id}/subscribers`, { method: "DELETE" });
var listInbox = () => request("/api/inbox");
var markNotificationRead = (id) => request(`/api/inbox/${id}/read`, { method: "POST" });
var markAllNotificationsRead = () => request("/api/inbox/read-all", { method: "POST" });
var getMyPreferences = () => request("/api/me/preferences");
var updateMyPreferences = (patch) => request("/api/me/preferences", {
	method: "PATCH",
	body: JSON.stringify(patch)
});
var listTabs = () => request("/api/me/tabs");
var openTab = (input) => request("/api/me/tabs", {
	method: "POST",
	body: JSON.stringify(input)
});
var closeTab = (id) => request(`/api/me/tabs/${id}`, { method: "DELETE" });
var closeAllTabs = () => request("/api/me/tabs", { method: "DELETE" });
var markOnboarding = (patch) => request("/api/me/onboarding", {
	method: "PATCH",
	body: JSON.stringify(patch)
});
var previewOAuthAuthorization = (search) => request(`/api/oauth/authorize${search}`);
var decideOAuthAuthorization = (search, approve) => {
	const params = new URLSearchParams(search);
	return request("/api/oauth/authorize", {
		method: "POST",
		body: JSON.stringify({
			responseType: params.get("response_type") ?? "",
			clientId: params.get("client_id") ?? "",
			redirectUri: params.get("redirect_uri") ?? "",
			state: params.get("state") || void 0,
			scope: params.get("scope") || void 0,
			codeChallenge: params.get("code_challenge") ?? "",
			codeChallengeMethod: params.get("code_challenge_method") ?? "",
			resource: params.get("resource") || void 0,
			approve
		})
	});
};
var listMcpServers = () => request("/api/ai/mcp/servers");
var listAiModels = () => request("/api/ai/models");
var createMcpServer = (input) => request("/api/ai/mcp/servers", {
	method: "POST",
	body: JSON.stringify(input)
});
var updateMcpServer = (id, patch) => request(`/api/ai/mcp/servers/${id}`, {
	method: "PATCH",
	body: JSON.stringify(patch)
});
var deleteMcpServer = (id) => request(`/api/ai/mcp/servers/${id}`, { method: "DELETE" });
var refreshMcpServerTools = (id) => request(`/api/ai/mcp/servers/${id}/refresh-tools`, { method: "POST" });
var startMcpServerOAuth = (id) => request(`/api/ai/mcp/servers/${id}/oauth/start`, { method: "POST" });
var listMcpApiKeys = () => request("/api/api-keys/keys");
var createMcpApiKey = (input) => request("/api/api-keys/keys", {
	method: "POST",
	body: JSON.stringify(input)
});
var revokeMcpApiKey = (id) => request(`/api/api-keys/keys/${id}`, { method: "DELETE" });
var deleteMcpApiKey = (id) => request(`/api/api-keys/keys/${id}/delete`, { method: "DELETE" });
var getGithubConnection = () => request("/api/github/connection");
var startGithubOAuth = () => request("/api/github/oauth/start", { method: "POST" });
var disconnectGithub = () => request("/api/github/connection", { method: "DELETE" });
var listGithubRepositories = () => request("/api/github/repositories");
var searchGithubRepositories = (params) => request(`/api/github/repository-search?q=${encodeURIComponent(params.q)}`);
var createGithubRepository = (input) => request("/api/github/repositories", {
	method: "POST",
	body: JSON.stringify(input)
});
var updateGithubRepository = (id, patch) => request(`/api/github/repositories/${id}`, {
	method: "PATCH",
	body: JSON.stringify(patch)
});
var deleteGithubRepository = (id) => request(`/api/github/repositories/${id}`, { method: "DELETE" });
var previewGithubRepositoryImport = (id) => request(`/api/github/repositories/${id}/preview`, { method: "POST" });
var importGithubRepositoryIssues = (id) => request(`/api/github/repositories/${id}/import`, { method: "POST" });
var listInvitations = () => request("/api/organizations/me/invitations");
var createInvitation = (email, role) => request("/api/organizations/me/invitations", {
	method: "POST",
	body: JSON.stringify({
		email,
		role
	})
});
var revokeInvitation = (id) => request(`/api/organizations/me/invitations/${id}`, { method: "DELETE" });
var resendInvitation = (id) => request(`/api/organizations/me/invitations/${id}/resend`, { method: "POST" });
var lookupInvitation = (token) => request(`/api/invitations/lookup?token=${encodeURIComponent(token)}`);
var acceptInvitation = (token) => request("/api/invitations/accept", {
	method: "POST",
	body: JSON.stringify({ token })
});
var listProjects = (includeArchived = false) => {
	return request(`/api/projects${includeArchived ? "?include_archived=true" : ""}`);
};
var getProject = (id) => request(`/api/projects/${id}`);
var createProject = (input) => request("/api/projects", {
	method: "POST",
	body: JSON.stringify(input)
});
var updateProject = (id, patch) => request(`/api/projects/${id}`, {
	method: "PATCH",
	body: JSON.stringify(patch)
});
var deleteProject = (id) => request(`/api/projects/${id}`, { method: "DELETE" });
var listLabels = (includeArchived = false) => {
	return request(`/api/labels${includeArchived ? "?include_archived=true" : ""}`);
};
var createLabel = (input) => request("/api/labels", {
	method: "POST",
	body: JSON.stringify(input)
});
var updateLabel = (id, patch) => request(`/api/labels/${id}`, {
	method: "PATCH",
	body: JSON.stringify(patch)
});
var deleteLabel = (id) => request(`/api/labels/${id}`, { method: "DELETE" });
var getMemberProfile = (id) => request(`/api/members/${id}`);
var listMembers = () => request("/api/members");
var listRoles = () => request("/api/roles");
var createRole = (input) => request("/api/roles", {
	method: "POST",
	body: JSON.stringify(input)
});
var updateRole = (id, input) => request(`/api/roles/${id}`, {
	method: "PATCH",
	body: JSON.stringify(input)
});
var deleteRole = (id) => request(`/api/roles/${id}`, { method: "DELETE" });
var updateMemberRole = (id, role) => request(`/api/members/${id}`, {
	method: "PATCH",
	body: JSON.stringify({ role })
});
var removeMember = (id) => request(`/api/members/${id}`, { method: "DELETE" });
var createIssue = (input) => request("/api/issues", {
	method: "POST",
	body: JSON.stringify(input)
});
var updateIssue = (id, input) => request(`/api/issues/${id}`, {
	method: "PATCH",
	body: JSON.stringify(input)
});
var deleteIssue = (id) => request(`/api/issues/${id}`, { method: "DELETE" });
var uploadIssueAttachment = async (id, file) => {
	const form = new FormData();
	form.append("file", file);
	const response = await fetch(apiPath(`/api/issues/${id}/attachments`), {
		method: "POST",
		credentials: "include",
		body: form
	});
	if (!response.ok) {
		const error = await response.json().catch(() => null);
		throw new Error(error?.error ?? "Failed to upload attachment");
	}
	return response.json();
};
var listFavorites = () => request("/api/favorites");
var addFavorite = (targetType, targetId) => request("/api/favorites", {
	method: "POST",
	body: JSON.stringify({
		targetType,
		targetId
	})
});
var removeFavorite = (targetType, targetId) => request(`/api/favorites/by/${targetType}/${encodeURIComponent(targetId)}`, { method: "DELETE" });
var listChats = () => request("/api/chats");
var createChat = () => request("/api/chats", { method: "POST" });
var getChat = (id) => request(`/api/chats/${id}`);
var deleteChat = (id) => request(`/api/chats/${id}`, { method: "DELETE" });
var listChatAccess = (id) => request(`/api/chats/${id}/access`);
var grantChatAccess = (id, userId) => request(`/api/chats/${id}/access`, {
	method: "POST",
	body: JSON.stringify({ userId })
});
var revokeChatAccess = (id, userId) => request(`/api/chats/${id}/access/${userId}`, { method: "DELETE" });
var uploadChatAttachment = async (id, file) => {
	const form = new FormData();
	form.append("file", file);
	const response = await fetch(apiPath(`/api/chats/${id}/attachments`), {
		method: "POST",
		credentials: "include",
		body: form
	});
	if (!response.ok) {
		const error = await response.json().catch(() => null);
		throw new Error(error?.error ?? "Failed to upload attachment");
	}
	return response.json();
};
var streamChatMessage = async (id, content, onEvent, options) => {
	const body = { content };
	if (options?.model) body.model = options.model;
	const response = await fetch(apiPath(`/api/chats/${id}/messages/stream`), {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body)
	});
	if (!response.ok) {
		const error = await response.json().catch(() => null);
		throw new Error(error?.error ?? "Request failed");
	}
	if (!response.body) throw new Error("Streaming is not supported in this browser");
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			onEvent(JSON.parse(trimmed));
		}
	}
	buffer += decoder.decode();
	const trimmed = buffer.trim();
	if (trimmed) onEvent(JSON.parse(trimmed));
};
var previewDiscordLink = (state) => request(`/api/discord/link/${encodeURIComponent(state)}`);
var completeDiscordLink = (state, organizationId) => request(`/api/discord/link/${encodeURIComponent(state)}`, {
	method: "POST",
	body: JSON.stringify({ organizationId })
});
//#endregion
//#region src/lib/auth-client.ts
var requestAuth = async (path, body) => {
	const response = await fetch(apiPath(path), {
		method: body ? "POST" : "GET",
		credentials: "include",
		headers: body ? { "Content-Type": "application/json" } : void 0,
		body: body ? JSON.stringify(body) : void 0
	});
	if (!response.ok) return {
		data: null,
		error: { message: (await response.json().catch(() => null))?.error ?? "Authentication failed" }
	};
	return {
		data: await response.json(),
		error: null
	};
};
var requestEmpty = async (path, body) => {
	const response = await fetch(apiPath(path), {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body)
	});
	if (!response.ok) return {
		data: null,
		error: { message: (await response.json().catch(() => null))?.error ?? "Request failed" }
	};
	return {
		data: await response.json(),
		error: null
	};
};
var requestJson = async (path, init) => {
	const response = await fetch(apiPath(path), {
		credentials: "include",
		headers: {
			"Content-Type": "application/json",
			...init?.headers
		},
		...init
	});
	if (!response.ok) {
		const error = await response.json().catch(() => null);
		throw new Error(error?.error ?? "Request failed");
	}
	return response.json();
};
var requestUpload = async (path, file) => {
	const body = new FormData();
	body.append("file", file);
	const response = await fetch(apiPath(path), {
		method: "POST",
		credentials: "include",
		body
	});
	if (!response.ok) {
		const error = await response.json().catch(() => null);
		throw new Error(error?.error ?? "Upload failed");
	}
	return response.json();
};
var sessionState = {
	data: null,
	error: null,
	status: "initial"
};
var sessionSubscribers = /* @__PURE__ */ new Set();
var inflightSessionFetch = null;
var sessionWriteVersion = 0;
var notifySessionSubscribers = () => {
	for (const fn of sessionSubscribers) fn();
};
var applySessionResult = (result) => {
	if (!result.error && result.data) {
		sessionWriteVersion += 1;
		sessionState = {
			data: result.data,
			error: null,
			status: "ready"
		};
		notifySessionSubscribers();
	}
	return result;
};
var clearSession = () => {
	sessionWriteVersion += 1;
	sessionState = {
		data: null,
		error: null,
		status: "ready"
	};
	notifySessionSubscribers();
};
var listOrganizations = () => requestJson("/api/auth/organizations");
var switchOrganization = (organizationId) => requestJson("/api/auth/switch-organization", {
	method: "POST",
	body: JSON.stringify({ organizationId })
});
var createOrganization = (name) => requestJson("/api/auth/organizations", {
	method: "POST",
	body: JSON.stringify({ name })
});
var updateActiveOrganization = (input) => requestJson("/api/auth/organizations/active", {
	method: "PATCH",
	body: JSON.stringify(input)
});
var uploadActiveOrganizationIcon = (file) => requestUpload("/api/auth/organizations/active/icon", file);
var deleteActiveOrganization = (input) => requestJson("/api/auth/organizations/active", {
	method: "DELETE",
	body: JSON.stringify(input)
});
var leaveActiveOrganization = () => requestJson("/api/auth/organizations/active/leave", { method: "POST" });
var deleteAccount = (confirm) => requestJson("/api/auth/account", {
	method: "DELETE",
	body: JSON.stringify({ confirm })
});
var uploadAccountIcon = (file) => requestUpload("/api/auth/account/icon", file).then((data) => {
	applySessionResult({
		data,
		error: null
	});
	return data;
});
var listAccountSessions = () => requestJson("/api/auth/sessions");
var revokeAccountSession = (id) => requestJson(`/api/auth/sessions/${id}`, { method: "DELETE" });
var revokeOtherAccountSessions = () => requestJson("/api/auth/sessions", { method: "DELETE" });
var authClient = {
	signIn: { email: ({ email, password }) => requestAuth("/api/auth/sign-in", {
		email,
		password
	}).then(applySessionResult) },
	signUp: { email: ({ email, password, name }) => requestEmpty("/api/auth/sign-up", {
		email,
		password,
		name
	}) },
	verifyEmail: ({ token }) => requestAuth("/api/auth/verify-email", { token }).then(applySessionResult),
	requestPasswordReset: ({ email }) => requestEmpty("/api/auth/request-password-reset", { email }),
	resetPassword: ({ token, password }) => requestEmpty("/api/auth/reset-password", {
		token,
		password
	}),
	getSession: () => requestAuth("/api/auth/session")
};
authClient.signIn;
authClient.signUp;
var signOut = async () => {
	await fetch(apiPath("/api/auth/sign-out"), {
		method: "POST",
		credentials: "include"
	});
	clearSession();
};
var fetchSession = async () => {
	const requestVersion = sessionWriteVersion;
	sessionState = {
		...sessionState,
		status: "loading"
	};
	notifySessionSubscribers();
	const result = await authClient.getSession();
	if (requestVersion !== sessionWriteVersion) return;
	if (result.error) sessionState = {
		data: null,
		error: new Error(result.error.message),
		status: "error"
	};
	else sessionState = {
		data: result.data,
		error: null,
		status: "ready"
	};
	notifySessionSubscribers();
};
var refreshSession = () => {
	if (!inflightSessionFetch) inflightSessionFetch = fetchSession().finally(() => {
		inflightSessionFetch = null;
	});
	return inflightSessionFetch;
};
var useSession = () => {
	const [, forceRender] = (0, import_react.useState)(0);
	(0, import_react.useEffect)(() => {
		const handler = () => forceRender((tick) => tick + 1);
		sessionSubscribers.add(handler);
		if (sessionState.status === "initial") refreshSession();
		return () => {
			sessionSubscribers.delete(handler);
		};
	}, []);
	return {
		data: sessionState.data,
		error: sessionState.error,
		isPending: sessionState.status === "initial" || sessionState.status === "loading",
		refresh: refreshSession
	};
};
var useOrganizations = (enabled) => {
	const [organizations, setOrganizations] = (0, import_react.useState)([]);
	const [activeOrganizationId, setActiveOrganizationId] = (0, import_react.useState)(null);
	const [isLoading, setIsLoading] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)(null);
	const refresh = (0, import_react.useCallback)(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const result = await listOrganizations();
			setOrganizations(result.organizations);
			setActiveOrganizationId(result.activeOrganizationId);
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : "Failed to load organizations");
		} finally {
			setIsLoading(false);
		}
	}, []);
	(0, import_react.useEffect)(() => {
		if (!enabled) return;
		refresh();
	}, [enabled, refresh]);
	return {
		organizations,
		activeOrganizationId,
		isLoading,
		error,
		refresh
	};
};
//#endregion
//#region src/lib/queries/keys.ts
var queryKeys = {
	issues: {
		all: ["issues"],
		list: () => ["issues", "list"],
		statuses: () => ["issues", "statuses"],
		detail: (id) => [
			"issues",
			"detail",
			id
		],
		history: (id) => [
			"issues",
			"detail",
			id,
			"history"
		],
		comments: (id) => [
			"issues",
			"detail",
			id,
			"comments"
		],
		subscribers: (id) => [
			"issues",
			"detail",
			id,
			"subscribers"
		]
	},
	projects: {
		all: ["projects"],
		list: (includeArchived) => [
			"projects",
			"list",
			{ includeArchived }
		],
		detail: (id) => [
			"projects",
			"detail",
			id
		]
	},
	labels: {
		all: ["labels"],
		list: (includeArchived) => [
			"labels",
			"list",
			{ includeArchived }
		]
	},
	favorites: ["favorites"],
	inbox: ["inbox"],
	chats: ["chats"],
	mcp: {
		keys: ["mcp", "keys"],
		servers: ["mcp", "servers"]
	},
	ai: { models: ["ai", "models"] },
	github: {
		connection: ["github", "connection"],
		repositories: ["github", "repositories"],
		repositorySearch: (q) => [
			"github",
			"repository-search",
			q
		]
	},
	members: ["members"],
	invitations: ["invitations"],
	tabs: ["tabs"]
};
//#endregion
//#region src/lib/use-tabs.ts
var tabsQueryOptions = () => queryOptions({
	queryKey: queryKeys.tabs,
	queryFn: listTabs,
	staleTime: 3e4
});
function useTabs() {
	const qc = useQueryClient();
	const query = useQuery(tabsQueryOptions());
	const open = useMutation({
		mutationFn: openTab,
		onMutate: async (input) => {
			await qc.cancelQueries({ queryKey: queryKeys.tabs });
			const previous = qc.getQueryData(queryKeys.tabs) ?? [];
			const existingIndex = previous.findIndex((tab) => tab.tabType === input.tabType && tab.targetId === input.targetId);
			if (existingIndex >= 0) {
				const next = previous.slice();
				next[existingIndex] = {
					...previous[existingIndex],
					title: input.title
				};
				qc.setQueryData(queryKeys.tabs, next);
			} else {
				const optimistic = {
					id: `temp:${input.tabType}:${input.targetId}`,
					tabType: input.tabType,
					targetId: input.targetId,
					title: input.title,
					openedAt: (/* @__PURE__ */ new Date()).toISOString()
				};
				qc.setQueryData(queryKeys.tabs, [...previous, optimistic]);
			}
			return { previous };
		},
		onSuccess: (created) => {
			qc.setQueryData(queryKeys.tabs, (existing) => {
				const list = existing ?? [];
				const idx = list.findIndex((tab) => tab.tabType === created.tabType && tab.targetId === created.targetId);
				if (idx >= 0) {
					const next = list.slice();
					next[idx] = created;
					return next;
				}
				return [...list, created];
			});
		},
		onError: (_error, _input, context) => {
			if (context?.previous !== void 0) qc.setQueryData(queryKeys.tabs, context.previous);
		}
	});
	const close = useMutation({
		mutationFn: closeTab,
		onMutate: async (id) => {
			await qc.cancelQueries({ queryKey: queryKeys.tabs });
			const previous = qc.getQueryData(queryKeys.tabs);
			qc.setQueryData(queryKeys.tabs, (existing) => (existing ?? []).filter((tab) => tab.id !== id));
			return { previous };
		},
		onError: (_error, _id, context) => {
			if (context?.previous) qc.setQueryData(queryKeys.tabs, context.previous);
		}
	});
	const closeAll = useMutation({
		mutationFn: closeAllTabs,
		onSuccess: () => {
			qc.setQueryData(queryKeys.tabs, []);
		}
	});
	return {
		tabs: query.data ?? [],
		isLoading: query.isPending,
		open: open.mutate,
		openAsync: open.mutateAsync,
		close: close.mutate,
		closeAll: closeAll.mutate
	};
}
/**
* Idempotently registers a tab when a detail page mounts. Re-opening with the
* same (type, id, title) is debounced so React StrictMode double-renders or
* rapid re-mounts don't fire the API twice.
*/
var recentRegistrations = /* @__PURE__ */ new Map();
var REGISTER_THROTTLE_MS = 1e3;
function useRegisterTab(input) {
	const { open } = useTabs();
	const { tabType, targetId, title, enabled } = input;
	(0, import_react.useEffect)(() => {
		if (!enabled) return;
		if (!title || !targetId) return;
		const key = `${tabType}:${targetId}:${title}`;
		const last = recentRegistrations.get(key) ?? 0;
		const now = Date.now();
		if (now - last < REGISTER_THROTTLE_MS) return;
		recentRegistrations.set(key, now);
		open({
			tabType,
			targetId,
			title
		});
	}, [
		enabled,
		tabType,
		targetId,
		title,
		open
	]);
}
//#endregion
//#region src/lib/use-user-preferences.ts
var PREFERENCES_QUERY_KEY = ["user-preferences"];
var userPreferencesQueryOptions = () => queryOptions({
	queryKey: PREFERENCES_QUERY_KEY,
	queryFn: getMyPreferences,
	staleTime: 6e4
});
function useUserPreferences() {
	const query = useQuery(userPreferencesQueryOptions());
	const prefs = query.data ?? null;
	return {
		prefs,
		tabsEnabled: prefs?.tabsEnabled ?? true,
		isLoading: query.isPending
	};
}
//#endregion
//#region src/lib/queries/issues.ts
var issuesQueryOptions = () => queryOptions({
	queryKey: queryKeys.issues.list(),
	queryFn: () => listIssues().then((r) => r.issues),
	staleTime: 6e4
});
var issueDetailQueryOptions = (id) => queryOptions({
	queryKey: queryKeys.issues.detail(id),
	queryFn: () => getIssue(id).then((r) => r.issue),
	staleTime: 6e4
});
var issueHistoryQueryOptions = (id) => queryOptions({
	queryKey: queryKeys.issues.history(id),
	queryFn: () => getIssueHistory(id).then((r) => r.events),
	staleTime: 6e4
});
var issueCommentsQueryOptions = (id) => queryOptions({
	queryKey: queryKeys.issues.comments(id),
	queryFn: () => listIssueComments(id).then((r) => r.comments),
	staleTime: 6e4
});
var issueSubscribersQueryOptions = (id) => queryOptions({
	queryKey: queryKeys.issues.subscribers(id),
	queryFn: () => listIssueSubscribers(id),
	staleTime: 6e4
});
var useIssuesQuery = () => useQuery(issuesQueryOptions());
var useIssueDetailQuery = (id) => useQuery(issueDetailQueryOptions(id));
var useIssueHistoryQuery = (id) => useQuery(issueHistoryQueryOptions(id));
var useIssueCommentsQuery = (id) => useQuery(issueCommentsQueryOptions(id));
var useIssueSubscribersQuery = (id) => useQuery(issueSubscribersQueryOptions(id));
//#endregion
//#region src/lib/queries/projects.ts
var projectsQueryOptions = (includeArchived = false) => queryOptions({
	queryKey: queryKeys.projects.list(includeArchived),
	queryFn: () => listProjects(includeArchived).then((r) => r.projects),
	staleTime: 6e4
});
var projectDetailQueryOptions = (id) => queryOptions({
	queryKey: queryKeys.projects.detail(id),
	queryFn: () => getProject(id).then((r) => r.project),
	staleTime: 6e4
});
var useProjectsQuery = (includeArchived = false) => useQuery(projectsQueryOptions(includeArchived));
var useProjectDetailQuery = (id) => useQuery(projectDetailQueryOptions(id));
//#endregion
//#region src/lib/queries/chats.ts
var chatsQueryOptions = () => queryOptions({
	queryKey: queryKeys.chats,
	queryFn: () => listChats().then((r) => r.chats),
	staleTime: 6e4
});
var chatAccessQueryOptions = (chatId) => queryOptions({
	queryKey: [
		...queryKeys.chats,
		chatId,
		"access"
	],
	queryFn: () => listChatAccess(chatId).then((r) => r.access),
	staleTime: 3e4
});
var useChatsQuery = () => useQuery(chatsQueryOptions());
//#endregion
//#region src/lib/issue-constants.ts
var defaultIssueStatuses = [
	{
		id: "backlog",
		key: "backlog",
		name: "Backlog",
		color: "gray",
		category: "backlog",
		sortOrder: 0,
		isSystem: true,
		archived: false
	},
	{
		id: "todo",
		key: "todo",
		name: "Todo",
		color: "blue",
		category: "active",
		sortOrder: 10,
		isSystem: true,
		archived: false
	},
	{
		id: "in-progress",
		key: "in-progress",
		name: "In Progress",
		color: "purple",
		category: "active",
		sortOrder: 20,
		isSystem: true,
		archived: false
	},
	{
		id: "done",
		key: "done",
		name: "Done",
		color: "green",
		category: "done",
		sortOrder: 30,
		isSystem: true,
		archived: false
	},
	{
		id: "canceled",
		key: "canceled",
		name: "Canceled",
		color: "red",
		category: "canceled",
		sortOrder: 40,
		isSystem: true,
		archived: false
	}
];
defaultIssueStatuses.map((status) => status.key);
var priorityOptions = [
	"low",
	"medium",
	"high",
	"urgent"
];
var statusLabel = Object.fromEntries(defaultIssueStatuses.map((status) => [status.key, status.name]));
defaultIssueStatuses.map((status) => status.key);
var viewLabels = {
	all: "All issues",
	active: "Active",
	backlog: "Backlog",
	done: "Done"
};
var sortedStatuses = (statuses) => [...statuses].filter((s) => !s.archived).sort((a, b) => a.sortOrder - b.sortOrder);
var statusName = (statuses, key) => statuses.find((status) => status.key === key)?.name ?? statusLabel[key] ?? key;
var statusCategory = (statuses, key) => statuses.find((status) => status.key === key)?.category ?? defaultIssueStatuses.find((status) => status.key === key)?.category ?? "active";
var statusesByCategory = (statuses, category) => sortedStatuses(statuses).filter((status) => status.category === category);
var firstStatusForCategory = (statuses, category, fallback) => statusesByCategory(statuses, category)[0]?.key ?? fallback;
var issueMatchesView = (issue, view, statuses) => {
	if (view === "all") return true;
	if (view === "active") return statusCategory(statuses, issue.status) === "active";
	if (view === "backlog") return statusCategory(statuses, issue.status) === "backlog";
	if (view === "done") return statusCategory(statuses, issue.status) === "done";
	return true;
};
var formatDate = (value) => new Intl.DateTimeFormat("en", {
	month: "short",
	day: "numeric"
}).format(new Date(value));
//#endregion
//#region src/lib/project-constants.ts
var projectStatusOptions = [
	"planned",
	"in-progress",
	"completed",
	"cancelled"
];
var projectStatusLabel = {
	planned: "Planned",
	"in-progress": "In Progress",
	completed: "Completed",
	cancelled: "Cancelled"
};
var projectColorOptions = [
	"blue",
	"green",
	"orange",
	"purple",
	"pink",
	"red",
	"yellow",
	"gray"
];
var projectColorHex = {
	blue: "#5b8cff",
	green: "#46b07a",
	orange: "#ff9456",
	purple: "#9061f9",
	pink: "#f472b6",
	red: "#e0594a",
	yellow: "#d4a23a",
	gray: "#7a7a82"
};
var defaultProjectColor = "blue";
var projectColorBackground = (color) => {
	return `${projectColorHex[color] ?? projectColorHex.blue}38`;
};
//#endregion
//#region src/lib/label-constants.ts
var labelColorOptions = projectColorOptions;
var labelColorHex = projectColorHex;
var defaultLabelColor = "gray";
//#endregion
//#region src/lib/issue-display.ts
var defaultDisplayOptions = {
	groupBy: "status",
	sortBy: "manual",
	density: "comfortable",
	viewMode: "list",
	properties: {
		priority: true,
		id: true,
		status: true,
		assignee: true,
		project: true,
		labels: true,
		updated: true
	}
};
var STORAGE_KEY$1 = "issues-display-options";
function readStorage() {
	if (typeof window === "undefined") return defaultDisplayOptions;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY$1);
		if (!raw) return defaultDisplayOptions;
		const parsed = JSON.parse(raw);
		return {
			...defaultDisplayOptions,
			...parsed,
			properties: {
				...defaultDisplayOptions.properties,
				...parsed?.properties ?? {}
			}
		};
	} catch {
		return defaultDisplayOptions;
	}
}
function useDisplayOptions() {
	const [options, setOptions] = (0, import_react.useState)(defaultDisplayOptions);
	(0, import_react.useEffect)(() => {
		setOptions(readStorage());
	}, []);
	const update = (patch) => {
		setOptions((current) => {
			const next = {
				...current,
				...patch
			};
			if (typeof window !== "undefined") try {
				window.localStorage.setItem(STORAGE_KEY$1, JSON.stringify(next));
			} catch {}
			return next;
		});
	};
	const updateProperties = (patch) => {
		setOptions((current) => {
			const next = {
				...current,
				properties: {
					...current.properties,
					...patch
				}
			};
			if (typeof window !== "undefined") try {
				window.localStorage.setItem(STORAGE_KEY$1, JSON.stringify(next));
			} catch {}
			return next;
		});
	};
	return {
		options,
		update,
		updateProperties
	};
}
var priorityRank = {
	urgent: 0,
	high: 1,
	medium: 2,
	low: 3,
	none: 4
};
var priorityLabels = {
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
	none: "No priority"
};
function groupIssues(issues, groupBy, statuses) {
	if (groupBy === "none") return [{
		key: "all",
		label: "All issues",
		status: null,
		items: issues
	}];
	if (groupBy === "status") {
		const buckets = {};
		for (const issue of issues) (buckets[issue.status] ??= []).push(issue);
		const ordered = statuses?.length ? sortedStatuses(statuses).map((status) => ({
			key: status.key,
			label: status.name
		})) : Object.keys(statusLabel).map((key) => ({
			key,
			label: statusLabel[key]
		}));
		const known = ordered.filter((s) => buckets[s.key]?.length).map((status) => ({
			key: status.key,
			label: status.label,
			status: status.key,
			items: buckets[status.key]
		}));
		const unknown = Object.keys(buckets).filter((key) => !ordered.some((status) => status.key === key)).map((key) => ({
			key,
			label: statusLabel[key] ?? key,
			status: key,
			items: buckets[key]
		}));
		return [...known, ...unknown];
	}
	if (groupBy === "priority") {
		const buckets = {};
		for (const issue of issues) (buckets[issue.priority] ??= []).push(issue);
		return [...priorityOptions].filter((p) => buckets[p]?.length).map((priority) => ({
			key: priority,
			label: priorityLabels[priority] ?? priority,
			status: null,
			items: buckets[priority]
		}));
	}
	if (groupBy === "project") {
		const buckets = {};
		for (const issue of issues) {
			const id = issue.project?.id ?? "__noproject";
			const name = issue.project?.name ?? "No project";
			(buckets[id] ??= {
				name,
				items: []
			}).items.push(issue);
		}
		return Object.entries(buckets).sort(([a, av], [b, bv]) => {
			if (a === "__noproject") return 1;
			if (b === "__noproject") return -1;
			return av.name.localeCompare(bv.name);
		}).map(([key, { name, items }]) => ({
			key,
			label: name,
			status: null,
			items
		}));
	}
	const buckets = {};
	for (const issue of issues) {
		const id = issue.assignedTo?.id ?? "__unassigned";
		const name = issue.assignedTo?.name ?? "Unassigned";
		(buckets[id] ??= {
			name,
			items: []
		}).items.push(issue);
	}
	return Object.entries(buckets).sort(([a, av], [b, bv]) => {
		if (a === "__unassigned") return 1;
		if (b === "__unassigned") return -1;
		return av.name.localeCompare(bv.name);
	}).map(([key, { name, items }]) => ({
		key,
		label: name,
		status: null,
		items
	}));
}
function sortIssues(items, sortBy) {
	if (sortBy === "manual") return items;
	const sorted = [...items];
	if (sortBy === "created") sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
	else if (sortBy === "updated") sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
	else if (sortBy === "priority") sorted.sort((a, b) => (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99));
	return sorted;
}
//#endregion
//#region src/lib/chat-attachments.ts
var attachmentStart = "\n\n<produktive_attachments>\n";
var attachmentEnd = "\n</produktive_attachments>";
var maxFileBytes = 10 * 1024 * 1024;
var maxFiles = 5;
function formatBytes(bytes) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function formatIssueReferences(issues) {
	if (issues.length === 0) return "";
	return `\n\nReferenced issues (use the get_issue tool for full details):\n${issues.map((issue) => `- id: ${issue.id} — "${issue.title}" (status: ${issue.status}, priority: ${issue.priority})`).join("\n")}`;
}
function formatToolReferences(tools) {
	if (tools.length === 0) return "";
	return `\n\nThe user has @-mentioned these tools — prefer them when relevant this turn:\n${tools.map((tool) => {
		const desc = tool.description ? ` — ${tool.description}` : "";
		return `- ${tool.displayName} (${tool.server.name})${desc}`;
	}).join("\n")}`;
}
function formatChatReferences(chats) {
	if (chats.length === 0) return "";
	return `\n\nReferenced chats (use the get_chat tool to inspect their messages):\n${chats.map((chat) => `- id: ${chat.id} — "${chat.title}"`).join("\n")}`;
}
function prepareChatAttachments(files, currentCount = 0) {
	const incoming = Array.from(files);
	const nextFiles = incoming.slice(0, maxFiles - currentCount);
	const attachments = [];
	const errors = [];
	if (currentCount + incoming.length > maxFiles) errors.push(`Only ${maxFiles} files can be attached.`);
	for (const file of nextFiles) {
		if (file.size > maxFileBytes) {
			errors.push(`${file.name} is larger than ${formatBytes(maxFileBytes)}.`);
			continue;
		}
		attachments.push({
			id: crypto.randomUUID(),
			file
		});
	}
	return {
		attachments,
		errors
	};
}
function buildMessageWithAttachments(text, attachments) {
	const trimmed = text.trim();
	if (attachments.length === 0) return trimmed;
	const payload = JSON.stringify(attachments.map(({ name, type, size, url, key }) => ({
		name,
		type,
		size,
		url,
		key
	})));
	return `${trimmed || "Review the attached files."}${attachmentStart}${payload}${attachmentEnd}`;
}
function parseMessageWithAttachments(content) {
	const start = content.indexOf(attachmentStart);
	if (start === -1) return {
		text: content,
		attachments: []
	};
	const end = content.indexOf(attachmentEnd, start + 27);
	if (end === -1) return {
		text: content,
		attachments: []
	};
	const text = content.slice(0, start);
	const raw = content.slice(start + 27, end);
	try {
		return {
			text,
			attachments: JSON.parse(raw).map((attachment) => ({
				id: `${attachment.name}-${attachment.size}-${attachment.url}`,
				name: attachment.name,
				type: attachment.type ?? attachment.contentType ?? "application/octet-stream",
				size: attachment.size,
				url: attachment.url,
				key: attachment.key
			}))
		};
	} catch {
		return {
			text: content,
			attachments: []
		};
	}
}
//#endregion
//#region src/lib/use-favorites.ts
function useFavorites() {
	const qc = useQueryClient();
	const query = useQuery({
		queryKey: queryKeys.favorites,
		queryFn: () => listFavorites().then((r) => r.favorites),
		staleTime: 6e4
	});
	const favorites = query.data ?? [];
	const refresh = (0, import_react.useCallback)(async () => {
		await qc.invalidateQueries({ queryKey: queryKeys.favorites });
	}, [qc]);
	const isFavorite = (0, import_react.useCallback)((type, id) => favorites.some((fav) => fav.type === type && fav.id === id), [favorites]);
	const addFavorite$1 = (0, import_react.useCallback)(async (type, id) => {
		const placeholder = type === "chat" ? {
			type: "chat",
			id,
			favoriteId: `pending:${id}`,
			title: "…",
			position: favorites.length
		} : type === "project" ? {
			type: "project",
			id,
			favoriteId: `pending:${id}`,
			title: "…",
			color: "#888",
			icon: null,
			status: "active",
			position: favorites.length
		} : {
			type: "issue",
			id,
			favoriteId: `pending:${id}`,
			title: "…",
			status: "backlog",
			priority: "medium",
			position: favorites.length
		};
		qc.setQueryData(queryKeys.favorites, (old) => old ? [...old, placeholder] : [placeholder]);
		try {
			await addFavorite(type, id);
			await qc.invalidateQueries({ queryKey: queryKeys.favorites });
		} catch (error) {
			qc.setQueryData(queryKeys.favorites, (old) => old?.filter((f) => f.favoriteId !== placeholder.favoriteId));
			throw error;
		}
	}, [favorites.length, qc]);
	const removeFavorite$1 = (0, import_react.useCallback)(async (type, id) => {
		const previous = qc.getQueryData(queryKeys.favorites);
		qc.setQueryData(queryKeys.favorites, (old) => old?.filter((f) => !(f.type === type && f.id === id)));
		try {
			await removeFavorite(type, id);
		} catch (error) {
			if (previous) qc.setQueryData(queryKeys.favorites, previous);
			throw error;
		}
	}, [qc]);
	const toggleFavorite = (0, import_react.useCallback)(async (type, id) => {
		if (isFavorite(type, id)) await removeFavorite$1(type, id);
		else await addFavorite$1(type, id);
	}, [
		addFavorite$1,
		isFavorite,
		removeFavorite$1
	]);
	return {
		favorites,
		isLoading: query.isPending,
		error: query.error?.message ?? null,
		refresh,
		isFavorite,
		addFavorite: addFavorite$1,
		removeFavorite: removeFavorite$1,
		toggleFavorite
	};
}
//#endregion
//#region src/lib/mutations/issues.ts
function useCreateIssue() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input) => createIssue(input).then((r) => r.issue),
		onSuccess: (issue) => {
			qc.setQueryData(queryKeys.issues.list(), (old) => old ? [issue, ...old] : [issue]);
		}
	});
}
function useUpdateIssue() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, patch }) => updateIssue(id, patch).then((r) => r.issue),
		onMutate: async ({ id, patch }) => {
			await qc.cancelQueries({ queryKey: queryKeys.issues.all });
			const prevList = qc.getQueryData(queryKeys.issues.list());
			const prevDetail = qc.getQueryData(queryKeys.issues.detail(id));
			qc.setQueryData(queryKeys.issues.list(), (old) => old?.map((i) => i.id === id ? {
				...i,
				...patch
			} : i));
			qc.setQueryData(queryKeys.issues.detail(id), (old) => old ? {
				...old,
				...patch
			} : old);
			return {
				prevList,
				prevDetail
			};
		},
		onError: (_err, { id }, ctx) => {
			if (ctx?.prevList) qc.setQueryData(queryKeys.issues.list(), ctx.prevList);
			if (ctx?.prevDetail) qc.setQueryData(queryKeys.issues.detail(id), ctx.prevDetail);
		},
		onSuccess: (issue) => {
			qc.setQueryData(queryKeys.issues.list(), (old) => old?.map((i) => i.id === issue.id ? issue : i));
			qc.setQueryData(queryKeys.issues.detail(issue.id), issue);
		}
	});
}
function useDeleteIssue() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id) => deleteIssue(id),
		onMutate: async (id) => {
			await qc.cancelQueries({ queryKey: queryKeys.issues.list() });
			const prev = qc.getQueryData(queryKeys.issues.list());
			qc.setQueryData(queryKeys.issues.list(), (old) => old?.filter((i) => i.id !== id));
			return { prev };
		},
		onError: (_err, _id, ctx) => {
			if (ctx?.prev) qc.setQueryData(queryKeys.issues.list(), ctx.prev);
		},
		onSuccess: (_data, id) => {
			qc.removeQueries({ queryKey: queryKeys.issues.detail(id) });
		},
		onSettled: () => {
			qc.invalidateQueries({ queryKey: queryKeys.issues.list() });
		}
	});
}
//#endregion
//#region src/lib/queries/labels.ts
var labelsQueryOptions = (includeArchived = false) => queryOptions({
	queryKey: queryKeys.labels.list(includeArchived),
	queryFn: () => listLabels(includeArchived).then((r) => r.labels),
	staleTime: 6e4
});
var useLabelsQuery = (includeArchived = false) => useQuery(labelsQueryOptions(includeArchived));
//#endregion
//#region src/lib/queries/issue-statuses.ts
var issueStatusesQueryOptions = () => queryOptions({
	queryKey: queryKeys.issues.statuses(),
	queryFn: () => listIssueStatuses().then((r) => r.statuses),
	staleTime: 6e4
});
var useIssueStatusesQuery = () => useQuery(issueStatusesQueryOptions());
//#endregion
//#region src/lib/use-issue-statuses.ts
function useIssueStatuses() {
	const qc = useQueryClient();
	const query = useIssueStatusesQuery();
	const statuses = query.data?.length ? query.data : defaultIssueStatuses;
	const refresh = async () => {
		await qc.invalidateQueries({ queryKey: queryKeys.issues.statuses() });
	};
	const setStatuses = (next) => {
		qc.setQueryData(queryKeys.issues.statuses(), next);
	};
	return {
		statuses,
		isLoading: query.isPending,
		error: query.error?.message ?? null,
		refresh,
		setStatuses
	};
}
//#endregion
//#region src/lib/theme.ts
var THEMES = [
	{
		id: "slate",
		label: "Slate",
		hint: "The cool dark — default.",
		swatchBg: "#0d0d0f",
		swatchAccent: "#f1c6aa"
	},
	{
		id: "ember",
		label: "Ember",
		hint: "Warm copper dark.",
		swatchBg: "#0b0a0c",
		swatchAccent: "#e07a3c"
	},
	{
		id: "tokyo-night",
		label: "Tokyo Night",
		hint: "Soft navy with editor accents.",
		swatchBg: "#1a1b26",
		swatchAccent: "#7aa2f7"
	},
	{
		id: "midnight",
		label: "Midnight",
		hint: "Cobalt cool dark.",
		swatchBg: "#07080d",
		swatchAccent: "#6a8cff"
	},
	{
		id: "vercel",
		label: "Vercel",
		hint: "True black with electric blue.",
		swatchBg: "#000000",
		swatchAccent: "#0070f3"
	},
	{
		id: "light",
		label: "Light",
		hint: "Warm paper for daylight.",
		swatchBg: "#faf7f2",
		swatchAccent: "#b25624"
	}
];
var DEFAULT_THEME = "slate";
var STORAGE_KEY = "produktive-theme";
var META_BG = {
	ember: "#0b0a0c",
	slate: "#0d0d0f",
	"tokyo-night": "#1a1b26",
	midnight: "#07080d",
	vercel: "#000000",
	light: "#faf7f2"
};
var VALID = new Set([
	"ember",
	"slate",
	"tokyo-night",
	"midnight",
	"vercel",
	"light"
]);
function readStoredTheme() {
	if (typeof window === "undefined") return DEFAULT_THEME;
	const raw = window.localStorage.getItem(STORAGE_KEY);
	if (raw && VALID.has(raw)) return raw;
	if (raw === "light") return "light";
	return DEFAULT_THEME;
}
function applyTheme(theme) {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	root.classList.remove("theme-light");
	root.setAttribute("data-theme", theme);
	document.querySelector("meta[name=\"theme-color\"]")?.setAttribute("content", META_BG[theme]);
	if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, theme);
}
//#endregion
export { useIssuesQuery as $, listAiModels as $t, projectStatusOptions as A, updateIssue as An, createIssueComment as At, chatsQueryOptions as B, useMediaQuery as Bn, deleteIssueStatus as Bt, labelColorHex as C, searchGithubRepositories as Cn, acceptInvitation as Ct, projectColorHex as D, subscribeToIssue as Dn, createGithubRepository as Dt, projectColorBackground as E, streamChatMessage as En, createChat as Et, sortedStatuses as F, updateMyPreferences as Fn, createProject as Ft, issueCommentsQueryOptions as G, deleteRole as Gt, projectsQueryOptions as H, deleteMcpApiKey as Ht, statusCategory as I, updateProject as In, createRole as It, issuesQueryOptions as J, getGithubConnection as Jt, issueDetailQueryOptions as K, disconnectGithub as Kt, statusName as L, updateRole as Ln, decideOAuthAuthorization as Lt, formatDate as M, updateLabel as Mn, createLabel as Mt, issueMatchesView as N, updateMcpServer as Nn, createMcpApiKey as Nt, projectColorOptions as O, unsubscribeFromIssue as On, createInvitation as Ot, priorityOptions as P, updateMemberRole as Pn, createMcpServer as Pt, useIssueSubscribersQuery as Q, importGithubRepositoryIssues as Qt, viewLabels as R, uploadChatAttachment as Rn, deleteChat as Rt, defaultLabelColor as S, revokeMcpApiKey as Sn, useSession as St, defaultProjectColor as T, startMcpServerOAuth as Tn, completeDiscordLink as Tt, useProjectDetailQuery as U, deleteMcpServer as Ut, useChatsQuery as V, cn as Vn, deleteLabel as Vt, useProjectsQuery as W, deleteProject as Wt, useIssueDetailQuery as X, getMyPreferences as Xt, useIssueCommentsQuery as Y, getMemberProfile as Yt, useIssueHistoryQuery as Z, grantChatAccess as Zt, defaultDisplayOptions as _, refreshMcpServerTools as _n, switchOrganization as _t, useLabelsQuery as a, listMcpApiKeys as an, queryKeys as at, sortIssues as b, revokeChatAccess as bn, uploadActiveOrganizationIcon as bt, useUpdateIssue as c, listProjects as cn, deleteAccount as ct, formatBytes as d, markAllNotificationsRead as dn, listAccountSessions as dt, listGithubRepositories as en, useUserPreferences as et, formatChatReferences as f, markNotificationRead as fn, listOrganizations as ft, prepareChatAttachments as g, previewOAuthAuthorization as gn, signOut as gt, parseMessageWithAttachments as h, previewGithubRepositoryImport as hn, revokeOtherAccountSessions as ht, useIssueStatuses as i, listLabels as in, useTabs as it, firstStatusForCategory as j, updateIssueStatus as jn, createIssueStatus as jt, projectStatusLabel as k, updateGithubRepository as kn, createIssue as kt, useFavorites as l, listRoles as ln, deleteActiveOrganization as lt, formatToolReferences as m, previewDiscordLink as mn, revokeAccountSession as mt, applyTheme as n, listInvitations as nn, tabsQueryOptions as nt, useCreateIssue as o, listMcpServers as on, authClient as ot, formatIssueReferences as p, markOnboarding as pn, refreshSession as pt, issueHistoryQueryOptions as q, getChat as qt, readStoredTheme as r, listIssues as rn, useRegisterTab as rt, useDeleteIssue as s, listMembers as sn, createOrganization as st, THEMES as t, listInbox as tn, userPreferencesQueryOptions as tt, buildMessageWithAttachments as u, lookupInvitation as un, leaveActiveOrganization as ut, groupIssues as v, removeMember as vn, updateActiveOrganization as vt, labelColorOptions as w, startGithubOAuth as wn, apiPath as wt, useDisplayOptions as x, revokeInvitation as xn, useOrganizations as xt, priorityLabels as y, resendInvitation as yn, uploadAccountIcon as yt, chatAccessQueryOptions as z, uploadIssueAttachment as zn, deleteGithubRepository as zt };

//# sourceMappingURL=initial-BOT0Y-sv.js.map