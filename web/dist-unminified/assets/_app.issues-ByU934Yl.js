import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { c as useRouterState, g as useNavigate } from "./initial-BUIQ08st.js";
import { v as toast } from "./initial-BjZJRI-E.js";
import { Bn as useMediaQuery, C as labelColorHex, F as sortedStatuses, L as statusName, M as formatDate, N as issueMatchesView, P as priorityOptions, R as viewLabels, St as useSession, Vn as cn, c as useUpdateIssue, cn as listProjects, d as formatBytes, g as prepareChatAttachments, i as useIssueStatuses, in as listLabels, j as firstStatusForCategory, kt as createIssue, l as useFavorites, o as useCreateIssue, s as useDeleteIssue, sn as listMembers, x as useDisplayOptions, y as priorityLabels, zn as uploadIssueAttachment } from "./initial-BOT0Y-sv.js";
import { $ as useOnboarding, C as DialogHeader, D as AttachIcon, L as IssuesIcon, S as DialogFooter, X as Button, _ as Avatar, a as SelectTrigger, b as DialogClose, c as ProjectIcon, d as StatusIcon, et as Popover, f as PriorityIcon, i as SelectItem, l as LabelPicker, n as Select, nt as PopoverTrigger, p as MemberPicker, r as SelectContent, s as ProjectPicker, tt as PopoverContent, v as useConfirmDialog, w as DialogTitle, x as DialogContent, y as Dialog } from "./initial-BWSisseh.js";
import { l as Route, r as IssueDetail } from "./initial-Cbvcoh8y.js";
import { t as useIssues } from "./use-issues-BFKzL-a-.js";
import { t as Input } from "./input-DAlWfusE.js";
import { t as Skeleton } from "./skeleton-bPEvTUQb.js";
import { n as IssueList, t as ISSUE_DRAG_MIME } from "./issue-list-Dpbqy9qW.js";
import { t as useLabels } from "./use-labels-DexLScJ2.js";
import { t as useProjects } from "./use-projects-DXOYwJpR.js";
//#region src/components/empty-state.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
function EmptyState({ onCreate }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col items-center justify-center px-6 py-12 text-center",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "text-sm font-medium text-fg",
				children: "No issues yet"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 max-w-xs text-xs text-fg-muted",
				children: "Create your first issue to start tracking work."
			}),
			onCreate ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				className: "mt-4",
				variant: "outline",
				size: "sm",
				onClick: onCreate,
				children: "New issue"
			}) : null
		]
	});
}
//#endregion
//#region src/components/issue/bulk-action-bar.tsx
function BulkActionBar({ count, statuses, onSetStatus, onSetPriority, onDelete, onClear }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: cn("pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-bg px-2 py-1 text-[12px] shadow-[0_18px_40px_rgba(0,0,0,0.45)]", "animate-fade-up"),
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "px-2 text-fg",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "tabular-nums",
						children: count
					}), " selected"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-4 w-px bg-border-subtle" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BulkSelect, {
					label: "Status",
					ariaLabel: "Set status",
					options: sortedStatuses(statuses).map((status) => ({
						value: status.key,
						label: status.name
					})),
					onChange: onSetStatus
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BulkSelect, {
					label: "Priority",
					ariaLabel: "Set priority",
					options: priorityOptions.map((value) => ({
						value,
						label: priorityLabels[value] ?? value
					})),
					onChange: onSetPriority
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: onDelete,
					className: "inline-flex h-7 items-center rounded-full px-3 text-[12px] text-danger transition-colors hover:bg-danger/10",
					children: "Delete"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-4 w-px bg-border-subtle" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: onClear,
					"aria-label": "Clear selection",
					className: "grid size-6 place-items-center rounded-full text-fg-faint transition-colors hover:bg-surface hover:text-fg",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
						width: "10",
						height: "10",
						viewBox: "0 0 12 12",
						fill: "none",
						"aria-hidden": true,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
							d: "M3 3l6 6M9 3l-6 6",
							stroke: "currentColor",
							strokeWidth: "1.4",
							strokeLinecap: "round"
						})
					})
				})
			]
		})
	});
}
function BulkSelect({ label, ariaLabel, options, onChange }) {
	const [resetKey, setResetKey] = (0, import_react.useState)(0);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
		onValueChange: (value) => {
			onChange(value);
			setResetKey((current) => current + 1);
		},
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
			"aria-label": ariaLabel,
			className: "h-7 w-auto rounded-full border-0 bg-transparent px-3 text-fg-muted hover:border-transparent hover:bg-surface hover:text-fg [&>svg]:hidden",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label })
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, {
			align: "start",
			children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
				value: option.value,
				children: option.label
			}, option.value))
		})]
	}, resetKey);
}
//#endregion
//#region src/components/issue/issue-board.tsx
function IssueBoard({ issues, statuses, onSelect, onMoveToStatus, onCreateInGroup }) {
	const [draggingId, setDraggingId] = (0, import_react.useState)(null);
	const [dropTarget, setDropTarget] = (0, import_react.useState)(null);
	const orderedStatuses = sortedStatuses(statuses);
	const buckets = {};
	for (const status of orderedStatuses) buckets[status.key] = [];
	for (const issue of issues) (buckets[issue.status] ??= []).push(issue);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex h-[calc(100vh-110px)] gap-3 overflow-x-auto px-5 py-4",
		children: orderedStatuses.map((statusMeta) => {
			const status = statusMeta.key;
			return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Column, {
				status,
				statuses,
				items: buckets[status] ?? [],
				isDropping: dropTarget === status,
				draggingId,
				onSelect,
				onCreateInGroup,
				onDragStart: (issue) => {
					setDraggingId(issue.id);
				},
				onDragEnd: () => {
					setDraggingId(null);
					setDropTarget(null);
				},
				onDragOver: (event) => {
					if (!onMoveToStatus || !draggingId) return;
					const dragged = issues.find((i) => i.id === draggingId);
					if (!dragged || dragged.status === status) return;
					event.preventDefault();
					event.dataTransfer.dropEffect = "move";
					if (dropTarget !== status) setDropTarget(status);
				},
				onDragLeave: (event) => {
					if (event.currentTarget.contains(event.relatedTarget)) return;
					if (dropTarget === status) setDropTarget(null);
				},
				onDrop: (event) => {
					if (!onMoveToStatus) return;
					const issueId = event.dataTransfer.getData("application/x-produktive-issue") || draggingId || "";
					setDraggingId(null);
					setDropTarget(null);
					if (!issueId) return;
					const dragged = issues.find((i) => i.id === issueId);
					if (!dragged || dragged.status === status) return;
					event.preventDefault();
					onMoveToStatus(issueId, status);
				}
			}, status);
		})
	});
}
function Column({ status, statuses, items, isDropping, draggingId, onSelect, onCreateInGroup, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop }) {
	const [creating, setCreating] = (0, import_react.useState)(false);
	const [draft, setDraft] = (0, import_react.useState)("");
	const [submitting, setSubmitting] = (0, import_react.useState)(false);
	const submit = async () => {
		const trimmed = draft.trim();
		if (!trimmed || !onCreateInGroup) return;
		setSubmitting(true);
		try {
			await onCreateInGroup(status, trimmed);
			setDraft("");
			setCreating(false);
		} finally {
			setSubmitting(false);
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		onDragOver,
		onDragLeave,
		onDrop,
		className: cn("flex w-[280px] shrink-0 flex-col rounded-lg border border-border-subtle bg-surface/30 transition-colors", isDropping && "border-accent bg-accent/10 ring-2 ring-accent/40"),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "flex items-center gap-2 px-3 py-2.5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusIcon, {
					status,
					statuses
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[12px] font-medium text-fg",
					children: statusName(statuses, status)
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[11px] tabular-nums text-fg-faint",
					children: items.length
				}),
				onCreateInGroup ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => setCreating(true),
					"aria-label": "Add issue",
					className: "ml-auto grid size-5 place-items-center rounded-[4px] text-fg-faint transition-colors hover:bg-surface hover:text-fg",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlusIcon, {})
				}) : null
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex-1 space-y-2 overflow-y-auto px-2 pb-3",
			children: [
				creating ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("form", {
					onSubmit: (event) => {
						event.preventDefault();
						submit();
					},
					className: "rounded-md border border-border bg-bg p-2",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						autoFocus: true,
						value: draft,
						onChange: (event) => setDraft(event.target.value),
						onKeyDown: (event) => {
							if (event.key === "Escape") {
								event.preventDefault();
								setCreating(false);
								setDraft("");
							}
						},
						onBlur: () => {
							if (!draft.trim()) {
								setCreating(false);
								setDraft("");
							}
						},
						placeholder: "Issue title…",
						disabled: submitting,
						className: "w-full bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-faint"
					})
				}) : null,
				items.map((issue) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					draggable: true,
					onDragStart: (event) => {
						event.dataTransfer.setData(ISSUE_DRAG_MIME, issue.id);
						event.dataTransfer.setData("text/plain", issue.title);
						event.dataTransfer.effectAllowed = "move";
						onDragStart(issue);
					},
					onDragEnd,
					onClick: () => onSelect(issue.id),
					className: cn("block w-full cursor-grab rounded-md border border-border-subtle bg-bg p-3 text-left transition-all hover:border-border active:cursor-grabbing", draggingId === issue.id && "opacity-60 scale-[0.98] shadow-lg shadow-black/30"),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-start justify-between gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "font-mono text-[10px] tracking-wide text-fg-faint",
								children: ["P-", issue.id.slice(0, 4).toUpperCase()]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PriorityIcon, { priority: issue.priority })]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1.5 text-[13px] leading-snug text-fg",
							children: issue.title
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-2.5 flex items-center justify-between text-[11px] text-fg-muted",
							children: [issue.assignedTo ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, {
								name: issue.assignedTo.name,
								image: issue.assignedTo.image
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								"aria-label": "Unassigned",
								className: "size-5 rounded-full border border-dashed border-border-subtle opacity-60"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono tabular-nums",
								children: formatDate(issue.updatedAt)
							})]
						})
					]
				}, issue.id)),
				items.length === 0 && !creating ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "px-1 py-2 text-[11px] text-fg-faint",
					children: "No issues."
				}) : null
			]
		})]
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
//#endregion
//#region src/components/issue/issue-toolbar.tsx
var emptyFilters = {
	statuses: [],
	priorities: [],
	assigneeIds: [],
	projectIds: [],
	labelIds: []
};
function filterCount(filters) {
	return filters.statuses.length + filters.priorities.length + filters.assigneeIds.length + filters.projectIds.length + filters.labelIds.length;
}
var groupOptions = [
	{
		value: "status",
		label: "Status"
	},
	{
		value: "priority",
		label: "Priority"
	},
	{
		value: "assignee",
		label: "Assignee"
	},
	{
		value: "project",
		label: "Project"
	},
	{
		value: "none",
		label: "None"
	}
];
var sortOptions = [
	{
		value: "manual",
		label: "Manual"
	},
	{
		value: "created",
		label: "Created"
	},
	{
		value: "updated",
		label: "Updated"
	},
	{
		value: "priority",
		label: "Priority"
	}
];
var densityOptions = [{
	value: "comfortable",
	label: "Comfortable"
}, {
	value: "compact",
	label: "Compact"
}];
var propertyOptions = [
	{
		key: "priority",
		label: "Priority"
	},
	{
		key: "id",
		label: "ID"
	},
	{
		key: "status",
		label: "Status"
	},
	{
		key: "assignee",
		label: "Assignee"
	},
	{
		key: "project",
		label: "Project"
	},
	{
		key: "labels",
		label: "Labels"
	},
	{
		key: "updated",
		label: "Updated"
	}
];
function IssueToolbar({ displayOptions, onDisplayChange, onPropertiesChange, filters, statuses, onFiltersChange }) {
	const count = filterCount(filters);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-center gap-1",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
				asChild: true,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors hover:bg-surface hover:text-fg", count > 0 ? "bg-surface text-fg" : "text-fg-muted"),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilterIcon, {}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Filter" }),
						count > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "tabular-nums text-[11px] text-fg-faint",
							children: count
						}) : null
					]
				})
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverContent, {
				align: "end",
				className: "w-64 p-0",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilterPopoverBody, {
					filters,
					statuses,
					onChange: onFiltersChange
				})
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ViewModeToggle, {
				value: displayOptions.viewMode,
				onChange: (viewMode) => onDisplayChange({ viewMode })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
				asChild: true,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-fg-muted transition-colors hover:bg-surface hover:text-fg",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SlidersIcon, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Display" })]
				})
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverContent, {
				align: "end",
				className: "w-72 p-0",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DisplayPopoverBody, {
					displayOptions,
					onChange: onDisplayChange,
					onPropertiesChange
				})
			})] })
		]
	});
}
function FilterPopoverBody({ filters, statuses, onChange }) {
	const toggleStatus = (value) => {
		onChange({
			...filters,
			statuses: filters.statuses.includes(value) ? filters.statuses.filter((v) => v !== value) : [...filters.statuses, value]
		});
	};
	const togglePriority = (value) => {
		onChange({
			...filters,
			priorities: filters.priorities.includes(value) ? filters.priorities.filter((v) => v !== value) : [...filters.priorities, value]
		});
	};
	const toggleProject = (value) => {
		onChange({
			...filters,
			projectIds: filters.projectIds.includes(value) ? filters.projectIds.filter((v) => v !== value) : [...filters.projectIds, value]
		});
	};
	const toggleLabel = (value) => {
		onChange({
			...filters,
			labelIds: filters.labelIds.includes(value) ? filters.labelIds.filter((v) => v !== value) : [...filters.labelIds, value]
		});
	};
	const { projects } = useProjects(false);
	const { labels } = useLabels(false);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "text-[12.5px]",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, {
				label: "Status",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex flex-wrap gap-1",
					children: sortedStatuses(statuses).map((status) => {
						const value = status.key;
						const active = filters.statuses.includes(value);
						return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilterChip, {
							label: status.name,
							active,
							onClick: () => toggleStatus(value)
						}, value);
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, {
				label: "Priority",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex flex-wrap gap-1",
					children: priorityOptions.map((value) => {
						const active = filters.priorities.includes(value);
						return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilterChip, {
							label: priorityLabels[value] ?? value,
							active,
							onClick: () => togglePriority(value)
						}, value);
					})
				})
			}),
			labels.filter((l) => l.archivedAt === null).length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, {
				label: "Label",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex flex-wrap gap-1",
					children: labels.filter((l) => l.archivedAt === null).map((label) => {
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => toggleLabel(label.id),
							className: cn("inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11.5px] transition-colors", filters.labelIds.includes(label.id) ? "border-border bg-surface text-fg" : "border-border-subtle bg-transparent text-fg-faint hover:text-fg-muted"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								"aria-hidden": true,
								className: "size-1.5 rounded-full",
								style: { backgroundColor: labelColorHex[label.color] ?? labelColorHex.gray }
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "max-w-[120px] truncate",
								children: label.name
							})]
						}, label.id);
					})
				})
			}) : null,
			projects.filter((p) => p.archivedAt === null).length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, {
				label: "Project",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex flex-wrap gap-1",
					children: projects.filter((p) => p.archivedAt === null).map((project) => {
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => toggleProject(project.id),
							className: cn("inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11.5px] transition-colors", filters.projectIds.includes(project.id) ? "border-border bg-surface text-fg" : "border-border-subtle bg-transparent text-fg-faint hover:text-fg-muted"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectIcon, {
								color: project.color,
								icon: project.icon,
								name: project.name,
								size: "sm"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "max-w-[120px] truncate",
								children: project.name
							})]
						}, project.id);
					})
				})
			}) : null,
			filterCount(filters) > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "border-t border-border-subtle px-3 py-2",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => onChange(emptyFilters),
					className: "text-[11.5px] text-fg-muted transition-colors hover:text-fg",
					children: "Clear all"
				})
			}) : null
		]
	});
}
function FilterChip({ label, active, onClick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		onClick,
		className: cn("inline-flex h-6 items-center rounded-md border px-2 text-[11.5px] capitalize transition-colors", active ? "border-border bg-surface text-fg" : "border-border-subtle bg-transparent text-fg-faint hover:text-fg-muted"),
		children: label
	});
}
function IssueFilterChips({ filters, statuses = [], onChange }) {
	if (filterCount(filters) === 0) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-wrap items-center gap-1.5 border-b border-border-subtle bg-bg px-5 py-1.5",
		children: [
			filters.statuses.map((value) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Chip, {
				label: statusName(statuses, value),
				group: "status",
				onRemove: () => onChange({
					...filters,
					statuses: filters.statuses.filter((v) => v !== value)
				})
			}, `status:${value}`)),
			filters.priorities.map((value) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Chip, {
				label: priorityLabels[value] ?? value,
				group: "priority",
				onRemove: () => onChange({
					...filters,
					priorities: filters.priorities.filter((v) => v !== value)
				})
			}, `priority:${value}`)),
			filters.assigneeIds.map((value) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Chip, {
				label: "me",
				group: "assignee",
				onRemove: () => onChange({
					...filters,
					assigneeIds: filters.assigneeIds.filter((v) => v !== value)
				})
			}, `assignee:${value}`)),
			filters.projectIds.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectChips, {
				ids: filters.projectIds,
				onRemove: (id) => onChange({
					...filters,
					projectIds: filters.projectIds.filter((v) => v !== id)
				})
			}) : null,
			filters.labelIds.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LabelFilterChips, {
				ids: filters.labelIds,
				onRemove: (id) => onChange({
					...filters,
					labelIds: filters.labelIds.filter((v) => v !== id)
				})
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => onChange(emptyFilters),
				className: "ml-1 text-[11px] text-fg-muted transition-colors hover:text-fg",
				children: "Clear"
			})
		]
	});
}
function LabelFilterChips({ ids, onRemove }) {
	const { labels } = useLabels(false);
	const map = new Map(labels.map((l) => [l.id, l]));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: ids.map((id) => {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Chip, {
			label: map.get(id)?.name ?? id.slice(0, 6),
			group: "label",
			onRemove: () => onRemove(id)
		}, `label:${id}`);
	}) });
}
function ProjectChips({ ids, onRemove }) {
	const { projects } = useProjects(false);
	const map = new Map(projects.map((p) => [p.id, p]));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: ids.map((id) => {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Chip, {
			label: map.get(id)?.name ?? id.slice(0, 6),
			group: "project",
			onRemove: () => onRemove(id)
		}, `project:${id}`);
	}) });
}
function Chip({ label, group, onRemove }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "inline-flex h-6 items-center gap-1 rounded-md border border-border-subtle bg-surface/40 pl-2 pr-1 text-[11.5px] capitalize text-fg",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "text-fg-faint",
				children: [group, ":"]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: onRemove,
				"aria-label": `Remove ${group} filter ${label}`,
				className: "grid size-4 place-items-center rounded-sm text-fg-faint transition-colors hover:bg-surface hover:text-fg",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
					width: "8",
					height: "8",
					viewBox: "0 0 12 12",
					fill: "none",
					"aria-hidden": true,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
						d: "M3 3l6 6M9 3l-6 6",
						stroke: "currentColor",
						strokeWidth: "1.4",
						strokeLinecap: "round"
					})
				})
			})
		]
	});
}
function ViewModeToggle({ value, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "inline-flex h-7 items-center rounded-md border border-border-subtle p-0.5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			onClick: () => onChange("list"),
			"aria-label": "List view",
			className: cn("grid size-6 place-items-center rounded-[4px] transition-colors", value === "list" ? "bg-surface text-fg" : "text-fg-faint hover:text-fg"),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ListIcon, {})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			onClick: () => onChange("board"),
			"aria-label": "Board view",
			className: cn("grid size-6 place-items-center rounded-[4px] transition-colors", value === "board" ? "bg-surface text-fg" : "text-fg-faint hover:text-fg"),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BoardIcon, {})
		})]
	});
}
function DisplayPopoverBody({ displayOptions, onChange, onPropertiesChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "text-[12.5px]",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, {
				label: "Grouping",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SegmentedControl, {
					options: groupOptions,
					value: displayOptions.groupBy,
					onChange: (value) => onChange({ groupBy: value })
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, {
				label: "Ordering",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SegmentedControl, {
					options: sortOptions,
					value: displayOptions.sortBy,
					onChange: (value) => onChange({ sortBy: value })
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, {
				label: "Density",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SegmentedControl, {
					options: densityOptions,
					value: displayOptions.density,
					onChange: (value) => onChange({ density: value })
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, {
				label: "Properties",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex flex-wrap gap-1",
					children: propertyOptions.map(({ key, label }) => {
						const active = displayOptions.properties[key];
						return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => onPropertiesChange({ [key]: !active }),
							className: cn("inline-flex h-6 items-center rounded-md border px-2 text-[11.5px] transition-colors", active ? "border-border bg-surface text-fg" : "border-border-subtle bg-transparent text-fg-faint hover:text-fg-muted"),
							children: label
						}, key);
					})
				})
			})
		]
	});
}
function Section({ label, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "border-b border-border-subtle px-3 py-2.5 last:border-b-0",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint",
			children: label
		}), children]
	});
}
function SegmentedControl({ options, value, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "grid grid-cols-2 gap-1 sm:grid-cols-4",
		children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			onClick: () => onChange(option.value),
			className: cn("h-7 rounded-md border text-[11.5px] transition-colors", value === option.value ? "border-border bg-surface text-fg" : "border-border-subtle bg-transparent text-fg-muted hover:bg-surface hover:text-fg"),
			children: option.label
		}, option.value))
	});
}
function SlidersIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: "13",
		height: "13",
		viewBox: "0 0 24 24",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		"aria-hidden": true,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M4 6h12m4 0h-2M4 12h6m10 0H14M4 18h12m4 0h-2",
				stroke: "currentColor",
				strokeWidth: "1.6",
				strokeLinecap: "round"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "17",
				cy: "6",
				r: "1.6",
				fill: "currentColor"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "11",
				cy: "12",
				r: "1.6",
				fill: "currentColor"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "17",
				cy: "18",
				r: "1.6",
				fill: "currentColor"
			})
		]
	});
}
function FilterIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		width: "12",
		height: "12",
		viewBox: "0 0 24 24",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		"aria-hidden": true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M3 5h18l-7 9v6l-4-2v-4L3 5z",
			stroke: "currentColor",
			strokeWidth: "1.6",
			strokeLinejoin: "round",
			strokeLinecap: "round"
		})
	});
}
function ListIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		width: "12",
		height: "12",
		viewBox: "0 0 24 24",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		"aria-hidden": true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M4 6h16M4 12h16M4 18h16",
			stroke: "currentColor",
			strokeWidth: "1.6",
			strokeLinecap: "round"
		})
	});
}
function BoardIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: "12",
		height: "12",
		viewBox: "0 0 24 24",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		"aria-hidden": true,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "4",
				y: "5",
				width: "5",
				height: "14",
				rx: "1.2",
				stroke: "currentColor",
				strokeWidth: "1.6"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "11",
				y: "5",
				width: "5",
				height: "9",
				rx: "1.2",
				stroke: "currentColor",
				strokeWidth: "1.6"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "18",
				y: "5",
				width: "2",
				height: "11",
				rx: "1",
				stroke: "currentColor",
				strokeWidth: "1.6"
			})
		]
	});
}
//#endregion
//#region src/components/issue/pill-select.tsx
function PillSelect({ value, onChange, options, icon, ariaLabel }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
		value,
		onValueChange: onChange,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectTrigger, {
			"aria-label": ariaLabel,
			className: "h-7 w-auto justify-start gap-1.5 border-border bg-surface px-2 text-xs hover:bg-surface-2 [&>svg]:ml-0",
			children: [icon, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "capitalize",
				children: value
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, {
			align: "start",
			children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
				value: option,
				children: option
			}, option))
		})]
	});
}
//#endregion
//#region src/lib/issue-natural-input.ts
var PRIORITY_ALIASES = {
	p0: "urgent",
	urgent: "urgent",
	p1: "high",
	p2: "medium",
	p3: "low"
};
var STATUSES = new Set([
	"backlog",
	"todo",
	"in-progress",
	"done"
]);
function parseNaturalIssueInput(input, { members, projects, labels }) {
	const words = input.trim().split(/\s+/).filter(Boolean);
	const titleWords = [];
	const labelIds = /* @__PURE__ */ new Set();
	const chips = [];
	let status = null;
	let priority = null;
	let assignedToId = null;
	let projectId = null;
	for (const word of words) {
		const parsed = parseWord(word, {
			members,
			projects,
			labels
		});
		if (!parsed) {
			titleWords.push(word);
			continue;
		}
		if (parsed.kind === "label") {
			if (!labelIds.has(parsed.id)) {
				labelIds.add(parsed.id);
				chips.push({
					kind: parsed.kind,
					label: parsed.label
				});
			}
			continue;
		}
		if (parsed.kind === "priority") {
			priority = parsed.value;
			replaceChip(chips, parsed.kind, parsed.label);
			continue;
		}
		if (parsed.kind === "status") {
			status = parsed.value;
			replaceChip(chips, parsed.kind, parsed.label);
			continue;
		}
		if (parsed.kind === "assignee") {
			assignedToId = parsed.id;
			replaceChip(chips, parsed.kind, parsed.label);
			continue;
		}
		projectId = parsed.id;
		replaceChip(chips, parsed.kind, parsed.label);
	}
	return {
		title: cleanTitle(titleWords.join(" ")),
		status,
		priority,
		assignedToId,
		projectId,
		labelIds: [...labelIds],
		chips
	};
}
function parseWord(word, context) {
	const token = stripTrailingPunctuation(word);
	const lower = token.toLowerCase();
	const priority = priorityFromToken(lower);
	if (priority) return {
		kind: "priority",
		value: priority,
		label: `Priority ${priorityLabel(priority)}`
	};
	const status = statusFromToken(lower);
	if (status) return {
		kind: "status",
		value: status,
		label: statusLabel(status)
	};
	if (token.startsWith("@") && token.length > 1) {
		const member = resolveMember(token.slice(1), context.members);
		if (member) return {
			kind: "assignee",
			id: member.id,
			label: member.name
		};
	}
	if (token.startsWith("#") && token.length > 1) {
		const query = token.slice(1);
		const project = resolveProject(query, context.projects);
		if (project) return {
			kind: "project",
			id: project.id,
			label: project.name
		};
		const label = resolveLabel(query, context.labels);
		if (label) return {
			kind: "label",
			id: label.id,
			label: label.name
		};
	}
	if (token.startsWith("+") && token.length > 1) {
		const label = resolveLabel(token.slice(1), context.labels);
		if (label) return {
			kind: "label",
			id: label.id,
			label: label.name
		};
	}
	return null;
}
function priorityFromToken(token) {
	const explicit = token.match(/^priority:(urgent|high|medium|low|p[0-3])$/);
	if (explicit) return PRIORITY_ALIASES[explicit[1]] ?? explicit[1];
	return PRIORITY_ALIASES[token] ?? null;
}
function statusFromToken(token) {
	const value = token.match(/^status:(backlog|todo|in-progress|done)$/)?.[1];
	if (value && STATUSES.has(value)) return value;
	return null;
}
function resolveMember(query, members) {
	const normalized = normalize(query);
	const matches = members.filter((member) => {
		const name = normalize(member.name);
		const email = normalize(member.email.split("@")[0] ?? member.email);
		return name === normalized || email === normalized || name.startsWith(normalized);
	});
	return matches.length === 1 ? matches[0] : null;
}
function resolveProject(query, projects) {
	return resolveNamed(query, projects.filter((project) => project.archivedAt === null));
}
function resolveLabel(query, labels) {
	return resolveNamed(query, labels.filter((label) => label.archivedAt === null));
}
function resolveNamed(query, items) {
	const normalized = normalize(query);
	const exact = items.filter((item) => normalize(item.name) === normalized);
	if (exact.length === 1) return exact[0];
	const prefixed = items.filter((item) => normalize(item.name).startsWith(normalized));
	return prefixed.length === 1 ? prefixed[0] : null;
}
function normalize(value) {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function stripTrailingPunctuation(value) {
	return value.replace(/[,.!?;:]+$/, "");
}
function cleanTitle(value) {
	return value.replace(/\s+/g, " ").trim();
}
function priorityLabel(priority) {
	return priority.charAt(0).toUpperCase() + priority.slice(1);
}
function statusLabel(status) {
	return status === "in-progress" ? "In progress" : priorityLabel(status);
}
function replaceChip(chips, kind, label) {
	const existing = chips.findIndex((chip) => chip.kind === kind);
	const chip = {
		kind,
		label
	};
	if (existing >= 0) chips[existing] = chip;
	else chips.push(chip);
}
//#endregion
//#region src/lib/issue-similarity.ts
var STOP_WORDS = new Set([
	"the",
	"a",
	"an",
	"of",
	"in",
	"on",
	"for",
	"to",
	"is",
	"and",
	"or",
	"but",
	"with",
	"when",
	"why",
	"how",
	"what",
	"as",
	"at",
	"by",
	"be",
	"it",
	"this",
	"that",
	"from"
]);
var WEIGHT_TITLE = .55;
var WEIGHT_BODY = .25;
var WEIGHT_SUBSTRING = .2;
var DEFAULT_MIN_SCORE = .28;
var DEFAULT_LIMIT = 3;
var SUBSTRING_RUN_LEN = 4;
function findSimilarIssues(query, issues, opts = {}) {
	const minScore = opts.minScore ?? DEFAULT_MIN_SCORE;
	const limit = opts.limit ?? DEFAULT_LIMIT;
	const queryNormalized = query.toLowerCase().trim();
	const queryTokens = tokenize(queryNormalized);
	if (queryTokens.size === 0) return [];
	const scored = [];
	for (const issue of issues) {
		if (opts.excludeId && issue.id === opts.excludeId) continue;
		const titleLower = issue.title.toLowerCase();
		const titleTokens = tokenize(titleLower);
		const descTokens = issue.description ? tokenize(issue.description.toLowerCase()) : null;
		let titleHits = 0;
		let descHits = 0;
		for (const token of queryTokens) if (titleTokens.has(token)) titleHits++;
		else if (descTokens?.has(token)) descHits++;
		const titleScore = titleHits / queryTokens.size;
		const descScore = descHits / queryTokens.size;
		const substringBoost = hasSubstringRun(queryNormalized, titleLower, SUBSTRING_RUN_LEN) ? 1 : 0;
		const score = clamp01(WEIGHT_TITLE * titleScore + WEIGHT_BODY * descScore + WEIGHT_SUBSTRING * substringBoost);
		if (score >= minScore) scored.push({
			issue,
			score
		});
	}
	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, limit);
}
function tokenize(input) {
	const tokens = /* @__PURE__ */ new Set();
	for (const raw of input.split(/[^a-z0-9]+/i)) {
		const t = raw.toLowerCase();
		if (t.length < 3) continue;
		if (STOP_WORDS.has(t)) continue;
		tokens.add(t);
	}
	return tokens;
}
function hasSubstringRun(query, haystack, minLen) {
	if (query.length < minLen || haystack.length < minLen) return false;
	for (let i = 0; i <= query.length - minLen; i++) {
		const slice = query.slice(i, i + minLen);
		if (/^\s+$/.test(slice)) continue;
		if (haystack.includes(slice)) return true;
	}
	return false;
}
function clamp01(n) {
	if (n < 0) return 0;
	if (n > 1) return 1;
	return n;
}
//#endregion
//#region src/components/issue/new-issue-dialog.tsx
function NewIssueDialog({ triggerLabel = "New issue", triggerVariant = "default", triggerSize = "sm", triggerClassName, shortcutEnabled = false, onCreated }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [title, setTitle] = (0, import_react.useState)("");
	const [description, setDescription] = (0, import_react.useState)("");
	const [status, setStatus] = (0, import_react.useState)("backlog");
	const [priority, setPriority] = (0, import_react.useState)("medium");
	const [assignedToId, setAssignedToId] = (0, import_react.useState)(null);
	const [projectId, setProjectId] = (0, import_react.useState)(null);
	const [labelIds, setLabelIds] = (0, import_react.useState)([]);
	const [attachments, setAttachments] = (0, import_react.useState)([]);
	const [error, setError] = (0, import_react.useState)(null);
	const [isSaving, setIsSaving] = (0, import_react.useState)(false);
	const [members, setMembers] = (0, import_react.useState)([]);
	const [projects, setProjects] = (0, import_react.useState)([]);
	const [labels, setLabels] = (0, import_react.useState)([]);
	const { statuses } = useIssueStatuses();
	const defaultStatus = firstStatusForCategory(statuses, "backlog", "backlog");
	const [manualFields, setManualFields] = (0, import_react.useState)({
		status: false,
		priority: false,
		assignee: false,
		project: false,
		labels: false
	});
	const [position, setPosition] = (0, import_react.useState)({
		x: 0,
		y: 0
	});
	const [dragging, setDragging] = (0, import_react.useState)(null);
	const [debouncedTitle, setDebouncedTitle] = (0, import_react.useState)("");
	const [dismissedSuggestions, setDismissedSuggestions] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
	const { issues: existingIssues } = useIssues();
	const fileInputRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		if (!shortcutEnabled) return;
		const onKey = (event) => {
			const target = event.target;
			if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
			if (event.key === "c" || event.key === "C") {
				event.preventDefault();
				setOpen(true);
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [shortcutEnabled]);
	(0, import_react.useEffect)(() => {
		if (!shortcutEnabled) return;
		const onOpenEvent = () => setOpen(true);
		window.addEventListener("produktive:new-issue", onOpenEvent);
		return () => window.removeEventListener("produktive:new-issue", onOpenEvent);
	}, [shortcutEnabled]);
	(0, import_react.useEffect)(() => {
		if (!dragging) return;
		const onMove = (event) => {
			setPosition({
				x: dragging.originX + event.clientX - dragging.startX,
				y: dragging.originY + event.clientY - dragging.startY
			});
		};
		const onUp = () => setDragging(null);
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp, { once: true });
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
		};
	}, [dragging]);
	(0, import_react.useEffect)(() => {
		if (open) {
			setPosition({
				x: 0,
				y: 0
			});
			setDismissedSuggestions(/* @__PURE__ */ new Set());
		}
	}, [open]);
	(0, import_react.useEffect)(() => {
		const handle = window.setTimeout(() => setDebouncedTitle(title), 250);
		return () => window.clearTimeout(handle);
	}, [title]);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		let cancelled = false;
		Promise.all([
			listMembers(),
			listProjects(false),
			listLabels(false)
		]).then(([membersResponse, projectsResponse, labelsResponse]) => {
			if (cancelled) return;
			setMembers(membersResponse.members);
			setProjects(projectsResponse.projects);
			setLabels(labelsResponse.labels);
		}).catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [open]);
	const parsedIssue = (0, import_react.useMemo)(() => parseNaturalIssueInput(title, {
		members,
		projects,
		labels
	}), [
		title,
		members,
		projects,
		labels
	]);
	(0, import_react.useEffect)(() => {
		if (!manualFields.status) setStatus(parsedIssue.status ?? defaultStatus);
		if (!manualFields.priority) setPriority(parsedIssue.priority ?? "medium");
		if (!manualFields.assignee) setAssignedToId(parsedIssue.assignedToId);
		if (!manualFields.project) setProjectId(parsedIssue.projectId);
		if (!manualFields.labels) setLabelIds(parsedIssue.labelIds);
	}, [
		defaultStatus,
		manualFields,
		parsedIssue
	]);
	const selectedMember = members.find((member) => member.id === assignedToId);
	const selectedProject = projects.find((project) => project.id === projectId);
	const submitTitle = parsedIssue.title || title.trim();
	const similarityQuery = ((0, import_react.useMemo)(() => parseNaturalIssueInput(debouncedTitle, {
		members,
		projects,
		labels
	}), [
		debouncedTitle,
		members,
		projects,
		labels
	]).title || debouncedTitle).trim();
	const visibleSuggestions = (0, import_react.useMemo)(() => {
		if (similarityQuery.length < 6) return [];
		return findSimilarIssues(similarityQuery, existingIssues, { limit: 3 });
	}, [similarityQuery, existingIssues]).filter((s) => !dismissedSuggestions.has(s.issue.id));
	const dismissSuggestion = (id) => {
		setDismissedSuggestions((current) => {
			const next = new Set(current);
			next.add(id);
			return next;
		});
	};
	const reset = () => {
		setTitle("");
		setDescription("");
		setStatus(defaultStatus);
		setPriority("medium");
		setAssignedToId(null);
		setProjectId(null);
		setLabelIds([]);
		setAttachments([]);
		setManualFields({
			status: false,
			priority: false,
			assignee: false,
			project: false,
			labels: false
		});
	};
	const close = () => {
		setOpen(false);
		setError(null);
	};
	const handleSubmit = async (event) => {
		event.preventDefault();
		if (!submitTitle) {
			setError("Issue title is required");
			return;
		}
		setIsSaving(true);
		setError(null);
		try {
			let response = await createIssue({
				title: submitTitle,
				description: description || void 0,
				status,
				priority,
				assignedToId: assignedToId || void 0,
				projectId: projectId || void 0,
				labelIds: labelIds.length > 0 ? labelIds : void 0
			});
			for (const attachment of attachments) response = await uploadIssueAttachment(response.issue.id, attachment.file);
			onCreated?.(response.issue);
			reset();
			setOpen(false);
			toast.success("Issue created");
		} catch (createError) {
			const message = createError instanceof Error ? createError.message : "Failed to create issue";
			setError(message);
			toast.error(message);
		} finally {
			setIsSaving(false);
		}
	};
	const handleAttachmentChange = (files) => {
		if (!files?.length) return;
		const result = prepareChatAttachments(files, attachments.length);
		if (result.attachments.length > 0) setAttachments((current) => [...current, ...result.attachments]);
		const nextError = result.errors[0] ?? null;
		setError(nextError);
		if (nextError) toast.error(nextError);
	};
	const removeAttachment = (id) => {
		setAttachments((current) => current.filter((file) => file.id !== id));
		setError(null);
	};
	const startDrag = (event) => {
		if (event.button !== 0) return;
		if (event.target.closest("button")) return;
		event.preventDefault();
		setDragging({
			startX: event.clientX,
			startY: event.clientY,
			originX: position.x,
			originY: position.y
		});
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
		variant: triggerVariant,
		size: triggerSize,
		className: triggerClassName,
		onClick: () => setOpen(true),
		"data-tour": "new-issue-trigger",
		children: triggerLabel
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
		open,
		onClose: close,
		className: "max-w-2xl",
		style: { transform: `translate3d(${position.x}px, ${position.y}px, 0)` },
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
			onSubmit: handleSubmit,
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogHeader, {
					className: "cursor-move select-none",
					onPointerDown: startDrag,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "New issue" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogClose, { onClose: close })]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "space-y-4 p-5",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							autoFocus: true,
							required: true,
							value: title,
							onChange: (event) => setTitle(event.target.value),
							placeholder: "Issue title",
							className: "h-10 border-0 bg-transparent px-0 text-base focus-visible:ring-0"
						}),
						title.trim() && (parsedIssue.chips.length > 0 || parsedIssue.title !== title.trim()) ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-border-subtle py-2 text-[11px] text-fg-muted",
							children: [parsedIssue.title && parsedIssue.title !== title.trim() ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "min-w-0 truncate",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-mono uppercase tracking-[0.12em] text-fg-faint",
										children: "title"
									}),
									" ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg",
										children: parsedIssue.title
									})
								]
							}) : null, parsedIssue.chips.map((chip) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "inline-flex items-baseline gap-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono uppercase tracking-[0.12em] text-fg-faint",
									children: chip.kind
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-fg-muted",
									children: chip.label
								})]
							}, `${chip.kind}:${chip.label}`))]
						}) : null,
						visibleSuggestions.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-1.5 flex items-baseline gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-faint",
								children: "Similar"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono text-[10.5px] tabular-nums text-fg-faint",
								children: visibleSuggestions.length
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "flex flex-col",
							children: visibleSuggestions.map(({ issue }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "group flex items-center gap-3 border-b border-border-subtle/60 px-2 py-1.5 last:border-b-0 hover:bg-surface/50",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusIcon, {
										status: issue.status,
										statuses
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "m-0 min-w-0 flex-1 truncate text-[13px] text-fg",
										children: issue.title
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
										href: `/issues/${issue.id}`,
										target: "_blank",
										rel: "noreferrer",
										className: "text-[11px] text-fg-muted opacity-0 transition-colors hover:text-fg group-hover:opacity-100 focus-visible:opacity-100",
										children: "Open"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => dismissSuggestion(issue.id),
										"aria-label": `Dismiss ${issue.title}`,
										className: "text-[14px] leading-none text-fg-faint opacity-0 transition-colors hover:text-fg group-hover:opacity-100 focus-visible:opacity-100",
										children: "×"
									})
								]
							}, issue.id))
						})] }) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
							value: description,
							onChange: (event) => setDescription(event.target.value),
							placeholder: "Add description…",
							rows: 4,
							className: "w-full resize-y rounded-md border-0 bg-transparent px-0 py-0 text-sm text-fg outline-none placeholder:text-fg-faint focus-visible:ring-0"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-center gap-2 pt-1",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PillSelect, {
									ariaLabel: "Status",
									value: status,
									onChange: (value) => {
										setManualFields((current) => ({
											...current,
											status: true
										}));
										setStatus(value);
									},
									options: sortedStatuses(statuses).map((status) => status.key),
									icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusIcon, {
										status,
										statuses
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PillSelect, {
									ariaLabel: "Priority",
									value: priority,
									onChange: (value) => {
										setManualFields((current) => ({
											...current,
											priority: true
										}));
										setPriority(value);
									},
									options: priorityOptions,
									icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PriorityIcon, { priority })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MemberPicker, {
									selectedId: assignedToId,
									onSelect: (value) => {
										setManualFields((current) => ({
											...current,
											assignee: true
										}));
										setAssignedToId(value);
									},
									trigger: ({ onClick }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick,
										className: "inline-flex h-7 items-center gap-1.5 rounded-md border border-border-subtle bg-bg px-2 font-mono text-[11px] text-fg-muted transition-colors hover:border-border hover:text-fg",
										children: selectedMember ? `@${selectedMember.name}` : "assignee"
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectPicker, {
									selectedId: projectId,
									onSelect: (value) => {
										setManualFields((current) => ({
											...current,
											project: true
										}));
										setProjectId(value);
									},
									trigger: ({ onClick }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick,
										className: "inline-flex h-7 items-center gap-1.5 rounded-md border border-border-subtle bg-bg px-2 font-mono text-[11px] text-fg-muted transition-colors hover:border-border hover:text-fg",
										children: selectedProject ? `#${selectedProject.name}` : "project"
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NewIssueLabels, {
									selectedIds: labelIds,
									onChange: (value) => {
										setManualFields((current) => ({
											...current,
											labels: true
										}));
										setLabelIds(value);
									}
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									type: "button",
									variant: "outline",
									size: "sm",
									onClick: () => fileInputRef.current?.click(),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AttachIcon, {}), "Attach files"]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									ref: fileInputRef,
									type: "file",
									multiple: true,
									className: "hidden",
									onChange: (event) => {
										handleAttachmentChange(event.target.files);
										event.target.value = "";
									}
								})
							]
						}),
						attachments.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid gap-px overflow-hidden rounded-md border border-border-subtle bg-border-subtle",
							children: attachments.map(({ id, file }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 bg-bg px-3 py-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "min-w-0",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "truncate font-mono text-[11px] text-fg",
											children: file.name
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "mt-1 truncate font-mono text-[10px] text-fg-faint",
											children: file.type || "application/octet-stream"
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-mono text-[10px] text-fg-muted",
										children: formatBytes(file.size)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => removeAttachment(id),
										className: "grid size-6 place-items-center rounded-md text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg",
										"aria-label": `Remove ${file.name}`,
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
											width: "12",
											height: "12",
											viewBox: "0 0 14 14",
											fill: "none",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
												d: "M3 3l8 8M11 3l-8 8",
												stroke: "currentColor",
												strokeWidth: "1.5",
												strokeLinecap: "round"
											})
										})
									})
								]
							}, id))
						}) : null,
						error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs text-danger",
							role: "alert",
							children: error
						}) : null
					]
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
					disabled: isSaving || !submitTitle,
					children: isSaving ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "inline-block size-3 animate-spin rounded-full border-2 border-bg/30 border-t-bg" }), attachments.length > 0 ? "Creating and uploading…" : "Creating…"]
					}) : "Create issue"
				})] })
			]
		})
	})] });
}
function NewIssueLabels({ selectedIds, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LabelPicker, {
		selectedIds,
		onChange,
		trigger: ({ onClick }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			type: "button",
			onClick,
			className: "inline-flex h-7 items-center gap-1.5 rounded-md border border-border-subtle bg-bg px-2 font-mono text-[11px] text-fg-muted transition-colors hover:border-border hover:text-fg",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LabelTagIcon, {}), selectedIds.length > 0 ? `${selectedIds.length} labels` : "labels"]
		})
	});
}
function LabelTagIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		width: "11",
		height: "11",
		viewBox: "0 0 14 14",
		fill: "none",
		"aria-hidden": true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M7.5 1.5h4a1 1 0 011 1v4l-6 6a1 1 0 01-1.4 0L1.5 8.4a1 1 0 010-1.4l6-6z",
			stroke: "currentColor",
			strokeWidth: "1.4",
			strokeLinejoin: "round"
		})
	});
}
//#endregion
//#region src/components/issue-skeleton.tsx
function IssueSkeleton() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-center gap-3 border-b border-border-subtle px-4 py-2.5 last:border-b-0",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "size-1.5 shrink-0 rounded-full" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-3 w-14 shrink-0" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-3 flex-1" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "hidden h-3 w-12 sm:block" })
		]
	});
}
function DashboardSkeleton() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "animate-fade-in p-5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
			className: "mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4",
			children: Array.from({ length: 4 }).map((_, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-2 rounded-lg border border-border-subtle bg-surface px-4 py-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-3 w-12" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-5 w-8" })]
			}, index))
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-lg border border-border bg-surface",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between border-b border-border-subtle px-4 py-2.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-3 w-16" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-3 w-20" })]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: Array.from({ length: 6 }).map((_, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IssueSkeleton, {}, index)) })]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-lg border border-border bg-surface",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "border-b border-border-subtle px-4 py-2.5",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-3 w-16" })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-3 p-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-9 w-full" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-20 w-full" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-2 gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-9 w-full" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "h-9 w-full" })]
						})
					]
				})]
			})]
		})]
	});
}
//#endregion
//#region src/routes/_app.issues.tsx?tsr-split=component
var viewKeys = Object.keys(viewLabels);
function IssuesPage() {
	const navigate = useNavigate();
	const search = Route.useSearch();
	const currentUserId = useSession().data?.user?.id ?? null;
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const issueId = pathname.startsWith("/issues/") ? decodeURIComponent(pathname.slice(8)) : null;
	const { issues, isLoading, error, dismissError, addIssue } = useIssues();
	const createIssueMutation = useCreateIssue();
	const updateIssueMutation = useUpdateIssue();
	const deleteIssueMutation = useDeleteIssue();
	const [view, setView] = (0, import_react.useState)("all");
	const [dragOverView, setDragOverView] = (0, import_react.useState)(null);
	const [filters, setFilters] = (0, import_react.useState)(emptyFilters);
	const { isFavorite, toggleFavorite } = useFavorites();
	const { options: displayOptions, update: updateDisplay, updateProperties } = useDisplayOptions();
	const effectiveViewMode = useMediaQuery("(max-width: 1023px)") && displayOptions.viewMode === "board" ? "list" : displayOptions.viewMode;
	const { confirm, dialog: confirmDialog } = useConfirmDialog();
	const onboarding = useOnboarding();
	const { statuses } = useIssueStatuses();
	const viewDropStatus = {
		all: null,
		active: firstStatusForCategory(statuses, "active", "todo"),
		backlog: firstStatusForCategory(statuses, "backlog", "backlog"),
		done: firstStatusForCategory(statuses, "done", "done")
	};
	(0, import_react.useEffect)(() => {
		onboarding.setFirstIssueId(issues[0]?.id ?? null);
	}, [issues, onboarding]);
	const handleToggleFavorite = (id) => {
		(async () => {
			const wasFavorite = isFavorite("issue", id);
			try {
				await toggleFavorite("issue", id);
				toast.success(wasFavorite ? "Removed from favorites" : "Pinned to sidebar");
			} catch {
				toast.error("Failed to update favorite");
			}
		})();
	};
	const [focusedId, setFocusedId] = (0, import_react.useState)(null);
	const [selectedIds, setSelectedIds] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
	const [lastClickedId, setLastClickedId] = (0, import_react.useState)(null);
	const filteredIssues = (0, import_react.useMemo)(() => {
		let pool = issues;
		if (view !== "all") pool = pool.filter((issue) => issueMatchesView(issue, view, statuses));
		if (filters.statuses.length > 0) pool = pool.filter((issue) => filters.statuses.includes(issue.status));
		if (filters.priorities.length > 0) pool = pool.filter((issue) => filters.priorities.includes(issue.priority));
		if (filters.assigneeIds.length > 0) pool = pool.filter((issue) => issue.assignedTo && filters.assigneeIds.includes(issue.assignedTo.id));
		if (filters.projectIds.length > 0) pool = pool.filter((issue) => issue.projectId !== null && issue.projectId !== void 0 && filters.projectIds.includes(issue.projectId));
		if (filters.labelIds.length > 0) pool = pool.filter((issue) => (issue.labels ?? []).some((l) => filters.labelIds.includes(l.id)));
		return pool;
	}, [
		issues,
		view,
		filters,
		statuses
	]);
	(0, import_react.useEffect)(() => {
		if (!search.mine || !currentUserId) return;
		setFilters((current) => current.assigneeIds.includes(currentUserId) ? current : {
			...current,
			assigneeIds: [...current.assigneeIds, currentUserId]
		});
		navigate({
			to: "/issues",
			search: (prev) => ({
				...prev,
				mine: void 0
			}),
			replace: true
		});
	}, [
		search.mine,
		currentUserId,
		navigate
	]);
	(0, import_react.useEffect)(() => {
		if (!search.new) return;
		window.dispatchEvent(new CustomEvent("produktive:new-issue"));
		navigate({
			to: "/issues",
			search: (prev) => ({
				...prev,
				new: void 0
			}),
			replace: true
		});
	}, [search.new, navigate]);
	const counts = (0, import_react.useMemo)(() => ({
		all: issues.length,
		active: issues.filter((issue) => issueMatchesView(issue, "active", statuses)).length,
		backlog: issues.filter((issue) => issueMatchesView(issue, "backlog", statuses)).length,
		done: issues.filter((issue) => issueMatchesView(issue, "done", statuses)).length
	}), [issues, statuses]);
	const onSelect = (id, event) => {
		if (event && (event.metaKey || event.ctrlKey)) {
			setSelectedIds((current) => {
				const next = new Set(current);
				if (next.has(id)) next.delete(id);
				else next.add(id);
				return next;
			});
			setLastClickedId(id);
			return;
		}
		if (event && event.shiftKey && lastClickedId) {
			const startIdx = filteredIssues.findIndex((i) => i.id === lastClickedId);
			const endIdx = filteredIssues.findIndex((i) => i.id === id);
			if (startIdx >= 0 && endIdx >= 0) {
				const [a, b] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
				const range = filteredIssues.slice(a, b + 1).map((i) => i.id);
				setSelectedIds((current) => new Set([...current, ...range]));
				setLastClickedId(id);
				return;
			}
		}
		if (selectedIds.size > 0) {
			setSelectedIds((current) => {
				const next = new Set(current);
				if (next.has(id)) next.delete(id);
				else next.add(id);
				return next;
			});
			setLastClickedId(id);
			return;
		}
		setLastClickedId(id);
		navigate({
			to: "/issues/$issueId",
			params: { issueId: id }
		});
	};
	const clearSelection = () => {
		setSelectedIds(/* @__PURE__ */ new Set());
		setLastClickedId(null);
	};
	const toggleIssueSelected = (id) => {
		setSelectedIds((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
		setLastClickedId(id);
	};
	const allFilteredSelected = filteredIssues.length > 0 && filteredIssues.every((issue) => selectedIds.has(issue.id));
	const toggleAllFiltered = () => {
		if (filteredIssues.length === 0) return;
		setSelectedIds((current) => {
			if (allFilteredSelected) {
				const next = new Set(current);
				for (const issue of filteredIssues) next.delete(issue.id);
				return next;
			}
			return new Set([...current, ...filteredIssues.map((issue) => issue.id)]);
		});
		setLastClickedId(filteredIssues[0]?.id ?? null);
	};
	const handleBulkSetStatus = async (status) => {
		const ids = Array.from(selectedIds);
		clearSelection();
		const failures = (await Promise.allSettled(ids.map((id) => updateIssueMutation.mutateAsync({
			id,
			patch: { status }
		})))).filter((r) => r.status === "rejected").length;
		if (failures === 0) toast.success(`Moved ${ids.length} to ${statusName(statuses, status)}`);
		else toast.error(`Failed for ${failures} issue(s)`);
	};
	const handleBulkSetPriority = async (priority) => {
		const ids = Array.from(selectedIds);
		clearSelection();
		const failures = (await Promise.allSettled(ids.map((id) => updateIssueMutation.mutateAsync({
			id,
			patch: { priority }
		})))).filter((r) => r.status === "rejected").length;
		if (failures === 0) toast.success(`Updated priority for ${ids.length}`);
		else toast.error(`Failed for ${failures} issue(s)`);
	};
	const handleBulkDelete = () => {
		const ids = Array.from(selectedIds);
		if (ids.length === 0) return;
		confirm({
			title: `Delete ${ids.length} issue${ids.length === 1 ? "" : "s"}?`,
			description: "This can't be undone.",
			confirmLabel: `Delete ${ids.length === 1 ? "issue" : "all"}`,
			destructive: true,
			onConfirm: async () => {
				clearSelection();
				const failures = (await Promise.allSettled(ids.map((id) => deleteIssueMutation.mutateAsync(id)))).filter((r) => r.status === "rejected").length;
				if (failures === 0) toast.success(`Deleted ${ids.length}`);
				else toast.error(`Failed to delete ${failures}`);
			}
		});
	};
	(0, import_react.useEffect)(() => {
		if (issueId) return;
		if (filteredIssues.length === 0) return;
		const handler = (event) => {
			const target = event.target;
			if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (event.key === "j" || event.key === "ArrowDown") {
				event.preventDefault();
				setFocusedId((current) => {
					const idx = current ? filteredIssues.findIndex((i) => i.id === current) : -1;
					return filteredIssues[Math.min(filteredIssues.length - 1, idx + 1)]?.id ?? filteredIssues[0]?.id ?? null;
				});
			} else if (event.key === "k" || event.key === "ArrowUp") {
				event.preventDefault();
				setFocusedId((current) => {
					const idx = current ? filteredIssues.findIndex((i) => i.id === current) : 0;
					return filteredIssues[Math.max(0, idx - 1)]?.id ?? filteredIssues[0]?.id ?? null;
				});
			} else if (event.key === "Enter" && focusedId) {
				event.preventDefault();
				onSelect(focusedId);
			} else if (event.key === "x" && focusedId) {
				event.preventDefault();
				setSelectedIds((current) => {
					const next = new Set(current);
					if (next.has(focusedId)) next.delete(focusedId);
					else next.add(focusedId);
					return next;
				});
			} else if (event.key === "Escape") {
				if (selectedIds.size > 0) {
					event.preventDefault();
					clearSelection();
				}
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [
		issueId,
		filteredIssues,
		focusedId,
		selectedIds
	]);
	(0, import_react.useEffect)(() => {
		if (!focusedId) return;
		document.querySelector(`[data-issue-row="${focusedId}"]`)?.scrollIntoView({ block: "nearest" });
	}, [focusedId]);
	if (issueId) {
		const idx = filteredIssues.findIndex((i) => i.id === issueId);
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IssueDetail, {
			issueId,
			siblings: {
				position: idx >= 0 ? idx + 1 : null,
				total: filteredIssues.length,
				prevId: idx > 0 ? filteredIssues[idx - 1].id : null,
				nextId: idx >= 0 && idx < filteredIssues.length - 1 ? filteredIssues[idx + 1].id : null
			}
		}, issueId);
	}
	const handleCreateInGroup = async (status, title) => {
		try {
			await createIssueMutation.mutateAsync({
				title,
				status
			});
			toast.success("Issue created");
		} catch (createError) {
			toast.error(createError instanceof Error ? createError.message : "Failed to create issue");
		}
	};
	const handleMoveToStatus = async (movingId, nextStatus) => {
		const previous = issues.find((issue) => issue.id === movingId)?.status;
		if (!previous || previous === nextStatus) return;
		try {
			await updateIssueMutation.mutateAsync({
				id: movingId,
				patch: { status: nextStatus }
			});
			toast.success(`Moved to ${statusName(statuses, nextStatus)}`);
		} catch (moveError) {
			toast.error(moveError instanceof Error ? moveError.message : "Failed to move issue");
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		confirmDialog,
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: cn("sticky top-0 z-10 flex h-12 items-center justify-between gap-3 border-b border-border-subtle bg-bg/85 px-5 backdrop-blur", "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-3 after:bg-gradient-to-b after:from-bg/60 after:to-transparent"),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IssuesIcon, {
						size: 14,
						className: "text-fg-muted"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "text-sm font-medium text-fg",
						children: "Issues"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-xs text-fg-muted tabular-nums",
						children: filteredIssues.length
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "hidden text-[11px] text-fg-faint sm:inline",
					children: [
						"Press",
						" ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", {
							className: "rounded border border-border bg-surface px-1 font-mono text-[10px]",
							children: "C"
						}),
						" ",
						"to create"
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NewIssueDialog, {
					shortcutEnabled: true,
					onCreated: (issue) => {
						addIssue(issue);
						onboarding.signal("issue-created");
					}
				})]
			})]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
			className: "flex items-center gap-1 border-b border-border-subtle bg-bg px-5 py-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex flex-1 items-center gap-1",
					children: viewKeys.map((key) => {
						const isActive = view === key;
						const dropStatus = viewDropStatus[key];
						const isDropping = dragOverView === key;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => setView(key),
							onDragOver: (event) => {
								if (!dropStatus) return;
								if (!event.dataTransfer.types.includes("application/x-produktive-issue")) return;
								event.preventDefault();
								event.dataTransfer.dropEffect = "move";
								if (dragOverView !== key) setDragOverView(key);
							},
							onDragLeave: (event) => {
								if (event.currentTarget.contains(event.relatedTarget)) return;
								if (dragOverView === key) setDragOverView(null);
							},
							onDrop: (event) => {
								if (!dropStatus) return;
								const issueId = event.dataTransfer.getData(ISSUE_DRAG_MIME);
								setDragOverView(null);
								if (!issueId) return;
								event.preventDefault();
								handleMoveToStatus(issueId, dropStatus);
							},
							className: cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors", isDropping ? "bg-accent/15 text-accent ring-1 ring-accent/40" : isActive ? "bg-surface text-fg" : "text-fg-muted hover:bg-surface hover:text-fg"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: viewLabels[key] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: cn("text-[11px] tabular-nums", isDropping ? "text-accent" : "text-fg-faint"),
								children: counts[key]
							})]
						}, key);
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IssueToolbar, {
					displayOptions,
					onDisplayChange: updateDisplay,
					onPropertiesChange: updateProperties,
					filters,
					statuses,
					onFiltersChange: setFilters
				}),
				effectiveViewMode === "list" && filteredIssues.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: toggleAllFiltered,
					className: cn("inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors", allFilteredSelected ? "border-accent/40 bg-accent/10 text-accent" : "border-border-subtle text-fg-muted hover:border-border hover:bg-surface hover:text-fg"),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: cn("grid size-3.5 place-items-center rounded-[3px] border", allFilteredSelected ? "border-accent bg-accent text-bg" : "border-border text-transparent"),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectCheckIcon, {})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: allFilteredSelected ? "Clear" : "Select all" })]
				}) : null
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IssueFilterChips, {
			filters,
			statuses,
			onChange: setFilters
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			"data-tour": "issue-list",
			children: [error ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "m-5 flex items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: error }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "text-fg-muted hover:text-fg transition-colors",
					onClick: dismissError,
					children: "Dismiss"
				})]
			}) : null, isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DashboardSkeleton, {}) : issues.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, {}) : filteredIssues.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyView, {
				view,
				onSwitchView: setView
			}) : effectiveViewMode === "board" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IssueBoard, {
				issues: filteredIssues,
				statuses,
				onSelect,
				onMoveToStatus: handleMoveToStatus,
				onCreateInGroup: handleCreateInGroup
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IssueList, {
				issues: filteredIssues,
				statuses,
				selectedId: null,
				focusedId,
				selectedIds,
				onSelect,
				onToggleSelected: toggleIssueSelected,
				onMoveToStatus: handleMoveToStatus,
				onCreateInGroup: handleCreateInGroup,
				isFavorite: (id) => isFavorite("issue", id),
				onToggleFavorite: handleToggleFavorite,
				displayOptions
			})]
		}),
		selectedIds.size > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BulkActionBar, {
			count: selectedIds.size,
			statuses,
			onSetStatus: (status) => void handleBulkSetStatus(status),
			onSetPriority: (priority) => void handleBulkSetPriority(priority),
			onDelete: handleBulkDelete,
			onClear: clearSelection
		}) : null
	] });
}
function SelectCheckIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		width: "9",
		height: "9",
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
function EmptyView({ view, onSwitchView }) {
	const target = {
		all: "active",
		active: "all",
		backlog: "all",
		done: "all"
	}[view];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col items-center justify-center px-6 py-16 text-center",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "text-sm text-fg",
			children: [
				"No ",
				viewLabels[view].toLowerCase(),
				"."
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "mt-1 text-xs text-fg-muted",
			children: [
				"Try",
				" ",
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => onSwitchView(target),
					className: "text-accent transition-colors hover:text-accent-hover",
					children: viewLabels[target]
				}),
				"."
			]
		})]
	});
}
//#endregion
export { IssuesPage as component };

//# sourceMappingURL=_app.issues-ByU934Yl.js.map