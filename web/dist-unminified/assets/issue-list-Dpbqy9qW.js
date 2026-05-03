import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { g as useNavigate } from "./initial-BUIQ08st.js";
import { v as toast } from "./initial-BjZJRI-E.js";
import { M as formatDate, Vn as cn, _ as defaultDisplayOptions, b as sortIssues, v as groupIssues } from "./initial-BOT0Y-sv.js";
import { G as StarIcon, _ as Avatar, c as ProjectIcon, d as StatusIcon, et as Popover, f as PriorityIcon, nt as PopoverTrigger, tt as PopoverContent, u as LabelChip } from "./initial-BWSisseh.js";
//#region src/components/issue/issue-list.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
var ISSUE_DRAG_MIME = "application/x-produktive-issue";
var DRAG_MIME = ISSUE_DRAG_MIME;
var COLLAPSED_GROUPS_KEY = "issues-collapsed-groups";
function readCollapsedGroups() {
	if (typeof window === "undefined") return {};
	try {
		const raw = window.localStorage.getItem(COLLAPSED_GROUPS_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}
function IssueList({ issues, statuses, selectedId, focusedId, selectedIds, onSelect, onToggleSelected, onMoveToStatus, isFavorite, onToggleFavorite, displayOptions = defaultDisplayOptions, onCreateInGroup }) {
	const navigate = useNavigate();
	const [draggingId, setDraggingId] = (0, import_react.useState)(null);
	const [dropTarget, setDropTarget] = (0, import_react.useState)(null);
	const [collapsedGroups, setCollapsedGroups] = (0, import_react.useState)(() => ({}));
	const [inlineCreatingKey, setInlineCreatingKey] = (0, import_react.useState)(null);
	const [inlineDraft, setInlineDraft] = (0, import_react.useState)("");
	const [inlineSubmitting, setInlineSubmitting] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		setCollapsedGroups(readCollapsedGroups());
	}, []);
	const toggleGroupCollapsed = (key) => {
		setCollapsedGroups((current) => {
			const next = {
				...current,
				[key]: !current[key]
			};
			if (typeof window !== "undefined") try {
				window.localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(next));
			} catch {}
			return next;
		});
	};
	const startInlineCreate = (key) => {
		setInlineCreatingKey(key);
		setInlineDraft("");
		if (collapsedGroups[key]) toggleGroupCollapsed(key);
	};
	const cancelInlineCreate = () => {
		setInlineCreatingKey(null);
		setInlineDraft("");
	};
	const submitInlineCreate = async (status) => {
		const trimmed = inlineDraft.trim();
		if (!trimmed || !onCreateInGroup) return;
		setInlineSubmitting(true);
		try {
			await onCreateInGroup(status, trimmed);
			setInlineDraft("");
		} finally {
			setInlineSubmitting(false);
		}
	};
	const groups = groupIssues(issues, displayOptions.groupBy, statuses).map((group) => ({
		...group,
		items: sortIssues(group.items, displayOptions.sortBy)
	}));
	const properties = displayOptions.properties;
	const rowPadY = displayOptions.density === "compact" ? "py-1" : "py-1.5";
	const handleDragStart = (event, issue) => {
		if (!onMoveToStatus) return;
		event.dataTransfer.setData(DRAG_MIME, issue.id);
		event.dataTransfer.setData("text/plain", issue.title);
		event.dataTransfer.effectAllowed = "move";
		setDraggingId(issue.id);
	};
	const handleDragEnd = () => {
		setDraggingId(null);
		setDropTarget(null);
	};
	const handleGroupDragOver = (event, groupStatus) => {
		if (!onMoveToStatus || !draggingId || !groupStatus) return;
		const dragged = issues.find((i) => i.id === draggingId);
		if (!dragged || dragged.status === groupStatus) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
		if (dropTarget !== groupStatus) setDropTarget(groupStatus);
	};
	const handleGroupDragLeave = (event, groupStatus) => {
		if (!groupStatus) return;
		if (event.currentTarget.contains(event.relatedTarget)) return;
		if (dropTarget === groupStatus) setDropTarget(null);
	};
	const handleGroupDrop = (event, groupStatus) => {
		if (!onMoveToStatus || !groupStatus) return;
		const issueId = event.dataTransfer.getData(DRAG_MIME) || draggingId || "";
		setDraggingId(null);
		setDropTarget(null);
		if (!issueId) return;
		const dragged = issues.find((i) => i.id === issueId);
		if (!dragged || dragged.status === groupStatus) return;
		event.preventDefault();
		onMoveToStatus(issueId, groupStatus);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "animate-fade-in",
		children: groups.map((group) => {
			const isDropping = group.status !== null && dropTarget === group.status;
			const collapsed = collapsedGroups?.[group.key] ?? false;
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				onDragOver: (event) => handleGroupDragOver(event, group.status),
				onDragLeave: (event) => handleGroupDragLeave(event, group.status),
				onDrop: (event) => handleGroupDrop(event, group.status),
				className: cn("transition-colors", isDropping && "bg-accent/10 ring-2 ring-accent/40 ring-inset"),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: cn("sticky top-12 z-[5] flex items-center gap-2 border-b bg-bg/95 px-5 py-2 backdrop-blur transition-colors", isDropping ? "border-accent/60 text-accent" : "border-border-subtle"),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => toggleGroupCollapsed(group.key),
							"aria-label": collapsed ? "Expand group" : "Collapse group",
							className: "grid size-4 place-items-center rounded-[3px] text-fg-faint transition-colors hover:bg-surface hover:text-fg",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronIcon, { collapsed })
						}),
						group.status ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusIcon, {
							status: group.status,
							statuses
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: cn("text-xs font-medium", isDropping ? "text-accent" : "text-fg"),
							children: group.label
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[11px] tabular-nums text-fg-muted",
							children: group.items.length
						}),
						isDropping ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "ml-auto text-[10.5px] uppercase tracking-[0.08em] text-accent",
							children: "Drop to move"
						}) : null,
						onCreateInGroup && group.status && !isDropping ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => startInlineCreate(group.key),
							"aria-label": "Add issue to group",
							className: "ml-auto grid size-5 place-items-center rounded-[4px] text-fg-faint transition-colors hover:bg-surface hover:text-fg",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlusIcon, {})
						}) : null
					]
				}), collapsed ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", { children: [inlineCreatingKey === group.key && group.status ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
					className: "border-b border-border-subtle bg-surface/40",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(InlineCreateRow, {
						status: group.status,
						statuses,
						value: inlineDraft,
						onChange: setInlineDraft,
						submitting: inlineSubmitting,
						onSubmit: () => void submitInlineCreate(group.status),
						onCancel: cancelInlineCreate,
						rowPadY
					})
				}) : null, group.items.map((issue) => {
					const isSelected = selectedId === issue.id;
					const isFocused = focusedId === issue.id;
					const isMultiSelected = selectedIds?.has(issue.id) ?? false;
					const isDragging = draggingId === issue.id;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
						draggable: Boolean(onMoveToStatus),
						onDragStart: (event) => handleDragStart(event, issue),
						onDragEnd: handleDragEnd,
						className: cn("transition-all", isDragging && "opacity-60 scale-[0.99] shadow-lg shadow-black/30"),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							role: "button",
							tabIndex: 0,
							onClick: (event) => onSelect(issue.id, event),
							onKeyDown: (event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									onSelect(issue.id, event);
								}
							},
							"data-issue-row": issue.id,
							className: cn("group/row relative flex w-full cursor-pointer items-center gap-3 border-b border-border-subtle px-5 text-left transition-colors hover:bg-surface/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent", rowPadY, onMoveToStatus && "cursor-grab active:cursor-grabbing", isSelected && "bg-surface", isMultiSelected && "bg-accent/10", (isFocused || isMultiSelected) && "before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-accent"),
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-checked": isMultiSelected,
									role: "checkbox",
									"aria-label": `Select ${issue.title}`,
									onClick: (event) => {
										event.preventDefault();
										event.stopPropagation();
										onToggleSelected?.(issue.id);
									},
									className: cn("grid size-4 shrink-0 place-items-center rounded-[3px] border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent", isMultiSelected ? "border-accent bg-accent text-bg" : "border-border-subtle text-transparent group-hover/row:border-border group-hover/row:text-fg-faint focus-visible:border-border focus-visible:text-fg-faint"),
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CheckIcon, {})
								}),
								properties.priority ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PriorityIcon, { priority: issue.priority }) : null,
								properties.id ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "font-mono text-[11px] text-fg-muted w-16 shrink-0",
									children: ["P-", issue.id.slice(0, 4).toUpperCase()]
								}) : null,
								properties.status ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusIcon, {
									status: issue.status,
									statuses
								}) : null,
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "min-w-0 flex-1 truncate text-[13px] text-fg",
									children: issue.title
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-label": "Copy issue link",
									onClick: (event) => {
										event.stopPropagation();
										copyIssueLink(issue.id);
									},
									className: "grid size-5 shrink-0 place-items-center rounded-[4px] text-fg-faint opacity-0 transition-colors hover:bg-surface-2 hover:text-fg group-hover/row:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LinkIcon, {})
								}),
								onToggleFavorite ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-label": isFavorite?.(issue.id) ? "Unpin issue" : "Pin issue",
									onClick: (event) => {
										event.stopPropagation();
										onToggleFavorite(issue.id);
									},
									className: cn("grid size-5 shrink-0 place-items-center rounded-[4px] transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent", isFavorite?.(issue.id) ? "text-warning opacity-100" : "text-fg-faint opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 hover:text-fg"),
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StarIcon, {
										size: 11,
										filled: Boolean(isFavorite?.(issue.id))
									})
								}) : null,
								properties.project && issue.project ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "inline-flex h-5 shrink-0 items-center gap-1 rounded-[4px] border border-border-subtle bg-surface/40 px-1.5 text-[11px] text-fg-muted",
									title: issue.project.name,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectIcon, {
										color: issue.project.color,
										icon: issue.project.icon,
										name: issue.project.name,
										size: "sm"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "hidden max-w-[100px] truncate sm:inline",
										children: issue.project.name
									})]
								}) : null,
								properties.labels && (issue.labels?.length ?? 0) > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "hidden items-center gap-1 sm:flex",
									title: (issue.labels ?? []).map((l) => l.name).join(", "),
									children: [(issue.labels ?? []).slice(0, 2).map((label) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LabelChip, {
										name: label.name,
										color: label.color,
										size: "sm"
									}, label.id)), (issue.labels?.length ?? 0) > 2 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "text-[10.5px] tabular-nums text-fg-faint",
										children: ["+", (issue.labels?.length ?? 0) - 2]
									}) : null]
								}) : null,
								properties.assignee ? issue.assignedTo ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MemberPopover, {
									member: issue.assignedTo,
									stats: memberStats(issues, issue.assignedTo.id),
									onOpen: () => void navigate({
										to: "/members/$memberId",
										params: { memberId: issue.assignedTo.id }
									})
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									"aria-label": "Unassigned",
									className: "size-5 shrink-0 rounded-full border border-dashed border-border-subtle opacity-60"
								}) : null,
								properties.updated ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "hidden font-mono text-[11px] text-fg-muted sm:block w-12 text-right",
									children: formatDate(issue.updatedAt)
								}) : null
							]
						})
					}, issue.id);
				})] })]
			}, group.key);
		})
	});
}
function MemberPopover({ member, stats, onOpen }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const handleOpen = (event) => {
		event.preventDefault();
		event.stopPropagation();
		onOpen();
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, {
		open,
		onOpenChange: setOpen,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
			asChild: true,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				role: "button",
				tabIndex: 0,
				"aria-label": `Open ${member.name}`,
				onMouseEnter: () => setOpen(true),
				onMouseLeave: () => setOpen(false),
				onFocus: () => setOpen(true),
				onBlur: () => setOpen(false),
				onClick: handleOpen,
				onKeyDown: (event) => {
					if (event.key === "Enter" || event.key === " ") handleOpen(event);
				},
				className: "grid size-5 shrink-0 place-items-center rounded-full transition-shadow hover:ring-1 hover:ring-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, {
					name: member.name,
					image: member.image
				})
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverContent, {
			align: "end",
			className: "w-64 p-0",
			onMouseEnter: () => setOpen(true),
			onMouseLeave: () => setOpen(false),
			onClick: (event) => event.stopPropagation(),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				onClick: handleOpen,
				className: "block w-full rounded-lg p-3 text-left transition-colors hover:bg-surface",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-start gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, {
							name: member.name,
							image: member.image
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "truncate text-sm font-medium text-fg",
								children: member.name
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-0.5 truncate text-[11px] text-fg-muted",
								children: member.email
							})]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-3 grid grid-cols-2 gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-md border border-border-subtle bg-surface px-2 py-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "font-mono text-sm text-fg tabular-nums",
								children: stats.assigned
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-[11px] text-fg-muted",
								children: "Assigned"
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-md border border-border-subtle bg-surface px-2 py-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "font-mono text-sm text-fg tabular-nums",
								children: stats.created
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-[11px] text-fg-muted",
								children: "Created"
							})]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-3 text-[11px] text-accent",
						children: "View profile"
					})
				]
			})
		})]
	});
}
function ChevronIcon({ collapsed }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		width: "9",
		height: "9",
		viewBox: "0 0 12 12",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
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
function PlusIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		width: "11",
		height: "11",
		viewBox: "0 0 12 12",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		"aria-hidden": true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M6 2.5v7M2.5 6h7",
			stroke: "currentColor",
			strokeWidth: "1.4",
			strokeLinecap: "round"
		})
	});
}
function LinkIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		width: "11",
		height: "11",
		viewBox: "0 0 12 12",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		"aria-hidden": true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M5 3.5H3.5A1.5 1.5 0 002 5v2a1.5 1.5 0 001.5 1.5H5M7 3.5h1.5A1.5 1.5 0 0110 5v2a1.5 1.5 0 01-1.5 1.5H7M4 6h4",
			stroke: "currentColor",
			strokeWidth: "1.4",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function CheckIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		width: "10",
		height: "10",
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
	});
}
async function copyIssueLink(id) {
	if (typeof window === "undefined") return;
	const url = `${window.location.origin}/issues/${id}`;
	try {
		await navigator.clipboard.writeText(url);
		toast.success("Link copied");
	} catch {
		toast.error("Couldn't copy link");
	}
}
function InlineCreateRow({ status, statuses, value, onChange, submitting, onSubmit, onCancel, rowPadY }) {
	const inputRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		inputRef.current?.focus();
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
		onSubmit: (event) => {
			event.preventDefault();
			onSubmit();
		},
		className: cn("flex w-full items-center gap-3 px-5 text-left", rowPadY),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "size-3 shrink-0",
				"aria-hidden": true
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "font-mono text-[11px] text-fg-faint w-16 shrink-0",
				children: "new"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusIcon, {
				status,
				statuses
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				ref: inputRef,
				value,
				onChange: (event) => onChange(event.target.value),
				onKeyDown: (event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						onCancel();
					}
				},
				onBlur: () => {
					if (!value.trim()) onCancel();
				},
				placeholder: "Issue title…",
				disabled: submitting,
				className: "min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-fg outline-none placeholder:text-fg-faint disabled:opacity-50"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "submit",
				disabled: !value.trim() || submitting,
				className: cn("h-6 rounded-md px-2 text-[11px] transition-colors", value.trim() && !submitting ? "bg-fg text-bg hover:bg-white" : "bg-surface text-fg-faint"),
				children: submitting ? "Adding…" : "Add"
			})
		]
	});
}
function memberStats(issues, memberId) {
	let assigned = 0;
	let created = 0;
	for (const issue of issues) {
		if (issue.assignedTo?.id === memberId) assigned += 1;
		if (issue.createdBy?.id === memberId) created += 1;
	}
	return {
		assigned,
		created
	};
}
//#endregion
export { IssueList as n, ISSUE_DRAG_MIME as t };

//# sourceMappingURL=issue-list-Dpbqy9qW.js.map