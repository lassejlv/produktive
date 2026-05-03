import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { g as useNavigate, h as Link } from "./initial-BUIQ08st.js";
import { ot as authClient } from "./initial-BOT0Y-sv.js";
import { X as Button } from "./initial-BWSisseh.js";
//#region src/routes/verify-email.tsx?tsr-split=component
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function VerifyEmailPage() {
	const navigate = useNavigate();
	const [status, setStatus] = (0, import_react.useState)("loading");
	const [message, setMessage] = (0, import_react.useState)("Verifying your email…");
	(0, import_react.useEffect)(() => {
		let isMounted = true;
		const token = new URLSearchParams(window.location.search).get("token");
		const verify = async () => {
			if (!token) {
				setStatus("error");
				setMessage("Verification token is missing.");
				return;
			}
			const result = await authClient.verifyEmail({ token });
			if (!isMounted) return;
			if (result.error) {
				setStatus("error");
				setMessage(result.error.message);
				return;
			}
			setStatus("success");
			setMessage("Email verified. Redirecting…");
			window.setTimeout(() => {
				navigate({ to: "/chat" });
			}, 800);
		};
		verify();
		return () => {
			isMounted = false;
		};
	}, [navigate]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "grid min-h-screen place-items-center px-6",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-sm text-center animate-fade-in",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mx-auto grid size-9 place-items-center rounded-md bg-fg text-sm font-semibold text-bg",
					children: "P"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "mt-5 text-xl font-semibold tracking-tight text-fg",
					children: status === "loading" ? "Verifying email" : status === "success" ? "Email verified" : "Verification failed"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-fg-muted",
					children: message
				}),
				status === "error" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					className: "mt-6",
					asChild: true,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/login",
						children: "Back to sign in"
					})
				}) : null
			]
		})
	});
}
//#endregion
export { VerifyEmailPage as component };

//# sourceMappingURL=verify-email-CyNBzPrV.js.map