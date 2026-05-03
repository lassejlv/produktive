import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { g as useNavigate } from "./initial-BUIQ08st.js";
import { v as toast } from "./initial-BjZJRI-E.js";
import { C as labelColorHex, Mn as updateLabel, Vn as cn, Vt as deleteLabel, w as labelColorOptions } from "./initial-BOT0Y-sv.js";
import { a as SelectTrigger, i as SelectItem, n as Select, r as SelectContent, v as useConfirmDialog } from "./initial-BWSisseh.js";
import { t as useLabels } from "./use-labels-DexLScJ2.js";
import { t as NewLabelDialog } from "./new-label-dialog-DufeO9MX.js";
//#region src/routes/_app.labels.tsx?tsr-split=component
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var viewLabels = {
	all: "All",
	active: "Active",
	archived: "Archived"
};
var exampleLabels = [
	{
		name: "bug",
		color: "red"
	},
	{
		name: "design",
		color: "purple"
	},
	{
		name: "tech-debt",
		color: "orange"
	},
	{
		name: "frontend",
		color: "blue"
	},
	{
		name: "P1",
		color: "yellow"
	}
];
function LabelsPage() {
	useNavigate();
	const [view, setView] = (0, import_react.useState)("active");
	const { labels, isLoading, refresh, addLabel, updateLabelLocal, removeLabelLocal } = useLabels(view === "archived" || view === "all");
	const { confirm, dialog } = useConfirmDialog();
	const filtered = (0, import_react.useMemo)(() => {
		if (view === "all") return labels;
		if (view === "active") return labels.filter((l) => l.archivedAt === null);
		return labels.filter((l) => l.archivedAt !== null);
	}, [labels, view]);
	const counts = (0, import_react.useMemo)(() => ({
		all: labels.length,
		active: labels.filter((l) => l.archivedAt === null).length,
		archived: labels.filter((l) => l.archivedAt !== null).length
	}), [labels]);
	const handleArchiveToggle = async (label) => {
		const next = label.archivedAt === null;
		updateLabelLocal(label.id, { archivedAt: next ? (/* @__PURE__ */ new Date()).toISOString() : null });
		try {
			const response = await updateLabel(label.id, { archived: next });
			updateLabelLocal(label.id, response.label);
			toast.success(next ? "Label archived" : "Label restored");
		} catch (error) {
			updateLabelLocal(label.id, { archivedAt: label.archivedAt });
			toast.error(error instanceof Error ? error.message : "Failed to update label");
		}
	};
	const handleColorChange = async (label, color) => {
		const previous = label.color;
		updateLabelLocal(label.id, { color });
		try {
			const response = await updateLabel(label.id, { color });
			updateLabelLocal(label.id, response.label);
		} catch (error) {
			updateLabelLocal(label.id, { color: previous });
			toast.error(error instanceof Error ? error.message : "Failed to update color");
		}
	};
	const handleDelete = (label) => {
		confirm({
			title: `Delete "${label.name}"?`,
			description: "It will be removed from all issues.",
			confirmLabel: "Delete label",
			destructive: true,
			onConfirm: async () => {
				removeLabelLocal(label.id);
				try {
					await deleteLabel(label.id);
					toast.success("Label deleted");
				} catch (error) {
					toast.error(error instanceof Error ? error.message : "Failed to delete label");
					refresh();
				}
			}
		});
	};
	const handleRename = async (label, name) => {
		const trimmed = name.trim();
		if (!trimmed || trimmed === label.name) return;
		const previous = label.name;
		updateLabelLocal(label.id, { name: trimmed });
		try {
			const response = await updateLabel(label.id, { name: trimmed });
			updateLabelLocal(label.id, response.label);
		} catch (error) {
			updateLabelLocal(label.id, { name: previous });
			toast.error(error instanceof Error ? error.message : "Failed to rename label");
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "min-h-full bg-bg",
		children: [
			dialog,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "sticky top-0 z-10 flex h-12 items-center justify-between gap-3 border-b border-border-subtle bg-bg/85 px-5 backdrop-blur",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-fg-muted",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LabelsHeaderIcon, {})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "text-sm font-medium text-fg",
							children: "Labels"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-xs text-fg-muted tabular-nums",
							children: filtered.length
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NewLabelDialog, { onCreated: (label) => addLabel(label) })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
				className: "flex items-center gap-1 border-b border-border-subtle bg-bg px-5 py-2",
				children: Object.keys(viewLabels).map((key) => {
					const isActive = view === key;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => setView(key),
						className: cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors", isActive ? "bg-surface text-fg" : "text-fg-muted hover:bg-surface hover:text-fg"),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: viewLabels[key] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: cn("text-[11px] tabular-nums", isActive ? "text-fg-muted" : "text-fg-faint"),
							children: counts[key]
						})]
					}, key);
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "mx-auto w-full max-w-[760px] px-5 py-6",
				children: isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[13px] text-fg-faint",
					children: "Loading…"
				}) : labels.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, { onCreate: (name) => {
					window.dispatchEvent(new CustomEvent("produktive:new-label", { detail: { name } }));
				} }) : filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-[13px] text-fg-faint",
					children: [
						"No labels in ",
						viewLabels[view].toLowerCase(),
						"."
					]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "overflow-hidden rounded-[10px] border border-border-subtle",
					children: filtered.map((label, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: cn("group flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors", index !== filtered.length - 1 && "border-b border-border-subtle", label.archivedAt !== null && "opacity-60"),
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ColorMenu, {
								color: label.color,
								onChange: (color) => void handleColorChange(label, color)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RenameField, {
								initialValue: label.name,
								onCommit: (name) => void handleRename(label, name)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "hidden min-w-0 flex-1 truncate text-[12px] text-fg-faint sm:inline",
								children: label.description ?? ""
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "text-[11.5px] tabular-nums text-fg-faint",
								children: [
									label.issueCount,
									" issue",
									label.issueCount === 1 ? "" : "s"
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => void handleArchiveToggle(label),
									className: "rounded-md px-2 py-0.5 text-[11.5px] text-fg-muted transition-colors hover:bg-surface hover:text-fg",
									children: label.archivedAt === null ? "Archive" : "Restore"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => handleDelete(label),
									className: "rounded-md px-2 py-0.5 text-[11.5px] text-fg-muted transition-colors hover:bg-danger/10 hover:text-danger",
									children: "Delete"
								})]
							})
						]
					}, label.id))
				})
			})
		]
	});
}
function ColorMenu({ color, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
		value: color,
		onValueChange: onChange,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
			"aria-label": "Color",
			className: "size-6 justify-center rounded-full border-0 bg-transparent p-0 hover:border-transparent hover:bg-surface [&>svg]:hidden",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				"aria-hidden": true,
				className: "size-2.5 rounded-full",
				style: { backgroundColor: labelColorHex[color] ?? labelColorHex.gray }
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, {
			align: "start",
			className: "min-w-32",
			children: labelColorOptions.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
				value: option,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "inline-flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						"aria-hidden": true,
						className: "size-2.5 rounded-full",
						style: { backgroundColor: labelColorHex[option] ?? labelColorHex.gray }
					}), option]
				})
			}, option))
		})]
	});
}
function RenameField({ initialValue, onCommit }) {
	const [value, setValue] = (0, import_react.useState)(initialValue);
	const [editing, setEditing] = (0, import_react.useState)(false);
	if (editing) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
		autoFocus: true,
		value,
		onChange: (event) => setValue(event.target.value),
		onBlur: () => {
			setEditing(false);
			onCommit(value);
		},
		onKeyDown: (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				setEditing(false);
				onCommit(value);
			} else if (event.key === "Escape") {
				event.preventDefault();
				setEditing(false);
				setValue(initialValue);
			}
		},
		className: "w-44 rounded-md border border-border bg-bg px-2 py-0.5 text-[13px] text-fg outline-none focus:border-fg-muted"
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		onClick: () => setEditing(true),
		className: "text-fg transition-colors hover:text-fg",
		children: initialValue
	});
}
function EmptyState({ onCreate }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col items-center py-16 text-center",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mb-4 grid size-12 place-items-center rounded-xl bg-surface/60 text-fg-muted",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LabelsHeaderIcon, { size: 22 })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-[15px] font-medium text-fg",
				children: "Tag issues with labels"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 max-w-[360px] text-[13px] text-fg-muted",
				children: "Lightweight, free-form tags. Filter by them, attach as many as you want. Try one of these to get started:"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-5 flex flex-wrap items-center justify-center gap-1.5",
				children: exampleLabels.map((example) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => onCreate(example.name),
					className: "inline-flex h-6 items-center gap-1.5 rounded-md border border-border-subtle bg-surface/40 px-2 text-[12px] text-fg-muted transition-colors hover:border-border hover:text-fg",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						"aria-hidden": true,
						className: "size-1.5 rounded-full",
						style: { backgroundColor: labelColorHex[example.color] }
					}), example.name]
				}, example.name))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => onCreate(),
				className: "mt-5 rounded-md bg-fg px-3 py-1.5 text-[12.5px] font-medium text-bg transition-colors hover:bg-white",
				children: "+ Create label"
			})
		]
	});
}
function LabelsHeaderIcon({ size = 14 }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: size,
		height: size,
		viewBox: "0 0 14 14",
		fill: "none",
		"aria-hidden": true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M7.5 1.5h4a1 1 0 011 1v4l-6 6a1 1 0 01-1.4 0L1.5 8.4a1 1 0 010-1.4l6-6z",
			stroke: "currentColor",
			strokeWidth: "1.4",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx: "9.5",
			cy: "4.5",
			r: "0.9",
			fill: "currentColor"
		})]
	});
}
//#endregion
export { LabelsPage as component };

//# sourceMappingURL=_app.labels-CDBgFzeR.js.map