const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/react-Ca2ECVb6.js","assets/rolldown-runtime-B_qr_iJn.js","assets/initial-DK83QUcz.js","assets/initial-C0EVeHlk.js","assets/initial-B5hxL7EP.js","assets/initial-BdtMOVmo.js","assets/initial-I0bxgxwz.js","assets/initial-BjZJRI-E.js","assets/initial-DwS9pZ8K.js","assets/initial-BoalMNbc.js","assets/initial-DqBeajiO.js","assets/initial-CMb3YuhF.js","assets/initial-D1YyMmpo.js","assets/initial-BO0AADDh.js","assets/initial-Cw7QFI8O.js","assets/initial-CSIB8P1o.js","assets/initial-BQUddyIu.js"])))=>i.map(i=>d[i]);
import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { t as __vitePreload } from "./initial-DK83QUcz.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { g as useNavigate, h as Link, n as queryOptions, r as useQuery } from "./initial-BUIQ08st.js";
import { v as toast } from "./initial-BjZJRI-E.js";
import { $t as listAiModels, En as streamChatMessage, Et as createChat, Rn as uploadChatAttachment, St as useSession, Vn as cn, at as queryKeys, et as useUserPreferences, h as parseMessageWithAttachments, qt as getChat, rt as useRegisterTab, u as buildMessageWithAttachments } from "./initial-BOT0Y-sv.js";
import { T as ChatMarkdown, W as SparkleIcon } from "./initial-BWSisseh.js";
import { a as readAskUserQuestion, i as readAskUserOptions, n as greetingForNow, o as ChatComposer, r as ChatMessageItem, t as firstName } from "./chat-history-DlK4S5DV.js";
import { t as ChatShare } from "./chat-share-wPNnS4pt.js";
import { t as Skeleton } from "./skeleton-bPEvTUQb.js";
//#region src/components/chat/chat-empty-state.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
var suggestions = [
	{
		text: "Create an issue",
		hint: "for the dashboard redesign"
	},
	{
		text: "Find issues",
		hint: "assigned to me this week"
	},
	{
		text: "Summarize",
		hint: "what's in progress right now"
	},
	{
		text: "Triage inbox",
		hint: "and propose priorities"
	}
];
function ChatEmptyState({ greeting, name, showSuggestions, onPickSuggestion }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "relative z-10 flex flex-1 items-center justify-center px-6 py-10",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-[560px] text-center animate-fade-up",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mx-auto mb-5 grid size-12 place-items-center rounded-[10px] border border-border-subtle bg-surface/40 text-fg-muted",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SparkleIcon, { size: 18 })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", {
					className: "m-0 text-[24px] font-medium tracking-[-0.02em] text-fg text-balance",
					children: [greeting, name ? `, ${name}` : ""]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mx-0 mb-7 mt-1.5 text-[13px] text-fg-muted",
					children: "What do you want to work on?"
				}),
				showSuggestions ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mx-auto grid grid-cols-1 gap-1.5 sm:grid-cols-2",
					children: suggestions.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => onPickSuggestion(`${s.text} ${s.hint}`),
						className: "flex flex-col gap-0.5 rounded-md border border-border-subtle/60 bg-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-surface/50",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[13px] leading-tight text-fg",
							children: s.text
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[11.5px] leading-snug text-fg-muted",
							children: s.hint
						})]
					}, s.text))
				}) : null
			]
		})
	});
}
//#endregion
//#region src/components/chat/chat-skeleton.tsx
function ChatSkeleton() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "relative z-10 flex flex-1 flex-col overflow-hidden px-6 pb-4 pt-8",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto flex w-full max-w-[760px] flex-col gap-6 animate-fade-in",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkeletonUserMessage, {
					widthClass: "w-2/5",
					lines: 1
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkeletonAssistantMessage, { widths: [
					"w-11/12",
					"w-10/12",
					"w-7/12"
				] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkeletonUserMessage, {
					widthClass: "w-1/3",
					lines: 1
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkeletonAssistantMessage, { widths: [
					"w-9/12",
					"w-11/12",
					"w-6/12",
					"w-8/12"
				] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkeletonUserMessage, {
					widthClass: "w-1/4",
					lines: 1
				})
			]
		})
	});
}
function SkeletonUserMessage({ widthClass, lines }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex justify-end",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: `flex max-w-110 flex-col gap-2 rounded-lg border border-border bg-surface/80 px-3.5 py-2.5 ${widthClass}`,
			children: Array.from({ length: lines }).map((_, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-3 w-full bg-surface-3" }, index))
		})
	});
}
function SkeletonAssistantMessage({ widths }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex flex-col gap-2 max-w-170",
		children: widths.map((widthClass, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: `h-3 ${widthClass} bg-surface-2` }, index))
	});
}
//#endregion
//#region src/lib/queries/ai-models.ts
var aiModelsQueryOptions = () => queryOptions({
	queryKey: queryKeys.ai.models,
	queryFn: listAiModels,
	staleTime: 5 * 6e4
});
var useAiModelsQuery = () => useQuery(aiModelsQueryOptions());
//#endregion
//#region src/lib/use-ai-models.ts
var useAiModels = () => {
	const query = useAiModelsQuery();
	return {
		models: query.data?.models ?? [],
		defaultId: query.data?.defaultId ?? null,
		isLoading: query.isPending,
		error: query.error
	};
};
//#endregion
//#region src/components/chat/chat-pane.tsx
var LazyMultiFileDiff = (0, import_react.lazy)(() => __vitePreload(() => import("./react-Ca2ECVb6.js").then((mod) => ({ default: mod.MultiFileDiff })), __vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16])));
var MODEL_STORAGE_KEY = "produktive:chat-model";
function ChatPane({ chatId }) {
	const navigate = useNavigate();
	const session = useSession();
	const userName = session.data?.user?.name ?? "there";
	const [chatTitle, setChatTitle] = (0, import_react.useState)("New conversation");
	const [chatCreatedById, setChatCreatedById] = (0, import_react.useState)(null);
	const currentUserId = session.data?.user?.id ?? null;
	const isCreator = Boolean(chatId) && currentUserId !== null && chatCreatedById === currentUserId;
	const { tabsEnabled } = useUserPreferences();
	useRegisterTab({
		tabType: "chat",
		targetId: chatId ?? "",
		title: chatId ? chatTitle : null,
		enabled: tabsEnabled && Boolean(chatId)
	});
	const [messages, setMessages] = (0, import_react.useState)([]);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [isLoadingChat, setIsLoadingChat] = (0, import_react.useState)(Boolean(chatId));
	const [error, setError] = (0, import_react.useState)(null);
	const [copiedMessageId, setCopiedMessageId] = (0, import_react.useState)(null);
	const [changesOpen, setChangesOpen] = (0, import_react.useState)(false);
	const [likedMessageIds, setLikedMessageIds] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
	const convoRef = (0, import_react.useRef)(null);
	const activeChatIdRef = (0, import_react.useRef)(null);
	const skipLoadChatIdRef = (0, import_react.useRef)(null);
	const stopRef = (0, import_react.useRef)(false);
	const { models: availableModels, defaultId: defaultModelId } = useAiModels();
	const [selectedModel, setSelectedModel] = (0, import_react.useState)(() => {
		if (typeof window === "undefined") return null;
		return window.localStorage.getItem(MODEL_STORAGE_KEY);
	});
	(0, import_react.useEffect)(() => {
		if (availableModels.length === 0) return;
		const current = selectedModel ? availableModels.find((entry) => entry.id === selectedModel) : null;
		if (Boolean(current)) return;
		setSelectedModel(defaultModelId);
		if (typeof window !== "undefined" && defaultModelId) window.localStorage.setItem(MODEL_STORAGE_KEY, defaultModelId);
	}, [
		availableModels,
		defaultModelId,
		selectedModel
	]);
	(0, import_react.useEffect)(() => {
		if (!chatId) {
			activeChatIdRef.current = null;
			skipLoadChatIdRef.current = null;
			setChatTitle("New conversation");
			setChatCreatedById(null);
			setMessages([]);
			setIsLoadingChat(false);
			return;
		}
		if (skipLoadChatIdRef.current === chatId) {
			skipLoadChatIdRef.current = null;
			activeChatIdRef.current = chatId;
			setIsLoadingChat(false);
			return;
		}
		setIsLoadingChat(true);
		let isMounted = true;
		(async () => {
			try {
				const response = await getChat(chatId);
				if (!isMounted) return;
				activeChatIdRef.current = chatId;
				setChatTitle(response.chat.title);
				setChatCreatedById(response.chat.createdById ?? null);
				setMessages(response.messages.map(recordToMessage));
			} catch (loadError) {
				if (!isMounted) return;
				const message = loadError instanceof Error ? loadError.message : "Failed to load chat";
				setError(message);
				toast.error(message);
			} finally {
				if (isMounted) setIsLoadingChat(false);
			}
		})();
		return () => {
			isMounted = false;
		};
	}, [chatId]);
	(0, import_react.useEffect)(() => {
		if (convoRef.current) convoRef.current.scrollTop = convoRef.current.scrollHeight;
	}, [messages]);
	const handleSend = async (text, attachmentDrafts = []) => {
		setError(null);
		stopRef.current = false;
		setBusy(true);
		let activeId = chatId;
		let createdChatId = null;
		let streamedUserId = null;
		const previousMessageCount = messages.length;
		try {
			if (!activeId) {
				const created = await createChat();
				activeId = created.chat.id;
				createdChatId = created.chat.id;
				activeChatIdRef.current = created.chat.id;
				skipLoadChatIdRef.current = created.chat.id;
				setChatTitle(created.chat.title);
				setChatCreatedById(created.chat.createdById ?? null);
				await navigate({
					to: "/chat/$chatId",
					params: { chatId: created.chat.id },
					replace: true
				});
			}
			const messageText = buildOutgoingMessage(text, await uploadAttachments(activeId, attachmentDrafts));
			let streamedText = "";
			let receivedDone = false;
			await streamChatMessage(activeId, messageText, (event) => {
				if (stopRef.current) return;
				if (event.type === "user") {
					streamedUserId = event.message.id;
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
					receivedDone = true;
					setMessages((prev) => {
						const withoutLoading = prev.filter((message) => !message.typing);
						return [...withoutLoading[withoutLoading.length - 1]?.role === "assistant" ? withoutLoading.slice(0, -1) : withoutLoading, ...event.messages.filter((record) => record.role === "assistant").map(recordToMessage)];
					});
					return;
				}
				if (event.type === "error") {
					if (event.messages?.length) {
						setMessages(event.messages.map(recordToMessage));
						if (didRecoverAssistantResponse(event.messages, streamedUserId, previousMessageCount)) {
							receivedDone = true;
							return;
						}
					}
					throw new Error(event.error);
				}
			}, selectedModel ? { model: selectedModel } : void 0);
			if (!receivedDone && stopRef.current) setMessages((prev) => prev.filter((m) => !m.typing));
			if (chatTitle === "New conversation") setChatTitle(truncateForTab(parseMessageWithAttachments(messageText).text));
			if (createdChatId) skipLoadChatIdRef.current = null;
		} catch (sendError) {
			const recoverId = activeId ?? createdChatId;
			if (recoverId) try {
				const response = await getChat(recoverId);
				setChatTitle(response.chat.title);
				setChatCreatedById(response.chat.createdById ?? null);
				setMessages(response.messages.map(recordToMessage));
				if (createdChatId) await navigate({
					to: "/chat/$chatId",
					params: { chatId: createdChatId },
					replace: true
				});
				if (didRecoverAssistantResponse(response.messages, streamedUserId, previousMessageCount)) {
					setError(null);
					return;
				}
			} catch {}
			const message = sendError instanceof Error ? sendError.message : "Failed to send message";
			setError(message);
			toast.error(message);
			setMessages((prev) => prev.filter((m) => !m.typing));
		} finally {
			setBusy(false);
		}
	};
	const handleCopy = async (message) => {
		const text = message.rawContent?.trim();
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
			toast.success("Copied response");
			setCopiedMessageId(message.id ?? null);
			window.setTimeout(() => {
				setCopiedMessageId((current) => current === message.id ? null : current);
			}, 1400);
		} catch {
			toast.error("Failed to copy message");
			setError("Failed to copy message");
		}
	};
	const handleRegenerate = (index) => {
		if (busy) return;
		const previousUser = [...messages].slice(0, index).reverse().find((message) => message.role === "user" && message.rawContent);
		if (!previousUser?.rawContent) {
			toast.error("No user message found to regenerate from");
			setError("No user message found to regenerate from");
			return;
		}
		setMessages((current) => current.filter((_, messageIndex) => messageIndex !== index));
		toast.message("Regenerating response");
		handleSend(previousUser.rawContent);
	};
	const handleGoodResponse = (message) => {
		if (!message.id) return;
		setLikedMessageIds((current) => {
			const next = new Set(current);
			if (next.has(message.id)) {
				next.delete(message.id);
				toast.message("Feedback removed");
			} else {
				next.add(message.id);
				toast.success("Marked as good response");
			}
			return next;
		});
	};
	const handleStop = () => {
		stopRef.current = true;
	};
	const isEmpty = messages.length === 0;
	const greeting = (0, import_react.useMemo)(() => greetingForNow(), []);
	const changes = (0, import_react.useMemo)(() => chatChangesFromMessages(messages), [messages]);
	const renderedMessages = (0, import_react.useMemo)(() => collapseToolMessages(messages), [messages]);
	const pendingQuestion = (0, import_react.useMemo)(() => findPendingQuestion(renderedMessages, (answer) => void handleSend(answer)), [renderedMessages]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-screen min-w-0 flex-1 overflow-hidden bg-bg md:h-full",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "relative flex min-w-0 flex-1 flex-col overflow-hidden",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "relative z-10 flex min-h-[58px] items-center gap-3 border-b border-border-subtle bg-bg/86 px-6 py-3 backdrop-blur",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex min-w-0 flex-1 items-center gap-3 text-[13px] text-fg-muted",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-fg-muted",
								children: "Chat"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-fg-muted",
								children: "/"
							}),
							isLoadingChat ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-3.5 w-40" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "truncate font-medium text-fg",
								children: chatTitle
							})
						]
					}), isCreator && chatId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatShare, {
						chatId,
						trigger: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							"aria-label": "Share chat",
							className: "h-7 shrink-0 rounded-md border border-border-subtle px-2.5 text-[12px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg",
							children: "Share"
						})
					}) : null]
				}),
				isLoadingChat ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatSkeleton, {}) : isEmpty ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatEmptyState, {
					greeting,
					name: firstName(userName) ?? null,
					showSuggestions: true,
					onPickSuggestion: (prompt) => void handleSend(prompt)
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					ref: convoRef,
					className: "relative z-10 flex flex-1 flex-col overflow-y-auto px-6 pb-4 pt-8",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mx-auto flex w-full max-w-[760px] flex-col gap-6",
						children: renderedMessages.map((message, index) => {
							return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatMessageItem, {
								message,
								onCopy: () => void handleCopy(message),
								onRegenerate: () => handleRegenerate(index),
								onGood: () => handleGoodResponse(message),
								onAnswerQuestion: (answer) => void handleSend(answer),
								pendingAnswer: renderedMessages.slice(index + 1).find((m) => m.role === "user")?.rawContent ?? null,
								actionState: copiedMessageId === message.id ? "copied" : message.id && likedMessageIds.has(message.id) ? "liked" : null
							}, message.id ?? index);
						})
					})
				}),
				error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatErrorNotice, {
					message: error,
					onDismiss: () => setError(null)
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatComposer, {
					busy,
					onSend: (text, attachments) => void handleSend(text, attachments),
					onStop: handleStop,
					onOpenChanges: () => setChangesOpen((current) => !current),
					changesCount: changes.length,
					changesOpen,
					pendingQuestion
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatChangesPanel, {
			open: changesOpen,
			changes,
			onClose: () => setChangesOpen(false)
		})]
	});
}
function ChatErrorNotice({ message, onDismiss }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "relative z-20 px-6 pb-1",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto flex min-h-9 w-full max-w-[760px] items-center justify-between gap-3 rounded-md border border-danger/25 bg-danger/[0.08] px-3 py-2 text-[12px] text-danger",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "min-w-0 truncate",
				children: message
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: "shrink-0 text-[11px] text-fg-muted transition-colors hover:text-fg",
				onClick: onDismiss,
				children: "Dismiss"
			})]
		})
	});
}
function ChatChangesPanel({ open, changes, onClose }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("aside", {
		className: cn("flex h-full shrink-0 flex-col overflow-hidden border-l border-border-subtle bg-bg transition-[width] duration-300 ease-out", open ? "w-[392px]" : "w-0 border-l-0"),
		"aria-hidden": !open,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: cn("flex h-full w-[392px] min-w-0 flex-col transition-[opacity,transform] duration-300 ease-out", open ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-3 opacity-0"),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex min-w-0 items-center gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-faint",
						children: "Changes"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-mono text-[11px] tabular-nums text-fg-faint",
						children: changes.length
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: onClose,
					className: "grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface hover:text-fg",
					"aria-label": "Close changes panel",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
						width: "14",
						height: "14",
						viewBox: "0 0 14 14",
						fill: "none",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
							d: "M3 3l8 8M11 3l-8 8",
							stroke: "currentColor",
							strokeWidth: "1.5",
							strokeLinecap: "round"
						})
					})
				})]
			}), changes.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-1 flex-col items-center px-6 py-16 text-center",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mb-4 grid size-10 place-items-center rounded-[10px] border border-border-subtle bg-surface/40 text-fg-muted",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
						width: "14",
						height: "14",
						viewBox: "0 0 14 14",
						fill: "none",
						"aria-hidden": true,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
							d: "M3 7h8M7 3v8",
							stroke: "currentColor",
							strokeWidth: "1.5",
							strokeLinecap: "round"
						})
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "max-w-60 text-[13px] leading-relaxed text-fg-muted",
					children: "No issue changes have been made from this chat yet."
				})]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex-1 overflow-y-auto",
				children: changes.map((change, idx) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
					className: cn("border-b border-border-subtle/60", idx === 0 && "border-t border-border-subtle/60"),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-surface/50",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex min-w-0 flex-1 items-center gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint",
									children: change.action
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "min-w-0 truncate text-[13px] text-fg",
									children: change.title
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "shrink-0 font-mono text-[10.5px] tabular-nums text-fg-faint",
									children: change.fields.length
								})
							]
						}), change.issueId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/issues/$issueId",
							params: { issueId: change.issueId },
							className: "shrink-0 text-[11px] text-fg-muted transition-colors hover:text-fg",
							onClick: onClose,
							children: "Open →"
						}) : null]
					}), change.fields.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid border-t border-border-subtle/60 bg-surface/20",
						children: change.fields.map((field) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatChangeField, { field }, field.name))
					}) : null]
				}, change.id))
			})]
		})
	});
}
function ChatChangeField({ field }) {
	const name = `${fieldLabel(field.name)}.md`;
	const oldFile = {
		name,
		contents: diffFileValue(field.before),
		lang: "markdown"
	};
	const newFile = {
		name,
		contents: diffFileValue(field.after),
		lang: "markdown"
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "border-b border-border-subtle bg-bg last:border-b-0",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Suspense, {
			fallback: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DiffLoadingState, { name }),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LazyMultiFileDiff, {
				oldFile,
				newFile,
				disableWorkerPool: true,
				options: {
					theme: "pierre-dark",
					themeType: "dark",
					diffStyle: "unified",
					diffIndicators: "bars",
					disableLineNumbers: true,
					hunkSeparators: "simple",
					lineDiffType: "word-alt",
					overflow: "wrap"
				},
				className: "produktive-diff"
			})
		})
	});
}
function DiffLoadingState({ name }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "border-b border-border-subtle bg-surface/20 px-3 py-2 font-mono text-[11px] text-fg-faint",
		children: name
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-1 p-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-3 w-3/4 rounded-full bg-surface" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-3 w-1/2 rounded-full bg-surface/70" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-3 w-2/3 rounded-full bg-surface/50" })
		]
	})] });
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
function didRecoverAssistantResponse(records, streamedUserId, previousMessageCount) {
	if (streamedUserId) {
		const userIndex = records.findIndex((record) => record.id === streamedUserId);
		return userIndex >= 0 && records.slice(userIndex + 1).some(isUsableAssistantRecord);
	}
	return records.length > previousMessageCount && records.slice(previousMessageCount).some(isUsableAssistantRecord);
}
function isUsableAssistantRecord(record) {
	if (record.role !== "assistant") return false;
	if (record.content.trim()) return true;
	return (record.toolCalls ?? []).some((toolCall) => toolCall.name === "ask_user" || toolCall.result !== void 0);
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
function chatChangesFromMessages(messages) {
	return messages.flatMap((message) => (message.toolCalls ?? []).filter((toolCall) => isChangeTool(toolCall.name)).map((toolCall) => toolCallToChange(toolCall)));
}
function isChangeTool(name) {
	return name === "create_issue" || name === "update_issue";
}
function toolCallToChange(toolCall) {
	const args = parsePayload(toolCall.arguments);
	const resultIssue = issueFromResult(toolCall.result);
	const resultChanges = changesFromResult(toolCall.result);
	const issueId = resultIssue?.id ?? stringField(args, "id");
	const title = toolCall.name === "create_issue" ? `Created ${resultIssue?.title ?? stringField(args, "title") ?? "issue"}` : `Updated ${resultIssue?.title ?? issueId ?? "issue"}`;
	return {
		id: toolCall.id,
		action: toolCall.name === "create_issue" ? "created" : "updated",
		title: title.replace(/^(Created|Updated)\s+/i, ""),
		issueId,
		fields: filterMeaningfulChanges(resultChanges ?? Object.entries(args).filter(([key]) => key !== "id").map(([name, value]) => ({
			name,
			after: value
		}))),
		result: toolCall.result
	};
}
function parsePayload(value) {
	try {
		const parsed = JSON.parse(value);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}
function issueFromResult(value) {
	if (!value || typeof value !== "object" || !("issue" in value)) return null;
	const issue = value.issue;
	if (!issue || typeof issue !== "object") return null;
	return issue;
}
function changesFromResult(value) {
	if (!value || typeof value !== "object" || !("changes" in value)) return null;
	const changes = value.changes;
	if (!Array.isArray(changes)) return null;
	return changes.filter((change) => Boolean(change) && typeof change === "object" && typeof change.field === "string" && "after" in change).map((change) => ({
		name: change.field,
		before: change.before,
		after: change.after
	}));
}
function stringField(value, key) {
	const field = value[key];
	return typeof field === "string" ? field : void 0;
}
function fieldLabel(field) {
	return {
		title: "Title",
		description: "Body",
		status: "Status",
		priority: "Priority",
		assigned_to_id: "Assignee",
		assignedToId: "Assignee"
	}[field] ?? field;
}
function diffFileValue(value) {
	if (isEmptyChangeValue(value)) return "";
	const text = typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value, null, 2);
	return text.endsWith("\n") ? text : `${text}\n`;
}
function filterMeaningfulChanges(fields) {
	return fields.filter((field) => {
		if (field.name === "id") return false;
		return normalizeChangeValue(field.before) !== normalizeChangeValue(field.after);
	});
}
function normalizeChangeValue(value) {
	if (isEmptyChangeValue(value)) return "";
	if (typeof value === "string") return value.trim();
	return JSON.stringify(value);
}
function isEmptyChangeValue(value) {
	return value === null || value === void 0 || value === "";
}
function truncateForTab(text, max = 48) {
	const normalized = text.trim() || "Attached files";
	return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}
function findPendingQuestion(messages, onAnswer) {
	if (messages.length === 0) return null;
	const last = messages[messages.length - 1];
	if (last.role !== "assistant") return null;
	if (last.typing) return null;
	const askUser = last.toolCalls?.find((tc) => tc.name === "ask_user");
	if (!askUser) return null;
	return {
		question: readAskUserQuestion(askUser),
		options: readAskUserOptions(askUser),
		onAnswer
	};
}
function collapseToolMessages(messages) {
	const out = [];
	let pendingToolCalls = [];
	const flushAsStandalone = () => {
		if (pendingToolCalls.length === 0) return;
		out.push({
			role: "assistant",
			toolCalls: pendingToolCalls
		});
		pendingToolCalls = [];
	};
	for (const message of messages) {
		if (message.role === "assistant" && !message.typing && !message.rawContent && (message.toolCalls?.length ?? 0) > 0) {
			pendingToolCalls.push(...message.toolCalls ?? []);
			continue;
		}
		if (message.role === "assistant" && pendingToolCalls.length > 0) {
			out.push({
				...message,
				toolCalls: [...pendingToolCalls, ...message.toolCalls ?? []]
			});
			pendingToolCalls = [];
			continue;
		}
		if (message.role === "user") flushAsStandalone();
		out.push(message);
	}
	flushAsStandalone();
	return out;
}
//#endregion
export { ChatPane as t };

//# sourceMappingURL=chat-pane-Dg35kO0v.js.map