import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { c as useRouterState, d as Outlet, g as useNavigate } from "./initial-BUIQ08st.js";
import { v as toast } from "./initial-BjZJRI-E.js";
import { D as projectColorHex, Vn as cn, k as projectStatusLabel } from "./initial-BOT0Y-sv.js";
import { B as ProjectsIcon, _ as Avatar, c as ProjectIcon } from "./initial-BWSisseh.js";
import { t as useProjects } from "./use-projects-DXOYwJpR.js";
import { n as useUpdateProject, r as ProjectStatusIcon } from "./projects-D7AJhZUh.js";
import { t as NewProjectDialog } from "./new-project-dialog-B3sWUiRu.js";
//#region src/routes/_app.projects.tsx?tsr-split=component
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var viewLabels = {
	all: "All",
	active: "Active",
	completed: "Completed",
	archived: "Archived"
};
function ProjectsPage() {
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const [view, setView] = (0, import_react.useState)("active");
	const { projects, isLoading, error, addProject } = useProjects(view === "archived" || view === "all");
	const updateProjectMutation = useUpdateProject();
	const filtered = (0, import_react.useMemo)(() => {
		if (view === "all") return projects;
		if (view === "active") return projects.filter((p) => p.archivedAt === null && (p.status === "planned" || p.status === "in-progress"));
		if (view === "completed") return projects.filter((p) => p.archivedAt === null && p.status === "completed");
		return projects.filter((p) => p.archivedAt !== null);
	}, [projects, view]);
	const counts = (0, import_react.useMemo)(() => ({
		all: projects.length,
		active: projects.filter((p) => p.archivedAt === null && (p.status === "planned" || p.status === "in-progress")).length,
		completed: projects.filter((p) => p.archivedAt === null && p.status === "completed").length,
		archived: projects.filter((p) => p.archivedAt !== null).length
	}), [projects]);
	if (pathname.startsWith("/projects/")) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {});
	const handleArchiveToggle = async (project) => {
		const next = project.archivedAt === null;
		try {
			await updateProjectMutation.mutateAsync({
				id: project.id,
				patch: { archived: next }
			});
			toast.success(next ? "Project archived" : "Project restored");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to update project");
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "min-h-full bg-bg",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "sticky top-0 z-10 flex h-12 items-center justify-between gap-3 border-b border-border-subtle bg-bg/85 px-5 backdrop-blur",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-fg-muted",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectsIcon, {})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "text-sm font-medium text-fg",
						children: "Projects"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-xs text-fg-muted tabular-nums",
						children: filtered.length
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NewProjectDialog, { onCreated: (project) => {
				addProject(project);
				navigate({
					to: "/projects/$projectId",
					params: { projectId: project.id }
				});
			} })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "mx-auto w-full max-w-[980px] px-5 pb-20 pt-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-col gap-5 border-b border-border-subtle pb-5 md:flex-row md:items-end md:justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-faint",
							children: "Portfolio"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "mt-1 text-[24px] font-medium tracking-[-0.02em] text-fg",
							children: "Project work"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 text-[12.5px] text-fg-muted",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "tabular-nums text-fg",
									children: filtered.length
								}),
								" ",
								filtered.length === 1 ? "project" : "projects",
								" in ",
								viewLabels[view].toLowerCase(),
								"."
							]
						})
					] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid grid-cols-3 divide-x divide-border-subtle border-y border-border-subtle md:min-w-[340px]",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SummaryStat, {
								label: "Active",
								value: counts.active
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SummaryStat, {
								label: "Completed",
								value: counts.completed
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SummaryStat, {
								label: "Archived",
								value: counts.archived
							})
						]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
					className: "mt-4 flex flex-wrap items-center gap-1",
					children: Object.keys(viewLabels).map((key) => {
						const isActive = view === key;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => setView(key),
							className: cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] transition-colors active:scale-[0.98]", isActive ? "bg-surface text-fg" : "text-fg-muted hover:bg-surface/60 hover:text-fg"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: viewLabels[key] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: cn("font-mono text-[11px]", isActive ? "text-fg-muted" : "text-fg-faint"),
								children: counts[key]
							})]
						}, key);
					})
				}),
				error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-5 border-y border-danger/30 py-3 text-[13px] text-danger",
					children: error
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-5",
					children: isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectListSkeleton, {}) : projects.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, { onCreate: (suggestedName) => {
						window.dispatchEvent(new CustomEvent("produktive:new-project", { detail: { name: suggestedName } }));
					} }) : filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-[13px] text-fg-faint",
						children: [
							"No projects in ",
							viewLabels[view].toLowerCase(),
							"."
						]
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "border-y border-border-subtle",
						children: filtered.map((project) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectRow, {
							project,
							onOpen: () => void navigate({
								to: "/projects/$projectId",
								params: { projectId: project.id }
							}),
							onArchiveToggle: () => void handleArchiveToggle(project)
						}, project.id))
					})
				})
			]
		})]
	});
}
function SummaryStat({ label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "px-3 py-2.5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "font-mono text-[17px] leading-none text-fg tabular-nums",
			children: value
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-1 text-[11px] text-fg-faint",
			children: label
		})]
	});
}
function ProjectRow({ project, onOpen, onArchiveToggle }) {
	const progress = project.issueCount === 0 ? 0 : project.doneCount / project.issueCount;
	const isArchived = project.archivedAt !== null;
	const percent = Math.round(progress * 100);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		role: "button",
		tabIndex: 0,
		onClick: onOpen,
		onKeyDown: (event) => {
			if (event.key !== "Enter") return;
			event.preventDefault();
			onOpen();
		},
		className: cn("group grid w-full cursor-pointer grid-cols-1 gap-3 border-b border-border-subtle px-0 py-4 text-left transition-colors last:border-b-0 hover:bg-surface/25 focus-visible:bg-surface/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:bg-surface/35 md:grid-cols-[minmax(0,1fr)_220px_76px]", isArchived && "opacity-70"),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex min-w-0 items-start gap-3 px-0 md:px-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectIcon, {
					color: project.color,
					icon: project.icon,
					name: project.name,
					size: "lg"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0 flex-1",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex min-w-0 items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "truncate text-[13.5px] font-medium text-fg",
							children: project.name
						}), isArchived ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "shrink-0 rounded-full border border-border-subtle px-1.5 py-px text-[10.5px] uppercase tracking-[0.04em] text-fg-faint",
							children: "Archived"
						}) : null]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-fg-muted",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectStatusIcon, {
								status: project.status,
								progress,
								size: "sm"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: projectStatusLabel[project.status] ?? project.status }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sep, {}),
							project.lead ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "inline-flex items-center gap-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, {
									name: project.lead.name,
									image: project.lead.image
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: project.lead.name })]
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-fg-faint",
								children: "No lead"
							}),
							project.targetDate ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sep, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono text-[11px]",
								children: new Date(project.targetDate).toLocaleDateString("en", {
									month: "short",
									day: "numeric"
								})
							})] }) : null
						]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "px-0 md:px-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between gap-3 text-[11px] text-fg-muted",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "font-mono tabular-nums",
						children: [
							project.doneCount,
							" / ",
							project.issueCount
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "font-mono tabular-nums text-fg-faint",
						children: [percent, "%"]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-2 h-1 overflow-hidden rounded-full bg-surface",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "h-full transition-all",
						style: {
							width: `${percent}%`,
							backgroundColor: projectColorHex[project.color] ?? "#5b8cff"
						}
					})
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "flex items-center justify-start px-0 md:justify-end md:px-3",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: (event) => {
						event.stopPropagation();
						onArchiveToggle();
					},
					className: "rounded-md px-2 py-1 text-[11.5px] text-fg-faint opacity-100 transition-colors hover:bg-surface hover:text-fg active:scale-[0.98] md:opacity-0 md:group-hover:opacity-100 md:group-focus-visible:opacity-100",
					children: isArchived ? "Restore" : "Archive"
				})
			})
		]
	});
}
function ProjectListSkeleton() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "border-y border-border-subtle",
		children: Array.from({ length: 5 }).map((_, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid grid-cols-1 gap-3 border-b border-border-subtle px-0 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_220px_76px]",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-start gap-3 px-0 md:px-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "size-8 rounded-[8px] bg-surface/70" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-3.5 w-40 rounded-full bg-surface/80" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mt-2 h-2.5 w-56 max-w-full rounded-full bg-surface/50" })]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "px-0 md:px-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-2.5 w-12 rounded-full bg-surface/60" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-2.5 w-8 rounded-full bg-surface/40" })]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mt-2 h-1 rounded-full bg-surface/60" })]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "hidden px-3 md:block",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "ml-auto h-5 w-14 rounded-md bg-surface/40" })
				})
			]
		}, index))
	});
}
function EmptyState({ onCreate }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col items-center py-20 text-center",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mb-4 grid size-11 place-items-center rounded-[10px] border border-border-subtle bg-surface/40 text-fg-muted",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectsIcon, { size: 22 })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-[15px] font-medium text-fg",
				children: "Track work as projects"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 max-w-[360px] text-[13px] text-fg-muted",
				children: "Projects group related issues into initiatives — from a launch to a polish week. Try one of these to get started:"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-5 flex flex-wrap items-center justify-center gap-2",
				children: [
					"Q2 launch",
					"Onboarding revamp",
					"Bug bash"
				].map((suggestion) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => onCreate(suggestion),
					className: "rounded-full border border-border-subtle bg-transparent px-3 py-1 text-[12px] text-fg-muted transition-colors hover:border-border hover:text-fg active:scale-[0.98]",
					children: suggestion
				}, suggestion))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => onCreate(),
				className: "mt-5 rounded-md bg-fg px-3 py-1.5 text-[12.5px] font-medium text-bg transition-colors hover:bg-white active:scale-[0.98]",
				children: "+ Create project"
			})
		]
	});
}
function Sep() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "select-none text-fg-faint/60",
		children: "·"
	});
}
//#endregion
export { ProjectsPage as component };

//# sourceMappingURL=_app.projects-Bxny_qMi.js.map