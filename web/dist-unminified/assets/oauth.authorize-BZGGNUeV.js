import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { h as Link } from "./initial-BUIQ08st.js";
import { Lt as decideOAuthAuthorization, gn as previewOAuthAuthorization } from "./initial-BOT0Y-sv.js";
import { X as Button } from "./initial-BWSisseh.js";
//#region src/routes/oauth.authorize.tsx?tsr-split=component
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function OAuthAuthorizePage() {
	const [preview, setPreview] = (0, import_react.useState)(null);
	const [error, setError] = (0, import_react.useState)(null);
	const [busy, setBusy] = (0, import_react.useState)(null);
	const search = (0, import_react.useMemo)(() => window.location.search, []);
	(0, import_react.useEffect)(() => {
		let mounted = true;
		previewOAuthAuthorization(search).then((result) => {
			if (mounted) setPreview(result);
		}).catch((error) => {
			const message = error instanceof Error ? error.message : "OAuth request failed";
			if (message === "Unauthorized") {
				const redirect = `${window.location.pathname}${window.location.search}`;
				window.location.assign(`/login?redirect=${encodeURIComponent(redirect)}`);
				return;
			}
			if (mounted) setError(message);
		});
		return () => {
			mounted = false;
		};
	}, [search]);
	const decide = async (approve) => {
		setBusy(approve ? "approve" : "deny");
		setError(null);
		try {
			const response = await decideOAuthAuthorization(search, approve);
			window.location.assign(response.redirectUrl);
		} catch (error) {
			setError(error instanceof Error ? error.message : "OAuth request failed");
			setBusy(null);
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "flex min-h-screen items-center justify-center bg-bg px-6 py-12 text-fg",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-sm rounded-[12px] border border-white/10 bg-bg/72 p-5 backdrop-blur-xl",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-lg font-medium",
					children: "Authorize access"
				}),
				error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-4 border-t border-danger/25 pt-3 text-xs text-danger",
					role: "alert",
					children: error
				}) : null,
				!preview && !error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-4 text-sm text-fg-muted",
					children: "Loading…"
				}) : null,
				preview ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 grid gap-4 text-sm",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-fg-muted",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-medium text-fg",
									children: preview.clientName
								}),
								" requests access to your workspace ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-medium text-fg",
									children: preview.organization.name
								}),
								"."
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-border-subtle pt-3 text-xs",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-fg-faint",
									children: "Account"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-fg-muted",
									children: preview.user.email
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-fg-faint",
									children: "Scope"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-fg-muted",
									children: preview.scope
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-fg-faint",
									children: "Resource"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "break-all font-mono text-[11px] text-fg-muted",
									children: preview.resource
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center justify-end gap-2 border-t border-border-subtle pt-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									asChild: true,
									variant: "ghost",
									size: "sm",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
										to: "/chat",
										children: "Cancel"
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									type: "button",
									variant: "outline",
									size: "sm",
									disabled: busy !== null,
									onClick: () => void decide(false),
									children: busy === "deny" ? "Denying…" : "Deny"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									type: "button",
									size: "sm",
									disabled: busy !== null,
									onClick: () => void decide(true),
									children: busy === "approve" ? "Approving…" : "Approve"
								})
							]
						})
					]
				}) : null
			]
		})
	});
}
//#endregion
export { OAuthAuthorizePage as component };

//# sourceMappingURL=oauth.authorize-BZGGNUeV.js.map