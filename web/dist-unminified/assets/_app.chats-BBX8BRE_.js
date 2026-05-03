import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { g as useNavigate } from "./initial-BUIQ08st.js";
import { v as toast } from "./initial-BjZJRI-E.js";
import { Rt as deleteChat, St as useSession, Vn as cn, h as parseMessageWithAttachments, l as useFavorites, qt as getChat } from "./initial-BOT0Y-sv.js";
import { G as StarIcon, M as DotsIcon, W as SparkleIcon, et as Popover, nt as PopoverTrigger, tt as PopoverContent, v as useConfirmDialog } from "./initial-BWSisseh.js";
import { s as Route } from "./initial-Cbvcoh8y.js";
import { t as useChats } from "./use-chats-CAdksDfN.js";
import { t as ChatShare } from "./chat-share-wPNnS4pt.js";
//#region src/routes/_app.chats.tsx?tsr-split=component
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var sortOptions = [
	{
		value: "recent",
		label: "Recent"
	},
	{
		value: "oldest",
		label: "Oldest"
	},
	{
		value: "alphabetical",
		label: "A–Z"
	}
];
var bucketOrder = [
	"pinned",
	"today",
	"yesterday",
	"this-week",
	"this-month",
	"older"
];
var bucketLabels = {
	pinned: "Pinned",
	today: "Today",
	yesterday: "Yesterday",
	"this-week": "Earlier this week",
	"this-month": "Earlier this month",
	older: "Older"
};
function ChatsPage() {
	const navigate = useNavigate();
	const search = Route.useSearch();
	const { chats, isLoading, removeChat } = useChats();
	const { isFavorite, toggleFavorite } = useFavorites();
	const { confirm, dialog } = useConfirmDialog();
	const currentUserId = useSession().data?.user.id ?? null;
	const [sort, setSort] = (0, import_react.useState)("recent");
	const [query, setQuery] = (0, import_react.useState)(search.q ?? "");
	const filtered = (0, import_react.useMemo)(() => {
		const q = query.trim().toLowerCase();
		return q ? chats.filter((chat) => (chat.title || "").toLowerCase().includes(q)) : chats;
	}, [chats, query]);
	const groups = (0, import_react.useMemo)(() => {
		if (sort === "alphabetical") return [{
			bucket: "all",
			chats: [...filtered].sort((a, b) => (a.title || "").localeCompare(b.title || "", void 0, { sensitivity: "base" }))
		}];
		if (sort === "oldest") return [{
			bucket: "all",
			chats: [...filtered].sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
		}];
		const buckets = /* @__PURE__ */ new Map();
		for (const chat of filtered) {
			const bucket = isFavorite("chat", chat.id) ? "pinned" : dateBucket(chat.updatedAt);
			const list = buckets.get(bucket) ?? [];
			list.push(chat);
			buckets.set(bucket, list);
		}
		for (const list of buckets.values()) list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
		return bucketOrder.filter((bucket) => buckets.has(bucket)).map((bucket) => ({
			bucket,
			chats: buckets.get(bucket) ?? []
		}));
	}, [
		filtered,
		sort,
		isFavorite
	]);
	const handleDelete = (chat) => {
		confirm({
			title: "Delete this chat?",
			description: "Messages and attachments will be removed.",
			confirmLabel: "Delete chat",
			destructive: true,
			onConfirm: async () => {
				try {
					await deleteChat(chat.id);
					removeChat(chat.id);
					toast.success("Chat deleted");
				} catch (error) {
					toast.error(error instanceof Error ? error.message : "Failed to delete chat");
				}
			}
		});
	};
	const handlePin = async (chat) => {
		const wasFavorite = isFavorite("chat", chat.id);
		try {
			await toggleFavorite("chat", chat.id);
			toast.success(wasFavorite ? "Removed from favorites" : "Pinned to sidebar");
		} catch {
			toast.error("Failed to update favorite");
		}
	};
	const handleCopy = async (chat) => {
		const url = new URL(`/chat/${chat.id}`, window.location.origin);
		try {
			await navigator.clipboard.writeText(url.toString());
			toast.success("Chat link copied");
		} catch {
			toast.error("Failed to copy link");
		}
	};
	const handleExport = async (chat) => {
		try {
			const data = await getChat(chat.id);
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `${safeFilename(displayChatTitle(chat))}-${chat.id}.json`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
			toast.success("Chat exported");
		} catch {
			toast.error("Failed to export chat");
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "min-h-full bg-bg",
		children: [
			dialog,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
				className: "border-b border-border-subtle px-8 pb-6 pt-10",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto flex w-full max-w-[920px] items-end justify-between gap-6",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-mono text-[10.5px] uppercase tracking-[0.18em] text-fg-faint",
							children: "Conversations"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "mt-1.5 text-[26px] font-medium leading-none tracking-[-0.02em] text-fg",
							children: "Chats"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1.5 text-[12.5px] text-fg-muted",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "tabular-nums text-fg",
									children: chats.length
								}),
								" ",
								chats.length === 1 ? "conversation" : "conversations"
							]
						})
					] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => void navigate({ to: "/chat" }),
						className: "inline-flex h-8 items-center gap-1.5 rounded-md bg-fg px-3 text-[12.5px] font-medium text-bg transition-colors hover:bg-white",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlusIcon, {}), "New chat"]
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "sticky top-0 z-10 border-b border-border-subtle bg-bg/85 backdrop-blur",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto flex w-full max-w-[920px] items-center gap-3 px-8 py-2.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "relative flex min-w-0 flex-1 items-center",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "pointer-events-none absolute left-2 text-fg-faint",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchIcon, {})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "search",
							placeholder: "Search conversations…",
							value: query,
							onChange: (event) => {
								const next = event.target.value;
								setQuery(next);
								navigate({
									to: "/chats",
									search: next.trim() ? { q: next.trim() } : {},
									replace: true
								});
							},
							className: "h-8 w-full bg-transparent pl-7 pr-2 text-[13px] text-fg outline-none placeholder:text-fg-faint"
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex items-center gap-0.5 rounded-md border border-border-subtle p-0.5",
						children: sortOptions.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setSort(option.value),
							className: cn("inline-flex h-6 items-center rounded-[4px] px-2 text-[11.5px] transition-colors", sort === option.value ? "bg-surface text-fg" : "text-fg-muted hover:text-fg"),
							children: option.label
						}, option.value))
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mx-auto w-full max-w-[920px] px-8 pb-24 pt-2",
				children: [isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "px-2 py-8 text-[13px] text-fg-faint",
					children: "Loading…"
				}) : chats.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatsEmptyState, { onNewChat: () => void navigate({ to: "/chat" }) }) : filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "px-2 py-12 text-center",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-[13px] text-fg",
						children: [
							"No matches for \"",
							query,
							"\"."
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => {
							setQuery("");
							navigate({
								to: "/chats",
								search: {},
								replace: true
							});
						},
						className: "mt-2 text-[12px] text-fg-muted transition-colors hover:text-fg",
						children: "Clear search"
					})]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex flex-col",
					children: groups.map((group, gIdx) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: cn(gIdx > 0 && "mt-8"),
						children: [group.bucket !== "all" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-2 flex items-baseline gap-2 px-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-faint",
								children: bucketLabels[group.bucket]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[10.5px] tabular-nums text-fg-faint",
								children: group.chats.length
							})]
						}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { children: group.chats.map((chat, idx) => {
							const pinned = isFavorite("chat", chat.id);
							const isCreator = currentUserId !== null && chat.createdById === currentUserId;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: cn("group flex items-center gap-4 rounded-md border-b border-border-subtle/60 px-2 py-3 transition-colors hover:bg-surface/50 last:border-b-0", idx === 0 && "border-t border-border-subtle/60"),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: () => void navigate({
										to: "/chat/$chatId",
										params: { chatId: chat.id }
									}),
									className: "flex min-w-0 flex-1 items-center gap-3 text-left",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: cn("shrink-0", pinned ? "text-warning" : "text-fg-faint"),
											children: pinned ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StarIcon, {
												size: 11,
												filled: true
											}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SparkleIcon, { size: 11 })
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "min-w-0 flex-1 truncate text-[14px] text-fg",
											children: displayChatTitle(chat)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "shrink-0 font-mono text-[11px] tabular-nums text-fg-faint",
											title: new Date(chat.updatedAt).toLocaleString(),
											children: formatRelative(chat.updatedAt)
										})
									]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RowMenu, {
									chatId: chat.id,
									pinned,
									isCreator,
									onPin: () => void handlePin(chat),
									onExport: () => void handleExport(chat),
									onCopy: () => void handleCopy(chat),
									onDelete: () => handleDelete(chat)
								})]
							}, chat.id);
						}) })]
					}, group.bucket))
				}), chats.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", {
					className: "mt-12 flex items-center justify-center gap-3 border-t border-border-subtle/50 pt-4 text-[11px] text-fg-faint",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Hint, {
							label: "Search",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Kbd, { children: "⌘" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Kbd, { children: "K" })]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-fg-faint/40",
							children: "·"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Hint, {
							label: "New chat",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Kbd, { children: "C" })
						})
					]
				}) : null]
			})
		]
	});
}
function RowMenu({ chatId, pinned, isCreator, onPin, onExport, onCopy, onDelete }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-center gap-1",
		children: [isCreator ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatShare, {
			chatId,
			trigger: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				"aria-label": "Share",
				className: "h-7 shrink-0 rounded-md px-2 text-[11.5px] text-fg-faint opacity-0 transition-colors hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 group-hover:opacity-100",
				children: "Share"
			})
		}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, {
			open,
			onOpenChange: setOpen,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
				asChild: true,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					"aria-label": "Actions",
					className: cn("grid size-7 shrink-0 place-items-center rounded-md text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent", open ? "bg-surface-2 text-fg opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DotsIcon, { size: 13 })
				})
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PopoverContent, {
				align: "end",
				sideOffset: 4,
				className: "w-40 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuItem, {
						onClick: () => closeAnd(setOpen, onPin),
						children: pinned ? "Unpin" : "Pin to sidebar"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuItem, {
						onClick: () => closeAnd(setOpen, onExport),
						children: "Export JSON"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuItem, {
						onClick: () => closeAnd(setOpen, onCopy),
						children: "Copy link"
					}),
					isCreator ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "my-1 h-px bg-border-subtle" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuItem, {
						danger: true,
						onClick: () => closeAnd(setOpen, onDelete),
						children: "Delete"
					})] }) : null
				]
			})]
		})]
	});
}
function MenuItem({ children, onClick, danger }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		className: cn("flex h-8 w-full items-center px-2.5 text-left text-[12.5px] transition-colors hover:bg-surface-2", danger ? "text-danger" : "text-fg"),
		onClick,
		children
	});
}
function closeAnd(setOpen, fn) {
	setOpen(false);
	fn();
}
function ChatsEmptyState({ onNewChat }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col items-center px-6 py-24 text-center",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mb-5 grid size-12 place-items-center rounded-[10px] border border-border-subtle bg-surface/40 text-fg-muted",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SparkleIcon, { size: 18 })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-[16px] font-medium tracking-[-0.01em] text-fg",
				children: "No chats yet"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1.5 max-w-[360px] text-[13px] leading-relaxed text-fg-muted",
				children: "Ask Produktive to triage issues, draft a spec, or summarize what's in progress."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				onClick: onNewChat,
				className: "mt-5 inline-flex h-8 items-center gap-1.5 rounded-md bg-fg px-3 text-[12.5px] font-medium text-bg transition-colors hover:bg-white",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlusIcon, {}), "Start a chat"]
			})
		]
	});
}
function Hint({ label, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "inline-flex items-center gap-1.5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "flex items-center gap-0.5",
			children
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-fg-muted",
			children: label
		})]
	});
}
function Kbd({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", {
		className: "grid h-4 min-w-4 place-items-center rounded-[3px] border border-border-subtle bg-surface px-1 font-mono text-[10px] text-fg-muted",
		children
	});
}
function PlusIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		width: "11",
		height: "11",
		viewBox: "0 0 12 12",
		fill: "none",
		"aria-hidden": true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M6 2.5v7M2.5 6h7",
			stroke: "currentColor",
			strokeWidth: "1.5",
			strokeLinecap: "round"
		})
	});
}
function SearchIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: "13",
		height: "13",
		viewBox: "0 0 14 14",
		fill: "none",
		"aria-hidden": true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx: "6",
			cy: "6",
			r: "3.5",
			stroke: "currentColor",
			strokeWidth: "1.4"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M11 11l-2.4-2.4",
			stroke: "currentColor",
			strokeWidth: "1.4",
			strokeLinecap: "round"
		})]
	});
}
function displayChatTitle(chat) {
	return parseMessageWithAttachments(chat.title).text.trim() || "Attached files";
}
function safeFilename(value) {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "chat";
}
function startOfDay(date) {
	const out = new Date(date);
	out.setHours(0, 0, 0, 0);
	return out;
}
function dateBucket(updatedAt) {
	const now = /* @__PURE__ */ new Date();
	const then = new Date(updatedAt);
	const todayStart = startOfDay(now);
	const thenStart = startOfDay(then);
	const dayDiff = Math.round((todayStart.getTime() - thenStart.getTime()) / (1e3 * 60 * 60 * 24));
	if (dayDiff <= 0) return "today";
	if (dayDiff === 1) return "yesterday";
	if (dayDiff < 7) return "this-week";
	if (dayDiff < 30) return "this-month";
	return "older";
}
function formatRelative(value) {
	const then = new Date(value).getTime();
	const diffMs = Date.now() - then;
	const minutes = Math.floor(diffMs / 6e4);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d`;
	return new Date(value).toLocaleDateString(void 0, {
		month: "short",
		day: "numeric"
	});
}
//#endregion
export { ChatsPage as component };

//# sourceMappingURL=_app.chats-BBX8BRE_.js.map