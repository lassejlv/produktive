import { a as useQueryClient, t as useMutation } from "./initial-BUIQ08st.js";
import { Fn as updateMyPreferences, et as useUserPreferences } from "./initial-BOT0Y-sv.js";
//#region src/lib/use-sidebar-layout.ts
var SIDEBAR_ITEM_IDS = [
	"inbox",
	"my-issues",
	"overview",
	"issues",
	"projects",
	"labels"
];
var CHATS_LIMIT_OPTIONS = [
	3,
	5,
	8,
	12,
	20,
	50
];
var KNOWN_IDS = new Set(SIDEBAR_ITEM_IDS);
var defaultSidebarItems = SIDEBAR_ITEM_IDS.map((id) => ({ id }));
var defaultSidebarLayout = {
	items: defaultSidebarItems,
	favoritesCollapsed: false,
	chatsCollapsed: false,
	favoritesOrder: [],
	chatsLimit: 8,
	chatsSort: "recent"
};
function normalizeItems(raw) {
	if (!Array.isArray(raw) || raw.length === 0) return defaultSidebarItems;
	const seen = /* @__PURE__ */ new Set();
	const ordered = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== "object") continue;
		const id = entry.id;
		if (typeof id !== "string" || !KNOWN_IDS.has(id) || seen.has(id)) continue;
		seen.add(id);
		const hidden = entry.hidden === true;
		ordered.push({
			id,
			...hidden ? { hidden: true } : {}
		});
	}
	for (const id of SIDEBAR_ITEM_IDS) if (!seen.has(id)) ordered.push({ id });
	return ordered;
}
function normalizeStringArray(raw) {
	if (!Array.isArray(raw)) return [];
	const out = [];
	const seen = /* @__PURE__ */ new Set();
	for (const value of raw) {
		if (typeof value !== "string" || seen.has(value)) continue;
		seen.add(value);
		out.push(value);
	}
	return out;
}
function normalizeLayout(raw) {
	if (Array.isArray(raw)) return {
		...defaultSidebarLayout,
		items: normalizeItems(raw)
	};
	if (!raw || typeof raw !== "object") return defaultSidebarLayout;
	const obj = raw;
	const rawLimit = obj.chatsLimit;
	const limit = typeof rawLimit === "number" && Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.round(rawLimit))) : defaultSidebarLayout.chatsLimit;
	const sort = obj.chatsSort === "alphabetical" ? "alphabetical" : "recent";
	return {
		items: normalizeItems(obj.items),
		favoritesCollapsed: obj.favoritesCollapsed === true,
		chatsCollapsed: obj.chatsCollapsed === true,
		favoritesOrder: normalizeStringArray(obj.favoritesOrder),
		chatsLimit: limit,
		chatsSort: sort
	};
}
function applyOrder(items, savedOrder, getId) {
	if (savedOrder.length === 0) return items;
	const indexById = /* @__PURE__ */ new Map();
	savedOrder.forEach((id, index) => indexById.set(id, index));
	const known = [];
	const unknown = [];
	for (const item of items) if (indexById.has(getId(item))) known.push(item);
	else unknown.push(item);
	known.sort((a, b) => (indexById.get(getId(a)) ?? 0) - (indexById.get(getId(b)) ?? 0));
	return [...known, ...unknown];
}
function useSidebarLayout() {
	const qc = useQueryClient();
	const { prefs } = useUserPreferences();
	const layout = normalizeLayout(prefs?.sidebarLayout);
	const mutation = useMutation({
		mutationFn: (next) => updateMyPreferences({ sidebarLayout: next }),
		onSuccess: (data) => {
			qc.setQueryData(["user-preferences"], data);
		}
	});
	const update = (patch) => {
		mutation.mutate({
			...layout,
			...patch
		});
	};
	return {
		layout,
		update,
		saveItems: (items) => update({ items }),
		toggleFavoritesCollapsed: () => update({ favoritesCollapsed: !layout.favoritesCollapsed }),
		toggleChatsCollapsed: () => update({ chatsCollapsed: !layout.chatsCollapsed }),
		setFavoritesOrder: (favoritesOrder) => update({ favoritesOrder }),
		setChatsLimit: (chatsLimit) => update({ chatsLimit }),
		setChatsSort: (chatsSort) => update({ chatsSort }),
		reset: () => mutation.mutate(null),
		isSaving: mutation.isPending
	};
}
//#endregion
export { useSidebarLayout as i, applyOrder as n, defaultSidebarItems as r, CHATS_LIMIT_OPTIONS as t };

//# sourceMappingURL=use-sidebar-layout-BFvwsaJX.js.map