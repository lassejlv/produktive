import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { v as toast } from "./initial-BjZJRI-E.js";
import { D as projectColorHex, Ft as createProject, O as projectColorOptions, T as defaultProjectColor, Vn as cn, sn as listMembers } from "./initial-BOT0Y-sv.js";
import { _ as Avatar, p as MemberPicker, y as Dialog } from "./initial-BWSisseh.js";
//#region src/components/project/new-project-dialog.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
function NewProjectDialog({ onCreated, initialName, headless }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [name, setName] = (0, import_react.useState)(initialName ?? "");
	const [icon, setIcon] = (0, import_react.useState)("");
	const [color, setColor] = (0, import_react.useState)(defaultProjectColor);
	const [leadId, setLeadId] = (0, import_react.useState)(null);
	const [leadName, setLeadName] = (0, import_react.useState)(null);
	const [leadImage, setLeadImage] = (0, import_react.useState)(null);
	const [targetDate, setTargetDate] = (0, import_react.useState)("");
	const [submitting, setSubmitting] = (0, import_react.useState)(false);
	const nameRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		if (!headless) return;
		const handler = (event) => {
			const detail = event.detail;
			if (detail?.name) setName(detail.name);
			setOpen(true);
		};
		window.addEventListener("produktive:new-project", handler);
		return () => window.removeEventListener("produktive:new-project", handler);
	}, [headless]);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		requestAnimationFrame(() => nameRef.current?.focus());
	}, [open]);
	(0, import_react.useEffect)(() => {
		if (!leadId) {
			setLeadName(null);
			setLeadImage(null);
			return;
		}
		let mounted = true;
		listMembers().then((response) => {
			if (!mounted) return;
			const member = response.members.find((m) => m.id === leadId);
			if (member) {
				setLeadName(member.name);
				setLeadImage(member.image);
			}
		}).catch(() => {});
		return () => {
			mounted = false;
		};
	}, [leadId]);
	const reset = () => {
		setName("");
		setIcon("");
		setColor(defaultProjectColor);
		setLeadId(null);
		setLeadName(null);
		setLeadImage(null);
		setTargetDate("");
		setSubmitting(false);
	};
	const close = () => {
		setOpen(false);
		reset();
	};
	const submit = async (event) => {
		event.preventDefault();
		if (submitting) return;
		const trimmed = name.trim();
		if (!trimmed) return;
		setSubmitting(true);
		try {
			const response = await createProject({
				name: trimmed,
				icon: icon.trim() || null,
				color,
				leadId,
				targetDate: targetDate || null
			});
			toast.success("Project created");
			onCreated?.(response.project);
			close();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to create project");
			setSubmitting(false);
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [!headless ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick: () => setOpen(true),
		className: "inline-flex h-8 items-center gap-1.5 rounded-md bg-fg px-3 text-[12.5px] font-medium text-bg transition-colors hover:bg-white",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			"aria-hidden": true,
			children: "+"
		}), "New project"]
	}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
		open,
		onClose: close,
		className: "w-full max-w-[440px]",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
			onSubmit: submit,
			className: "flex flex-col gap-4 p-5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ColorIcon, {
						color,
						icon,
						name: name || "P"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "min-w-0 flex-1",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							ref: nameRef,
							type: "text",
							value: name,
							onChange: (event) => setName(event.target.value),
							placeholder: "Project name",
							required: true,
							className: "h-9 w-full rounded-md border border-border bg-bg px-3 text-[14px] text-fg outline-none placeholder:text-fg-faint focus:border-fg-muted"
						})
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						type: "text",
						value: icon,
						onChange: (event) => setIcon(event.target.value.slice(0, 4)),
						placeholder: "🎯",
						maxLength: 4,
						"aria-label": "Project emoji",
						className: "h-8 w-12 rounded-md border border-border bg-bg text-center text-[16px] outline-none focus:border-fg-muted"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex flex-wrap gap-1.5",
						children: projectColorOptions.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setColor(option),
							"aria-label": `Color ${option}`,
							className: cn("size-5 rounded-full transition-shadow", color === option ? "ring-2 ring-fg ring-offset-2 ring-offset-bg" : "hover:ring-1 hover:ring-border"),
							style: { backgroundColor: projectColorHex[option] }
						}, option))
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-2.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Lead",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MemberPicker, {
							selectedId: leadId,
							onSelect: (id) => setLeadId(id),
							trigger: ({ onClick }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick,
								className: "inline-flex h-8 items-center gap-2 rounded-md border border-border bg-bg px-2.5 text-[12.5px] text-fg-muted transition-colors hover:border-fg-muted hover:text-fg",
								children: leadId && leadName ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, {
									name: leadName,
									image: leadImage
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: leadName })] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-5 rounded-full border border-dashed border-border-subtle" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Pick a lead" })] })
							})
						})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Target date",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "date",
							value: targetDate,
							onChange: (event) => setTargetDate(event.target.value),
							className: "h-8 rounded-md border border-border bg-bg px-2.5 text-[12.5px] text-fg outline-none focus:border-fg-muted"
						})
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-1 flex items-center justify-end gap-2 border-t border-border-subtle pt-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: close,
						className: "h-8 rounded-md px-3 text-[12.5px] text-fg-muted transition-colors hover:bg-surface hover:text-fg",
						children: "Cancel"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "submit",
						disabled: !name.trim() || submitting,
						className: "h-8 rounded-md bg-fg px-3 text-[12.5px] font-medium text-bg transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60",
						children: submitting ? "Creating…" : "Create project"
					})]
				})
			]
		})
	})] });
}
function ColorIcon({ color, icon, name }) {
	const fg = projectColorHex[color] ?? projectColorHex.blue;
	const display = (icon || name.charAt(0) || "•").trim() || "•";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "grid size-9 shrink-0 place-items-center rounded-md text-[18px] font-medium",
		style: {
			backgroundColor: `${fg}33`,
			color: fg
		},
		"aria-hidden": true,
		children: display
	});
}
function Field({ label, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "flex items-center justify-between gap-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-[12px] text-fg-muted",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children })]
	});
}
//#endregion
export { NewProjectDialog as t };

//# sourceMappingURL=new-project-dialog-B3sWUiRu.js.map