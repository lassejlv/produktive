const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/chat-widget-BwJp7TJH.js","assets/rolldown-runtime-B_qr_iJn.js","assets/initial-BUIQ08st.js","assets/initial-DwS9pZ8K.js","assets/initial-BoalMNbc.js","assets/initial-DqBeajiO.js","assets/initial-CMb3YuhF.js","assets/initial-C0EVeHlk.js","assets/initial-B5hxL7EP.js","assets/initial-BdtMOVmo.js","assets/initial-I0bxgxwz.js","assets/initial-BjZJRI-E.js","assets/initial-BQUddyIu.js","assets/initial-D1YyMmpo.js","assets/initial-BO0AADDh.js","assets/initial-Cw7QFI8O.js","assets/initial-CSIB8P1o.js","assets/chat-history-DlK4S5DV.js","assets/initial-BWSisseh.js","assets/initial-DLWOBo7o.js","assets/initial-DdNWnGNg.js","assets/initial-D7ykuetp.js","assets/initial-Dyi5_3zG.js","assets/initial-Ch8rDTLW.js","assets/initial-BOT0Y-sv.js","assets/mcp-Dq1M87f2.js","assets/use-chats-CAdksDfN.js","assets/use-issues-BFKzL-a-.js"])))=>i.map(i=>d[i]);
import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { t as __vitePreload } from "./initial-DK83QUcz.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { c as useRouterState, d as Outlet, g as useNavigate } from "./initial-BUIQ08st.js";
import { v as toast } from "./initial-BjZJRI-E.js";
import { An as updateIssue, Rt as deleteChat, St as useSession, Vn as cn, W as useProjectsQuery, _t as switchOrganization, cn as listProjects, et as useUserPreferences, gt as signOut, h as parseMessageWithAttachments, i as useIssueStatuses, it as useTabs, l as useFavorites, n as applyTheme, pt as refreshSession, qt as getChat, rn as listIssues, rt as useRegisterTab, st as createOrganization, xt as useOrganizations } from "./initial-BOT0Y-sv.js";
import { $ as useOnboarding, A as CheckIcon, B as ProjectsIcon, C as DialogHeader, F as HashIcon, G as StarIcon, I as InboxIcon, L as IssuesIcon, M as DotsIcon, O as CaretIcon, S as DialogFooter, U as SettingsIcon, W as SparkleIcon, X as Button, b as DialogClose, c as ProjectIcon, d as StatusIcon, m as LoadingTip, w as DialogTitle, x as DialogContent, y as Dialog, z as PlusIcon$1 } from "./initial-BWSisseh.js";
import { t as useChats } from "./use-chats-CAdksDfN.js";
import { t as Input } from "./input-DAlWfusE.js";
import { i as useSidebarLayout, n as applyOrder, r as defaultSidebarItems, t as CHATS_LIMIT_OPTIONS } from "./use-sidebar-layout-BFvwsaJX.js";
import { t as useInbox } from "./use-inbox-Dl6a-9M-.js";
import { t as ISSUE_DRAG_MIME } from "./issue-list-Dpbqy9qW.js";
import { t as useProjects } from "./use-projects-DXOYwJpR.js";
import { t as NewLabelDialog } from "./new-label-dialog-DufeO9MX.js";
import { t as NewProjectDialog } from "./new-project-dialog-B3sWUiRu.js";
//#region src/components/command-palette.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
function CommandPalette() {
	const navigate = useNavigate();
	const [open, setOpen] = (0, import_react.useState)(false);
	const [query, setQuery] = (0, import_react.useState)("");
	const [issues, setIssues] = (0, import_react.useState)([]);
	const [projects, setProjects] = (0, import_react.useState)([]);
	const [activeIndex, setActiveIndex] = (0, import_react.useState)(0);
	const inputRef = (0, import_react.useRef)(null);
	const listRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		const handler = (event) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				setOpen((v) => !v);
			} else if (event.key === "Escape" && open) {
				event.preventDefault();
				setOpen(false);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [open]);
	(0, import_react.useEffect)(() => {
		const handler = () => setOpen(true);
		window.addEventListener("produktive:open-cmdk", handler);
		return () => window.removeEventListener("produktive:open-cmdk", handler);
	}, []);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		setQuery("");
		setActiveIndex(0);
		requestAnimationFrame(() => inputRef.current?.focus());
		Promise.all([listIssues(), listProjects(false)]).then(([issuesResponse, projectsResponse]) => {
			setIssues(issuesResponse.issues);
			setProjects(projectsResponse.projects);
		}).catch(() => {});
	}, [open]);
	const results = (0, import_react.useMemo)(() => {
		const q = query.trim().toLowerCase();
		const issueResults = issues.filter((issue) => {
			if (!q) return true;
			const id = `p-${issue.id.slice(0, 4)}`.toLowerCase();
			return issue.title.toLowerCase().includes(q) || id.includes(q);
		}).slice(0, 6).map((issue) => ({
			type: "issue",
			id: issue.id,
			title: issue.title,
			statusKey: issue.status
		}));
		const projectResults = projects.filter((project) => {
			if (!q) return true;
			return project.name.toLowerCase().includes(q);
		}).slice(0, 6).map((project) => ({
			type: "project",
			id: project.id,
			title: project.name,
			color: project.color,
			icon: project.icon,
			issueCount: project.issueCount,
			doneCount: project.doneCount
		}));
		const actions = [
			{
				type: "action",
				key: "go-projects",
				label: "Go to Projects",
				run: () => navigate({ to: "/projects" })
			},
			{
				type: "action",
				key: "new-project",
				label: "New project",
				run: () => {
					window.dispatchEvent(new CustomEvent("produktive:new-project"));
				}
			},
			{
				type: "action",
				key: "go-overview",
				label: "Go to Overview",
				hint: "G O",
				run: () => navigate({ to: "/workspace" })
			},
			{
				type: "action",
				key: "go-issues",
				label: "Go to Issues",
				hint: "G I",
				run: () => navigate({ to: "/issues" })
			},
			{
				type: "action",
				key: "go-chat",
				label: "Go to Chat",
				hint: "G C",
				run: () => navigate({ to: "/chat" })
			},
			{
				type: "action",
				key: "go-account",
				label: "Account settings",
				run: () => navigate({ to: "/account" })
			},
			{
				type: "action",
				key: "go-workspace-settings",
				label: "Settings",
				run: () => navigate({ to: "/workspace/settings" })
			},
			{
				type: "action",
				key: "theme-ember",
				label: "Theme: Ember (warm dark)",
				run: () => {
					applyTheme("ember");
					toast.success("Ember theme applied");
				}
			},
			{
				type: "action",
				key: "theme-slate",
				label: "Theme: Slate (cool dark)",
				run: () => {
					applyTheme("slate");
					toast.success("Slate theme applied");
				}
			},
			{
				type: "action",
				key: "theme-tokyo-night",
				label: "Theme: Tokyo Night",
				run: () => {
					applyTheme("tokyo-night");
					toast.success("Tokyo Night theme applied");
				}
			},
			{
				type: "action",
				key: "theme-midnight",
				label: "Theme: Midnight (cobalt dark)",
				run: () => {
					applyTheme("midnight");
					toast.success("Midnight theme applied");
				}
			},
			{
				type: "action",
				key: "theme-vercel",
				label: "Theme: Vercel",
				run: () => {
					applyTheme("vercel");
					toast.success("Vercel theme applied");
				}
			},
			{
				type: "action",
				key: "theme-light",
				label: "Theme: Light",
				run: () => {
					applyTheme("light");
					toast.success("Light theme applied");
				}
			},
			{
				type: "action",
				key: "new-issue",
				label: "New issue",
				hint: "C",
				run: () => navigate({
					to: "/issues",
					search: { new: true }
				})
			},
			{
				type: "action",
				key: "sign-out",
				label: "Sign out",
				run: async () => {
					await signOut();
					await navigate({ to: "/login" });
				}
			}
		].filter((action) => {
			if (!q) return true;
			return action.label.toLowerCase().includes(q);
		});
		return [
			...projectResults,
			...issueResults,
			...actions
		];
	}, [
		query,
		issues,
		projects,
		navigate
	]);
	(0, import_react.useEffect)(() => {
		if (activeIndex >= results.length) setActiveIndex(Math.max(0, results.length - 1));
	}, [activeIndex, results.length]);
	const runResult = async (result) => {
		setOpen(false);
		if (result.type === "issue") await navigate({
			to: "/issues/$issueId",
			params: { issueId: result.id }
		});
		else if (result.type === "project") await navigate({
			to: "/projects/$projectId",
			params: { projectId: result.id }
		});
		else try {
			await result.run();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed");
		}
	};
	const handleKeyDown = (event) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setActiveIndex((i) => Math.min(results.length - 1, i + 1));
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setActiveIndex((i) => Math.max(0, i - 1));
		} else if (event.key === "Enter") {
			event.preventDefault();
			const result = results[activeIndex];
			if (result) runResult(result);
		}
	};
	(0, import_react.useEffect)(() => {
		if (!listRef.current) return;
		listRef.current.querySelector(`[data-result-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
	}, [activeIndex]);
	if (!open) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-[60] flex items-start justify-center bg-bg/60 px-4 pt-[15vh] backdrop-blur-sm",
		onClick: () => setOpen(false),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			role: "dialog",
			"aria-modal": "true",
			onKeyDown: handleKeyDown,
			onClick: (event) => event.stopPropagation(),
			className: "w-full max-w-[560px] overflow-hidden rounded-xl border border-border bg-bg shadow-[0_24px_60px_rgba(0,0,0,0.6)] animate-fade-up",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2 border-b border-border-subtle px-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchIcon, {}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						ref: inputRef,
						value: query,
						onChange: (event) => {
							setQuery(event.target.value);
							setActiveIndex(0);
						},
						placeholder: "Type a command or search issues…",
						className: "h-12 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-faint"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", {
						className: "rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-fg-faint",
						children: "Esc"
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				ref: listRef,
				className: "max-h-[50vh] overflow-y-auto py-1.5",
				children: results.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "px-4 py-6 text-center text-[12px] text-fg-faint",
					children: "No results."
				}) : results.map((result, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					"data-result-index": index,
					onMouseEnter: () => setActiveIndex(index),
					onClick: () => void runResult(result),
					className: cn("flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] transition-colors", index === activeIndex ? "bg-surface text-fg" : "text-fg-muted hover:bg-surface/60 hover:text-fg"),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "grid size-5 shrink-0 place-items-center text-fg-faint",
							children: result.type === "issue" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IssueGlyph, {}) : result.type === "project" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectIcon, {
								color: result.color,
								icon: result.icon,
								name: result.title,
								size: "sm"
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActionGlyph, {})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "min-w-0 flex-1 truncate",
							children: result.type === "issue" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "font-mono text-[11px] text-fg-faint",
									children: ["P-", result.id.slice(0, 4).toUpperCase()]
								}),
								" ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: result.title })
							] }) : result.type === "project" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: result.title }), result.issueCount > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "ml-2 text-[11px] tabular-nums text-fg-faint",
								children: [
									result.doneCount,
									"/",
									result.issueCount
								]
							}) : null] }) : result.label
						}),
						result.type === "action" && result.hint ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", {
							className: "rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-fg-faint",
							children: result.hint
						}) : null
					]
				}, result.type === "issue" ? `issue:${result.id}` : result.type === "project" ? `project:${result.id}` : `action:${result.key}`))
			})]
		})
	});
}
function SearchIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: "14",
		height: "14",
		viewBox: "0 0 14 14",
		fill: "none",
		"aria-hidden": true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx: "6",
			cy: "6",
			r: "3.5",
			stroke: "currentColor",
			strokeWidth: "1.5"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M11 11l-2.4-2.4",
			stroke: "currentColor",
			strokeWidth: "1.5",
			strokeLinecap: "round"
		})]
	});
}
function IssueGlyph() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		width: "11",
		height: "11",
		viewBox: "0 0 14 14",
		fill: "none",
		"aria-hidden": true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: "2.5",
			y: "2.5",
			width: "9",
			height: "9",
			rx: "2",
			stroke: "currentColor",
			strokeWidth: "1.4"
		})
	});
}
function ActionGlyph() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		width: "11",
		height: "11",
		viewBox: "0 0 14 14",
		fill: "none",
		"aria-hidden": true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M3 7l3 3 5-6",
			stroke: "currentColor",
			strokeWidth: "1.5",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
//#endregion
//#region src/components/keyboard-help.tsx
var SHORTCUT_GROUPS = [
	{
		title: "Global",
		shortcuts: [
			{
				keys: [typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl", "K"],
				label: "Open command palette"
			},
			{
				keys: ["?"],
				label: "Show this help"
			},
			{
				keys: ["Esc"],
				label: "Close dialog or menu"
			}
		]
	},
	{
		title: "Issues",
		shortcuts: [
			{
				keys: ["C"],
				label: "New issue"
			},
			{
				keys: ["J"],
				label: "Move down"
			},
			{
				keys: ["K"],
				label: "Move up"
			},
			{
				keys: ["X"],
				label: "Multi-select issue"
			},
			{
				keys: ["↵"],
				label: "Open issue"
			}
		]
	},
	{
		title: "Chat",
		shortcuts: [{
			keys: ["↵"],
			label: "Send message"
		}, {
			keys: ["⇧", "↵"],
			label: "New line in composer"
		}]
	}
];
var isTypingIn = (target) => {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	const tag = target.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};
function KeyboardHelp() {
	const [open, setOpen] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		const onKey = (event) => {
			if (event.key !== "?") return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (isTypingIn(event.target)) return;
			event.preventDefault();
			setOpen((current) => !current);
		};
		const onTrigger = () => setOpen(true);
		window.addEventListener("keydown", onKey);
		window.addEventListener("produktive:keyboard-help", onTrigger);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("produktive:keyboard-help", onTrigger);
		};
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Dialog, {
		open,
		onClose: () => setOpen(false),
		className: "max-w-md",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Keyboard shortcuts" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogContent, {
			className: "grid gap-4",
			children: SHORTCUT_GROUPS.map((group) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "m-0 mb-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint",
				children: group.title
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "grid gap-1.5",
				children: group.shortcuts.map((shortcut) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "flex items-center justify-between text-[13px]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-fg-muted",
						children: shortcut.label
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "flex items-center gap-1",
						children: shortcut.keys.map((key) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", {
							className: "grid min-h-5 min-w-5 place-items-center rounded-[4px] border border-border-subtle bg-surface px-1.5 font-mono text-[11px] text-fg",
							children: key
						}, key))
					})]
				}, shortcut.label))
			})] }, group.title))
		})]
	});
}
//#endregion
//#region src/components/org-switcher.tsx
function OrgSwitcher({ activeOrganization }) {
	const navigate = useNavigate();
	const [menuOpen, setMenuOpen] = (0, import_react.useState)(false);
	const [createOpen, setCreateOpen] = (0, import_react.useState)(false);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [switchError, setSwitchError] = (0, import_react.useState)(null);
	const containerRef = (0, import_react.useRef)(null);
	const { organizations } = useOrganizations(menuOpen);
	(0, import_react.useEffect)(() => {
		if (!menuOpen) return;
		const onPointerDown = (event) => {
			if (containerRef.current && !containerRef.current.contains(event.target)) setMenuOpen(false);
		};
		const onKeyDown = (event) => {
			if (event.key === "Escape") setMenuOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [menuOpen]);
	const handleSwitch = async (org) => {
		if (org.id === activeOrganization.id) {
			setMenuOpen(false);
			return;
		}
		setBusy(true);
		setSwitchError(null);
		try {
			await switchOrganization(org.id);
			await refreshSession();
			setMenuOpen(false);
			setBusy(false);
		} catch (error) {
			setSwitchError(error instanceof Error ? error.message : "Failed to switch organization");
			setBusy(false);
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		ref: containerRef,
		className: "relative",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			type: "button",
			"aria-haspopup": "menu",
			"aria-expanded": menuOpen,
			onClick: () => setMenuOpen((value) => !value),
			className: cn("flex w-full items-center gap-2.5 rounded-[8px] border border-transparent px-1.5 py-1.5 text-left transition-colors", menuOpen ? "border-border bg-surface" : "hover:border-border hover:bg-surface/65"),
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(OrgIcon, {
					name: activeOrganization.name,
					image: activeOrganization.image,
					size: "md"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.015em] text-fg",
					children: activeOrganization.name
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: cn("text-fg-muted transition-transform", menuOpen && "rotate-180"),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaretIcon, {})
				})
			]
		}), menuOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-[10px] border border-border bg-surface shadow-[0_18px_40px_rgba(0,0,0,0.45)] animate-fade-up",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "px-3 pt-2.5 pb-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint",
					children: "Workspaces"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex max-h-[260px] flex-col overflow-auto pb-1",
					children: organizations.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "px-3 py-2",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoadingTip, { compact: true })
					}) : organizations.map((org) => {
						const isActive = org.id === activeOrganization.id;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							disabled: busy,
							onClick: () => void handleSwitch(org),
							className: cn("flex h-9 items-center gap-2.5 px-3 text-left text-[13px] transition-colors", isActive ? "text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg", busy && "cursor-wait opacity-60"),
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(OrgIcon, {
									name: org.name,
									image: org.image,
									size: "sm"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "min-w-0 flex-1 truncate",
									children: org.name
								}),
								isActive ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-fg",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CheckIcon, { size: 13 })
								}) : null
							]
						}, org.id);
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "border-t border-border-subtle",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						disabled: busy,
						onClick: () => {
							setMenuOpen(false);
							navigate({ to: "/workspace/settings" });
						},
						className: "flex h-9 w-full items-center gap-2.5 px-3 text-left text-[13px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-60",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "grid size-5 shrink-0 place-items-center rounded-[5px] border border-border text-fg-muted",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingsIcon, { size: 11 })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Settings" })]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						disabled: busy,
						onClick: () => {
							setMenuOpen(false);
							setCreateOpen(true);
						},
						className: "flex h-9 w-full items-center gap-2.5 px-3 text-left text-[13px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-60",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "grid size-5 shrink-0 place-items-center rounded-[5px] border border-border text-fg-muted",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlusIcon$1, { size: 11 })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Create organization" })]
					})]
				}),
				switchError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "border-t border-border-subtle px-3 py-2 text-[12px] text-danger",
					children: switchError
				}) : null
			]
		}) : null]
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CreateOrganizationDialog, {
		open: createOpen,
		onClose: () => setCreateOpen(false)
	})] });
}
function OrgIcon({ name, image, size }) {
	const className = size === "md" ? "size-6 rounded-[7px] text-[12px]" : "size-5 rounded-[5px] text-[10px]";
	if (image) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
		src: image,
		alt: "",
		className: cn("shrink-0 border border-border object-cover", className)
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("grid shrink-0 place-items-center bg-fg font-semibold text-bg", className),
		children: name.trim().charAt(0).toUpperCase() || "O"
	});
}
function CreateOrganizationDialog({ open, onClose }) {
	const [name, setName] = (0, import_react.useState)("");
	const [error, setError] = (0, import_react.useState)(null);
	const [isSaving, setIsSaving] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		if (!open) {
			setName("");
			setError(null);
			setIsSaving(false);
		}
	}, [open]);
	const close = () => {
		if (isSaving) return;
		onClose();
	};
	const handleSubmit = async (event) => {
		event.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;
		setIsSaving(true);
		setError(null);
		try {
			await createOrganization(trimmed);
			await refreshSession();
			onClose();
		} catch (createError) {
			setError(createError instanceof Error ? createError.message : "Failed to create organization");
			setIsSaving(false);
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
		open,
		onClose: close,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
			onSubmit: handleSubmit,
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogHeader, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Create organization" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogClose, { onClose: close })] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "space-y-3 p-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						autoFocus: true,
						required: true,
						maxLength: 64,
						value: name,
						onChange: (event) => setName(event.target.value),
						placeholder: "Acme Inc.",
						className: "h-10 border-0 bg-transparent px-0 text-base focus-visible:ring-0"
					}), error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs text-danger",
						role: "alert",
						children: error
					}) : null]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					variant: "ghost",
					size: "sm",
					onClick: close,
					children: "Cancel"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "submit",
					size: "sm",
					disabled: isSaving || !name.trim(),
					children: isSaving ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "inline-block size-3 animate-spin rounded-full border-2 border-bg/30 border-t-bg" }), "Creating…"]
					}) : "Create organization"
				})] })
			]
		})
	});
}
//#endregion
//#region src/components/ui/sidebar.tsx
function SidebarProvider({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-screen w-full bg-sidebar text-fg md:h-screen md:overflow-hidden",
		children
	});
}
function Sidebar({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("aside", {
		className: cn("hidden w-[260px] shrink-0 flex-col bg-sidebar text-fg md:flex", className),
		...props
	});
}
function SidebarHeader({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("px-4 pb-5 pt-4", className),
		...props
	});
}
function SidebarContent({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("flex-1 overflow-auto p-4", className),
		...props
	});
}
function SidebarFooter({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("p-4", className),
		...props
	});
}
function SidebarInset({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: cn("relative min-w-0 flex-1 bg-bg", "md:my-1.5 md:mr-1.5 md:overflow-auto md:rounded-xl md:border md:border-border-subtle md:shadow-[0_2px_12px_rgba(0,0,0,0.25)]", className),
		...props
	});
}
//#endregion
//#region src/lib/tab-pages.ts
var STATIC_PAGES = [
	{
		path: "/workspace",
		title: "Overview",
		glyph: "overview"
	},
	{
		path: "/issues",
		title: "Issues",
		glyph: "issues"
	},
	{
		path: "/projects",
		title: "Projects",
		glyph: "projects"
	},
	{
		path: "/inbox",
		title: "Inbox",
		glyph: "inbox"
	},
	{
		path: "/labels",
		title: "Labels",
		glyph: "labels"
	},
	{
		path: "/account",
		title: "Account",
		glyph: "account"
	},
	{
		path: "/workspace/settings",
		title: "Settings",
		glyph: "settings"
	}
];
function findStaticPage(pathname) {
	return STATIC_PAGES.find((page) => page.path === pathname) ?? null;
}
//#endregion
//#region src/components/workspace/tab-bar.tsx
var POSITION_STORAGE_KEY = "produktive:tabbar-position";
var VIEWPORT_MARGIN = 8;
function TabBar({ enabled }) {
	const { tabs, close } = useTabs();
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const [position, setPosition] = (0, import_react.useState)(() => readStoredPosition());
	const [dragging, setDragging] = (0, import_react.useState)(false);
	const barRef = (0, import_react.useRef)(null);
	const dragOffsetRef = (0, import_react.useRef)({
		x: 0,
		y: 0
	});
	(0, import_react.useEffect)(() => {
		if (!dragging) return;
		const onMove = (event) => {
			const node = barRef.current;
			if (!node) return;
			const width = node.offsetWidth;
			const height = node.offsetHeight;
			const rawX = event.clientX - dragOffsetRef.current.x;
			const rawY = event.clientY - dragOffsetRef.current.y;
			setPosition({
				x: clamp(rawX, VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
				y: clamp(rawY, VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN)
			});
		};
		const onUp = () => setDragging(false);
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onUp);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onUp);
		};
	}, [dragging]);
	(0, import_react.useEffect)(() => {
		if (dragging) return;
		if (!position) return;
		window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
	}, [dragging, position]);
	(0, import_react.useEffect)(() => {
		if (!position) return;
		const onResize = () => {
			const node = barRef.current;
			if (!node) return;
			const width = node.offsetWidth;
			const height = node.offsetHeight;
			setPosition((current) => {
				if (!current) return current;
				return {
					x: clamp(current.x, VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
					y: clamp(current.y, VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN)
				};
			});
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, [position]);
	if (!enabled) return null;
	if (tabs.length === 0) return null;
	const activeId = activeTargetFor(pathname);
	const startDrag = (event) => {
		const node = barRef.current;
		if (!node) return;
		const rect = node.getBoundingClientRect();
		dragOffsetRef.current = {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top
		};
		if (!position) setPosition({
			x: rect.left,
			y: rect.top
		});
		setDragging(true);
		event.preventDefault();
	};
	const resetPosition = () => {
		setPosition(null);
		window.localStorage.removeItem(POSITION_STORAGE_KEY);
	};
	const wrapperStyle = position ? {
		position: "fixed",
		left: position.x,
		top: position.y,
		right: "auto",
		bottom: "auto"
	} : {};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("pointer-events-none z-30", position ? "" : "fixed inset-x-0 bottom-0 flex justify-center px-3 pb-3"),
		style: wrapperStyle,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			ref: barRef,
			className: cn("pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-[10px] border border-border-subtle bg-surface/95 p-1 shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur", dragging && "select-none"),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onPointerDown: startDrag,
				onDoubleClick: resetPosition,
				"aria-label": "Drag tab bar (double-click to reset)",
				title: "Drag to move · double-click to reset",
				className: cn("grid h-7 w-4 shrink-0 place-items-center text-fg-faint transition-colors hover:text-fg", dragging ? "cursor-grabbing" : "cursor-grab"),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GripIcon, {})
			}), tabs.map((tab) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabPill, {
				tab,
				active: tab.targetId === activeId.targetId && tab.tabType === activeId.tabType,
				onSelect: () => {
					if (tab.tabType === "issue") navigate({
						to: "/issues/$issueId",
						params: { issueId: tab.targetId }
					});
					else if (tab.tabType === "project") navigate({
						to: "/projects/$projectId",
						params: { projectId: tab.targetId }
					});
					else if (tab.tabType === "chat") navigate({
						to: "/chat/$chatId",
						params: { chatId: tab.targetId }
					});
					else if (tab.tabType === "page") navigateToPage(navigate, tab.targetId);
				},
				onClose: () => close(tab.id)
			}, tab.id))]
		})
	});
}
function TabPill({ tab, active, onSelect, onClose }) {
	const [hover, setHover] = (0, import_react.useState)(false);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		onMouseEnter: () => setHover(true),
		onMouseLeave: () => setHover(false),
		className: cn("group flex h-7 max-w-[200px] items-center gap-1.5 rounded-[7px] px-2 text-[12px] transition-colors", active ? "bg-bg text-fg ring-1 ring-border" : "text-fg-muted hover:bg-surface-2 hover:text-fg"),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			type: "button",
			onClick: onSelect,
			className: "flex min-w-0 items-center gap-1.5 text-left",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabGlyph, { tab }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "min-w-0 truncate",
				children: tab.title
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			onClick: onClose,
			"aria-label": `Close ${tab.title}`,
			tabIndex: hover || active ? 0 : -1,
			className: cn("grid size-4 shrink-0 place-items-center rounded-[4px] text-fg-faint transition-opacity hover:bg-surface-3 hover:text-fg", hover || active ? "opacity-100" : "pointer-events-none opacity-0"),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CloseIcon, {})
		})]
	});
}
function TabGlyph({ tab }) {
	if (tab.tabType === "project") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectGlyph, {
		targetId: tab.targetId,
		title: tab.title
	});
	if (tab.tabType === "chat") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SparkleIcon, { size: 11 });
	if (tab.tabType === "page") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageGlyph, { glyph: findStaticPage(tab.targetId)?.glyph ?? null });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IssueDot, {});
}
function PageGlyph({ glyph }) {
	switch (glyph) {
		case "issues": return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IssuesIcon, { size: 11 });
		case "projects": return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectsIcon, { size: 11 });
		case "inbox": return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(InboxIcon, { size: 11 });
		case "labels": return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HashIcon, { size: 11 });
		case "settings": return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingsIcon, { size: 11 });
		case "account": return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PersonGlyph, {});
		case "overview": return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GridGlyph, {});
		default: return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IssueDot, {});
	}
}
function PersonGlyph() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: "11",
		height: "11",
		viewBox: "0 0 14 14",
		fill: "none",
		"aria-hidden": true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx: "7",
			cy: "5",
			r: "2",
			stroke: "currentColor",
			strokeWidth: "1.4"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M3 12c.5-2 2-3 4-3s3.5 1 4 3",
			stroke: "currentColor",
			strokeWidth: "1.4",
			strokeLinecap: "round"
		})]
	});
}
function GridGlyph() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: "11",
		height: "11",
		viewBox: "0 0 14 14",
		fill: "none",
		"aria-hidden": true,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "2",
				y: "2",
				width: "4",
				height: "4",
				rx: "1",
				stroke: "currentColor",
				strokeWidth: "1.3"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "8",
				y: "2",
				width: "4",
				height: "4",
				rx: "1",
				stroke: "currentColor",
				strokeWidth: "1.3"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "2",
				y: "8",
				width: "4",
				height: "4",
				rx: "1",
				stroke: "currentColor",
				strokeWidth: "1.3"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "8",
				y: "8",
				width: "4",
				height: "4",
				rx: "1",
				stroke: "currentColor",
				strokeWidth: "1.3"
			})
		]
	});
}
function navigateToPage(navigate, path) {
	switch (path) {
		case "/workspace": return navigate({ to: "/workspace" });
		case "/issues": return navigate({ to: "/issues" });
		case "/projects": return navigate({ to: "/projects" });
		case "/inbox": return navigate({ to: "/inbox" });
		case "/labels": return navigate({ to: "/labels" });
		case "/account": return navigate({ to: "/account" });
		case "/workspace/settings": return navigate({ to: "/workspace/settings" });
		default: return Promise.resolve();
	}
}
function ProjectGlyph({ targetId, title }) {
	const { data } = useProjectsQuery();
	const project = (data ?? []).find((p) => p.id === targetId);
	if (!project) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectIcon, {
		color: "blue",
		icon: null,
		name: title,
		size: "sm"
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectIcon, {
		color: project.color,
		icon: project.icon,
		name: project.name,
		size: "sm"
	});
}
function IssueDot() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		"aria-hidden": true,
		className: "size-1.5 shrink-0 rounded-full bg-fg-faint"
	});
}
function CloseIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		width: "9",
		height: "9",
		viewBox: "0 0 12 12",
		fill: "none",
		"aria-hidden": true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M3 3l6 6M9 3l-6 6",
			stroke: "currentColor",
			strokeWidth: "1.4",
			strokeLinecap: "round"
		})
	});
}
function GripIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: "6",
		height: "12",
		viewBox: "0 0 6 12",
		fill: "currentColor",
		"aria-hidden": true,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "1.5",
				cy: "2",
				r: "0.9"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "4.5",
				cy: "2",
				r: "0.9"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "1.5",
				cy: "6",
				r: "0.9"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "4.5",
				cy: "6",
				r: "0.9"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "1.5",
				cy: "10",
				r: "0.9"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "4.5",
				cy: "10",
				r: "0.9"
			})
		]
	});
}
function clamp(value, min, max) {
	if (max < min) return min;
	return Math.min(Math.max(value, min), max);
}
function readStoredPosition() {
	if (typeof window === "undefined") return null;
	const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed?.x === "number" && typeof parsed?.y === "number" && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) return parsed;
	} catch {}
	return null;
}
function activeTargetFor(pathname) {
	if (pathname.startsWith("/issues/")) return {
		tabType: "issue",
		targetId: decodeURIComponent(pathname.slice(8))
	};
	if (pathname.startsWith("/projects/")) return {
		tabType: "project",
		targetId: decodeURIComponent(pathname.slice(10))
	};
	if (pathname.startsWith("/chat/")) return {
		tabType: "chat",
		targetId: decodeURIComponent(pathname.slice(6))
	};
	const page = findStaticPage(pathname);
	if (page) return {
		tabType: "page",
		targetId: page.path
	};
	return {
		tabType: null,
		targetId: null
	};
}
//#endregion
//#region src/routes/_app.tsx?tsr-split=component
var ChatWidget = (0, import_react.lazy)(() => __vitePreload(() => import("./chat-widget-BwJp7TJH.js").then((mod) => ({ default: mod.ChatWidget })), __vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27])));
function AppLayout() {
	const navigate = useNavigate();
	const session = useSession();
	const { tabsEnabled } = useUserPreferences();
	const { statuses } = useIssueStatuses();
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const staticPage = findStaticPage(pathname);
	useRegisterTab({
		tabType: "page",
		targetId: staticPage?.path ?? "",
		title: staticPage?.title ?? null,
		enabled: tabsEnabled && Boolean(staticPage)
	});
	const { chats, isLoading: chatsLoading, removeChat } = useChats();
	const { favorites: rawFavorites, isLoading: favoritesLoading, isFavorite, toggleFavorite } = useFavorites();
	const { unreadCount: inboxUnread } = useInbox();
	const currentUserId = session.data?.user.id ?? null;
	const { layout: sidebarLayout, toggleFavoritesCollapsed, toggleChatsCollapsed, setFavoritesOrder, setChatsLimit, setChatsSort } = useSidebarLayout();
	const favorites = applyOrder(rawFavorites, sidebarLayout.favoritesOrder, (fav) => fav.favoriteId);
	const [favDragId, setFavDragId] = (0, import_react.useState)(null);
	const [chatsSettingsOpen, setChatsSettingsOpen] = (0, import_react.useState)(false);
	const chatsSettingsRef = (0, import_react.useRef)(null);
	const [accountMenuOpen, setAccountMenuOpen] = (0, import_react.useState)(false);
	const [chatMenuOpenId, setChatMenuOpenId] = (0, import_react.useState)(null);
	const [editingLayout, setEditingLayout] = (0, import_react.useState)(false);
	const accountMenuRef = (0, import_react.useRef)(null);
	const onboarding = useOnboarding();
	(0, import_react.useEffect)(() => {
		if (!session.isPending && !session.data) navigate({ to: "/login" });
	}, [
		navigate,
		session.data,
		session.isPending
	]);
	(0, import_react.useEffect)(() => {
		const user = session.data?.user;
		if (!user) return;
		if (user.onboardingCompletedAt) return;
		if (onboarding.isActive) return;
		if (typeof window === "undefined") return;
		if (window.sessionStorage.getItem("produktive-onboarding-deferred-this-session")) return;
		const id = window.setTimeout(() => {
			onboarding.start(user.onboardingStep ?? void 0);
		}, 500);
		return () => window.clearTimeout(id);
	}, [session.data?.user, onboarding]);
	(0, import_react.useEffect)(() => {
		if (!accountMenuOpen) return;
		const handlePointerDown = (event) => {
			if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) setAccountMenuOpen(false);
		};
		const handleKeyDown = (event) => {
			if (event.key === "Escape") setAccountMenuOpen(false);
		};
		document.addEventListener("pointerdown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [accountMenuOpen]);
	(0, import_react.useEffect)(() => {
		if (!chatsSettingsOpen) return;
		const handlePointerDown = (event) => {
			if (chatsSettingsRef.current && !chatsSettingsRef.current.contains(event.target)) setChatsSettingsOpen(false);
		};
		const handleKeyDown = (event) => {
			if (event.key === "Escape") setChatsSettingsOpen(false);
		};
		document.addEventListener("pointerdown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [chatsSettingsOpen]);
	(0, import_react.useEffect)(() => {
		if (!chatMenuOpenId) return;
		const handlePointerDown = () => setChatMenuOpenId(null);
		const handleKeyDown = (event) => {
			if (event.key === "Escape") setChatMenuOpenId(null);
		};
		document.addEventListener("pointerdown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [chatMenuOpenId]);
	const currentUser = session.data?.user;
	if (session.isPending || !session.data) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "grid min-h-screen place-items-center px-6",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "bg-dotgrid",
			"aria-hidden": true
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoadingTip, {})]
	});
	pathname === "/issues" || pathname.startsWith("/issues/");
	const recentChats = (sidebarLayout.chatsSort === "alphabetical" ? [...chats].sort((a, b) => (a.title || "").localeCompare(b.title || "", void 0, { sensitivity: "base" })) : chats).slice(0, sidebarLayout.chatsLimit);
	const openChat = async (id) => {
		setChatMenuOpenId(null);
		await navigate({
			to: "/chat/$chatId",
			params: { chatId: id }
		});
	};
	const copyChatLink = async (id) => {
		setChatMenuOpenId(null);
		const url = new URL(`/chat/${id}`, window.location.origin);
		try {
			await navigator.clipboard.writeText(url.toString());
			toast.success("Chat link copied");
		} catch {
			toast.error("Failed to copy chat link");
		}
	};
	const exportChat = async (chat) => {
		setChatMenuOpenId(null);
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
	const moveFavoriteBefore = (sourceFavoriteId, targetFavoriteId) => {
		if (sourceFavoriteId === targetFavoriteId) return;
		const currentOrder = favorites.map((fav) => fav.favoriteId);
		const sourceIdx = currentOrder.indexOf(sourceFavoriteId);
		const targetIdx = currentOrder.indexOf(targetFavoriteId);
		if (sourceIdx < 0 || targetIdx < 0) return;
		const next = currentOrder.filter((id) => id !== sourceFavoriteId);
		const insertAt = next.indexOf(targetFavoriteId);
		next.splice(insertAt, 0, sourceFavoriteId);
		setFavoritesOrder(next);
	};
	const handleDeleteChat = async (chat) => {
		setChatMenuOpenId(null);
		try {
			await deleteChat(chat.id);
			removeChat(chat.id);
			if (pathname === `/chat/${chat.id}`) await navigate({ to: "/chat" });
			toast.success("Chat deleted");
		} catch {
			toast.error("Failed to delete chat");
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SidebarProvider, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CommandPalette, {}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeyboardHelp, {}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NewProjectDialog, {
			headless: true,
			onCreated: (project) => {
				navigate({
					to: "/projects/$projectId",
					params: { projectId: project.id }
				});
			}
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NewLabelDialog, { headless: true }),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Sidebar, {
			className: "bg-sidebar/95",
			"data-tour": "sidebar",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex items-center gap-1",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "min-w-0 flex-1",
						"data-tour": "org-switcher",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OrgSwitcher, { activeOrganization: session.data.organization })
					})
				}) }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SidebarContent, {
					className: "flex flex-col gap-5 px-4 pt-0 pb-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarNav, {
							pathname,
							inboxUnread,
							isEditing: editingLayout,
							onExitEditing: () => setEditingLayout(false)
						}),
						favoritesLoading || favorites.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarSectionHeader, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StarIcon, {
								size: 10,
								filled: true
							}),
							label: "Favorites",
							collapsed: sidebarLayout.favoritesCollapsed,
							onToggle: toggleFavoritesCollapsed,
							trailing: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: (event) => {
									event.stopPropagation();
									navigate({ to: "/favorites" });
								},
								"aria-label": "View all favorites",
								title: "View all favorites",
								className: "grid size-5 place-items-center rounded-[5px] text-fg-faint opacity-0 transition-opacity hover:bg-surface hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent group-hover/favs-header:opacity-100",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowOutIcon, {})
							}),
							groupClass: "group/favs-header"
						}), sidebarLayout.favoritesCollapsed ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex flex-col gap-px",
							children: favoritesLoading && favorites.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "px-2.5 py-1",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoadingTip, { compact: true })
							}) : favorites.map((fav) => {
								let targetPath = `/issues/${fav.id}`;
								if (fav.type === "chat") targetPath = `/chat/${fav.id}`;
								else if (fav.type === "project") targetPath = `/projects/${fav.id}`;
								const isActive = pathname === targetPath;
								const goTo = () => {
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
								const onUnpin = async () => {
									try {
										await toggleFavorite(fav.type, fav.id);
										toast.success("Removed from favorites");
									} catch {
										toast.error("Failed to update favorite");
									}
								};
								return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									role: "button",
									tabIndex: 0,
									draggable: true,
									onDragStart: (event) => {
										event.dataTransfer.setData(FAVORITE_DRAG_MIME, fav.favoriteId);
										event.dataTransfer.effectAllowed = "move";
										setFavDragId(fav.favoriteId);
									},
									onDragEnd: () => setFavDragId(null),
									onDragOver: (event) => {
										if (!event.dataTransfer.types.includes(FAVORITE_DRAG_MIME)) return;
										event.preventDefault();
										event.dataTransfer.dropEffect = "move";
									},
									onDrop: (event) => {
										const sourceId = event.dataTransfer.getData(FAVORITE_DRAG_MIME);
										if (!sourceId) return;
										event.preventDefault();
										moveFavoriteBefore(sourceId, fav.favoriteId);
									},
									onClick: () => void goTo(),
									onKeyDown: (event) => {
										if (event.key === "Enter") {
											event.preventDefault();
											goTo();
										}
									},
									title: displayFavoriteTitle(fav.title),
									className: cn("group flex h-8 w-full cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent", isActive ? "bg-surface text-fg" : "text-fg-muted hover:bg-surface hover:text-fg", favDragId === fav.favoriteId && "opacity-60"),
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "shrink-0 text-fg-faint group-hover:text-fg-muted",
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
											className: "flex-1 truncate",
											children: displayFavoriteTitle(fav.title)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											"aria-label": `Unpin ${displayFavoriteTitle(fav.title)}`,
											onClick: (event) => {
												event.stopPropagation();
												onUnpin();
											},
											className: "shrink-0 rounded-[3px] text-warning opacity-0 transition-opacity hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent group-hover:opacity-100",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StarIcon, {
												size: 11,
												filled: true
											})
										})
									]
								}, fav.favoriteId);
							})
						})] }) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center justify-between pb-1.5 pl-2 pr-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: toggleChatsCollapsed,
								"aria-label": sidebarLayout.chatsCollapsed ? "Expand chats" : "Collapse chats",
								className: "flex flex-1 items-center gap-1 rounded-[4px] px-0 py-px text-left text-fg-faint transition-colors hover:text-fg-muted",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionChevron, { collapsed: sidebarLayout.chatsCollapsed }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[10.5px] font-medium uppercase tracking-[0.08em]",
									children: "Chats"
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								ref: chatsSettingsRef,
								className: "relative flex items-center gap-0.5",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => setChatsSettingsOpen((value) => !value),
										"aria-label": "Chats settings",
										"aria-expanded": chatsSettingsOpen,
										title: "Chats settings",
										className: cn("grid size-5 place-items-center rounded-[5px] text-fg-faint transition-colors hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent", chatsSettingsOpen && "bg-surface text-fg"),
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DotsIcon, {})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => void navigate({ to: "/chat" }),
										"aria-label": "New chat",
										title: "New chat",
										className: "grid size-5 place-items-center rounded-[5px] text-fg-faint transition-colors hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlusIcon, {})
									}),
									chatsSettingsOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatsSettingsPopover, {
										limit: sidebarLayout.chatsLimit,
										sort: sidebarLayout.chatsSort,
										onLimitChange: (value) => setChatsLimit(value),
										onSortChange: (value) => setChatsSort(value),
										onClose: () => setChatsSettingsOpen(false),
										onViewAll: () => {
											setChatsSettingsOpen(false);
											navigate({ to: "/chats" });
										}
									}) : null
								]
							})]
						}), sidebarLayout.chatsCollapsed ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-px",
							children: [chatsLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "px-2.5 py-1",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoadingTip, { compact: true })
							}) : chats.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "px-2.5 py-1 text-[12px] text-fg-faint",
								children: "No chats yet"
							}) : recentChats.map((entry) => {
								const isActive = pathname === `/chat/${entry.id}`;
								const isCreator = currentUserId !== null && entry.createdById === currentUserId;
								return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "relative",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										role: "button",
										tabIndex: 0,
										onClick: () => void openChat(entry.id),
										onKeyDown: (event) => {
											if (event.key === "Enter") {
												event.preventDefault();
												openChat(entry.id);
											}
										},
										title: displayChatTitle(entry),
										className: cn("group flex h-8 w-full cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent", isActive ? "bg-surface text-fg" : "text-fg-muted hover:bg-surface hover:text-fg"),
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "flex-1 truncate",
											children: displayChatTitle(entry)
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											"aria-label": `Actions for ${displayChatTitle(entry)}`,
											onClick: (event) => {
												event.stopPropagation();
												setChatMenuOpenId((current) => current === entry.id ? null : entry.id);
											},
											className: cn("grid size-6 shrink-0 place-items-center rounded-[6px] text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent", chatMenuOpenId === entry.id ? "bg-surface-2 opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"),
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DotsIcon, {})
										})]
									}), chatMenuOpenId === entry.id ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "absolute right-1 top-8 z-30 w-36 overflow-hidden rounded-[8px] border border-border bg-surface py-1 shadow-xl",
										onClick: (event) => event.stopPropagation(),
										onPointerDown: (event) => event.stopPropagation(),
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatMenuItem, {
												onClick: () => void openChat(entry.id),
												children: "Open"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatMenuItem, {
												onClick: async () => {
													setChatMenuOpenId(null);
													const wasFavorite = isFavorite("chat", entry.id);
													try {
														await toggleFavorite("chat", entry.id);
														toast.success(wasFavorite ? "Removed from favorites" : "Pinned to sidebar");
													} catch {
														toast.error("Failed to update favorite");
													}
												},
												children: isFavorite("chat", entry.id) ? "Unpin" : "Pin"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatMenuItem, {
												onClick: () => void exportChat(entry),
												children: "Export JSON"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatMenuItem, {
												onClick: () => void copyChatLink(entry.id),
												children: "Copy link"
											}),
											isCreator ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "my-1 h-px bg-border-subtle" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatMenuItem, {
												danger: true,
												onClick: () => void handleDeleteChat(entry),
												children: "Delete"
											})] }) : null
										]
									}) : null]
								}, entry.id);
							}), chats.length > recentChats.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => void navigate({ to: "/chats" }),
								className: "mt-0.5 px-2.5 py-1 text-left text-[11.5px] text-fg-muted transition-colors hover:text-fg",
								children: [
									"View all ",
									chats.length,
									" →"
								]
							}) : null]
						})] })
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarFooter, {
					className: "relative",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						ref: accountMenuRef,
						children: [accountMenuOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: cn("absolute left-4 right-4 overflow-hidden rounded-[9px] border border-border bg-surface animate-fade-up", "bottom-18.5"),
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "border-b border-border-subtle px-3 py-2.5",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "truncate text-[13px] font-medium text-fg",
										children: currentUser?.name ?? "User"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-0.5 truncate text-[11px] text-fg-muted",
										children: currentUser?.email
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									className: "flex h-9 w-full items-center justify-between px-3 text-left text-[13px] text-fg transition-colors hover:bg-surface-2",
									onClick: async () => {
										setAccountMenuOpen(false);
										await navigate({ to: "/account" });
									},
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Account settings" })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									className: "flex h-9 w-full items-center justify-between px-3 text-left text-[13px] text-fg transition-colors hover:bg-surface-2",
									onClick: () => {
										setAccountMenuOpen(false);
										setEditingLayout(true);
									},
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Customize sidebar" })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-px bg-border-subtle" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "flex h-9 w-full items-center justify-between px-3 text-left text-[13px] font-medium text-fg transition-colors hover:bg-surface-2",
									onClick: async () => {
										setAccountMenuOpen(false);
										await signOut();
										await navigate({ to: "/login" });
									},
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Sign out" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg-faint",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SignOutIcon, {})
									})]
								})
							]
						}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							"aria-expanded": accountMenuOpen,
							"aria-haspopup": "menu",
							className: cn("flex w-full items-center gap-2.5 rounded-[9px] border border-transparent p-1.5 text-left transition-colors", accountMenuOpen ? "border-border bg-surface" : "hover:border-border hover:bg-surface/65"),
							onClick: () => setAccountMenuOpen((open) => !open),
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountIcon, {
									name: currentUser?.name ?? "User",
									image: currentUser?.image
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0 flex-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "truncate text-[13px] font-medium text-fg",
										title: currentUser?.name ?? "User",
										children: currentUser?.name ?? "User"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "truncate text-[11px] text-fg-muted",
										title: currentUser?.email,
										children: currentUser?.email
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: cn("text-fg-muted transition-transform", accountMenuOpen && "rotate-180"),
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaretIcon, {})
								})
							]
						})]
					})
				})
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SidebarInset, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabBar, { enabled: tabsEnabled })] }),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Suspense, {
			fallback: null,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatWidget, {})
		})
	] });
}
function ChatMenuItem({ children, onClick, danger }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		className: cn("flex h-8 w-full items-center px-2.5 text-left text-[12px] transition-colors hover:bg-surface-2", danger ? "text-danger" : "text-fg"),
		onClick,
		children
	});
}
function AccountIcon({ name, image }) {
	if (image) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
		src: image,
		alt: "",
		className: "size-8 shrink-0 rounded-[8px] border border-border object-cover"
	});
	const tokens = name.trim().split(/\s+/).filter(Boolean);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "grid size-8 shrink-0 place-items-center rounded-[8px] border border-border bg-surface text-[12px] font-medium text-fg",
		children: tokens.length === 0 ? "P" : tokens.length === 1 ? tokens[0].slice(0, 2).toUpperCase() : (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase()
	});
}
function displayChatTitle(chat) {
	return parseMessageWithAttachments(chat.title).text.trim() || "Attached files";
}
function displayFavoriteTitle(title) {
	return parseMessageWithAttachments(title).text.trim() || "Untitled";
}
function safeFilename(value) {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "chat";
}
function SignOutIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		"aria-hidden": "true",
		width: "14",
		height: "14",
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "2",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("polyline", { points: "16 17 21 12 16 7" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				x1: "21",
				y1: "12",
				x2: "9",
				y2: "12"
			})
		]
	});
}
function MyIssuesIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: "13",
		height: "13",
		viewBox: "0 0 14 14",
		fill: "none",
		"aria-hidden": true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx: "7",
			cy: "5",
			r: "2",
			stroke: "currentColor",
			strokeWidth: "1.4"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M3 12c.5-2 2-3 4-3s3.5 1 4 3",
			stroke: "currentColor",
			strokeWidth: "1.4",
			strokeLinecap: "round"
		})]
	});
}
function SidebarRecentProjects({ pathname }) {
	const navigate = useNavigate();
	const { projects } = useProjects(false);
	const recent = projects.filter((p) => p.archivedAt === null && p.status !== "cancelled").slice(0, 5);
	if (recent.length === 0) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "ml-3 mt-0.5 flex flex-col gap-px border-l border-border-subtle/60 pl-2",
		children: recent.map((project) => {
			const isActive = pathname === `/projects/${project.id}` || pathname.startsWith(`/projects/${project.id}`);
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				title: project.name,
				onClick: () => void navigate({
					to: "/projects/$projectId",
					params: { projectId: project.id }
				}),
				onDragOver: (event) => {
					if (!event.dataTransfer.types.includes("application/x-produktive-issue")) return;
					event.preventDefault();
					event.dataTransfer.dropEffect = "move";
					event.currentTarget.classList.add("ring-2", "ring-accent", "bg-accent/15");
				},
				onDragLeave: (event) => {
					event.currentTarget.classList.remove("ring-2", "ring-accent", "bg-accent/15");
				},
				onDrop: (event) => {
					event.currentTarget.classList.remove("ring-2", "ring-accent", "bg-accent/15");
					const issueId = event.dataTransfer.getData(ISSUE_DRAG_MIME);
					if (!issueId) return;
					event.preventDefault();
					(async () => {
						try {
							await updateIssue(issueId, { projectId: project.id });
							toast.success(`Added to ${project.name}`);
						} catch (error) {
							toast.error(error instanceof Error ? error.message : "Failed to add to project");
						}
					})();
				},
				className: cn("flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[12.5px] transition-colors", isActive ? "bg-surface text-fg" : "text-fg-muted hover:bg-surface hover:text-fg"),
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectIcon, {
						color: project.color,
						icon: project.icon,
						name: project.name,
						size: "sm"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "min-w-0 flex-1 truncate",
						children: project.name
					}),
					project.issueCount > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "shrink-0 text-[10px] tabular-nums text-fg-faint",
						children: [
							project.doneCount,
							"/",
							project.issueCount
						]
					}) : null
				]
			}, project.id);
		})
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
function OverviewIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: "13",
		height: "13",
		viewBox: "0 0 14 14",
		fill: "none",
		"aria-hidden": true,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "2",
				y: "2",
				width: "4",
				height: "4",
				rx: "1",
				stroke: "currentColor",
				strokeWidth: "1.4"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "8",
				y: "2",
				width: "4",
				height: "4",
				rx: "1",
				stroke: "currentColor",
				strokeWidth: "1.4"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "2",
				y: "8",
				width: "4",
				height: "4",
				rx: "1",
				stroke: "currentColor",
				strokeWidth: "1.4"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "8",
				y: "8",
				width: "4",
				height: "4",
				rx: "1",
				stroke: "currentColor",
				strokeWidth: "1.4"
			})
		]
	});
}
function SidebarLabelsIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: "13",
		height: "13",
		viewBox: "0 0 14 14",
		fill: "none",
		"aria-hidden": true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M7.5 1.5h4a1 1 0 011 1v4l-6 6a1 1 0 01-1.4 0L1.5 8.4a1 1 0 010-1.4l6-6z",
			stroke: "currentColor",
			strokeWidth: "1.4",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx: "9.5",
			cy: "4.5",
			r: "0.9",
			fill: "currentColor"
		})]
	});
}
var NAV_ITEM_SPECS = {
	inbox: {
		id: "inbox",
		label: "Inbox",
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(InboxIcon, {}),
		isActive: (p) => p === "/inbox",
		onNavigate: (n) => void n({ to: "/inbox" })
	},
	"my-issues": {
		id: "my-issues",
		label: "My issues",
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MyIssuesIcon, {}),
		isActive: () => false,
		onNavigate: (n) => void n({
			to: "/issues",
			search: { mine: true }
		})
	},
	overview: {
		id: "overview",
		label: "Overview",
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OverviewIcon, {}),
		isActive: (p) => p === "/workspace",
		onNavigate: (n) => void n({ to: "/workspace" })
	},
	issues: {
		id: "issues",
		label: "Issues",
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IssuesIcon, {}),
		isActive: (p) => p === "/issues" || p.startsWith("/issues/"),
		onNavigate: (n) => void n({ to: "/issues" })
	},
	projects: {
		id: "projects",
		label: "Projects",
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectsIcon, {}),
		isActive: (p) => p === "/projects" || p.startsWith("/projects/"),
		onNavigate: (n) => void n({ to: "/projects" })
	},
	labels: {
		id: "labels",
		label: "Labels",
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarLabelsIcon, {}),
		isActive: (p) => p === "/labels",
		onNavigate: (n) => void n({ to: "/labels" })
	}
};
function SidebarNav({ pathname, inboxUnread, isEditing, onExitEditing }) {
	const navigate = useNavigate();
	const { layout, saveItems, reset, isSaving } = useSidebarLayout();
	const savedItems = layout.items;
	const [draft, setDraft] = (0, import_react.useState)(savedItems);
	const [dragId, setDragId] = (0, import_react.useState)(null);
	(0, import_react.useEffect)(() => {
		if (!isEditing) setDraft(savedItems);
	}, [isEditing, savedItems]);
	const items = isEditing ? draft : savedItems;
	const moveBefore = (sourceId, targetId) => {
		if (sourceId === targetId) return;
		setDraft((current) => {
			const next = current.filter((item) => item.id !== sourceId);
			const sourceItem = current.find((item) => item.id === sourceId);
			if (!sourceItem) return current;
			const targetIdx = next.findIndex((item) => item.id === targetId);
			if (targetIdx < 0) return current;
			next.splice(targetIdx, 0, sourceItem);
			return next;
		});
	};
	const toggleHidden = (id) => {
		setDraft((current) => current.map((item) => item.id === id ? {
			...item,
			hidden: !item.hidden
		} : item));
	};
	const onDone = () => {
		saveItems(draft);
		onExitEditing();
	};
	const onCancel = () => {
		setDraft(savedItems);
		onExitEditing();
	};
	const onReset = () => {
		setDraft(defaultSidebarItems);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-px",
		children: [items.map((entry) => {
			const spec = NAV_ITEM_SPECS[entry.id];
			if (!spec) return null;
			const hidden = entry.hidden === true;
			if (!isEditing && hidden) return null;
			const active = spec.isActive(pathname);
			const showRecent = !isEditing && spec.id === "projects" && !hidden;
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarNavRow, {
				spec,
				isEditing,
				hidden,
				active,
				isDragging: dragId === entry.id,
				onClick: () => spec.onNavigate(navigate),
				onToggleHidden: () => toggleHidden(entry.id),
				onDragStart: () => setDragId(entry.id),
				onDragEnd: () => setDragId(null),
				onDropOnto: (sourceId) => moveBefore(sourceId, entry.id),
				trailing: spec.id === "inbox" && inboxUnread > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium text-white",
					children: inboxUnread > 99 ? "99+" : inboxUnread
				}) : null
			}), showRecent ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarRecentProjects, { pathname }) : null] }, entry.id);
		}), isEditing ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-3 flex items-center justify-between gap-2 rounded-[8px] border border-border-subtle bg-surface/40 px-2.5 py-2 text-[11.5px]",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: onReset,
				className: "text-fg-muted transition-colors hover:text-fg",
				children: "Reset"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-1",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: onCancel,
					className: "rounded-md px-2 py-0.5 text-fg-muted transition-colors hover:bg-surface hover:text-fg",
					children: "Cancel"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: onDone,
					disabled: isSaving,
					className: "rounded-md bg-fg px-2 py-0.5 font-medium text-bg transition-colors hover:bg-white disabled:opacity-60",
					children: isSaving ? "Saving…" : "Done"
				})]
			})]
		}) : null]
	});
}
var NAV_DRAG_MIME = "application/x-produktive-sidebar-item";
function SidebarNavRow({ spec, isEditing, hidden, active, isDragging, trailing, onClick, onToggleHidden, onDragStart, onDragEnd, onDropOnto }) {
	const [dropping, setDropping] = (0, import_react.useState)(false);
	if (isEditing) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		draggable: true,
		onDragStart: (event) => {
			event.dataTransfer.setData(NAV_DRAG_MIME, spec.id);
			event.dataTransfer.effectAllowed = "move";
			onDragStart();
		},
		onDragEnd: () => {
			setDropping(false);
			onDragEnd();
		},
		onDragOver: (event) => {
			if (!event.dataTransfer.types.includes(NAV_DRAG_MIME)) return;
			event.preventDefault();
			event.dataTransfer.dropEffect = "move";
			if (!dropping) setDropping(true);
		},
		onDragLeave: (event) => {
			if (event.currentTarget.contains(event.relatedTarget)) return;
			setDropping(false);
		},
		onDrop: (event) => {
			const sourceId = event.dataTransfer.getData(NAV_DRAG_MIME);
			setDropping(false);
			if (!sourceId) return;
			event.preventDefault();
			onDropOnto(sourceId);
		},
		className: cn("group flex h-8 w-full select-none items-center gap-1.5 rounded-[7px] border border-transparent pl-1 pr-1.5 text-[13px] transition-colors", dropping ? "border-accent/40 bg-accent/10" : "border-border-subtle/60 bg-surface/30", isDragging && "opacity-60", hidden && !dropping && "text-fg-faint"),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				"aria-hidden": true,
				className: "cursor-grab text-fg-faint hover:text-fg active:cursor-grabbing",
				title: "Drag to reorder",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DragHandleIcon, {})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: cn("shrink-0", hidden ? "text-fg-faint" : "text-fg-muted"),
				children: spec.icon
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "flex-1 truncate",
				children: spec.label
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: onToggleHidden,
				"aria-label": hidden ? `Show ${spec.label}` : `Hide ${spec.label}`,
				title: hidden ? "Show" : "Hide",
				className: "grid size-5 place-items-center rounded-[4px] text-fg-faint transition-colors hover:bg-surface hover:text-fg",
				children: hidden ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EyeOffIcon, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EyeIcon, {})
			})
		]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick,
		className: cn("flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[13px] transition-colors [&_svg]:text-fg-faint", active ? "bg-surface-2 text-fg [&_svg]:text-fg" : "text-fg-muted hover:bg-surface hover:text-fg"),
		children: [
			spec.icon,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "flex-1 truncate",
				children: spec.label
			}),
			trailing
		]
	});
}
var FAVORITE_DRAG_MIME = "application/x-produktive-favorite";
function ChatsSettingsPopover({ limit, sort, onLimitChange, onSortChange, onViewAll, onClose }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "absolute right-0 top-7 z-30 w-52 overflow-hidden rounded-[8px] border border-border bg-surface py-1.5 shadow-xl",
		onClick: (event) => event.stopPropagation(),
		onPointerDown: (event) => event.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "px-2.5 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint",
				children: "Sort"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverChoice, {
				label: "Recent",
				active: sort === "recent",
				onClick: () => onSortChange("recent")
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverChoice, {
				label: "Alphabetical",
				active: sort === "alphabetical",
				onClick: () => onSortChange("alphabetical")
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "my-1 h-px bg-border-subtle" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "px-2.5 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-fg-faint",
				children: "Show"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex flex-wrap gap-1 px-2.5 pb-1.5",
				children: CHATS_LIMIT_OPTIONS.map((value) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => onLimitChange(value),
					className: cn("inline-flex h-6 items-center rounded-[5px] border px-1.5 text-[11px] tabular-nums transition-colors", limit === value ? "border-border bg-bg text-fg" : "border-border-subtle text-fg-muted hover:border-border hover:text-fg"),
					children: value
				}, value))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "my-1 h-px bg-border-subtle" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => {
					onViewAll();
					onClose();
				},
				className: "flex h-8 w-full items-center px-2.5 text-left text-[12.5px] text-fg transition-colors hover:bg-surface-2",
				children: "View all chats"
			})
		]
	});
}
function PopoverChoice({ label, active, onClick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick,
		className: cn("flex h-7 w-full items-center justify-between px-2.5 text-left text-[12.5px] transition-colors hover:bg-surface-2", active ? "text-fg" : "text-fg-muted"),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }), active ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
			width: "11",
			height: "11",
			viewBox: "0 0 12 12",
			fill: "none",
			"aria-hidden": true,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M3 6.2l2 2L9 3.8",
				stroke: "currentColor",
				strokeWidth: "1.6",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			})
		}) : null]
	});
}
function SidebarSectionHeader({ icon, label, collapsed, onToggle, trailing, groupClass }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("flex w-full items-center gap-1 px-2 pb-1.5", groupClass),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			type: "button",
			onClick: onToggle,
			"aria-label": collapsed ? `Expand ${label}` : `Collapse ${label}`,
			className: "flex flex-1 items-center gap-1.5 rounded-[4px] py-px text-left text-fg-faint transition-colors hover:text-fg-muted",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionChevron, { collapsed }),
				icon,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[10.5px] font-medium uppercase tracking-[0.08em]",
					children: label
				})
			]
		}), trailing]
	});
}
function SectionChevron({ collapsed }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		width: "9",
		height: "9",
		viewBox: "0 0 12 12",
		fill: "none",
		"aria-hidden": true,
		style: {
			transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
			transition: "transform 120ms ease"
		},
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M3 4.5l3 3 3-3",
			stroke: "currentColor",
			strokeWidth: "1.4",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function ArrowOutIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: "11",
		height: "11",
		viewBox: "0 0 12 12",
		fill: "none",
		"aria-hidden": true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M4.5 7.5L9 3M5 3h4v4",
			stroke: "currentColor",
			strokeWidth: "1.4",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M9 6v3a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1h3",
			stroke: "currentColor",
			strokeWidth: "1.4",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})]
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
function EyeIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: "11",
		height: "11",
		viewBox: "0 0 14 14",
		fill: "none",
		"aria-hidden": true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z",
			stroke: "currentColor",
			strokeWidth: "1.3",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx: "7",
			cy: "7",
			r: "1.6",
			stroke: "currentColor",
			strokeWidth: "1.3"
		})]
	});
}
function EyeOffIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		width: "11",
		height: "11",
		viewBox: "0 0 14 14",
		fill: "none",
		"aria-hidden": true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M1 7s2-4 6-4c1 0 1.9.2 2.7.6M13 7s-2 4-6 4c-1 0-1.9-.2-2.7-.6M2 12L12 2",
			stroke: "currentColor",
			strokeWidth: "1.3",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
//#endregion
export { AppLayout as component };

//# sourceMappingURL=_app-BmBIYt2h.js.map