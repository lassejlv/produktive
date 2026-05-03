import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { g as useNavigate } from "./initial-BUIQ08st.js";
import { v as toast } from "./initial-BjZJRI-E.js";
import { Vn as cn, h as parseMessageWithAttachments, i as useIssueStatuses, l as useFavorites } from "./initial-BOT0Y-sv.js";
import { G as StarIcon, W as SparkleIcon, c as ProjectIcon, d as StatusIcon } from "./initial-BWSisseh.js";
import { c as Route } from "./initial-Cbvcoh8y.js";
import { i as useSidebarLayout, n as applyOrder } from "./use-sidebar-layout-BFvwsaJX.js";
//#region src/routes/_app.favorites.tsx?tsr-split=component
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var typeTabs = [
	{
		value: "all",
		label: "All"
	},
	{
		value: "issue",
		label: "Issues"
	},
	{
		value: "project",
		label: "Projects"
	},
	{
		value: "chat",
		label: "Chats"
	}
];
var typeOrder = [
	"issue",
	"project",
	"chat"
];
var typeLabels = {
	issue: "Issues",
	project: "Projects",
	chat: "Chats"
};
var FAVORITE_DRAG_MIME = "application/x-produktive-favorite-page";
function FavoritesPage() {
	const navigate = useNavigate();
	const search = Route.useSearch();
	const { favorites: rawFavorites, isLoading, toggleFavorite } = useFavorites();
	const { layout, setFavoritesOrder } = useSidebarLayout();
	const { statuses } = useIssueStatuses();
	const ordered = applyOrder(rawFavorites, layout.favoritesOrder, (fav) => fav.favoriteId);
	const [query, setQuery] = (0, import_react.useState)(search.q ?? "");
	const [typeFilter, setTypeFilter] = (0, import_react.useState)(search.type ?? "all");
	const [dragId, setDragId] = (0, import_react.useState)(null);
	const filtered = (0, import_react.useMemo)(() => {
		const q = query.trim().toLowerCase();
		return ordered.filter((fav) => {
			if (typeFilter !== "all" && fav.type !== typeFilter) return false;
			if (!q) return true;
			return fav.title.toLowerCase().includes(q);
		});
	}, [
		ordered,
		typeFilter,
		query
	]);
	const groups = (0, import_react.useMemo)(() => {
		if (typeFilter !== "all") return [{
			type: typeFilter,
			items: filtered
		}];
		const buckets = /* @__PURE__ */ new Map();
		for (const fav of filtered) {
			const list = buckets.get(fav.type) ?? [];
			list.push(fav);
			buckets.set(fav.type, list);
		}
		return typeOrder.filter((type) => buckets.has(type)).map((type) => ({
			type,
			items: buckets.get(type) ?? []
		}));
	}, [filtered, typeFilter]);
	const counts = (0, import_react.useMemo)(() => ({
		all: ordered.length,
		issue: ordered.filter((f) => f.type === "issue").length,
		project: ordered.filter((f) => f.type === "project").length,
		chat: ordered.filter((f) => f.type === "chat").length
	}), [ordered]);
	const moveBefore = (sourceFavoriteId, targetFavoriteId) => {
		if (sourceFavoriteId === targetFavoriteId) return;
		const currentOrder = ordered.map((fav) => fav.favoriteId);
		const sourceIdx = currentOrder.indexOf(sourceFavoriteId);
		const targetIdx = currentOrder.indexOf(targetFavoriteId);
		if (sourceIdx < 0 || targetIdx < 0) return;
		const next = currentOrder.filter((id) => id !== sourceFavoriteId);
		const insertAt = next.indexOf(targetFavoriteId);
		next.splice(insertAt, 0, sourceFavoriteId);
		setFavoritesOrder(next);
	};
	const goTo = (fav) => {
		if (fav.type === "chat") return navigate({
			to: "/chat/$chatId",
			params: { chatId: fav.id }
		});
		if (fav.type === "project") return navigate({
			to: "/projects/$projectId",
			params: { projectId: fav.id }
		});
		return navigate({
			to: "/issues/$issueId",
			params: { issueId: fav.id }
		});
	};
	const handleUnpin = async (fav) => {
		try {
			await toggleFavorite(fav.type, fav.id);
			toast.success("Removed from favorites");
		} catch {
			toast.error("Failed to update favorite");
		}
	};
	const updateSearch = (next) => {
		navigate({
			to: "/favorites",
			search: (prev) => ({
				...prev,
				...next
			}),
			replace: true
		});
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "min-h-full bg-bg",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
				className: "border-b border-border-subtle px-8 pb-6 pt-10",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mx-auto flex w-full max-w-[920px] items-end justify-between gap-6",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-mono text-[10.5px] uppercase tracking-[0.18em] text-fg-faint",
							children: "Pinned items"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", {
							className: "mt-1.5 flex items-center gap-2 text-[26px] font-medium leading-none tracking-[-0.02em] text-fg",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-warning",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StarIcon, {
									size: 18,
									filled: true
								})
							}), "Favorites"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1.5 text-[12.5px] text-fg-muted",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "tabular-nums text-fg",
									children: counts.all
								}),
								" ",
								counts.all === 1 ? "item" : "items",
								" pinned",
								ordered.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [" · ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-fg-faint",
									children: "drag to reorder"
								})] }) : null
							]
						})
					] })
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
							placeholder: "Search favorites…",
							value: query,
							onChange: (event) => {
								const next = event.target.value;
								setQuery(next);
								updateSearch({ q: next.trim() ? next.trim() : void 0 });
							},
							className: "h-8 w-full bg-transparent pl-7 pr-2 text-[13px] text-fg outline-none placeholder:text-fg-faint"
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex items-center gap-0.5 rounded-md border border-border-subtle p-0.5",
						children: typeTabs.map((tab) => {
							const isActive = typeFilter === tab.value;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => {
									setTypeFilter(tab.value);
									updateSearch({ type: tab.value === "all" ? void 0 : tab.value });
								},
								className: cn("inline-flex h-6 items-center gap-1.5 rounded-[4px] px-2 text-[11.5px] transition-colors", isActive ? "bg-surface text-fg" : "text-fg-muted hover:text-fg"),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: tab.label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: cn("tabular-nums text-[10.5px]", isActive ? "text-fg-muted" : "text-fg-faint"),
									children: counts[tab.value]
								})]
							}, tab.value);
						})
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mx-auto w-full max-w-[920px] px-8 pb-24 pt-2",
				children: [isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "px-2 py-8 text-[13px] text-fg-faint",
					children: "Loading…"
				}) : ordered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FavoritesEmptyState, {}) : filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "px-2 py-12 text-center",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[13px] text-fg",
						children: "No favorites match this filter."
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => {
							setQuery("");
							setTypeFilter("all");
							updateSearch({
								q: void 0,
								type: void 0
							});
						},
						className: "mt-2 text-[12px] text-fg-muted transition-colors hover:text-fg",
						children: "Clear filters"
					})]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex flex-col",
					children: groups.map((group, gIdx) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: cn(gIdx > 0 && "mt-8"),
						children: [typeFilter === "all" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-2 flex items-baseline gap-2 px-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-faint",
								children: typeLabels[group.type]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[10.5px] tabular-nums text-fg-faint",
								children: group.items.length
							})]
						}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { children: group.items.map((fav, idx) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							draggable: true,
							onDragStart: (event) => {
								event.dataTransfer.setData(FAVORITE_DRAG_MIME, fav.favoriteId);
								event.dataTransfer.effectAllowed = "move";
								setDragId(fav.favoriteId);
							},
							onDragEnd: () => setDragId(null),
							onDragOver: (event) => {
								if (!event.dataTransfer.types.includes(FAVORITE_DRAG_MIME)) return;
								event.preventDefault();
								event.dataTransfer.dropEffect = "move";
							},
							onDrop: (event) => {
								const sourceId = event.dataTransfer.getData(FAVORITE_DRAG_MIME);
								if (!sourceId) return;
								event.preventDefault();
								moveBefore(sourceId, fav.favoriteId);
							},
							className: cn("group flex items-center gap-3 border-b border-border-subtle/60 px-2 py-3 transition-colors hover:bg-surface/50 last:border-b-0", idx === 0 && "border-t border-border-subtle/60", dragId === fav.favoriteId && "opacity-50"),
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "cursor-grab text-fg-faint opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing",
									"aria-hidden": true,
									title: "Drag to reorder",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DragHandleIcon, {})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: () => void goTo(fav),
									className: "flex min-w-0 flex-1 items-center gap-3 text-left",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "shrink-0 text-fg-faint",
											children: fav.type === "issue" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusIcon, {
												status: fav.status,
												statuses
											}) : fav.type === "project" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectIcon, {
												color: fav.color,
												icon: fav.icon,
												name: fav.title,
												size: "sm"
											}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SparkleIcon, { size: 11 })
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "min-w-0 flex-1 truncate text-[14px] text-fg",
											children: displayFavoriteTitle(fav.title)
										}),
										typeFilter === "all" ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-faint",
											children: fav.type
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => void handleUnpin(fav),
									"aria-label": `Unpin ${displayFavoriteTitle(fav.title)}`,
									className: "grid size-7 shrink-0 place-items-center rounded-md text-warning opacity-0 transition-colors hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent group-hover:opacity-100",
									title: "Unpin",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StarIcon, {
										size: 11,
										filled: true
									})
								})
							]
						}, fav.favoriteId)) })]
					}, group.type))
				}), ordered.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", {
					className: "mt-12 flex items-center justify-center gap-3 border-t border-border-subtle/50 pt-4 text-[11px] text-fg-faint",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "inline-flex items-center gap-1.5",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Kbd, { children: "⌘" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Kbd, { children: "K" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-fg-muted",
									children: "Search anything"
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-fg-faint/40",
							children: "·"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "inline-flex items-center gap-1.5",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-fg-muted",
									children: "Pin from any item's"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "inline-flex size-3.5 items-center justify-center rounded-[3px] border border-border-subtle text-warning",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StarIcon, {
										size: 9,
										filled: true
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-fg-muted",
									children: "menu"
								})
							]
						})
					]
				}) : null]
			})
		]
	});
}
function FavoritesEmptyState() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col items-center px-6 py-24 text-center",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mb-5 grid size-12 place-items-center rounded-[10px] border border-border-subtle bg-surface/40 text-warning",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StarIcon, {
					size: 18,
					filled: true
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-[16px] font-medium tracking-[-0.01em] text-fg",
				children: "Nothing pinned yet"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1.5 max-w-[400px] text-[13px] leading-relaxed text-fg-muted",
				children: "Pin issues, projects, or chats — they'll show up here and at the top of the sidebar so you can jump back fast."
			})
		]
	});
}
function DragHandleIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: "11",
		height: "11",
		viewBox: "0 0 12 12",
		fill: "none",
		"aria-hidden": true,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "4",
				cy: "3",
				r: "0.9",
				fill: "currentColor"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "8",
				cy: "3",
				r: "0.9",
				fill: "currentColor"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "4",
				cy: "6",
				r: "0.9",
				fill: "currentColor"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "8",
				cy: "6",
				r: "0.9",
				fill: "currentColor"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "4",
				cy: "9",
				r: "0.9",
				fill: "currentColor"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "8",
				cy: "9",
				r: "0.9",
				fill: "currentColor"
			})
		]
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
function Kbd({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", {
		className: "grid h-4 min-w-4 place-items-center rounded-[3px] border border-border-subtle bg-surface px-1 font-mono text-[10px] text-fg-muted",
		children
	});
}
function displayFavoriteTitle(title) {
	return parseMessageWithAttachments(title).text.trim() || "Untitled";
}
//#endregion
export { FavoritesPage as component };

//# sourceMappingURL=_app.favorites-D1dHr0ZP.js.map