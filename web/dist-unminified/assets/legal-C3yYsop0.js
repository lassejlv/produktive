import { t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { c as useRouterState, d as Outlet, h as Link } from "./initial-BUIQ08st.js";
import { Vn as cn } from "./initial-BOT0Y-sv.js";
import { n as legalDocuments } from "./legal-documents-BAf4jnHn.js";
//#region src/routes/legal.tsx?tsr-split=component
var import_jsx_runtime = require_jsx_runtime();
function LegalIndexPage() {
	if (useRouterState({ select: (state) => state.location.pathname }).startsWith("/legal/")) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "relative isolate min-h-screen bg-bg text-fg",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LegalPageBackground, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
				className: "sticky inset-x-0 top-0 z-20 px-4 py-4",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
					className: cn("mx-auto flex max-w-[680px] items-center justify-between rounded-full border border-white/10 bg-bg/40 px-5 py-2.5 backdrop-blur-xl", "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: "/",
						className: "flex items-center gap-2.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "grid size-6 place-items-center rounded-md bg-fg text-[11px] font-semibold tracking-tight text-bg",
							children: "P"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[13px] font-medium tracking-tight text-fg",
							children: "Produktive"
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/login",
						className: "rounded-full px-3 py-1 text-[12.5px] text-fg/70 transition-colors hover:text-fg",
						children: "Sign in"
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "relative z-10 mx-auto flex w-full max-w-[480px] flex-col px-5 py-24",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "text-[28px] font-semibold tracking-[-0.035em] text-fg",
						children: "Legal documents"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-[13.5px] leading-relaxed text-fg-muted",
						children: "Choose the document you want to read."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-8 grid gap-2",
						children: legalDocuments.map((document) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
							to: "/legal/$type",
							params: { type: document.type },
							className: "group flex h-11 items-center justify-between rounded-[6px] border border-border-subtle px-3.5 text-[13px] text-fg-muted transition-colors hover:border-border hover:text-fg",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: document.title }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								"aria-hidden": true,
								className: "font-mono text-[11px] text-fg-faint group-hover:text-fg",
								children: "Open"
							})]
						}, document.type))
					})
				]
			})
		]
	});
}
function LegalPageBackground() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		"aria-hidden": true,
		className: "fixed inset-0 -z-10",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: "https://cdn.produktive.app/assets/landing.webp",
				alt: "",
				decoding: "async",
				fetchPriority: "high",
				className: "animate-ken-burns absolute inset-0 h-full w-full object-cover object-[center_65%]"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "absolute inset-0 bg-gradient-to-b from-bg/0 via-bg/15 to-bg" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "absolute inset-0",
				style: { background: "radial-gradient(ellipse 80% 60% at 50% 50%, transparent 0%, rgba(13,13,15,0.55) 100%)" }
			})
		]
	});
}
//#endregion
export { LegalIndexPage as component };

//# sourceMappingURL=legal-C3yYsop0.js.map