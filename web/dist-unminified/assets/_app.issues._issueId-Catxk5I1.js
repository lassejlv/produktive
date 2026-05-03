import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { a as useQueryClient, g as useNavigate, h as Link, r as useQuery } from "./initial-BUIQ08st.js";
import { v as toast } from "./initial-BjZJRI-E.js";
import { $ as useIssuesQuery, At as createIssueComment, Dn as subscribeToIssue, M as formatDate, On as unsubscribeFromIssue, Q as useIssueSubscribersQuery, Vn as cn, W as useProjectsQuery, X as useIssueDetailQuery, Y as useIssueCommentsQuery, Z as useIssueHistoryQuery, a as useLabelsQuery, at as queryKeys, c as useUpdateIssue, d as formatBytes, et as useUserPreferences, g as prepareChatAttachments, i as useIssueStatuses, l as useFavorites, o as useCreateIssue, rt as useRegisterTab, s as useDeleteIssue, sn as listMembers, wt as apiPath, zn as uploadIssueAttachment } from "./initial-BOT0Y-sv.js";
import { $ as useOnboarding, D as AttachIcon, G as StarIcon, M as DotsIcon, T as ChatMarkdown, _ as Avatar, d as StatusIcon, g as EditableDescription, h as EditableTitle, t as IssueProperties, v as useConfirmDialog } from "./initial-BWSisseh.js";
import { i as Route } from "./initial-Cbvcoh8y.js";
//#region src/routes/_app.issues.$issueId.tsx?tsr-split=component
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function IssueDetailPage() {
	const { issueId } = Route.useParams();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IssueDetail, { issueId });
}
function IssueDetail({ issueId, siblings }) {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const fileInputRef = (0, import_react.useRef)(null);
	const issueQuery = useIssueDetailQuery(issueId);
	const historyQuery = useIssueHistoryQuery(issueId);
	const commentsQuery = useIssueCommentsQuery(issueId);
	const projectsQuery = useProjectsQuery();
	const labelsQuery = useLabelsQuery();
	const { statuses } = useIssueStatuses();
	const membersQuery = useQuery({
		queryKey: queryKeys.members,
		queryFn: () => listMembers().then((r) => r.members),
		staleTime: 6e4
	});
	const issue = issueQuery.data ?? null;
	const history = historyQuery.data ?? [];
	const comments = commentsQuery.data ?? [];
	const isLoading = issueQuery.isPending;
	const { tabsEnabled } = useUserPreferences();
	useRegisterTab({
		tabType: "issue",
		targetId: issueId,
		title: issue?.title,
		enabled: tabsEnabled
	});
	const lookups = (0, import_react.useMemo)(() => ({
		projects: new Map((projectsQuery.data ?? []).map((p) => [p.id, p.name])),
		members: new Map((membersQuery.data ?? []).map((m) => [m.id, m.name])),
		labels: new Map((labelsQuery.data ?? []).map((l) => [l.id, l.name]))
	}), [
		projectsQuery.data,
		membersQuery.data,
		labelsQuery.data
	]);
	const updateIssueMutation = useUpdateIssue();
	const deleteIssueMutation = useDeleteIssue();
	const [commentBody, setCommentBody] = (0, import_react.useState)("");
	const [isUploading, setIsUploading] = (0, import_react.useState)(false);
	const [isCommenting, setIsCommenting] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)(null);
	const [menuOpen, setMenuOpen] = (0, import_react.useState)(false);
	const menuRef = (0, import_react.useRef)(null);
	const { isFavorite, toggleFavorite } = useFavorites();
	const { confirm, dialog: confirmDialog } = useConfirmDialog();
	const onboarding = useOnboarding();
	const pinned = isFavorite("issue", issueId);
	(0, import_react.useEffect)(() => {
		setError(issueQuery.error?.message ?? null);
	}, [issueQuery.error]);
	(0, import_react.useEffect)(() => {
		if (!menuOpen) return;
		const onPointerDown = (event) => {
			if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
		};
		const onKey = (event) => {
			if (event.key === "Escape") setMenuOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [menuOpen]);
	(0, import_react.useEffect)(() => {
		if (!siblings) return;
		const handler = (event) => {
			const target = event.target;
			if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if ((event.key === "j" || event.key === "ArrowDown") && siblings.nextId) {
				event.preventDefault();
				navigate({
					to: "/issues/$issueId",
					params: { issueId: siblings.nextId }
				});
			} else if ((event.key === "k" || event.key === "ArrowUp") && siblings.prevId) {
				event.preventDefault();
				navigate({
					to: "/issues/$issueId",
					params: { issueId: siblings.prevId }
				});
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [siblings, navigate]);
	const reloadAfterChange = async () => {
		await Promise.all([
			qc.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) }),
			qc.invalidateQueries({ queryKey: queryKeys.issues.history(issueId) }),
			qc.invalidateQueries({ queryKey: queryKeys.issues.comments(issueId) })
		]);
	};
	(0, import_react.useEffect)(() => {
		const source = new EventSource(apiPath(`/api/realtime?channel=issueSystem&id=${encodeURIComponent(issueId)}`), { withCredentials: true });
		source.addEventListener("refresh", () => {
			reloadAfterChange();
		});
		source.addEventListener("deleted", () => {
			toast.message("Issue was deleted");
			navigate({ to: "/issues" });
		});
		return () => source.close();
	}, [issueId, navigate]);
	const timeline = (0, import_react.useMemo)(() => buildTimeline(history, comments), [history, comments]);
	const handleTogglePin = async () => {
		try {
			await toggleFavorite("issue", issueId);
			toast.success(pinned ? "Removed from favorites" : "Pinned to sidebar");
		} catch {
			toast.error("Failed to update favorite");
		}
	};
	const updateField = async (patch, errorLabel, onSuccess) => {
		if (!issue) return;
		try {
			await updateIssueMutation.mutateAsync({
				id: issue.id,
				patch
			});
			onSuccess?.();
			await reloadAfterChange();
		} catch (updateError) {
			const message = updateError instanceof Error ? updateError.message : errorLabel;
			setError(message);
			toast.error(message);
		}
	};
	const handleStatus = (next) => void updateField({ status: next }, "Failed to update issue");
	const handlePriority = (next) => void updateField({ priority: next }, "Failed to update issue", () => onboarding.signal("priority-or-assignee-changed"));
	const handleTitle = (next) => void updateField({ title: next }, "Failed to update title");
	const handleDescription = (next) => void updateField({ description: next }, "Failed to update description");
	const handleAssignee = (memberId) => void updateField({ assignedToId: memberId }, "Failed to update assignee", () => onboarding.signal("priority-or-assignee-changed"));
	const handleLabels = (labelIds) => void updateField({ labelIds }, "Failed to update labels");
	const handleProject = (projectId) => void updateField({ projectId: projectId ?? "" }, "Failed to update project", () => toast.success(projectId ? "Project updated" : "Project cleared"));
	const handleDelete = () => {
		if (!issue) return;
		confirm({
			title: "Delete this issue?",
			description: "This can't be undone.",
			confirmLabel: "Delete issue",
			destructive: true,
			onConfirm: async () => {
				try {
					await deleteIssueMutation.mutateAsync(issue.id);
					navigate({ to: "/issues" });
				} catch (deleteError) {
					const message = deleteError instanceof Error ? deleteError.message : "Failed to delete issue";
					setError(message);
					toast.error(message);
				}
			}
		});
	};
	const handleComment = async () => {
		if (!issue) return;
		const body = commentBody.trim();
		if (!body) return;
		setIsCommenting(true);
		setError(null);
		try {
			const response = await createIssueComment(issue.id, body);
			qc.setQueryData(queryKeys.issues.comments(issue.id), (old) => old ? [...old, response.comment] : [response.comment]);
			setCommentBody("");
			await reloadAfterChange();
		} catch (commentError) {
			const message = commentError instanceof Error ? commentError.message : "Failed to post comment";
			setError(message);
			toast.error(message);
		} finally {
			setIsCommenting(false);
		}
	};
	const handleAttachmentChange = async (event) => {
		if (!issue || !event.target.files?.length) return;
		const result = prepareChatAttachments(event.target.files, issue.attachments?.length ?? 0);
		event.target.value = "";
		if (result.errors.length > 0) {
			setError(result.errors[0] ?? "Failed to attach files");
			toast.error(result.errors[0] ?? "Failed to attach files");
		}
		if (result.attachments.length === 0) return;
		setIsUploading(true);
		setError(null);
		try {
			let nextIssue = issue;
			for (const draft of result.attachments) nextIssue = (await uploadIssueAttachment(nextIssue.id, draft.file)).issue;
			qc.setQueryData(queryKeys.issues.detail(issue.id), nextIssue);
			await reloadAfterChange();
			toast.success(result.attachments.length === 1 ? "File attached" : `${result.attachments.length} files attached`);
		} catch (uploadError) {
			const message = uploadError instanceof Error ? uploadError.message : "Failed to upload attachment";
			setError(message);
			toast.error(message);
		} finally {
			setIsUploading(false);
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "min-h-full bg-bg",
		"data-tour": "issue-detail",
		children: [
			confirmDialog,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "flex items-center justify-between gap-3 px-6 pt-5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: "/issues",
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
						}), "Back to issues"]
					}), siblings && siblings.position !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SiblingsNav, {
						siblings,
						onNavigate: (id) => void navigate({
							to: "/issues/$issueId",
							params: { issueId: id }
						})
					}) : null]
				}), issue ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-0.5",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							ref: fileInputRef,
							type: "file",
							multiple: true,
							className: "hidden",
							onChange: (event) => void handleAttachmentChange(event)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeaderIconButton, {
							title: pinned ? "Unpin issue" : "Pin issue",
							onClick: () => void handleTogglePin(),
							active: pinned,
							activeClass: "text-warning",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StarIcon, {
								size: 12,
								filled: pinned
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeaderIconButton, {
							title: "Attach files",
							onClick: () => fileInputRef.current?.click(),
							disabled: isUploading,
							children: isUploading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "inline-block size-3 animate-spin rounded-full border-2 border-border border-t-fg" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AttachIcon, { size: 12 })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							ref: menuRef,
							className: "relative",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeaderIconButton, {
								title: "More",
								active: menuOpen,
								onClick: () => setMenuOpen((value) => !value),
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DotsIcon, { size: 12 })
							}), menuOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "absolute right-0 top-8 z-30 w-40 overflow-hidden rounded-[8px] border border-border bg-surface py-1 shadow-[0_18px_40px_rgba(0,0,0,0.45)]",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									className: "flex h-8 w-full items-center px-2.5 text-left text-[12.5px] text-danger transition-colors hover:bg-surface-2",
									onClick: () => {
										setMenuOpen(false);
										handleDelete();
									},
									children: "Delete issue"
								})
							}) : null]
						})
					]
				}) : null]
			}),
			error ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mx-auto mt-4 flex w-full max-w-[760px] items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: error }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "text-fg-muted transition-colors hover:text-fg",
					onClick: () => setError(null),
					children: "Dismiss"
				})]
			}) : null,
			isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IssueDetailSkeleton, {}) : !issue ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col items-center justify-center px-6 py-24 text-center",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-fg",
					children: "Issue not found."
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: "/issues",
					className: "mt-3 inline-flex items-center gap-1 text-[12px] text-fg-muted transition-colors hover:text-fg",
					children: "← Back to issues"
				})]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("article", {
				className: "mx-auto w-full max-w-[1080px] px-6 pb-24 pt-10 animate-fade-in",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-10 md:grid-cols-[minmax(0,1fr)_260px]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "order-2 min-w-0 md:order-none",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-faint",
								children: ["P-", issue.id.slice(0, 4).toUpperCase()]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditableTitle, {
								value: issue.title,
								onSave: handleTitle
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-fg-faint",
								children: [
									issue.createdBy ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "inline-flex items-center gap-1.5 text-fg-muted",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, {
											name: issue.createdBy.name,
											image: issue.createdBy.image
										}), issue.createdBy.name]
									}) : null,
									issue.createdBy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg-faint/60",
										children: "·"
									}) : null,
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Created ", formatDate(issue.createdAt)] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg-faint/60",
										children: "·"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Updated ", formatDate(issue.updatedAt)] })
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-10",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditableDescription, {
									value: issue.description,
									onSave: handleDescription
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SubIssuesSection, { parentId: issueId }),
							issue.attachments && issue.attachments.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
								className: "mt-12",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "mb-3 text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint",
									children: "Attachments"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AttachmentRail, { attachments: issue.attachments })]
							}) : null,
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
								className: "mt-14 border-t border-border-subtle pt-8",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IssueTimeline, {
									items: timeline,
									lookups
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "mt-6",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CommentComposer, {
										value: commentBody,
										disabled: isCommenting,
										onChange: setCommentBody,
										onSubmit: () => void handleComment()
									})
								})]
							})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
						className: "order-1 md:order-none md:sticky md:top-10 md:self-start",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IssueProperties, {
								status: issue.status,
								statuses,
								priority: issue.priority,
								assignee: issue.assignedTo ? {
									id: issue.assignedTo.id,
									name: issue.assignedTo.name,
									image: issue.assignedTo.image
								} : null,
								project: issue.project ?? null,
								labels: issue.labels ?? [],
								onChangeStatus: (next) => void handleStatus(next),
								onChangePriority: (next) => void handlePriority(next),
								onChangeAssignee: (id) => void handleAssignee(id),
								onChangeProject: (id) => void handleProject(id),
								onChangeLabels: (ids) => void handleLabels(ids)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "my-4 h-px bg-border-subtle" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SubscribeStrip, { issueId })
						]
					})]
				})
			})
		]
	});
}
function SubIssuesSection({ parentId }) {
	const navigate = useNavigate();
	const issuesQuery = useIssuesQuery();
	const { statuses } = useIssueStatuses();
	const children = (0, import_react.useMemo)(() => (issuesQuery.data ?? []).filter((issue) => issue.parentId === parentId), [issuesQuery.data, parentId]);
	const loading = issuesQuery.isPending;
	const createIssueMutation = useCreateIssue();
	const [creating, setCreating] = (0, import_react.useState)(false);
	const [draft, setDraft] = (0, import_react.useState)("");
	const [submitting, setSubmitting] = (0, import_react.useState)(false);
	const submit = async () => {
		const trimmed = draft.trim();
		if (!trimmed) return;
		setSubmitting(true);
		try {
			await createIssueMutation.mutateAsync({
				title: trimmed,
				parentId
			});
			setDraft("");
			setCreating(false);
			toast.success("Sub-issue added");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to create");
		} finally {
			setSubmitting(false);
		}
	};
	if (loading && children.length === 0 && !creating) return null;
	const done = children.filter((c) => statuses.find((s) => s.key === c.status)?.category === "done").length;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "mt-12",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-3 flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-faint",
						children: "Sub-issues"
					}), children.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "text-[11px] tabular-nums text-fg-faint",
						children: [
							done,
							" / ",
							children.length
						]
					}) : null]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => setCreating(true),
					className: "text-[11px] text-fg-muted transition-colors hover:text-fg",
					children: "+ Add"
				})]
			}),
			children.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "overflow-hidden rounded-lg border border-border-subtle",
				children: children.map((child, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
					className: cn("border-border-subtle", index !== children.length - 1 && "border-b"),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => void navigate({
							to: "/issues/$issueId",
							params: { issueId: child.id }
						}),
						className: "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface/40",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusIcon, {
								status: child.status,
								statuses
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "font-mono text-[11px] text-fg-faint",
								children: ["P-", child.id.slice(0, 4).toUpperCase()]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: cn("min-w-0 flex-1 truncate text-[13px]", statuses.find((s) => s.key === child.status)?.category === "done" ? "text-fg-muted line-through" : "text-fg"),
								children: child.title
							})
						]
					})
				}, child.id))
			}) : null,
			creating ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				onSubmit: (event) => {
					event.preventDefault();
					submit();
				},
				className: cn("mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface/40 px-3 py-2"),
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-3 rounded-full border border-dashed border-fg-faint" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
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
						placeholder: "Sub-issue title…",
						disabled: submitting,
						className: "min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-faint disabled:opacity-50"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "submit",
						disabled: !draft.trim() || submitting,
						className: "rounded-md bg-fg px-2 py-0.5 text-[11px] font-medium text-bg disabled:opacity-50",
						children: submitting ? "…" : "Add"
					})
				]
			}) : null
		]
	});
}
function SubscribeStrip({ issueId }) {
	const qc = useQueryClient();
	const subscribersQuery = useIssueSubscribersQuery(issueId);
	const subscribers = subscribersQuery.data?.subscribers ?? [];
	const subscribed = subscribersQuery.data?.subscribed ?? false;
	const loading = subscribersQuery.isPending;
	const [busy, setBusy] = (0, import_react.useState)(false);
	const toggle = async () => {
		if (busy) return;
		setBusy(true);
		try {
			const response = subscribed ? await unsubscribeFromIssue(issueId) : await subscribeToIssue(issueId);
			qc.setQueryData(queryKeys.issues.subscribers(issueId), response);
			toast.success(subscribed ? "Unsubscribed" : "Subscribed");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to update");
		} finally {
			setBusy(false);
		}
	};
	if (loading) return null;
	const visible = subscribers.slice(0, 4);
	const extra = subscribers.length - visible.length;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-center gap-2 text-[11px] text-fg-muted",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			onClick: () => void toggle(),
			disabled: busy,
			className: "rounded-full border border-border-subtle px-2 py-0.5 transition-colors hover:border-border hover:text-fg disabled:opacity-50",
			children: subscribed ? "Unsubscribe" : "Subscribe"
		}), visible.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex -space-x-1.5",
			children: [visible.map((user) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				title: user.name,
				className: "grid size-5 place-items-center rounded-full border border-bg bg-surface-2 text-[9px] font-medium text-fg-muted",
				children: user.image ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: user.image,
					alt: "",
					className: "size-5 rounded-full object-cover"
				}) : user.name.slice(0, 2).toUpperCase()
			}, user.id)), extra > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "grid size-5 place-items-center rounded-full border border-bg bg-surface-2 text-[9px] tabular-nums text-fg-muted",
				children: ["+", extra]
			}) : null]
		}) : null]
	});
}
function SiblingsNav({ siblings, onNavigate }) {
	const goPrev = () => {
		if (siblings.prevId) onNavigate(siblings.prevId);
	};
	const goNext = () => {
		if (siblings.nextId) onNavigate(siblings.nextId);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface/40 px-2 py-0.5 text-[11px] text-fg-muted",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "tabular-nums",
			children: [
				siblings.position,
				" ",
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-fg-faint",
					children: "/"
				}),
				" ",
				siblings.total
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: goPrev,
				disabled: !siblings.prevId,
				"aria-label": "Previous issue",
				className: "grid size-5 place-items-center rounded-[4px] text-fg-faint transition-colors hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-faint",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowIcon, { direction: "up" })
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: goNext,
				disabled: !siblings.nextId,
				"aria-label": "Next issue",
				className: "grid size-5 place-items-center rounded-[4px] text-fg-faint transition-colors hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-faint",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowIcon, { direction: "down" })
			})]
		})]
	});
}
function ArrowIcon({ direction }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		width: "9",
		height: "9",
		viewBox: "0 0 12 12",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		"aria-hidden": true,
		style: { transform: direction === "up" ? "rotate(180deg)" : "none" },
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M3 4.5l3 3 3-3",
			stroke: "currentColor",
			strokeWidth: "1.4",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function HeaderIconButton({ children, title, onClick, disabled, active, activeClass }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		title,
		"aria-label": title,
		onClick,
		disabled,
		className: cn("grid size-7 place-items-center rounded-[6px] text-fg-muted transition-colors hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-60", active && (activeClass ?? "bg-surface text-fg")),
		children
	});
}
function AttachmentRail({ attachments }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex flex-wrap gap-2",
		children: attachments.map((file) => {
			const isImage = file.contentType.startsWith("image/");
			if (file.contentType.startsWith("video/")) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "max-w-full overflow-hidden rounded-[7px] border border-border-subtle bg-surface/40",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
					src: file.url,
					controls: true,
					playsInline: true,
					preload: "metadata",
					className: "block h-32 w-56 max-w-full bg-black object-contain"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
					href: file.url,
					target: "_blank",
					rel: "noreferrer",
					className: "flex min-w-0 flex-col px-2.5 py-1.5 transition-colors hover:bg-surface",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "truncate font-mono text-[11.5px] text-fg",
						children: file.name
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "truncate font-mono text-[10px] text-fg-faint",
						children: formatBytes(file.size)
					})]
				})]
			}, file.id);
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
				href: file.url,
				target: "_blank",
				rel: "noreferrer",
				className: "group inline-flex max-w-full items-center gap-2 overflow-hidden rounded-[7px] border border-border-subtle bg-surface/40 transition-colors hover:border-border hover:bg-surface",
				children: [isImage ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: file.url,
					alt: file.name,
					loading: "lazy",
					className: "h-16 w-24 object-cover"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "grid h-10 w-10 shrink-0 place-items-center text-fg-faint",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AttachIcon, { size: 14 })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "flex min-w-0 flex-col py-1 pr-2.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "truncate font-mono text-[11.5px] text-fg",
						children: file.name
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "truncate font-mono text-[10px] text-fg-faint",
						children: formatBytes(file.size)
					})]
				})]
			}, file.id);
		})
	});
}
function buildTimeline(events, comments) {
	const items = [];
	for (const event of events) {
		if (event.action === "created") {
			items.push({
				type: "created",
				key: `created-${event.id}`,
				date: event.createdAt,
				actor: event.actor
			});
			continue;
		}
		if (event.action === "attachment_added") {
			const change = event.changes[0];
			if (change) items.push({
				type: "attachment",
				key: `att-${event.id}`,
				date: event.createdAt,
				actor: event.actor,
				change
			});
			continue;
		}
		event.changes.filter(isMeaningfulChange).forEach((change, index) => {
			items.push({
				type: "change",
				key: `change-${event.id}-${change.field}-${index}`,
				date: event.createdAt,
				actor: event.actor,
				change
			});
		});
	}
	for (const comment of comments) items.push({
		type: "comment",
		key: `comment-${comment.id}`,
		date: comment.createdAt,
		comment
	});
	return items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
function IssueTimeline({ items, lookups }) {
	if (items.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-[13px] text-fg-faint",
		children: "No activity yet."
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ol", {
		className: "relative flex flex-col",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			"aria-hidden": true,
			className: "absolute left-[11px] top-2 bottom-2 w-px bg-border-subtle"
		}), items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
			className: "relative",
			children: item.type === "comment" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CommentRow, { comment: item.comment }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EventRow, {
				item,
				lookups
			})
		}, item.key))]
	});
}
function CommentRow({ comment }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: "relative flex gap-3 py-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "relative z-10 mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full bg-bg",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, {
				name: comment.author?.name,
				image: comment.author?.image
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "min-w-0 flex-1",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-baseline gap-2 text-[12.5px]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-medium text-fg",
					children: comment.author?.name ?? "Unknown user"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[11.5px] text-fg-faint",
					children: formatDate(comment.createdAt)
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-1 text-[14px] leading-[1.6] text-fg",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatMarkdown, { content: comment.body })
			})]
		})]
	});
}
function EventRow({ item, lookups }) {
	const summary = describeEvent(item, lookups);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative flex items-center gap-3 py-1.5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "relative z-10 grid size-[22px] shrink-0 place-items-center bg-bg",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-[7px] rounded-full border border-border bg-surface" })
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "min-w-0 flex-1 truncate text-[12.5px] text-fg-muted",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-fg",
					children: item.actor?.name ?? "Someone"
				}),
				" ",
				summary,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "ml-2 text-[11.5px] text-fg-faint",
					children: formatDate(item.date)
				})
			]
		})]
	});
}
function describeEvent(item, lookups) {
	if (item.type === "created") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "created the issue" });
	if (item.type === "attachment") return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: ["attached ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Token, { children: attachmentName(item.change.after) })] });
	return describeChange(item.change, lookups);
}
function describeChange(change, lookups) {
	switch (change.field) {
		case "title": return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "renamed the issue" });
		case "description": return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "edited the description" });
		case "status": return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: ["set status to ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Token, { children: formatToken(change.after) })] });
		case "priority": return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: ["set priority to ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Token, { children: formatToken(change.after) })] });
		case "assignedToId": {
			const name = resolveId(change.after, lookups.members);
			if (!name) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "removed the assignee" });
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: ["assigned ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Token, { children: name })] });
		}
		case "projectId": {
			const name = resolveId(change.after, lookups.projects);
			if (!name) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "removed the project" });
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: ["moved to ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Token, { children: name })] });
		}
		case "labelIds": {
			const before = toIdArray(change.before);
			const after = toIdArray(change.after);
			const added = after.filter((id) => !before.includes(id));
			const removed = before.filter((id) => !after.includes(id));
			const names = (ids) => ids.map((id) => lookups.labels.get(id) ?? "label").join(", ");
			if (added.length && !removed.length) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: ["added ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Token, { children: names(added) })] });
			if (removed.length && !added.length) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: ["removed ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Token, { children: names(removed) })] });
			return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "updated labels" });
		}
		case "parentId": return isEmpty(change.after) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "removed the parent issue" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "set the parent issue" });
		default: return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: ["updated ", fieldLabel(change.field).toLowerCase()] });
	}
}
function Token({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "font-medium text-fg",
		children
	});
}
function CommentComposer({ value, disabled, onChange, onSubmit }) {
	const [focused, setFocused] = (0, import_react.useState)(false);
	const empty = value.trim().length === 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("flex flex-col gap-2 rounded-[10px] border bg-surface/30 px-3.5 py-3 transition-colors", focused ? "border-border bg-surface/60" : "border-border-subtle hover:border-border"),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
				className: "sr-only",
				htmlFor: "issue-comment",
				children: "Comment"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
				id: "issue-comment",
				value,
				disabled,
				onChange: (event) => onChange(event.target.value),
				onFocus: () => setFocused(true),
				onBlur: () => setFocused(false),
				onKeyDown: (event) => {
					if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
						event.preventDefault();
						onSubmit();
					}
				},
				placeholder: "Add a comment…",
				rows: 2,
				className: "min-h-[40px] w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-[1.6] text-fg outline-none placeholder:text-fg-faint disabled:opacity-60"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[11px] text-fg-faint",
					children: "Markdown · ⌘↵ to send"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: onSubmit,
					disabled: disabled || empty,
					className: cn("inline-flex h-7 items-center rounded-[6px] px-2.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed", empty || disabled ? "text-fg-faint" : "bg-fg text-bg hover:bg-fg/90"),
					children: disabled ? "Sending…" : "Reply"
				})]
			})
		]
	});
}
function isMeaningfulChange(change) {
	if (isEmpty(change.before) && isEmpty(change.after)) return false;
	if (valuesEqual(change.before, change.after)) return false;
	if (change.field === "labelIds") {
		const before = toIdArray(change.before);
		const after = toIdArray(change.after);
		if (before.length === after.length && before.every((id) => after.includes(id))) return false;
	}
	return true;
}
function isEmpty(value) {
	if (value === null || value === void 0 || value === "") return true;
	if (Array.isArray(value) && value.length === 0) return true;
	return false;
}
function valuesEqual(a, b) {
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((item, index) => item === b[index]);
	}
	return a === b;
}
function toIdArray(value) {
	if (!Array.isArray(value)) return [];
	return value.map((entry) => String(entry));
}
function resolveId(value, map) {
	if (typeof value !== "string" || value.length === 0) return null;
	return map.get(value) ?? null;
}
function formatToken(value) {
	if (typeof value === "string" && value.length > 0) return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
	return displayValue(value);
}
function IssueDetailSkeleton() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto w-full max-w-[760px] animate-pulse px-6 pb-24 pt-10",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-3 w-12 rounded bg-surface" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mt-3 h-10 w-3/4 rounded bg-surface" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mt-5 h-3 w-64 rounded bg-surface" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mt-3 h-5 w-80 rounded bg-surface" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-10 grid gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-3 w-full rounded bg-surface" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-3 w-11/12 rounded bg-surface" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-3 w-3/4 rounded bg-surface" })
				]
			})
		]
	});
}
function fieldLabel(field) {
	return {
		title: "Title",
		description: "Description",
		status: "Status",
		priority: "Priority",
		assignedToId: "Assignee",
		projectId: "Project",
		labelIds: "Labels",
		parentId: "Parent",
		attachments: "Attachments"
	}[field] ?? field;
}
function displayValue(value) {
	if (value === null || value === void 0 || value === "") return "None";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return JSON.stringify(value, null, 2);
}
function attachmentName(value) {
	if (value && typeof value === "object" && "name" in value) {
		const name = value.name;
		if (typeof name === "string") return name;
	}
	return "file";
}
//#endregion
export { IssueDetail, IssueDetailPage as component };

//# sourceMappingURL=_app.issues._issueId-Catxk5I1.js.map