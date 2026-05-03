import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { c as useRouterState, g as useNavigate } from "./initial-BUIQ08st.js";
import { v as toast } from "./initial-BjZJRI-E.js";
import { En as streamChatMessage, Et as createChat, Rn as uploadChatAttachment, St as useSession, Vn as cn, h as parseMessageWithAttachments, qt as getChat, u as buildMessageWithAttachments } from "./initial-BOT0Y-sv.js";
import { A as CheckIcon, N as ExpandIcon, O as CaretIcon, T as ChatMarkdown, W as SparkleIcon, et as Popover, nt as PopoverTrigger, tt as PopoverContent, z as PlusIcon } from "./initial-BWSisseh.js";
import { a as readAskUserQuestion, i as readAskUserOptions, o as ChatComposer, r as ChatMessageItem, t as firstName } from "./chat-history-DlK4S5DV.js";
import { t as useChats } from "./use-chats-CAdksDfN.js";
//#region src/components/chat/chat-widget.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
var WIDGET_CHAT_ID_KEY = "produktive:widget-chat-id";
var MODEL_STORAGE_KEY = "produktive:chat-model";
function ChatWidget() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const isChatRoute = pathname === "/chat" || pathname.startsWith("/chat/");
	const navigate = useNavigate();
	const userName = useSession().data?.user?.name ?? null;
	const { chats, prependChat, refresh: refreshChats } = useChats();
	const [open, setOpen] = (0, import_react.useState)(false);
	const [chatId, setChatId] = (0, import_react.useState)(null);
	const [messages, setMessages] = (0, import_react.useState)([]);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)(null);
	const [pickerOpen, setPickerOpen] = (0, import_react.useState)(false);
	const stopRef = (0, import_react.useRef)(false);
	const listRef = (0, import_react.useRef)(null);
	const panelRef = (0, import_react.useRef)(null);
	const bubbleRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		if (typeof window === "undefined") return;
		const stored = window.localStorage.getItem(WIDGET_CHAT_ID_KEY);
		if (!stored) return;
		let cancelled = false;
		(async () => {
			try {
				const response = await getChat(stored);
				if (cancelled) return;
				setChatId(stored);
				setMessages(response.messages.map(recordToMessage));
			} catch {
				if (cancelled) return;
				window.localStorage.removeItem(WIDGET_CHAT_ID_KEY);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		const el = listRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messages, open]);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		const onPointerDown = (event) => {
			const target = event.target;
			if (panelRef.current?.contains(target) || bubbleRef.current?.contains(target)) return;
			const el = event.target;
			if (el?.closest("[data-radix-popper-content-wrapper]")) return;
			if (el?.closest("[role='dialog']")) return;
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
	const renderedMessages = (0, import_react.useMemo)(() => collapseToolMessages(messages), [messages]);
	const handleSend = async (text, attachmentDrafts = []) => {
		setError(null);
		stopRef.current = false;
		setBusy(true);
		let activeId = chatId;
		try {
			if (!activeId) {
				const created = await createChat();
				activeId = created.chat.id;
				setChatId(activeId);
				prependChat(created.chat);
				if (typeof window !== "undefined") window.localStorage.setItem(WIDGET_CHAT_ID_KEY, activeId);
			}
			const messageText = buildOutgoingMessage(text, await uploadAttachments(activeId, attachmentDrafts));
			const selectedModel = typeof window !== "undefined" ? window.localStorage.getItem(MODEL_STORAGE_KEY) : null;
			let streamedText = "";
			await streamChatMessage(activeId, messageText, (event) => {
				if (stopRef.current) return;
				if (event.type === "user") {
					setMessages((prev) => [
						...prev,
						recordToMessage(event.message),
						{
							role: "assistant",
							typing: true
						}
					]);
					return;
				}
				if (event.type === "delta") {
					streamedText += event.content;
					setMessages((prev) => {
						const next = [...prev];
						if (next[next.length - 1]?.role === "assistant") next[next.length - 1] = {
							role: "assistant",
							content: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatMarkdown, { content: streamedText })
						};
						return next;
					});
					return;
				}
				if (event.type === "done") {
					setMessages((prev) => {
						const withoutTyping = prev.filter((m) => !m.typing);
						return [...withoutTyping[withoutTyping.length - 1]?.role === "assistant" ? withoutTyping.slice(0, -1) : withoutTyping, ...event.messages.filter((record) => record.role === "assistant").map(recordToMessage)];
					});
					refreshChats();
					return;
				}
				if (event.type === "error") throw new Error(event.error);
			}, selectedModel ? { model: selectedModel } : void 0);
		} catch (sendError) {
			setError(sendError instanceof Error ? sendError.message : "Failed to send");
			setMessages((prev) => prev.filter((m) => !m.typing));
		} finally {
			setBusy(false);
		}
	};
	const handleStop = () => {
		stopRef.current = true;
	};
	const handleNewChat = () => {
		if (typeof window !== "undefined") window.localStorage.removeItem(WIDGET_CHAT_ID_KEY);
		setChatId(null);
		setMessages([]);
		setError(null);
		toast.message("New chat started");
	};
	const handleOpenInFullChat = () => {
		setOpen(false);
		if (chatId) navigate({
			to: "/chat/$chatId",
			params: { chatId }
		});
		else navigate({ to: "/chat" });
	};
	const switchChat = async (id) => {
		setPickerOpen(false);
		if (busy || id === chatId) return;
		try {
			const response = await getChat(id);
			setChatId(id);
			setMessages(response.messages.map(recordToMessage));
			setError(null);
			if (typeof window !== "undefined") window.localStorage.setItem(WIDGET_CHAT_ID_KEY, id);
		} catch (loadError) {
			const message = loadError instanceof Error ? loadError.message : "Failed to load chat";
			setError(message);
			toast.error(message);
		}
	};
	const currentChat = chatId ? chats.find((c) => c.id === chatId) ?? null : null;
	const headerLabel = currentChat ? displayChatTitle(currentChat) : "Assistant";
	const pendingQuestion = (0, import_react.useMemo)(() => findPendingQuestion(renderedMessages, (answer) => void handleSend(answer)), [renderedMessages]);
	if (isChatRoute) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: !open ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		ref: bubbleRef,
		type: "button",
		onClick: () => setOpen(true),
		"aria-label": "Open AI assistant",
		className: "fixed bottom-4 right-4 z-40 hidden size-11 place-items-center rounded-full border border-border bg-surface text-fg-muted shadow-md transition-colors hover:text-fg md:grid",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SparkleIcon, { size: 16 })
	}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		ref: panelRef,
		role: "dialog",
		"aria-label": "AI assistant",
		className: "fixed bottom-4 right-4 z-40 hidden h-[600px] max-h-[calc(100vh-2rem)] w-[420px] flex-col overflow-hidden rounded-lg border border-border-subtle bg-bg shadow-2xl animate-fade-up md:flex",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, {
					open: pickerOpen,
					onOpenChange: setPickerOpen,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
						asChild: true,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "truncate text-[13px] font-medium text-fg",
								children: headerLabel
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "shrink-0 text-fg-faint",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaretIcon, { size: 10 })
							})]
						})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PopoverContent, {
						align: "start",
						sideOffset: 6,
						className: "w-72 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatPickerItem, {
							onClick: () => {
								setPickerOpen(false);
								handleNewChat();
							},
							leading: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlusIcon, { size: 11 }),
							children: "New chat"
						}), chats.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "my-1 h-px bg-border-subtle" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "max-h-[280px] overflow-y-auto",
							children: chats.slice(0, 12).map((chat) => {
								return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatPickerItem, {
									onClick: () => void switchChat(chat.id),
									trailing: chat.id === chatId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CheckIcon, { size: 11 })
									}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-mono text-[10.5px] tabular-nums text-fg-faint",
										children: formatRelative(chat.updatedAt)
									}),
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "truncate",
										children: displayChatTitle(chat)
									})
								}, chat.id);
							})
						})] }) : null]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-0.5",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeaderButton, {
							title: "New chat",
							onClick: handleNewChat,
							disabled: busy,
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlusIcon, { size: 13 })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeaderButton, {
							title: "Open in full chat",
							onClick: handleOpenInFullChat,
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExpandIcon, { size: 13 })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeaderButton, {
							title: "Close",
							onClick: () => setOpen(false),
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CloseGlyph, {})
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				ref: listRef,
				className: "flex-1 overflow-y-auto px-3 py-3",
				children: renderedMessages.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WidgetEmptyState, { name: firstName(userName) ?? null }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex flex-col gap-4",
					children: renderedMessages.map((message, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatMessageItem, { message }, message.id ?? index))
				})
			}),
			error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "shrink-0 border-t border-border-subtle bg-danger/[0.08] px-3 py-2 text-[11.5px] text-danger",
				children: error
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "shrink-0 border-t border-border-subtle",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatComposer, {
					busy,
					onSend: (text, attachments) => void handleSend(text, attachments),
					onStop: handleStop,
					pendingQuestion
				})
			})
		]
	}) });
}
function HeaderButton({ title, onClick, disabled, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		title,
		onClick,
		disabled,
		className: cn("grid size-7 place-items-center rounded-md text-fg-faint transition-colors hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"),
		children
	});
}
function CloseGlyph() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		width: "12",
		height: "12",
		viewBox: "0 0 14 14",
		fill: "none",
		"aria-hidden": true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M3 3l8 8M11 3l-8 8",
			stroke: "currentColor",
			strokeWidth: "1.5",
			strokeLinecap: "round"
		})
	});
}
function WidgetEmptyState({ name }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-full flex-col items-center justify-center px-6 text-center",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mb-3 grid size-10 place-items-center rounded-[10px] border border-border-subtle bg-surface/40 text-fg-muted",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SparkleIcon, { size: 16 })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "m-0 text-[15px] font-medium tracking-[-0.01em] text-fg",
				children: name ? `Hi ${name},` : "Hi there,"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "m-0 mt-0.5 text-[12.5px] text-fg-muted",
				children: "what can I help with?"
			})
		]
	});
}
async function uploadAttachments(chatId, drafts) {
	return Promise.all(drafts.map(async ({ file }) => {
		const uploaded = await uploadChatAttachment(chatId, file);
		return {
			id: uploaded.id,
			name: uploaded.name,
			type: uploaded.contentType,
			size: uploaded.size,
			key: uploaded.key,
			url: uploaded.url
		};
	}));
}
function buildOutgoingMessage(text, attachments) {
	if (attachments.length === 0) return text.trim();
	return buildMessageWithAttachments(text.trim() || "Review the attached files.", attachments);
}
function recordToMessage(record) {
	const parsed = parseMessageWithAttachments(record.content);
	const content = record.role === "assistant" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatMarkdown, { content: parsed.text }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "m-0 whitespace-pre-wrap",
		children: parsed.text
	});
	return {
		id: record.id,
		role: record.role,
		content,
		rawContent: record.role === "user" ? record.content : parsed.text,
		attachments: parsed.attachments,
		toolCalls: record.toolCalls ?? []
	};
}
function collapseToolMessages(messages) {
	const out = [];
	let pending = [];
	const flush = () => {
		if (pending.length === 0) return;
		out.push({
			role: "assistant",
			toolCalls: pending
		});
		pending = [];
	};
	for (const message of messages) {
		if (message.role === "assistant" && !message.typing && !message.rawContent && (message.toolCalls?.length ?? 0) > 0) {
			pending.push(...message.toolCalls ?? []);
			continue;
		}
		if (message.role === "assistant" && pending.length > 0) {
			out.push({
				...message,
				toolCalls: [...pending, ...message.toolCalls ?? []]
			});
			pending = [];
			continue;
		}
		if (message.role === "user") flush();
		out.push(message);
	}
	flush();
	return out;
}
function findPendingQuestion(messages, onAnswer) {
	if (messages.length === 0) return null;
	const last = messages[messages.length - 1];
	if (last.role !== "assistant" || last.typing) return null;
	const askUser = last.toolCalls?.find((tc) => tc.name === "ask_user");
	if (!askUser) return null;
	return {
		question: readAskUserQuestion(askUser),
		options: readAskUserOptions(askUser),
		onAnswer
	};
}
function ChatPickerItem({ children, onClick, leading, trailing }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick,
		className: "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] text-fg transition-colors hover:bg-surface-2",
		children: [
			leading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "shrink-0 text-fg-faint",
				children: leading
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "min-w-0 flex-1 truncate",
				children
			}),
			trailing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "shrink-0",
				children: trailing
			}) : null
		]
	});
}
function displayChatTitle(chat) {
	return parseMessageWithAttachments(chat.title).text.trim() || "Attached files";
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
export { ChatWidget };

//# sourceMappingURL=chat-widget-BwJp7TJH.js.map