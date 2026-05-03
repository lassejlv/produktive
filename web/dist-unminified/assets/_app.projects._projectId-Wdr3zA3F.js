import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { g as useNavigate, h as Link } from "./initial-BUIQ08st.js";
import { v as toast } from "./initial-BjZJRI-E.js";
import { A as projectStatusOptions, D as projectColorHex, F as sortedStatuses, L as statusName, U as useProjectDetailQuery, Vn as cn, _ as defaultDisplayOptions, c as useUpdateIssue, et as useUserPreferences, i as useIssueStatuses, k as projectStatusLabel, o as useCreateIssue, rt as useRegisterTab } from "./initial-BOT0Y-sv.js";
import { _ as Avatar, a as SelectTrigger, c as ProjectIcon, g as EditableDescription, h as EditableTitle, i as SelectItem, n as Select, p as MemberPicker, r as SelectContent, v as useConfirmDialog } from "./initial-BWSisseh.js";
import { o as Route } from "./initial-Cbvcoh8y.js";
import { t as useIssues } from "./use-issues-BFKzL-a-.js";
import { n as IssueList } from "./issue-list-Dpbqy9qW.js";
import { n as useUpdateProject, r as ProjectStatusIcon, t as useDeleteProject } from "./projects-D7AJhZUh.js";
//#region src/routes/_app.projects.$projectId.tsx?tsr-split=component
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function ProjectDetailPage() {
	const { projectId } = Route.useParams();
	const navigate = useNavigate();
	const projectQuery = useProjectDetailQuery(projectId);
	const project = projectQuery.data ?? null;
	const [menuOpen, setMenuOpen] = (0, import_react.useState)(false);
	const { issues } = useIssues();
	const { statuses } = useIssueStatuses();
	const updateProjectMutation = useUpdateProject();
	const deleteProjectMutation = useDeleteProject();
	const createIssueMutation = useCreateIssue();
	const updateIssueMutation = useUpdateIssue();
	const { confirm, dialog } = useConfirmDialog();
	const projectIssues = (0, import_react.useMemo)(() => issues.filter((issue) => issue.projectId === projectId), [issues, projectId]);
	const statusBreakdown = (0, import_react.useMemo)(() => {
		const counts = /* @__PURE__ */ new Map();
		for (const issue of projectIssues) counts.set(issue.status, (counts.get(issue.status) ?? 0) + 1);
		return sortedStatuses(statuses).map((status) => ({
			key: status.key,
			name: status.name,
			count: counts.get(status.key) ?? 0
		}));
	}, [projectIssues, statuses]);
	const { tabsEnabled } = useUserPreferences();
	useRegisterTab({
		tabType: "project",
		targetId: projectId,
		title: project?.name,
		enabled: tabsEnabled
	});
	const updateField = async (patch) => {
		if (!project) return;
		try {
			await updateProjectMutation.mutateAsync({
				id: projectId,
				patch
			});
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to update");
		}
	};
	const handleStatus = (next) => void updateField({ status: next });
	const handleLead = (leadId) => void updateField({ leadId });
	const handleArchiveToggle = async () => {
		if (!project) return;
		const next = project.archivedAt === null;
		await updateField({ archived: next });
		toast.success(next ? "Project archived" : "Project restored");
	};
	const handleDelete = () => {
		if (!project) return;
		confirm({
			title: `Delete project "${project.name}"?`,
			description: "Issues in this project won't be deleted, but they'll lose the project assignment.",
			confirmLabel: "Delete project",
			destructive: true,
			onConfirm: async () => {
				try {
					await deleteProjectMutation.mutateAsync(projectId);
					toast.success("Project deleted");
					await navigate({ to: "/projects" });
				} catch (error) {
					toast.error(error instanceof Error ? error.message : "Failed to delete");
				}
			}
		});
	};
	const handleCreateInGroup = async (status, title) => {
		try {
			await createIssueMutation.mutateAsync({
				title,
				status,
				projectId
			});
			projectQuery.refetch();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to create issue");
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
			projectQuery.refetch();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to move issue");
		}
	};
	if (projectQuery.isPending || !project) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "min-h-full bg-bg p-6",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-[13px] text-fg-faint",
			children: "Loading project…"
		})
	});
	const progress = project.issueCount === 0 ? 0 : project.doneCount / project.issueCount;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "min-h-full bg-bg",
		children: [
			dialog,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "flex items-center justify-between gap-3 px-6 pt-5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
					to: "/projects",
					className: "inline-flex items-center gap-1.5 text-[12px] text-fg-faint transition-colors hover:text-fg-muted",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
						width: "11",
						height: "11",
						viewBox: "0 0 14 14",
						fill: "none",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
							d: "M9 3l-4 4 4 4",
							stroke: "currentColor",
							strokeWidth: "1.5",
							strokeLinecap: "round",
							strokeLinejoin: "round"
						})
					}), "Back to projects"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "relative",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => setMenuOpen((value) => !value),
						className: "grid size-7 place-items-center rounded-[6px] text-fg-muted transition-colors hover:bg-surface hover:text-fg",
						children: "⋯"
					}), menuOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "absolute right-0 top-8 z-30 w-44 overflow-hidden rounded-[8px] border border-border bg-surface py-1 shadow-[0_18px_40px_rgba(0,0,0,0.45)]",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuItem, {
								onClick: () => {
									setMenuOpen(false);
									handleArchiveToggle();
								},
								children: project.archivedAt === null ? "Archive project" : "Restore project"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "my-1 h-px bg-border-subtle" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuItem, {
								danger: true,
								onClick: () => {
									setMenuOpen(false);
									handleDelete();
								},
								children: "Delete project"
							})
						]
					}) : null]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
				className: "mx-auto w-full max-w-[760px] px-6 pb-24 pt-10",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectIcon, {
							color: project.color,
							icon: project.icon,
							name: project.name,
							size: "lg"
						}), project.archivedAt !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "rounded-full border border-border-subtle bg-surface/40 px-2 py-0.5 text-[10.5px] uppercase tracking-[0.06em] text-fg-muted",
							children: "Archived"
						}) : null]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-4",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditableTitle, {
							value: project.name,
							onSave: async (next) => {
								await updateField({ name: next });
							}
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 flex flex-wrap items-center gap-x-1 gap-y-1.5 text-[13px] text-fg-muted",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(InlineStatusSelect, {
								status: project.status,
								progress,
								onChange: handleStatus
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sep, {}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MemberPicker, {
								selectedId: project.leadId,
								onSelect: handleLead,
								trigger: ({ onClick }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick,
									className: "inline-flex h-6 items-center gap-1.5 rounded-[5px] px-1 transition-colors hover:bg-surface/60 hover:text-fg",
									children: project.lead ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, {
										name: project.lead.name,
										image: project.lead.image
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: project.lead.name })] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg-faint",
										children: "No lead"
									})
								})
							}),
							project.targetDate ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sep, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono text-[12px]",
								children: new Date(project.targetDate).toLocaleDateString("en", {
									month: "short",
									day: "numeric",
									year: "numeric"
								})
							})] }) : null
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-10",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditableDescription, {
							value: project.description,
							onSave: async (next) => {
								await updateField({ description: next });
							}
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "mt-12",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mb-3 flex items-center justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint",
									children: "Progress"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
									to: "/issues",
									className: "text-[11px] text-fg-muted transition-colors hover:text-fg",
									children: "Open in Issues →"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "h-2 overflow-hidden rounded-full bg-surface/60",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "h-full transition-all",
									style: {
										width: `${Math.round(progress * 100)}%`,
										backgroundColor: projectColorHex[project.color] ?? "#5b8cff"
									}
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-muted",
								children: statusBreakdown.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BreakdownPill, {
									label: item.name,
									count: item.count
								}, item.key))
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "mt-10",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "mb-3 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint",
								children: "Issues"
							}),
							projectIssues.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[13px] text-fg-faint",
								children: "No issues yet. Add the first one from a status group."
							}) : null,
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IssueList, {
								issues: projectIssues,
								statuses,
								selectedId: null,
								onSelect: (id) => void navigate({
									to: "/issues/$issueId",
									params: { issueId: id }
								}),
								onMoveToStatus: handleMoveToStatus,
								onCreateInGroup: handleCreateInGroup,
								displayOptions: defaultDisplayOptions
							})
						]
					})
				]
			})
		]
	});
}
function InlineStatusSelect({ status, progress, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
		value: status,
		onValueChange: onChange,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectTrigger, {
			"aria-label": "Status",
			className: "h-6 w-auto justify-start gap-1.5 rounded-[5px] border-0 bg-transparent px-1 capitalize hover:border-transparent hover:bg-surface/60 hover:text-fg [&>svg]:hidden",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectStatusIcon, {
				status,
				progress,
				size: "sm"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: projectStatusLabel[status] ?? status })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, {
			align: "start",
			children: projectStatusOptions.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
				value: option,
				children: projectStatusLabel[option] ?? option
			}, option))
		})]
	});
}
function BreakdownPill({ label, count }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "inline-flex items-center gap-1",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "tabular-nums text-fg-faint",
			children: count
		})]
	});
}
function Sep() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "select-none px-0.5 text-fg-faint/60",
		children: "·"
	});
}
function MenuItem({ children, onClick, danger }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		onClick,
		className: cn("flex h-8 w-full items-center px-2.5 text-left text-[12.5px] transition-colors hover:bg-surface-2", danger ? "text-danger" : "text-fg"),
		children
	});
}
//#endregion
export { ProjectDetailPage as component };

//# sourceMappingURL=_app.projects._projectId-Wdr3zA3F.js.map