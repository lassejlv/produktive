import { t as Markdown } from "./initial-CMb3YuhF.js";
import { t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { t as remarkGfm } from "./initial-D1YyMmpo.js";
import { h as Link } from "./initial-BUIQ08st.js";
import { Vn as cn } from "./initial-BOT0Y-sv.js";
import { f as Route } from "./initial-Cbvcoh8y.js";
import { n as legalDocuments, t as getLegalDocument } from "./legal-documents-BAf4jnHn.js";
//#region src/components/legal-markdown.tsx
var import_jsx_runtime = require_jsx_runtime();
var components = {
	a({ children, href, ...props }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
			...props,
			href,
			target: href?.startsWith("#") ? void 0 : "_blank",
			rel: href?.startsWith("#") ? void 0 : "noreferrer",
			className: "text-accent underline decoration-accent/35 underline-offset-4 transition-colors hover:text-accent-hover",
			children
		});
	},
	blockquote({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("blockquote", {
			className: "my-6 border-l border-border pl-5 text-fg-muted",
			children
		});
	},
	code({ children, className, ...props }) {
		if (className) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", {
			...props,
			className: [className, "font-mono text-[12px]"].join(" "),
			children
		});
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", {
			...props,
			className: "rounded-[4px] border border-border-subtle bg-surface px-1.5 py-0.5 font-mono text-[0.9em] text-fg",
			children
		});
	},
	h1({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
			className: "mb-5 text-[30px] font-semibold leading-[1.08] tracking-[-0.035em] text-fg sm:text-[38px]",
			children
		});
	},
	h2({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
			className: "mb-4 mt-12 border-t border-border-subtle pt-8 text-[22px] font-semibold leading-snug tracking-[-0.025em] text-fg",
			children
		});
	},
	h3({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
			className: "mb-2 mt-7 text-[15px] font-semibold tracking-[-0.01em] text-fg",
			children
		});
	},
	hr() {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("hr", { className: "my-9 border-border-subtle" });
	},
	li({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
			className: "pl-1 leading-[1.75] text-fg-muted",
			children
		});
	},
	ol({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
			className: "my-6 list-decimal space-y-2 pl-5 marker:text-fg-faint",
			children
		});
	},
	p({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "my-4 text-[15px] leading-[1.78] text-fg-muted",
			children
		});
	},
	pre({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
			className: "my-6 overflow-x-auto rounded-[8px] border border-border-subtle bg-surface p-4 font-mono text-[12px] leading-relaxed text-fg",
			children
		});
	},
	strong({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
			className: "font-medium text-fg",
			children
		});
	},
	table({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "my-6 overflow-x-auto rounded-[8px] border border-border-subtle bg-surface",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("table", {
				className: "w-full border-collapse text-left text-[13px]",
				children
			})
		});
	},
	th({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
			className: "border-b border-border-subtle bg-surface px-3 py-2.5 font-medium text-fg",
			children
		});
	},
	td({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
			className: "border-b border-border-subtle px-3 py-2.5 text-fg-muted",
			children
		});
	},
	ul({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
			className: "my-6 list-disc space-y-2 pl-5 marker:text-fg-faint",
			children
		});
	}
};
function LegalMarkdown({ content }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Markdown, {
		remarkPlugins: [remarkGfm],
		components,
		children: content
	});
}
//#endregion
//#region src/routes/legal.$type.tsx?tsr-split=component
function LegalDocumentPage() {
	const { type } = Route.useParams();
	const document = getLegalDocument(type);
	if (!document) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UnknownLegalDocument, {});
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
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/legal",
							className: "rounded-full px-3 py-1 text-[12.5px] text-fg/70 transition-colors hover:text-fg",
							children: "Legal"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/login",
							className: "rounded-full px-3 py-1 text-[12.5px] text-fg/70 transition-colors hover:text-fg",
							children: "Sign in"
						})]
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "relative z-10 mx-auto w-full max-w-[760px] px-5 py-8 lg:py-12",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("article", {
					className: "min-w-0 rounded-[12px] border border-white/10 bg-bg/68 px-5 py-6 backdrop-blur-md sm:px-8 sm:py-8",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LegalMarkdown, { content: document.markdown })
				})
			})
		]
	});
}
function UnknownLegalDocument() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-bg px-6 py-12 text-fg",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LegalPageBackground, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "relative z-10 w-full max-w-[420px] border-y border-white/10 bg-bg/45 py-8 text-center backdrop-blur-md",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-mono text-[11px] uppercase tracking-[0.14em] text-fg-faint",
					children: "Unknown document"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "mt-3 text-[32px] font-semibold tracking-[-0.035em] text-fg",
					children: "Legal page not found."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-3 text-[13.5px] leading-relaxed text-fg-muted",
					children: "Choose one of the available Produktive legal documents instead."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-6 flex justify-center gap-2",
					children: legalDocuments.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/legal/$type",
						params: { type: item.type },
						className: "inline-flex h-9 items-center rounded-[5px] border border-border-subtle px-3 text-[13px] text-fg-muted transition-colors hover:border-border hover:text-fg",
						children: item.shortTitle
					}, item.type))
				})
			]
		})]
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
export { LegalDocumentPage as component };

//# sourceMappingURL=legal._type-CnV_xg4u.js.map