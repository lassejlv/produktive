import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { c as useRouterState, d as Outlet, h as Link } from "./initial-BUIQ08st.js";
import { $ as useIssuesQuery, F as sortedStatuses, I as statusCategory, St as useSession, Vn as cn, W as useProjectsQuery, i as useIssueStatuses } from "./initial-BOT0Y-sv.js";
import { c as ProjectIcon, d as StatusIcon } from "./initial-BWSisseh.js";
//#region src/routes/_app.workspace.tsx?tsr-split=component
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var PRIORITY_RANK = {
	urgent: 0,
	high: 1,
	medium: 2,
	low: 3,
	none: 4
};
function WorkspaceRoute() {
	if (useRouterState({ select: (state) => state.location.pathname }) !== "/workspace") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WorkspaceOverview, {});
}
function WorkspaceOverview() {
	const session = useSession();
	const issuesQuery = useIssuesQuery();
	const projectsQuery = useProjectsQuery();
	const { statuses } = useIssueStatuses();
	const issues = issuesQuery.data ?? [];
	const projects = projectsQuery.data ?? [];
	const userId = session.data?.user?.id ?? null;
	const orgName = session.data?.organization?.name ?? "Workspace";
	const counts = (0, import_react.useMemo)(() => {
		let active = 0;
		let inProgress = 0;
		let done = 0;
		for (const issue of issues) if (issue.status === "in-progress") {
			active++;
			inProgress++;
		} else if (statusCategory(statuses, issue.status) === "active") active++;
		else if (statusCategory(statuses, issue.status) === "backlog") active++;
		else if (statusCategory(statuses, issue.status) === "done") done++;
		return {
			active,
			inProgress,
			done
		};
	}, [issues, statuses]);
	const focusIssues = (0, import_react.useMemo)(() => {
		if (!userId) return [];
		const statusRank = new Map(sortedStatuses(statuses).map((status, index) => [status.key, index]));
		return issues.filter((issue) => issue.assignedTo?.id === userId && !["done", "canceled"].includes(statusCategory(statuses, issue.status))).sort((a, b) => {
			const sa = statusRank.get(a.status) ?? 999;
			const sb = statusRank.get(b.status) ?? 999;
			if (sa !== sb) return sa - sb;
			const pa = PRIORITY_RANK[a.priority] ?? 9;
			const pb = PRIORITY_RANK[b.priority] ?? 9;
			if (pa !== pb) return pa - pb;
			return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
		}).slice(0, 5);
	}, [
		issues,
		statuses,
		userId
	]);
	const activeProjects = (0, import_react.useMemo)(() => projects.filter((p) => p.archivedAt === null && (p.status === "planned" || p.status === "in-progress")).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5), [projects]);
	const isLoading = issuesQuery.isPending || projectsQuery.isPending;
	const empty = !isLoading && issues.length === 0 && projects.length === 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "min-h-full bg-bg",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
			className: "sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-border-subtle bg-bg/85 px-5 backdrop-blur",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "text-sm font-medium text-fg",
				children: "Overview"
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
			className: "mx-auto w-full max-w-[640px] px-6 py-12",
			children: isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] text-fg-faint",
				children: "Loading…"
			}) : empty ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col items-center justify-center py-24 text-center",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[13.5px] text-fg",
					children: "Add your first issue to get started."
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: "/issues",
					className: "mt-3 text-[12px] text-fg-muted transition-colors hover:text-fg",
					children: "Go to issues →"
				})]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-[24px] font-medium tracking-[-0.02em] text-fg",
					children: orgName
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-1.5 text-[13px] text-fg-muted",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "tabular-nums",
							children: counts.active
						}),
						" active",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sep, {}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "tabular-nums",
							children: counts.inProgress
						}),
						" in progress",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sep, {}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "tabular-nums",
							children: counts.done
						}),
						" done"
					]
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, {
					title: "Your focus",
					actionLabel: "All issues",
					actionTo: "/issues",
					children: focusIssues.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[13px] text-fg-faint",
						children: "Nothing on your plate."
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "-mx-2 flex flex-col",
						children: focusIssues.map((issue) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
							to: "/issues/$issueId",
							params: { issueId: issue.id },
							className: "group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface/40",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusIcon, {
									status: issue.status,
									statuses
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "min-w-0 flex-1 truncate text-[13.5px] text-fg",
									children: issue.title
								}),
								issue.project ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "shrink-0 text-[11.5px] text-fg-faint",
									children: issue.project.name
								}) : null
							]
						}) }, issue.id))
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, {
					title: "Projects",
					actionLabel: "All projects",
					actionTo: "/projects",
					children: activeProjects.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[13px] text-fg-faint",
						children: "No projects yet."
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "-mx-2 flex flex-col",
						children: activeProjects.map((project) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
							to: "/projects/$projectId",
							params: { projectId: project.id },
							className: "group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface/40",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectIcon, {
									color: project.color,
									icon: project.icon,
									name: project.name,
									size: "sm"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "min-w-0 flex-1 truncate text-[13.5px] text-fg",
									children: project.name
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "shrink-0 text-[11.5px] tabular-nums text-fg-faint",
									children: [
										project.doneCount,
										" / ",
										project.issueCount
									]
								})
							]
						}) }, project.id))
					})
				})
			] })
		})]
	});
}
function Sep() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "px-1.5 text-fg-faint",
		children: "·"
	});
}
function Section({ title, actionLabel, actionTo, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "mt-12",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mb-3 flex items-baseline justify-between",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint",
				children: title
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
				to: actionTo,
				className: cn("text-[11.5px] text-fg-muted transition-colors hover:text-fg"),
				children: [actionLabel, " →"]
			})]
		}), children]
	});
}
//#endregion
export { WorkspaceRoute as component };

//# sourceMappingURL=_app.workspace-CaZFRAJz.js.map