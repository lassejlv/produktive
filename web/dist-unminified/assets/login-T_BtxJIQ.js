import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { g as useNavigate, h as Link } from "./initial-BUIQ08st.js";
import { ot as authClient } from "./initial-BOT0Y-sv.js";
import { X as Button } from "./initial-BWSisseh.js";
import { p as Route } from "./initial-Cbvcoh8y.js";
import { t as Input } from "./input-DAlWfusE.js";
import { t as Label } from "./label-URXhy-aU.js";
//#region src/routes/login.tsx?tsr-split=component
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function LoginPage() {
	const navigate = useNavigate();
	const search = Route.useSearch();
	const inviteToken = search.invite ?? null;
	const [mode, setMode] = (0, import_react.useState)(search.mode ?? (inviteToken ? "signup" : "signin"));
	const [name, setName] = (0, import_react.useState)("");
	const [email, setEmail] = (0, import_react.useState)(search.email ?? "");
	const [password, setPassword] = (0, import_react.useState)("");
	const [acceptedLegal, setAcceptedLegal] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)(null);
	const [message, setMessage] = (0, import_react.useState)(null);
	const [isSubmitting, setIsSubmitting] = (0, import_react.useState)(false);
	const onSubmit = async (event) => {
		event.preventDefault();
		setError(null);
		setMessage(null);
		if (mode === "signup" && !acceptedLegal) {
			setError("Accept the terms to continue.");
			return;
		}
		setIsSubmitting(true);
		const result = mode === "signin" ? await authClient.signIn.email({
			email,
			password
		}) : await authClient.signUp.email({
			email,
			password,
			name
		});
		setIsSubmitting(false);
		if (result.error) {
			setError(formatAuthError(result.error.message, mode));
			return;
		}
		if (mode === "signup") {
			setMessage(inviteToken ? "Check your email, then return to accept the invite." : "Check your email to verify your account.");
			return;
		}
		if (inviteToken) {
			await navigate({
				to: "/invite/$token",
				params: { token: inviteToken }
			});
			return;
		}
		if (search.redirect?.startsWith("/") && !search.redirect.startsWith("//")) {
			window.location.assign(search.redirect);
			return;
		}
		await navigate({ to: "/chat" });
	};
	const onForgotPassword = async () => {
		setError(null);
		setMessage(null);
		if (!email.trim()) {
			setError("Enter your email first.");
			return;
		}
		if ((await authClient.requestPasswordReset({ email })).error) {
			setError("Could not send reset link.");
			return;
		}
		setMessage("If the email exists, a reset link was sent.");
	};
	const switchMode = (newMode) => {
		setMode(newMode);
		setError(null);
		setMessage(null);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-bg px-6 py-12",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			"aria-hidden": true,
			className: "absolute inset-0 -z-10",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: "https://cdn.produktive.app/assets/landing.webp",
					alt: "",
					decoding: "async",
					fetchPriority: "high",
					className: "animate-ken-burns absolute inset-0 h-full w-full object-cover object-[center_65%]"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "absolute inset-0 bg-gradient-to-b from-bg/10 via-bg/55 to-bg" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "absolute inset-0",
					style: { background: "radial-gradient(ellipse 70% 55% at 50% 50%, rgba(13,13,15,0.2) 0%, rgba(13,13,15,0.76) 100%)" }
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-sm animate-fade-in rounded-[12px] border border-white/10 bg-bg/72 p-5 backdrop-blur-xl",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					className: "grid gap-4",
					onSubmit,
					children: [
						mode === "signup" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid gap-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
								htmlFor: "name",
								children: "Name"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								id: "name",
								autoComplete: "name",
								value: name,
								onChange: (event) => setName(event.target.value),
								placeholder: "Ada Lovelace",
								required: true
							})]
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid gap-1.5",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
									htmlFor: "email",
									children: "Email"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									id: "email",
									type: "email",
									autoComplete: "email",
									value: email,
									onChange: (event) => setEmail(event.target.value),
									placeholder: "john@doe.gg",
									required: true,
									readOnly: Boolean(inviteToken && mode === "signup")
								}),
								inviteToken && mode === "signup" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[11px] text-fg-faint",
									children: "The invitation is for this email."
								}) : null
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid gap-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
									htmlFor: "password",
									children: "Password"
								}), mode === "signin" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									className: "text-xs text-fg-muted hover:text-fg transition-colors",
									onClick: () => void onForgotPassword(),
									children: "Forgot password?"
								}) : null]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								id: "password",
								type: "password",
								autoComplete: mode === "signin" ? "current-password" : "new-password",
								minLength: 8,
								value: password,
								onChange: (event) => setPassword(event.target.value),
								placeholder: "At least 8 characters",
								required: true
							})]
						}),
						mode === "signup" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex gap-3 border-y border-border-subtle py-3",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
									htmlFor: "legal-acceptance",
									className: "sr-only",
									children: "Legal agreement"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									id: "legal-acceptance",
									type: "checkbox",
									checked: acceptedLegal,
									onChange: (event) => setAcceptedLegal(event.target.checked),
									required: true,
									className: "mt-0.5 size-3.5 shrink-0 accent-fg"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-[11.5px] leading-[1.65] text-fg-muted",
									children: [
										"I agree to the",
										" ",
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
											to: "/legal/$type",
											params: { type: "terms" },
											className: "text-fg transition-colors hover:text-accent",
											children: "Terms of Service"
										}),
										" ",
										"and",
										" ",
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
											to: "/legal/$type",
											params: { type: "privacy" },
											className: "text-fg transition-colors hover:text-accent",
											children: "Privacy Policy"
										}),
										"."
									]
								})
							]
						}) : null,
						error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoginNotice, {
							variant: "error",
							message: error
						}) : null,
						message ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoginNotice, {
							variant: "info",
							message
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "submit",
							disabled: isSubmitting,
							children: isSubmitting ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "flex items-center gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "inline-block size-3 animate-spin rounded-full border-2 border-bg/30 border-t-bg" }), mode === "signin" ? "Signing in…" : "Creating account…"]
							}) : mode === "signin" ? "Sign in" : "Create account"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-6 text-center text-xs text-fg-muted",
					children: mode === "signin" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
						"Don't have an account?",
						" ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "text-fg hover:underline underline-offset-4",
							onClick: () => switchMode("signup"),
							children: "Sign up"
						})
					] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
						"Already have an account?",
						" ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "text-fg hover:underline underline-offset-4",
							onClick: () => switchMode("signin"),
							children: "Sign in"
						})
					] })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-6 text-center text-xs text-fg-faint",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/",
						className: "hover:text-fg-muted transition-colors",
						children: "← Back to home"
					})
				})
			]
		})]
	});
}
function LoginNotice({ variant, message }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: variant === "error" ? "border-t border-danger/25 pt-2 text-xs text-danger" : "border-t border-border-subtle pt-2 text-xs text-fg-muted",
		role: variant === "error" ? "alert" : "status",
		children: message
	});
}
function formatAuthError(message, mode) {
	if (message?.toLowerCase().includes("verify your email")) return "Verify your email before signing in.";
	return mode === "signin" ? "Could not sign in." : "Could not create account.";
}
//#endregion
export { LoginPage as component };

//# sourceMappingURL=login-T_BtxJIQ.js.map