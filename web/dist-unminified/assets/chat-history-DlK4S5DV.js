import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { n as require_react_dom } from "./initial-DwS9pZ8K.js";
import { a as useQueryClient, h as Link } from "./initial-BUIQ08st.js";
import { Vn as cn, at as queryKeys, d as formatBytes, f as formatChatReferences, g as prepareChatAttachments, m as formatToolReferences, p as formatIssueReferences } from "./initial-BOT0Y-sv.js";
import { D as AttachIcon, E as AtIcon, H as SendIcon, K as StopIcon, R as PlayIcon, V as RefreshIcon, W as SparkleIcon, d as StatusIcon, j as CopyIcon, k as ChangesIcon, q as ThumbsUpIcon } from "./initial-BWSisseh.js";
import { t as useChats } from "./use-chats-CAdksDfN.js";
import { t as useIssues } from "./use-issues-BFKzL-a-.js";
import { n as useMentionableTools } from "./mcp-Dq1M87f2.js";
//#region src/components/chat/tool-mention-popup.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_react_dom = /* @__PURE__ */ __toESM(require_react_dom(), 1);
var import_jsx_runtime = require_jsx_runtime();
var POPOVER_WIDTH = 320;
var POPOVER_MAX_HEIGHT = 320;
var VIEWPORT_PADDING = 8;
var CARET_GAP = 8;
function MentionPopup({ open, query, items, coords, onSelect, onClose }) {
	const [activeIndex, setActiveIndex] = (0, import_react.useState)(0);
	const popoverRef = (0, import_react.useRef)(null);
	const activeRowRef = (0, import_react.useRef)(null);
	const filtered = (0, import_react.useMemo)(() => {
		const trimmed = query.trim().toLowerCase();
		if (!trimmed) return items;
		return items.filter((item) => itemHaystack(item).includes(trimmed));
	}, [items, query]);
	(0, import_react.useEffect)(() => {
		setActiveIndex(0);
	}, [query, open]);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		const onKey = (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onClose();
				return;
			}
			if (filtered.length === 0) return;
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setActiveIndex((current) => (current + 1) % filtered.length);
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				setActiveIndex((current) => (current - 1 + filtered.length) % filtered.length);
			} else if (event.key === "Enter" || event.key === "Tab") {
				const item = filtered[activeIndex];
				if (item) {
					event.preventDefault();
					onSelect(item);
				}
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [
		open,
		filtered,
		activeIndex,
		onClose,
		onSelect
	]);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		const onPointerDown = (event) => {
			const target = event.target;
			if (popoverRef.current?.contains(target)) return;
			onClose();
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [open, onClose]);
	(0, import_react.useLayoutEffect)(() => {
		if (!open) return;
		activeRowRef.current?.scrollIntoView({ block: "nearest" });
	}, [activeIndex, open]);
	if (!open || !coords) return null;
	const maxLeft = window.innerWidth - POPOVER_WIDTH - VIEWPORT_PADDING;
	const left = Math.min(Math.max(coords.left, VIEWPORT_PADDING), maxLeft);
	const bottom = Math.max(VIEWPORT_PADDING, window.innerHeight - coords.top + CARET_GAP);
	return (0, import_react_dom.createPortal)(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		ref: popoverRef,
		role: "dialog",
		style: {
			position: "fixed",
			left,
			bottom,
			width: POPOVER_WIDTH,
			maxHeight: Math.min(POPOVER_MAX_HEIGHT, Math.max(160, window.innerHeight - bottom - VIEWPORT_PADDING))
		},
		className: "z-50 flex flex-col overflow-hidden rounded-[10px] border border-border bg-surface text-xs leading-tight shadow-[0_18px_40px_rgba(0,0,0,0.45)] animate-fade-up",
		children: items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, { onClose }) : filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "px-3 py-2.5 text-fg-faint",
			children: "No matches."
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex flex-col overflow-auto py-1",
			children: renderRows(filtered, activeIndex, activeRowRef, onSelect)
		})
	}), document.body);
}
function renderRows(items, activeIndex, activeRowRef, onSelect) {
	const rows = [];
	let currentGroupKey = null;
	items.forEach((item, index) => {
		const group = groupOf(item);
		if (group.key !== currentGroupKey) {
			currentGroupKey = group.key;
			rows.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				style: { fontSize: 10 },
				className: "px-3 pt-2 pb-1 font-medium uppercase tracking-[0.08em] text-fg-faint",
				children: group.label
			}, `group-${group.key}`));
		}
		const active = index === activeIndex;
		if (item.kind === "tool") rows.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolRow, {
			tool: item.tool,
			active,
			activeRef: active ? activeRowRef : null,
			onSelect: () => onSelect(item)
		}, item.id));
		else if (item.kind === "issue") rows.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IssueRow, {
			issue: item.issue,
			active,
			activeRef: active ? activeRowRef : null,
			onSelect: () => onSelect(item)
		}, item.id));
		else rows.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatRow, {
			chat: item.chat,
			active,
			activeRef: active ? activeRowRef : null,
			onSelect: () => onSelect(item)
		}, item.id));
	});
	return rows;
}
function ToolRow({ tool, active, activeRef, onSelect }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		ref: activeRef,
		type: "button",
		onClick: onSelect,
		style: {
			fontSize: 12,
			lineHeight: 1.3
		},
		className: cn("flex w-full flex-col items-start gap-0 px-3 py-1 text-left transition-colors", active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "block w-full truncate font-mono text-fg",
			children: prettyToolName(tool)
		}), tool.description ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			style: { fontSize: 11 },
			className: "block w-full truncate text-fg-faint",
			children: tool.description
		}) : null]
	});
}
function IssueRow({ issue, active, activeRef, onSelect }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		ref: activeRef,
		type: "button",
		onClick: onSelect,
		style: {
			fontSize: 12,
			lineHeight: 1.3
		},
		className: cn("flex w-full items-center gap-2 px-3 py-1 text-left transition-colors", active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusIcon, { status: issue.status }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "block min-w-0 flex-1 truncate text-fg",
				children: issue.title
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				style: { fontSize: 10 },
				className: "shrink-0 font-mono text-fg-faint",
				children: ["P-", issue.id.slice(0, 4).toUpperCase()]
			})
		]
	});
}
function ChatRow({ chat, active, activeRef, onSelect }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		ref: activeRef,
		type: "button",
		onClick: onSelect,
		style: {
			fontSize: 12,
			lineHeight: 1.3
		},
		className: cn("flex w-full items-center gap-2 px-3 py-1 text-left transition-colors", active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "shrink-0 text-fg-faint",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SparkleIcon, { size: 11 })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "block min-w-0 flex-1 truncate text-fg",
				children: chat.title || "Untitled chat"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				style: { fontSize: 10 },
				className: "shrink-0 text-fg-faint",
				children: relativeTime(chat.updatedAt)
			})
		]
	});
}
function relativeTime(value) {
	const then = new Date(value).getTime();
	if (Number.isNaN(then)) return "";
	const diffMin = Math.max(0, Math.round((Date.now() - then) / 6e4));
	if (diffMin < 1) return "now";
	if (diffMin < 60) return `${diffMin}m`;
	const hours = Math.floor(diffMin / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d`;
	return new Date(value).toLocaleDateString(void 0, {
		month: "short",
		day: "numeric"
	});
}
function groupOf(item) {
	if (item.kind === "issue") return {
		key: "issues",
		label: "Issues"
	};
	if (item.kind === "chat") return {
		key: "chats",
		label: "Chats"
	};
	return {
		key: `tool:${item.tool.server.id}`,
		label: item.tool.server.name
	};
}
function itemHaystack(item) {
	if (item.kind === "tool") {
		const t = item.tool;
		return `${t.name} ${t.displayName} ${t.description} ${t.server.name}`.toLowerCase();
	}
	if (item.kind === "issue") {
		const i = item.issue;
		return `${i.title} ${i.id} ${i.status} ${i.priority}`.toLowerCase();
	}
	return `${item.chat.title} ${item.chat.id}`.toLowerCase();
}
function EmptyState({ onClose }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "px-3 py-3 leading-relaxed text-fg-muted",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "m-0",
			children: "Nothing to mention yet."
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
			to: "/workspace/settings",
			search: { section: "ai" },
			onClick: onClose,
			className: "mt-1.5 inline-flex text-accent transition-colors hover:underline",
			children: "Connect an MCP server →"
		})]
	});
}
function prettyToolName(tool) {
	const prefix = `mcp__${tool.server.slug}__`;
	if (tool.displayName.startsWith(prefix)) return tool.displayName.slice(prefix.length);
	return tool.displayName;
}
//#endregion
//#region src/lib/textarea-caret.ts
var MIRRORED_PROPERTIES = [
	"boxSizing",
	"borderTopWidth",
	"borderRightWidth",
	"borderBottomWidth",
	"borderLeftWidth",
	"paddingTop",
	"paddingRight",
	"paddingBottom",
	"paddingLeft",
	"fontStyle",
	"fontVariant",
	"fontWeight",
	"fontStretch",
	"fontSize",
	"fontSizeAdjust",
	"lineHeight",
	"fontFamily",
	"textAlign",
	"textTransform",
	"textIndent",
	"textDecoration",
	"letterSpacing",
	"wordSpacing",
	"tabSize",
	"MozTabSize"
];
/**
* Returns the viewport coordinates of the textarea's caret.
*
* Uses the mirror-div technique: render an off-screen div that exactly
* mimics the textarea's text layout, place a 0-width marker where the
* caret is, and read the marker's bounding rect. Translate by the
* textarea's own rect + scroll.
*/
function getCaretCoords(textarea) {
	if (typeof document === "undefined") return {
		left: 0,
		top: 0
	};
	const taRect = textarea.getBoundingClientRect();
	const computed = window.getComputedStyle(textarea);
	const mirror = document.createElement("div");
	const style = mirror.style;
	style.position = "absolute";
	style.visibility = "hidden";
	style.whiteSpace = "pre-wrap";
	style.wordWrap = "break-word";
	style.overflow = "hidden";
	style.top = "0";
	style.left = "-9999px";
	style.width = `${textarea.clientWidth}px`;
	style.height = "auto";
	for (const prop of MIRRORED_PROPERTIES) style[prop] = computed[prop];
	mirror.textContent = textarea.value.slice(0, textarea.selectionStart ?? 0);
	const marker = document.createElement("span");
	marker.textContent = "​";
	mirror.appendChild(marker);
	document.body.appendChild(mirror);
	const markerRect = marker.getBoundingClientRect();
	const mirrorRect = mirror.getBoundingClientRect();
	document.body.removeChild(mirror);
	const offsetLeft = markerRect.left - mirrorRect.left;
	const offsetTop = markerRect.top - mirrorRect.top;
	return {
		left: taRect.left + offsetLeft - textarea.scrollLeft,
		top: taRect.top + offsetTop - textarea.scrollTop
	};
}
//#endregion
//#region src/lib/use-mcp-tools.ts
var useMcpTools = () => {
	const qc = useQueryClient();
	const query = useMentionableTools();
	const refresh = (0, import_react.useCallback)(async () => {
		await qc.invalidateQueries({ queryKey: queryKeys.mcp.servers });
	}, [qc]);
	return {
		tools: query.data ?? [],
		isLoading: query.isPending,
		error: query.error,
		refresh
	};
};
//#endregion
//#region src/components/chat/chat-composer.tsx
function ChatComposer({ busy, onSend, onStop, onOpenChanges, changesCount = 0, changesOpen = false, pendingQuestion }) {
	const [value, setValue] = (0, import_react.useState)("");
	const [attachments, setAttachments] = (0, import_react.useState)([]);
	const [attachmentError, setAttachmentError] = (0, import_react.useState)(null);
	const [issues, setIssues] = (0, import_react.useState)([]);
	const [mentionedTools, setMentionedTools] = (0, import_react.useState)([]);
	const [mentionedChats, setMentionedChats] = (0, import_react.useState)([]);
	const [mentionState, setMentionState] = (0, import_react.useState)(null);
	const taRef = (0, import_react.useRef)(null);
	const fileRef = (0, import_react.useRef)(null);
	const { tools: availableTools } = useMcpTools();
	const { issues: availableIssues } = useIssues();
	const { chats: availableChats } = useChats();
	const mentionItems = (0, import_react.useMemo)(() => {
		const issueItems = availableIssues.map((issue) => ({
			kind: "issue",
			id: `issue:${issue.id}`,
			issue: {
				id: issue.id,
				title: issue.title,
				status: issue.status,
				priority: issue.priority
			}
		}));
		const chatItems = availableChats.map((chat) => ({
			kind: "chat",
			id: `chat:${chat.id}`,
			chat
		}));
		const toolItems = availableTools.map((tool) => ({
			kind: "tool",
			id: `tool:${tool.id}`,
			tool
		}));
		return [
			...issueItems,
			...chatItems,
			...toolItems
		];
	}, [
		availableIssues,
		availableChats,
		availableTools
	]);
	const autoresize = (el) => {
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
	};
	const detectMention = (textarea) => {
		const caret = textarea.selectionStart ?? textarea.value.length;
		const before = textarea.value.slice(0, caret);
		const atIndex = before.lastIndexOf("@");
		if (atIndex === -1) {
			setMentionState(null);
			return;
		}
		const charBefore = atIndex === 0 ? "" : before[atIndex - 1];
		if (!(atIndex === 0 || /\s/.test(charBefore))) {
			setMentionState(null);
			return;
		}
		const query = before.slice(atIndex + 1);
		if (!/^[\w-]*$/.test(query)) {
			setMentionState(null);
			return;
		}
		setMentionState({
			anchor: atIndex,
			query,
			coords: getCaretCoords(textarea)
		});
	};
	const handleChange = (event) => {
		setValue(event.target.value);
		autoresize(event.target);
		detectMention(event.target);
	};
	const openMentionFromButton = () => {
		const ta = taRef.current;
		if (!ta) return;
		ta.focus();
		const caret = ta.selectionStart ?? ta.value.length;
		const before = ta.value.slice(0, caret);
		const after = ta.value.slice(caret);
		const insertion = `${before.length > 0 && !/\s/.test(before[before.length - 1] ?? "") ? " " : ""}@`;
		setValue(before + insertion + after);
		autoresize(ta);
		const newCaret = caret + insertion.length;
		requestAnimationFrame(() => {
			ta.setSelectionRange(newCaret, newCaret);
			detectMention(ta);
		});
	};
	const addMentionedTool = (tool) => {
		setMentionedTools((current) => current.find((existing) => existing.id === tool.id) ? current : [...current, tool]);
	};
	const addMentionedIssue = (issue) => {
		setIssues((current) => current.find((existing) => existing.id === issue.id) ? current : [...current, issue]);
	};
	const addMentionedChat = (chat) => {
		setMentionedChats((current) => current.find((existing) => existing.id === chat.id) ? current : [...current, chat]);
	};
	const onSelectMention = (item) => {
		const ta = taRef.current;
		if (!ta || !mentionState) return;
		const caret = ta.selectionStart ?? ta.value.length;
		setValue(ta.value.slice(0, mentionState.anchor) + ta.value.slice(caret));
		if (item.kind === "tool") addMentionedTool(item.tool);
		else if (item.kind === "issue") addMentionedIssue(item.issue);
		else addMentionedChat({
			id: item.chat.id,
			title: item.chat.title || "Untitled chat"
		});
		const restoreAt = mentionState.anchor;
		setMentionState(null);
		requestAnimationFrame(() => {
			ta.focus();
			ta.setSelectionRange(restoreAt, restoreAt);
			autoresize(ta);
		});
	};
	const removeTool = (id) => {
		setMentionedTools((current) => current.filter((tool) => tool.id !== id));
	};
	const removeMentionedChat = (id) => {
		setMentionedChats((current) => current.filter((chat) => chat.id !== id));
	};
	const trySend = () => {
		const trimmed = value.trim();
		if (!trimmed && attachments.length === 0 && issues.length === 0 && mentionedTools.length === 0 && mentionedChats.length === 0 || busy) return;
		const fallback = attachments.length > 0 ? "Review the attached files." : "";
		onSend(`${trimmed || fallback}${formatIssueReferences(issues)}${formatChatReferences(mentionedChats)}${formatToolReferences(mentionedTools)}`.trim(), attachments);
		setValue("");
		setAttachments([]);
		setAttachmentError(null);
		setIssues([]);
		setMentionedTools([]);
		setMentionedChats([]);
		setMentionState(null);
		requestAnimationFrame(() => autoresize(taRef.current));
	};
	const placeholder = pendingQuestion ? "Answer the question above…" : "Ask Produktive anything — type @ to add context";
	const removeIssue = (id) => {
		setIssues((current) => current.filter((issue) => issue.id !== id));
	};
	const handleFiles = async (files) => {
		if (!files || files.length === 0) return;
		const result = prepareChatAttachments(files, attachments.length);
		if (result.attachments.length > 0) setAttachments((current) => [...current, ...result.attachments]);
		setAttachmentError(result.errors[0] ?? null);
		if (fileRef.current) fileRef.current.value = "";
	};
	const removeAttachment = (id) => {
		setAttachments((current) => current.filter((file) => file.id !== id));
		setAttachmentError(null);
	};
	const handleKey = (event) => {
		if (mentionState !== null) return;
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			trySend();
		}
	};
	const canSend = (value.trim().length > 0 || attachments.length > 0 || issues.length > 0 || mentionedTools.length > 0 || mentionedChats.length > 0) && !busy;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "relative z-10 px-6 pb-3 pt-2",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: cn("mx-auto w-full max-w-[760px] overflow-hidden rounded-[10px] border bg-surface/80 transition-colors focus-within:bg-surface-2", pendingQuestion ? "border-accent/40 focus-within:border-accent/60" : "border-border-subtle focus-within:border-border"),
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					ref: fileRef,
					type: "file",
					multiple: true,
					className: "sr-only",
					onChange: (event) => void handleFiles(event.target.files)
				}),
				pendingQuestion ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "border-b border-border-subtle bg-surface/40 px-3.5 py-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-1 flex items-center gap-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-fg-faint",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								"aria-hidden": "true",
								children: "?"
							}), "Question"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "m-0 text-[13.5px] leading-snug text-fg",
							children: pendingQuestion.question
						}),
						pendingQuestion.options.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-2.5 flex flex-wrap gap-1.5",
							children: pendingQuestion.options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => pendingQuestion.onAnswer(option),
								disabled: busy,
								className: "inline-flex h-7 items-center rounded-[5px] border border-border-subtle bg-surface px-2 text-[12px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50",
								children: option
							}, option))
						}) : null
					]
				}) : null,
				attachments.length > 0 || issues.length > 0 || mentionedTools.length > 0 || mentionedChats.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "border-b border-border-subtle px-3 py-2",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap gap-1.5",
						children: [
							mentionedChats.map((chat) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "inline-flex max-w-full items-center gap-1.5 rounded-[5px] border border-border-subtle bg-surface px-2 py-1 text-[11px] text-fg-muted",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg-faint",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SparkleIcon, { size: 11 })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "max-w-[180px] truncate text-fg",
										children: chat.title
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										className: "text-fg-faint transition-colors hover:text-fg",
										onClick: () => removeMentionedChat(chat.id),
										"aria-label": `Remove ${chat.title}`,
										children: "×"
									})
								]
							}, chat.id)),
							mentionedTools.map((tool) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "inline-flex max-w-full items-center gap-1.5 rounded-[5px] border border-border-subtle bg-surface px-2 py-1 text-[11px] text-fg-muted",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-mono text-[10px] text-fg-faint",
										children: "@"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "max-w-[180px] truncate font-mono text-fg",
										children: prettyToolName(tool)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "text-fg-faint",
										children: ["· ", tool.server.name]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										className: "text-fg-faint transition-colors hover:text-fg",
										onClick: () => removeTool(tool.id),
										"aria-label": `Remove ${tool.displayName}`,
										children: "×"
									})
								]
							}, tool.id)),
							issues.map((issue) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "inline-flex max-w-full items-center gap-1.5 rounded-[5px] border border-border-subtle bg-surface px-2 py-1 text-[11px] text-fg-muted",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusIcon, { status: issue.status }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "max-w-[220px] truncate text-fg",
										children: issue.title
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										className: "text-fg-faint transition-colors hover:text-fg",
										onClick: () => removeIssue(issue.id),
										"aria-label": `Remove ${issue.title}`,
										children: "×"
									})
								]
							}, issue.id)),
							attachments.map((file) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "inline-flex max-w-full items-center gap-2 rounded-[5px] border border-border-subtle bg-surface px-2 py-1 font-mono text-[11px] text-fg-muted",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "max-w-[220px] truncate text-fg",
										children: file.file.name
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: formatBytes(file.file.size) }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										className: "text-fg-faint transition-colors hover:text-fg",
										onClick: () => removeAttachment(file.id),
										"aria-label": `Remove ${file.file.name}`,
										children: "×"
									})
								]
							}, file.id))
						]
					})
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
					ref: taRef,
					value,
					onChange: handleChange,
					onKeyDown: handleKey,
					onClick: (event) => detectMention(event.currentTarget),
					onKeyUp: (event) => {
						if ([
							"ArrowLeft",
							"ArrowRight",
							"ArrowUp",
							"ArrowDown",
							"Home",
							"End"
						].includes(event.key)) detectMention(event.currentTarget);
					},
					rows: 1,
					placeholder,
					className: "block min-h-[46px] w-full resize-none border-0 bg-transparent px-4 pb-1 pt-3.5 text-[14px] leading-[1.55] text-fg outline-none placeholder:text-fg-muted",
					style: { maxHeight: 240 }
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MentionPopup, {
					open: mentionState !== null,
					query: mentionState?.query ?? "",
					coords: mentionState?.coords ?? null,
					items: mentionItems,
					onSelect: onSelectMention,
					onClose: () => setMentionState(null)
				}),
				attachmentError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "border-t border-border-subtle px-3 py-2 text-[12px] text-danger",
					children: attachmentError
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-0.5 px-2 pb-2 pt-1",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ToolButton, {
							title: "Add context (@)",
							onClick: openMentionFromButton,
							disabled: busy,
							active: mentionState !== null,
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AtIcon, { size: 11 }), "Context"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ToolButton, {
							title: "Attach files",
							onClick: () => fileRef.current?.click(),
							disabled: busy,
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AttachIcon, { size: 11 }), "Attach"]
						}),
						onOpenChanges ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ToolButton, {
							title: "View changes",
							onClick: onOpenChanges,
							active: changesOpen,
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChangesIcon, { size: 11 }),
								"Changes",
								changesCount > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "ml-0.5 rounded-[4px] bg-surface-3 px-1 font-mono text-[10px] text-fg",
									children: changesCount
								}) : null
							]
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "flex-1" }),
						busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: onStop,
							"aria-label": "Stop generating",
							className: "grid size-8 place-items-center rounded-[8px] bg-surface-3 text-fg transition-colors hover:bg-surface-2",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StopIcon, {})
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: trySend,
							disabled: !canSend,
							"aria-label": "Send",
							className: "grid size-8 place-items-center rounded-[8px] bg-fg text-bg transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-fg-faint",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SendIcon, {})
						})
					]
				})
			]
		})
	});
}
function ToolButton({ children, title, onClick, disabled, active }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		title,
		onClick,
		disabled,
		className: cn("inline-flex h-6 items-center gap-1 rounded-[5px] px-1.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50", active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface hover:text-fg"),
		children
	});
}
//#endregion
//#region src/components/chat/chat-message.tsx
function ChatMessageItem({ message, onCopy, onRegenerate, onGood, actionState, onAnswerQuestion, pendingAnswer }) {
	const isUser = message.role === "user";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("group flex animate-fade-up", isUser ? "justify-end" : "justify-start"),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: cn("flex min-w-0 flex-col gap-1.5", isUser && "items-end"),
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex items-center gap-2 text-[12px] text-fg-faint",
					children: message.time ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: message.time }) : null
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: cn("max-w-full text-[14px] leading-[1.65] text-fg text-pretty", isUser && "max-w-110 rounded-md border border-border-subtle bg-surface/60 px-3 py-2", !isUser && "max-w-170"),
					children: message.typing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "inline-flex items-center gap-2 py-1 text-fg-muted",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-shimmer font-medium",
							children: "Thinking"
						})
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
						message.toolCalls?.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolCallList, {
							toolCalls: message.toolCalls,
							onAnswerQuestion,
							pendingAnswer: pendingAnswer ?? null
						}) : null,
						message.content,
						message.attachments?.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatAttachmentList, { attachments: message.attachments }) : null
					] })
				}),
				message.role === "assistant" && !message.typing && message.rawContent ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-0.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActionButton, {
							title: actionState === "copied" ? "Copied" : "Copy",
							onClick: onCopy,
							active: actionState === "copied",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CopyIcon, {})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActionButton, {
							title: "Regenerate",
							onClick: onRegenerate,
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshIcon, {})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActionButton, {
							title: actionState === "liked" ? "Marked good" : "Good response",
							onClick: onGood,
							active: actionState === "liked",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ThumbsUpIcon, {})
						})
					]
				}) : null
			]
		})
	});
}
function ToolCallList({ toolCalls, onAnswerQuestion, pendingAnswer }) {
	const askUserCalls = toolCalls.filter((tc) => tc.name === "ask_user");
	const groups = groupConsecutive(toolCalls.filter((tc) => tc.name !== "ask_user"));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [groups.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "mb-2 flex flex-wrap gap-1",
		children: groups.map((group, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolCallChip, { group }, `${group.name}-${index}`))
	}) : null, askUserCalls.map((call) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AskUserCard, {
		call,
		onAnswer: onAnswerQuestion,
		submittedAnswer: pendingAnswer
	}, call.id))] });
}
function groupConsecutive(toolCalls) {
	const groups = [];
	for (const call of toolCalls) {
		const last = groups[groups.length - 1];
		if (last && last.name === call.name) last.calls.push(call);
		else groups.push({
			name: call.name,
			calls: [call]
		});
	}
	return groups;
}
function ToolCallChip({ group }) {
	const count = group.calls.length;
	const errorCount = group.calls.filter((c) => isErrorResult(c.result)).length;
	const allErrored = errorCount > 0 && errorCount === count;
	const summary = aggregateSummary(group.calls);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: cn("inline-flex max-w-full items-center gap-1.5 rounded-[5px] border border-border-subtle bg-surface/60 py-[3px] pl-1.5 pr-2 text-[11px] leading-none", allErrored && "text-danger"),
		title: summary ?? group.name,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: cn("grid size-[11px] shrink-0 place-items-center", allErrored ? "text-danger" : "text-fg-faint"),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlayIcon, { size: 7 })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: cn("truncate font-mono", allErrored ? "text-danger" : "text-fg-muted"),
				children: group.name
			}),
			count > 1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: cn("font-mono text-[10px] tabular-nums", allErrored ? "text-danger/80" : "text-fg-faint"),
				children: ["×", count]
			}) : null,
			summary ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: cn("truncate", allErrored ? "text-danger/80" : "text-fg-faint"),
				children: summary
			}) : null
		]
	});
}
function aggregateSummary(calls) {
	if (calls.length === 1) return summarizeResult(calls[0].result);
	const errorCount = calls.filter((c) => isErrorResult(c.result)).length;
	if (errorCount === calls.length) return `${errorCount} errored`;
	if (errorCount > 0) return `${calls.length - errorCount} ok · ${errorCount} errored`;
	const summaries = calls.map((c) => summarizeResult(c.result)).filter((s) => s !== null);
	if (summaries.length === 0) return null;
	if (summaries.every((s) => s === summaries[0])) return summaries[0];
	const matches = summaries.map((s) => /^(\d+)\s+(.+)$/.exec(s));
	if (matches.every((m) => m !== null) && matches.every((m) => m[2] === matches[0][2])) return `${matches.reduce((sum, m) => sum + parseInt(m[1], 10), 0)} ${matches[0][2]}`;
	return "all done";
}
function AskUserCard({ call, submittedAnswer }) {
	if (!submittedAnswer) return null;
	const question = readAskUserQuestion(call);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
		className: "my-2 text-[13px] leading-snug text-fg-muted",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "mr-1.5 font-mono text-fg-faint",
			"aria-hidden": "true",
			children: "?"
		}), question]
	});
}
function readAskUserQuestion(call) {
	const args = parseAskUserPayload(call.arguments);
	return call.result?.question ?? args.question ?? "";
}
function readAskUserOptions(call) {
	const args = parseAskUserPayload(call.arguments);
	const result = call.result;
	if (result?.options && result.options.length > 0) return result.options;
	return args.options ?? [];
}
function parseAskUserPayload(raw) {
	try {
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object") return parsed;
	} catch {}
	return {};
}
function isErrorResult(result) {
	return typeof result === "object" && result !== null && "error" in result;
}
function summarizeResult(result) {
	if (result === void 0) return "Pending";
	if (result === null) return null;
	if (typeof result === "object") {
		const obj = result;
		if ("error" in obj) {
			const error = obj.error;
			return typeof error === "string" ? error : "Error";
		}
		for (const [key, value] of Object.entries(obj)) if (Array.isArray(value)) {
			const noun = key.replace(/_/g, " ");
			return `${value.length} ${noun}`;
		}
		if (Array.isArray(result)) return `${result.length} items`;
		return "Done";
	}
	return null;
}
function ChatAttachmentList({ attachments }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "mt-2 divide-y divide-border-subtle/60 overflow-hidden rounded-md border border-border-subtle",
		children: attachments.map((file) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
			href: file.url,
			target: "_blank",
			rel: "noreferrer",
			className: "block bg-bg",
			children: isImageAttachment(file) ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", {
				className: "m-0",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: file.url,
					alt: file.name,
					loading: "lazy",
					className: "max-h-[360px] w-full object-contain"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figcaption", {
					className: "grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-border-subtle/60 px-2.5 py-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "truncate font-mono text-[10px] text-fg-muted",
						children: file.name
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-mono text-[10px] text-fg-faint",
						children: formatBytes(file.size)
					})]
				})]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2.5 py-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "m-0 truncate font-mono text-[11px] leading-tight text-fg",
						children: file.name
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "m-0 mt-1 truncate font-mono text-[10px] leading-tight text-fg-faint",
						children: file.type || "application/octet-stream"
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-mono text-[10px] text-fg-muted",
					children: formatBytes(file.size)
				})]
			})
		}, file.id))
	});
}
function isImageAttachment(file) {
	return file.type.startsWith("image/");
}
function ActionButton({ children, title, onClick, active }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		title,
		onClick,
		className: cn("grid size-6 place-items-center rounded-[5px] transition-colors hover:text-fg focus-visible:text-fg focus-visible:outline-none", active ? "text-fg" : "text-fg-faint"),
		children
	});
}
//#endregion
//#region src/lib/chat-history.tsx
var greetingForNow = () => {
	const hour = (/* @__PURE__ */ new Date()).getHours();
	if (hour < 5) return "Good evening";
	if (hour < 12) return "Good morning";
	if (hour < 18) return "Good afternoon";
	return "Good evening";
};
var firstName = (full) => {
	if (!full) return null;
	return full.trim().split(/\s+/)[0] || null;
};
//#endregion
export { readAskUserQuestion as a, readAskUserOptions as i, greetingForNow as n, ChatComposer as o, ChatMessageItem as r, firstName as t };

//# sourceMappingURL=chat-history-DlK4S5DV.js.map