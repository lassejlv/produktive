import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { a as useQueryClient, r as useQuery, t as useMutation } from "./initial-BUIQ08st.js";
import { v as toast } from "./initial-BjZJRI-E.js";
import { Vn as cn, Zt as grantChatAccess, at as queryKeys, bn as revokeChatAccess, sn as listMembers, z as chatAccessQueryOptions } from "./initial-BOT0Y-sv.js";
import { et as Popover, nt as PopoverTrigger, tt as PopoverContent } from "./initial-BWSisseh.js";
//#region src/components/chat/chat-share.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
function ChatShare({ chatId, trigger, align = "end" }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, {
		open,
		onOpenChange: setOpen,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
			asChild: true,
			children: trigger
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverContent, {
			align,
			sideOffset: 6,
			className: "w-72 overflow-hidden rounded-lg border border-border bg-surface p-0 shadow-xl",
			children: open ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatShareBody, { chatId }) : null
		})]
	});
}
function ChatShareBody({ chatId }) {
	const qc = useQueryClient();
	const [query, setQuery] = (0, import_react.useState)("");
	const accessQuery = useQuery(chatAccessQueryOptions(chatId));
	const membersQuery = useQuery({
		queryKey: queryKeys.members,
		queryFn: () => listMembers().then((r) => r.members),
		staleTime: 6e4
	});
	const accessByUserId = (0, import_react.useMemo)(() => {
		const map = /* @__PURE__ */ new Map();
		for (const entry of accessQuery.data ?? []) map.set(entry.userId, entry);
		return map;
	}, [accessQuery.data]);
	const filteredMembers = (0, import_react.useMemo)(() => {
		const q = query.trim().toLowerCase();
		const all = membersQuery.data ?? [];
		if (!q) return all;
		return all.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
	}, [membersQuery.data, query]);
	const invalidate = () => qc.invalidateQueries({ queryKey: [
		...queryKeys.chats,
		chatId,
		"access"
	] });
	const grantMutation = useMutation({
		mutationFn: (userId) => grantChatAccess(chatId, userId),
		onSuccess: () => {
			invalidate();
		},
		onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to share")
	});
	const revokeMutation = useMutation({
		mutationFn: (userId) => revokeChatAccess(chatId, userId),
		onSuccess: () => {
			invalidate();
		},
		onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to remove access")
	});
	const isLoading = accessQuery.isPending || membersQuery.isPending;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "border-b border-border-subtle px-3 pt-2.5 pb-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[12px] font-medium text-fg",
					children: "Share chat"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-0.5 text-[11.5px] text-fg-muted",
					children: "Grant workspace members access to this conversation."
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				type: "search",
				value: query,
				onChange: (event) => setQuery(event.target.value),
				placeholder: "Search members…",
				className: "h-8 border-b border-border-subtle bg-transparent px-3 text-[12.5px] text-fg outline-none placeholder:text-fg-faint"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "max-h-72 overflow-y-auto",
				children: isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "px-3 py-3 text-[12px] text-fg-faint",
					children: "Loading…"
				}) : filteredMembers.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "px-3 py-3 text-[12px] text-fg-faint",
					children: "No members."
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { children: filteredMembers.map((member) => {
					const access = accessByUserId.get(member.id);
					const hasAccess = Boolean(access);
					const isCreator = access?.isCreator ?? false;
					const pending = grantMutation.isPending && grantMutation.variables === member.id;
					const removing = revokeMutation.isPending && revokeMutation.variables === member.id;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex items-center gap-2 px-3 py-1.5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MemberAvatar, { member }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex min-w-0 flex-1 flex-col",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "truncate text-[12.5px] text-fg",
									children: member.name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "truncate text-[11px] text-fg-faint",
									children: member.email
								})]
							}),
							isCreator ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[11px] text-fg-faint",
								children: "Creator"
							}) : hasAccess ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: removing,
								onClick: () => revokeMutation.mutate(member.id),
								className: cn("h-6 rounded-md border border-border-subtle px-2 text-[11.5px] text-fg-muted transition-colors hover:text-fg", removing && "opacity-50"),
								children: removing ? "Removing…" : "Remove"
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: pending,
								onClick: () => grantMutation.mutate(member.id),
								className: cn("h-6 rounded-md bg-fg px-2 text-[11.5px] font-medium text-bg transition-colors hover:bg-white", pending && "opacity-50"),
								children: pending ? "Adding…" : "Add"
							})
						]
					}, member.id);
				}) })
			})
		]
	});
}
function MemberAvatar({ member }) {
	if (member.image) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
		src: member.image,
		alt: "",
		className: "size-6 shrink-0 rounded-full object-cover"
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "grid size-6 shrink-0 place-items-center rounded-full border border-border-subtle bg-surface-2 text-[10px] font-medium text-fg-muted",
		children: (member.name || member.email).split(/\s+/).map((part) => part.charAt(0)).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"
	});
}
//#endregion
export { ChatShare as t };

//# sourceMappingURL=chat-share-wPNnS4pt.js.map