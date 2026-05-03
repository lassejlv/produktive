import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { v as toast } from "./initial-BjZJRI-E.js";
import { C as labelColorHex, Mt as createLabel, S as defaultLabelColor, Vn as cn, w as labelColorOptions } from "./initial-BOT0Y-sv.js";
import { y as Dialog } from "./initial-BWSisseh.js";
//#region src/components/label/new-label-dialog.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
function NewLabelDialog({ onCreated, headless }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [name, setName] = (0, import_react.useState)("");
	const [color, setColor] = (0, import_react.useState)(defaultLabelColor);
	const [description, setDescription] = (0, import_react.useState)("");
	const [submitting, setSubmitting] = (0, import_react.useState)(false);
	const nameRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		if (!headless) return;
		const handler = (event) => {
			const detail = event.detail;
			if (detail?.name) setName(detail.name);
			setOpen(true);
		};
		window.addEventListener("produktive:new-label", handler);
		return () => window.removeEventListener("produktive:new-label", handler);
	}, [headless]);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		requestAnimationFrame(() => nameRef.current?.focus());
	}, [open]);
	const reset = () => {
		setName("");
		setColor(defaultLabelColor);
		setDescription("");
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
			const response = await createLabel({
				name: trimmed,
				color,
				description: description.trim() || void 0
			});
			onCreated?.(response.label);
			window.dispatchEvent(new CustomEvent("produktive:label-created", { detail: { id: response.label.id } }));
			toast.success("Label created");
			close();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to create label");
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
		}), "New label"]
	}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
		open,
		onClose: close,
		className: "w-full max-w-[420px]",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
			onSubmit: submit,
			className: "flex flex-col gap-4 p-5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						"aria-hidden": true,
						className: "size-2.5 shrink-0 rounded-full",
						style: { backgroundColor: labelColorHex[color] }
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						ref: nameRef,
						type: "text",
						value: name,
						onChange: (event) => setName(event.target.value),
						placeholder: "Label name (e.g. bug)",
						required: true,
						maxLength: 48,
						className: "h-9 w-full rounded-md border border-border bg-bg px-3 text-[14px] text-fg outline-none placeholder:text-fg-faint focus:border-fg-muted"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex flex-wrap items-center gap-1.5",
					children: labelColorOptions.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => setColor(option),
						"aria-label": `Color ${option}`,
						className: cn("size-5 rounded-full transition-shadow", color === option ? "ring-2 ring-fg ring-offset-2 ring-offset-bg" : "hover:ring-1 hover:ring-border"),
						style: { backgroundColor: labelColorHex[option] }
					}, option))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
					value: description,
					onChange: (event) => setDescription(event.target.value),
					placeholder: "Optional description — what does this label mean?",
					rows: 2,
					className: "resize-none rounded-md border border-border bg-bg px-3 py-2 text-[12.5px] text-fg outline-none placeholder:text-fg-faint focus:border-fg-muted"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-end gap-2 border-t border-border-subtle pt-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: close,
						className: "h-8 rounded-md px-3 text-[12.5px] text-fg-muted transition-colors hover:bg-surface hover:text-fg",
						children: "Cancel"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "submit",
						disabled: !name.trim() || submitting,
						className: "h-8 rounded-md bg-fg px-3 text-[12.5px] font-medium text-bg transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60",
						children: submitting ? "Creating…" : "Create label"
					})]
				})
			]
		})
	})] });
}
//#endregion
export { NewLabelDialog as t };

//# sourceMappingURL=new-label-dialog-DufeO9MX.js.map