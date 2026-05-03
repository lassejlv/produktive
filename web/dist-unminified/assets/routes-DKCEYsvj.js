import { t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { h as Link } from "./initial-BUIQ08st.js";
import { St as useSession, Vn as cn } from "./initial-BOT0Y-sv.js";
//#region src/routes/index.tsx?tsr-split=component
var import_jsx_runtime = require_jsx_runtime();
function LandingPage() {
	const session = useSession();
	const isLoggedIn = Boolean(session.data);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "relative isolate flex min-h-screen flex-col overflow-hidden bg-bg",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
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
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "absolute inset-0 bg-linear-to-b from-bg/0 via-bg/15 to-bg" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "absolute inset-0",
						style: { background: "radial-gradient(ellipse 80% 60% at 50% 50%, transparent 0%, rgba(13,13,15,0.55) 100%)" }
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
				className: "absolute inset-x-0 top-4 z-20 px-4",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
					className: cn("animate-fade-up mx-auto flex max-w-[680px] items-center justify-between rounded-full border border-white/10 bg-bg/40 px-5 py-2.5 backdrop-blur-xl", "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-2.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid size-6 place-items-center rounded-md bg-fg text-[11px] font-semibold tracking-tight text-bg",
							children: "P"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[13px] font-medium tracking-tight text-fg",
							children: "Produktive"
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex items-center gap-1",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: isLoggedIn ? "/workspace" : "/login",
							className: "rounded-full px-3 py-1 text-[12.5px] text-fg/70 transition-colors hover:text-fg",
							children: isLoggedIn ? "Open app" : "Sign in"
						})
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "relative z-10 flex flex-1 items-center justify-center px-6 pb-12 pt-24",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "w-full max-w-[760px] text-center lg:-translate-y-[3%]",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", {
							className: "text-balance text-[clamp(48px,8.5vw,108px)] font-semibold leading-[0.95] tracking-[-0.04em] text-fg",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "animate-fade-up block",
								style: { animationDelay: "80ms" },
								children: "Ship faster."
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "animate-fade-up block bg-[linear-gradient(180deg,#ffffff_0%,#f0c5a8_70%,#d99a78_100%)] bg-clip-text text-transparent",
								style: { animationDelay: "160ms" },
								children: "Track less."
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "animate-fade-up mx-auto mt-5 max-w-[420px] text-pretty text-[16px] leading-[1.55] text-fg/80",
							style: { animationDelay: "240ms" },
							children: "The issue tracker that gets out of your way."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "animate-fade-up mt-8 flex flex-wrap items-center justify-center gap-2.5",
							style: { animationDelay: "320ms" },
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
								to: isLoggedIn ? "/workspace" : "/login",
								className: cn("inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-fg px-6 text-[13px] font-medium text-bg transition-colors", "hover:bg-white"),
								children: [isLoggedIn ? "Open app" : "Get started", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									"aria-hidden": true,
									children: "↗"
								})]
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "animate-fade-up mt-4 text-[12px] text-fg/55",
							style: { animationDelay: "400ms" },
							children: "Built for focused teams."
						})
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("footer", {
				className: "relative z-10 px-7 pb-4 text-center text-[11px] text-fg/40",
				children: "© 2026 Produktive"
			})
		]
	});
}
//#endregion
export { LandingPage as component };

//# sourceMappingURL=routes-DKCEYsvj.js.map