import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { g as useNavigate, h as Link } from "./initial-BUIQ08st.js";
import { ot as authClient } from "./initial-BOT0Y-sv.js";
import { X as Button } from "./initial-BWSisseh.js";
import { t as Input } from "./input-DAlWfusE.js";
import { t as Label } from "./label-URXhy-aU.js";
//#region src/routes/reset-password.tsx?tsr-split=component
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function ResetPasswordPage() {
	const navigate = useNavigate();
	const [password, setPassword] = (0, import_react.useState)("");
	const [error, setError] = (0, import_react.useState)(null);
	const [message, setMessage] = (0, import_react.useState)(null);
	const [isSubmitting, setIsSubmitting] = (0, import_react.useState)(false);
	const onSubmit = async (event) => {
		event.preventDefault();
		setError(null);
		setMessage(null);
		setIsSubmitting(true);
		const token = new URLSearchParams(window.location.search).get("token");
		if (!token) {
			setError("Reset token is missing.");
			setIsSubmitting(false);
			return;
		}
		const result = await authClient.resetPassword({
			token,
			password
		});
		setIsSubmitting(false);
		if (result.error) {
			setError(result.error.message);
			return;
		}
		setMessage("Password updated. Redirecting…");
		window.setTimeout(() => {
			navigate({ to: "/login" });
		}, 800);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "grid min-h-screen place-items-center px-6 py-12",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-sm animate-fade-in",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mb-8 flex flex-col items-center text-center",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid size-9 place-items-center rounded-md bg-fg text-sm font-semibold text-bg",
							children: "P"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "mt-5 text-xl font-semibold tracking-tight text-fg",
							children: "Reset your password"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1.5 text-sm text-fg-muted",
							children: "Choose a new password for your account."
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					className: "grid gap-4",
					onSubmit,
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid gap-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
								htmlFor: "password",
								children: "New password"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								id: "password",
								type: "password",
								minLength: 8,
								autoComplete: "new-password",
								value: password,
								onChange: (event) => setPassword(event.target.value),
								placeholder: "At least 8 characters",
								required: true
							})]
						}),
						error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs text-danger",
							role: "alert",
							children: error
						}) : null,
						message ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs text-fg-muted",
							role: "status",
							children: message
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "submit",
							disabled: isSubmitting,
							children: isSubmitting ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "flex items-center gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "inline-block size-3 animate-spin rounded-full border-2 border-bg/30 border-t-bg" }), "Updating…"]
							}) : "Update password"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-6 text-center text-xs text-fg-faint",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/login",
						className: "hover:text-fg-muted transition-colors",
						children: "← Back to sign in"
					})
				})
			]
		})
	});
}
//#endregion
export { ResetPasswordPage as component };

//# sourceMappingURL=reset-password-DT9iVYbx.js.map