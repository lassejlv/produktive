import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { g as useNavigate } from "./initial-BUIQ08st.js";
import { L as statusName, M as formatDate, Vn as cn, Yt as getMemberProfile, i as useIssueStatuses } from "./initial-BOT0Y-sv.js";
import { d as StatusIcon, f as PriorityIcon } from "./initial-BWSisseh.js";
import { a as Route } from "./initial-Cbvcoh8y.js";
//#region src/routes/_app.members.$memberId.tsx?tsr-split=component
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function MemberProfilePage() {
	const { memberId } = Route.useParams();
	const navigate = useNavigate();
	const [member, setMember] = (0, import_react.useState)(null);
	const [error, setError] = (0, import_react.useState)(null);
	const [isLoading, setIsLoading] = (0, import_react.useState)(true);
	const { statuses } = useIssueStatuses();
	(0, import_react.useEffect)(() => {
		let cancelled = false;
		setIsLoading(true);
		setError(null);
		getMemberProfile(memberId).then((response) => {
			if (!cancelled) setMember(response.member);
		}).catch((loadError) => {
			if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Failed to load member");
		}).finally(() => {
			if (!cancelled) setIsLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [memberId]);
	if (isLoading) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "p-6",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto max-w-5xl animate-pulse",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-20 rounded-lg border border-border-subtle bg-surface" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-6 grid gap-3 md:grid-cols-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-24 rounded-lg border border-border-subtle bg-surface" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-24 rounded-lg border border-border-subtle bg-surface" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-24 rounded-lg border border-border-subtle bg-surface" })
				]
			})]
		})
	});
	if (error || !member) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "grid min-h-[60vh] place-items-center px-6 text-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-sm text-fg",
			children: error ?? "Member not found"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			onClick: () => history.back(),
			className: "mt-3 text-xs text-accent hover:underline",
			children: "Go back"
		})] })
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "min-h-full bg-bg",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto max-w-5xl px-5 py-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
					className: "rounded-lg border border-border-subtle bg-bg px-4 py-4",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center justify-between gap-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex min-w-0 items-center gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MemberAvatar, {
								name: member.name,
								image: member.image
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
									className: "truncate text-lg font-medium text-fg",
									children: member.name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: member.email }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-fg-faint",
											children: "/"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "capitalize",
											children: member.role
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-fg-faint",
											children: "/"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Joined ", formatDate(member.joinedAt)] })
									]
								})]
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => history.back(),
							className: "rounded-md border border-border-subtle px-3 py-1.5 text-xs text-fg-muted transition-colors hover:bg-surface hover:text-fg",
							children: "Back"
						})]
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "mt-5 grid gap-3 sm:grid-cols-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
							label: "Assigned issues",
							value: member.stats.assignedIssues
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
							label: "Created issues",
							value: member.stats.createdIssues
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
							label: "Activity events",
							value: member.stats.activityEvents
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-lg border border-border-subtle bg-bg",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "border-b border-border-subtle px-4 py-3",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "text-sm font-medium text-fg",
								children: "Activity"
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: member.activity.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyLine, { text: "No recorded activity yet." }) : member.activity.map((event) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => event.issue && void navigate({
								to: "/issues/$issueId",
								params: { issueId: event.issue.id }
							}),
							className: "block w-full border-b border-border-subtle px-4 py-3 text-left last:border-b-0 transition-colors hover:bg-surface",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-start justify-between gap-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "truncate text-sm text-fg",
										children: [
											activityLabel(event.action),
											" ",
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-fg-muted",
												children: event.issue?.title
											})
										]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChangeSummary, { changes: event.changes })]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "shrink-0 font-mono text-[11px] text-fg-muted",
									children: formatDate(event.createdAt)
								})]
							})
						}, event.id)) })]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid content-start gap-5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IssuePanel, {
							title: "Assigned",
							issues: member.assignedIssues,
							statuses,
							onOpen: (issueId) => void navigate({
								to: "/issues/$issueId",
								params: { issueId }
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IssuePanel, {
							title: "Created",
							issues: member.createdIssues,
							statuses,
							onOpen: (issueId) => void navigate({
								to: "/issues/$issueId",
								params: { issueId }
							})
						})]
					})]
				})
			]
		})
	});
}
function Stat({ label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-lg border border-border-subtle bg-bg px-4 py-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "font-mono text-xl text-fg tabular-nums",
			children: value
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-1 text-xs text-fg-muted",
			children: label
		})]
	});
}
function MemberAvatar({ name, image }) {
	if (image) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
		src: image,
		alt: "",
		className: "size-11 shrink-0 rounded-full border border-border-subtle object-cover"
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "grid size-11 shrink-0 place-items-center rounded-full border border-border-subtle bg-surface font-mono text-sm text-fg-muted",
		children: name.slice(0, 2).toUpperCase()
	});
}
function IssuePanel({ title, issues, statuses, onOpen }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-lg border border-border-subtle bg-bg",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "border-b border-border-subtle px-4 py-3",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-sm font-medium text-fg",
				children: title
			})
		}), issues.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyLine, { text: "No issues." }) : issues.map((issue) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			type: "button",
			onClick: () => onOpen(issue.id),
			className: "flex w-full items-center gap-2 border-b border-border-subtle px-4 py-2.5 text-left last:border-b-0 transition-colors hover:bg-surface",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PriorityIcon, { priority: issue.priority }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusIcon, {
					status: issue.status,
					statuses
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "min-w-0 flex-1 truncate text-sm text-fg",
					children: issue.title
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "hidden text-[11px] text-fg-muted sm:block",
					children: statusName(statuses, issue.status)
				})
			]
		}, issue.id))]
	});
}
function ChangeSummary({ changes }) {
	if (changes.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "mt-1 text-xs text-fg-muted",
		children: "No field changes."
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "mt-1 flex flex-wrap gap-1.5",
		children: changes.slice(0, 4).map((change) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: cn("rounded border border-border-subtle bg-surface px-1.5 py-0.5", "font-mono text-[10.5px] text-fg-muted"),
			children: [
				change.field,
				": ",
				formatValue(change.before),
				" -> ",
				formatValue(change.after)
			]
		}, change.field))
	});
}
function EmptyLine({ text }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "px-4 py-5 text-sm text-fg-muted",
		children: text
	});
}
function activityLabel(action) {
	if (action === "created") return "Created";
	if (action === "updated") return "Updated";
	if (action === "attachment_added") return "Attached a file to";
	return action.replace(/_/g, " ");
}
function formatValue(value) {
	if (value === null || value === void 0) return "empty";
	if (typeof value === "string") return value || "empty";
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return "changed";
}
//#endregion
export { MemberProfilePage as component };

//# sourceMappingURL=_app.members._memberId-kA0XrE1b.js.map