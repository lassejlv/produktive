import { t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { g as useNavigate } from "./initial-BUIQ08st.js";
import { v as toast } from "./initial-BjZJRI-E.js";
import { Vn as cn } from "./initial-BOT0Y-sv.js";
import { t as useInbox } from "./use-inbox-Dl6a-9M-.js";
//#region src/routes/_app.inbox.tsx?tsr-split=component
var import_jsx_runtime = require_jsx_runtime();
function InboxPage() {
	const navigate = useNavigate();
	const { notifications, unreadCount, isLoading, markRead, markAll } = useInbox();
	const open = async (id, targetType, targetId, isRead) => {
		if (!isRead) markRead(id);
		if (targetType === "issue") {
			await navigate({
				to: "/issues/$issueId",
				params: { issueId: targetId }
			});
			return;
		}
		if (targetType === "project") {
			await navigate({
				to: "/projects/$projectId",
				params: { projectId: targetId }
			});
			return;
		}
		if (targetType === "chat") {
			await navigate({
				to: "/chat/$chatId",
				params: { chatId: targetId }
			});
			return;
		}
		toast.message("Marked as read", { description: "There's no destination for this notification yet." });
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "min-h-full bg-bg",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "sticky top-0 z-10 flex h-12 items-center justify-between gap-3 border-b border-border-subtle bg-bg/85 px-5 backdrop-blur",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-sm font-medium text-fg",
					children: "Inbox"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-xs text-fg-muted tabular-nums",
					children: notifications.length
				})]
			}), unreadCount > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => void markAll(),
				className: "text-[12px] text-fg-muted transition-colors hover:text-fg",
				children: "Mark all as read"
			}) : null]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
			className: "mx-auto w-full max-w-[760px] px-6 py-8",
			children: isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] text-fg-faint",
				children: "Loading…"
			}) : notifications.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col items-center justify-center py-20 text-center",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[13px] text-fg",
					children: "You're all caught up."
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-[12px] text-fg-muted",
					children: "New comments and assignments will land here."
				})]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "overflow-hidden rounded-xl border border-border-subtle",
				children: notifications.map((notification, index) => {
					const isUnread = notification.readAt === null;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
						className: cn("border-border-subtle", index !== notifications.length - 1 && "border-b"),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => void open(notification.id, notification.targetType, notification.targetId, !isUnread),
							className: cn("group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface/40", isUnread && "bg-surface/20"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn("mt-1.5 size-1.5 shrink-0 rounded-full transition-colors", isUnread ? "bg-accent" : "bg-transparent") }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0 flex-1",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "flex items-center gap-2",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: cn("truncate text-[13px]", isUnread ? "text-fg" : "text-fg-muted"),
											children: notification.title
										})
									}),
									notification.snippet ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-0.5 truncate text-[12px] text-fg-faint",
										children: notification.snippet
									}) : null,
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "mt-1 text-[11px] text-fg-faint",
										children: [formatRelative(notification.createdAt), notification.actor ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [" · ", notification.actor.name] }) : null]
									})
								]
							})]
						})
					}, notification.id);
				})
			})
		})]
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
	return new Date(value).toLocaleDateString();
}
//#endregion
export { InboxPage as component };

//# sourceMappingURL=_app.inbox-BhMFQJ_X.js.map