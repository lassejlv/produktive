import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { t as Markdown } from "./initial-CMb3YuhF.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { n as rehypeSanitize, r as rehypeRaw, t as remarkGfm } from "./initial-D1YyMmpo.js";
import { n as require_react_dom } from "./initial-DwS9pZ8K.js";
import { c as useRouterState, g as useNavigate } from "./initial-BUIQ08st.js";
import { _ as Toaster$1, v as toast } from "./initial-BjZJRI-E.js";
import { a as ItemText, c as Trigger$1, d as Slot, f as Anchor2, g as Trigger, h as Root2, i as ItemIndicator, l as Value, m as Portal, n as Icon$1, o as Portal$1, p as Content2, r as Item, s as Root2$1, t as Content2$1, u as Viewport } from "./initial-D7ykuetp.js";
import { b as cva, i as defaultSchema } from "./initial-C0EVeHlk.js";
import { Bn as useMediaQuery, C as labelColorHex, D as projectColorHex, E as projectColorBackground, F as sortedStatuses, I as statusCategory, L as statusName, Mt as createLabel, P as priorityOptions, Vn as cn, cn as listProjects, in as listLabels, pn as markOnboarding, pt as refreshSession, sn as listMembers, y as priorityLabels } from "./initial-BOT0Y-sv.js";
import { _ as osr, a as Msr, b as vLr, c as Tar, d as cT, f as gn, g as nhr, h as my, i as KD, l as Tlr, m as l6, n as EC, o as R, p as hE, r as K1, s as Ser, t as $C, u as WI, v as rR, x as wWr, y as uv } from "./initial-DLWOBo7o.js";
import { t as HugeiconsIcon } from "./initial-DdNWnGNg.js";
//#region src/components/ui/popover.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_react_dom = /* @__PURE__ */ __toESM(require_react_dom(), 1);
var import_jsx_runtime = require_jsx_runtime();
var Popover = Root2;
var PopoverTrigger = Trigger;
var PopoverAnchor = Anchor2;
function PopoverContent({ className, align = "center", sideOffset = 8, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Portal, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Content2, {
		align,
		sideOffset,
		className: cn("z-50 w-72 rounded-lg border border-border bg-bg p-3 text-fg shadow-xl shadow-black/20 outline-none", "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95", className),
		...props
	}) });
}
//#endregion
//#region src/components/onboarding/steps.ts
var STEPS = [
	{
		id: "welcome",
		target: null,
		title: "Welcome to Produktive",
		body: "A focused issue tracker built for shipping. Take a quick tour of the basics — it'll be over before your coffee cools.",
		await: "next",
		ctaLabel: "Let's go"
	},
	{
		id: "sidebar",
		target: "[data-tour=\"sidebar\"]",
		placement: "right",
		title: "Your sidebar",
		body: "This is your sidebar — your projects and navigation live here.",
		await: "next"
	},
	{
		id: "new-issue",
		target: "[data-tour=\"new-issue-trigger\"]",
		placement: "bottom",
		title: "Create your first issue",
		body: "Create issues here — this is where your work starts. Go ahead, click it.",
		await: { event: "issue-created" },
		successToast: "🎉 Nice — you just created your first issue!",
		navigateBefore: "/issues"
	},
	{
		id: "issue-list",
		target: "[data-tour=\"issue-list\"]",
		placement: "top",
		title: "Your issues",
		body: "All your issues live here. You can filter, sort, and click any issue to see details.",
		await: "next",
		navigateBefore: "/issues"
	},
	{
		id: "issue-detail",
		target: "[data-tour=\"issue-detail\"]",
		placement: "left",
		title: "Edit & ship",
		body: "This is where you edit issues — update the title, description, priority, and assign teammates.",
		await: "next",
		navigateBefore: "/issues/$first",
		requiresFirstIssue: true
	},
	{
		id: "fields",
		target: "[data-tour=\"issue-fields\"]",
		placement: "left",
		title: "Priority & assignee",
		body: "Set priority and assign people to keep your work organized. Try changing one — or hit Next.",
		await: { event: "priority-or-assignee-changed" },
		successToast: "Looking good — fields updated.",
		requiresFirstIssue: true
	},
	{
		id: "project-switcher",
		target: "[data-tour=\"org-switcher\"]",
		placement: "bottom",
		title: "Workspaces & settings",
		body: "Switch between projects here, or tweak your workspace settings anytime.",
		await: "next"
	},
	{
		id: "github-sync",
		target: null,
		title: "Sync from GitHub",
		body: "Already tracking issues elsewhere? Connect a repo from Workspace settings → GitHub to import existing issues and keep them in sync automatically.",
		await: "next"
	},
	{
		id: "tabs-feature",
		target: null,
		title: "Optional: tab bar",
		body: "Want browser-style tabs? A draggable bar at the bottom keeps the issues, projects, and pages you've opened one click away. It's off by default — flip it on under Account → Appearance whenever you want.",
		link: {
			url: "/account",
			label: "Open account settings"
		},
		await: "next"
	},
	{
		id: "done",
		target: null,
		title: "You're all set 🎉",
		body: "You now know the basics of Produktive. It's also fully open source — contributions, issues, and stars are all welcome.",
		link: {
			url: "https://github.com/lassejlv/produktive",
			label: "View on GitHub"
		},
		await: "next",
		ctaLabel: "Start working"
	}
];
var stepIndex = (id) => STEPS.findIndex((step) => step.id === id);
//#endregion
//#region src/components/onboarding/onboarding-context.tsx
var SKIP_FLAG = "produktive-onboarding-deferred-this-session";
var OnboardingContext = (0, import_react.createContext)(null);
function OnboardingProvider({ children }) {
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const [activeStepId, setActiveStepId] = (0, import_react.useState)(null);
	const [firstIssueId, setFirstIssueId] = (0, import_react.useState)(null);
	const firstIssueIdRef = (0, import_react.useRef)(null);
	firstIssueIdRef.current = firstIssueId;
	const idx = activeStepId ? stepIndex(activeStepId) : -1;
	const step = idx >= 0 ? STEPS[idx] : null;
	const persist = (0, import_react.useCallback)(async (patch) => {
		try {
			await markOnboarding(patch);
			await refreshSession();
		} catch {}
	}, []);
	const handleNavigation = (0, import_react.useCallback)(async (target) => {
		if (!target.navigateBefore) return true;
		let to;
		if (target.navigateBefore === "/issues/$first") {
			const id = firstIssueIdRef.current;
			if (!id) return false;
			to = `/issues/${id}`;
		} else to = target.navigateBefore;
		if (pathname !== to) await navigate({ to });
		return true;
	}, [navigate, pathname]);
	const goTo = (0, import_react.useCallback)(async (id) => {
		let target = STEPS[stepIndex(id)];
		while (target.requiresFirstIssue && !firstIssueIdRef.current) {
			const ni = stepIndex(target.id) + 1;
			if (ni >= STEPS.length) {
				target = STEPS[STEPS.length - 1];
				break;
			}
			target = STEPS[ni];
		}
		if (!await handleNavigation(target)) target = STEPS[STEPS.length - 1];
		setActiveStepId(target.id);
	}, [handleNavigation]);
	const start = (0, import_react.useCallback)((from) => {
		if (typeof window !== "undefined") window.sessionStorage.removeItem(SKIP_FLAG);
		goTo(from ?? "welcome");
	}, [goTo]);
	const next = (0, import_react.useCallback)(() => {
		if (!step) return;
		const nextIdx = stepIndex(step.id) + 1;
		if (nextIdx >= STEPS.length) {
			setActiveStepId(null);
			persist({
				completed: true,
				step: "done"
			});
			return;
		}
		goTo(STEPS[nextIdx].id);
	}, [
		goTo,
		persist,
		step
	]);
	const back = (0, import_react.useCallback)(() => {
		if (!step) return;
		const prevIdx = stepIndex(step.id) - 1;
		if (prevIdx < 0) return;
		goTo(STEPS[prevIdx].id);
	}, [goTo, step]);
	const skip = (0, import_react.useCallback)(() => {
		if (typeof window !== "undefined") window.sessionStorage.setItem(SKIP_FLAG, "1");
		setActiveStepId(null);
		persist({ completed: true });
	}, [persist]);
	const signal = (0, import_react.useCallback)((name) => {
		if (!step) return;
		if (typeof step.await === "object" && step.await.event === name) {
			if (step.successToast) toast.success(step.successToast);
			next();
		}
	}, [next, step]);
	(0, import_react.useEffect)(() => {
		if (!activeStepId) return;
		const onKey = (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				skip();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [activeStepId, skip]);
	const value = {
		isActive: activeStepId !== null,
		step,
		stepIndex: idx,
		totalSteps: STEPS.length,
		firstIssueId,
		start,
		next,
		back,
		skip,
		signal,
		setFirstIssueId
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OnboardingContext.Provider, {
		value,
		children
	});
}
function useOnboarding() {
	const ctx = (0, import_react.useContext)(OnboardingContext);
	if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
	return ctx;
}
var ONBOARDING_SKIP_FLAG = SKIP_FLAG;
//#endregion
//#region src/components/ui/button.tsx
var buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent", {
	variants: {
		variant: {
			default: "bg-fg text-bg hover:bg-fg/90",
			outline: "border border-border bg-transparent text-fg hover:bg-surface",
			ghost: "bg-transparent text-fg hover:bg-surface",
			danger: "bg-danger text-white hover:bg-danger/90",
			link: "bg-transparent text-accent hover:underline underline-offset-4 px-0"
		},
		size: {
			default: "h-9 px-4",
			sm: "h-8 px-3 text-xs",
			lg: "h-10 px-5",
			icon: "h-9 w-9"
		}
	},
	defaultVariants: {
		variant: "default",
		size: "default"
	}
});
function Button({ className, variant, size, asChild = false, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(asChild ? Slot : "button", {
		className: cn(buttonVariants({
			variant,
			size,
			className
		})),
		...props
	});
}
//#endregion
//#region src/components/onboarding/onboarding-tooltip.tsx
function OnboardingTooltip({ step, total, title, body, link, ctaLabel, onBack, onNext, onSkip, showBack }) {
	const containerRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		(containerRef.current?.querySelector("button[data-onboarding-next=\"true\"]"))?.focus();
	}, [step]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		ref: containerRef,
		role: "dialog",
		"aria-modal": "false",
		"aria-labelledby": "onboarding-tooltip-title",
		"aria-describedby": "onboarding-tooltip-body",
		className: "flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-[10px] border border-border bg-surface p-4 text-fg shadow-2xl shadow-black/40 animate-fade-up",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-start justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					id: "onboarding-tooltip-title",
					className: "text-[14px] font-medium leading-snug text-fg",
					children: title
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					"aria-label": "Skip onboarding",
					onClick: onSkip,
					className: "-mr-1 -mt-0.5 grid size-6 shrink-0 place-items-center rounded-md text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
						width: "11",
						height: "11",
						viewBox: "0 0 12 12",
						fill: "none",
						"aria-hidden": true,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
							d: "M3 3l6 6M9 3l-6 6",
							stroke: "currentColor",
							strokeWidth: "1.4",
							strokeLinecap: "round"
						})
					})
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				id: "onboarding-tooltip-body",
				className: "text-[13px] leading-relaxed text-fg-muted",
				children: body
			}),
			link ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
				href: link.url,
				target: "_blank",
				rel: "noreferrer",
				className: "inline-flex w-fit items-center gap-1 text-[12.5px] text-accent transition-colors hover:text-fg",
				children: [link.label, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					"aria-hidden": true,
					children: "↗"
				})]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between gap-3 pt-1",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex items-center gap-1.5",
						"aria-hidden": true,
						children: Array.from({ length: total }).map((_, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn("block h-1 rounded-full transition-all", i === step - 1 ? "w-4 bg-accent" : i < step - 1 ? "w-1 bg-fg-muted" : "w-1 bg-fg-faint/40") }, i))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "sr-only",
						children: [
							"Step ",
							step,
							" of ",
							total
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-2",
						children: [showBack ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "ghost",
							size: "sm",
							onClick: onBack,
							children: "Back"
						}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							size: "sm",
							onClick: onNext,
							"data-onboarding-next": "true",
							children: ctaLabel ?? "Next"
						})]
					})
				]
			})
		]
	});
}
//#endregion
//#region src/components/onboarding/use-onboarding-target.ts
function useTargetRect(selector) {
	const [rect, setRect] = (0, import_react.useState)(null);
	(0, import_react.useEffect)(() => {
		if (!selector || typeof window === "undefined") {
			setRect(null);
			return;
		}
		let raf = 0;
		let pollTimer = null;
		let observer = null;
		let observedEl = null;
		const compute = () => {
			raf = 0;
			const el = document.querySelector(selector);
			if (el !== observedEl) {
				if (observer && observedEl) observer.unobserve(observedEl);
				observedEl = el;
				if (observer && el) observer.observe(el);
			}
			if (el) {
				const r = el.getBoundingClientRect();
				setRect({
					top: r.top,
					left: r.left,
					width: r.width,
					height: r.height
				});
				if (pollTimer !== null) {
					window.clearInterval(pollTimer);
					pollTimer = null;
				}
			} else {
				setRect(null);
				if (pollTimer === null) pollTimer = window.setInterval(schedule, 150);
			}
		};
		const schedule = () => {
			if (raf) return;
			raf = requestAnimationFrame(compute);
		};
		observer = new ResizeObserver(schedule);
		window.addEventListener("scroll", schedule, {
			capture: true,
			passive: true
		});
		window.addEventListener("resize", schedule);
		schedule();
		return () => {
			if (raf) cancelAnimationFrame(raf);
			if (pollTimer !== null) window.clearInterval(pollTimer);
			observer?.disconnect();
			window.removeEventListener("scroll", schedule, { capture: true });
			window.removeEventListener("resize", schedule);
		};
	}, [selector]);
	return rect;
}
//#endregion
//#region src/components/onboarding/onboarding-overlay.tsx
var SPOTLIGHT_PADDING = 6;
var SPOTLIGHT_RADIUS = 10;
function OnboardingOverlay() {
	const onboarding = useOnboarding();
	const isMobile = useMediaQuery("(max-width: 767px)");
	const [mounted, setMounted] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => setMounted(true), []);
	if (!mounted || !onboarding.isActive || !onboarding.step) return null;
	if (typeof document === "undefined") return null;
	const tooltipProps = {
		step: onboarding.stepIndex + 1,
		total: onboarding.totalSteps,
		title: onboarding.step.title,
		body: onboarding.step.body,
		link: onboarding.step.link,
		ctaLabel: onboarding.step.ctaLabel,
		onBack: onboarding.back,
		onNext: onboarding.next,
		onSkip: onboarding.skip,
		showBack: onboarding.stepIndex > 0
	};
	return (0, import_react_dom.createPortal)(isMobile ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MobileShell, { tooltipProps }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DesktopShell, {
		tooltipProps,
		target: onboarding.step.target,
		placement: onboarding.step.placement
	}), document.body);
}
function DesktopShell({ tooltipProps, target, placement }) {
	const rect = useTargetRect(target);
	if (target == null) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FullDim, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CenterTooltip, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OnboardingTooltip, { ...tooltipProps }) })] });
	if (!rect) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FullDim, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CenterTooltip, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OnboardingTooltip, { ...tooltipProps }) })] });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Spotlight, { rect }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, {
		open: true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverAnchor, {
			asChild: true,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				"aria-hidden": true,
				style: {
					position: "fixed",
					top: rect.top + rect.height / 2,
					left: rect.left + rect.width / 2,
					width: 0,
					height: 0,
					pointerEvents: "none"
				}
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverContent, {
			side: placement ?? "bottom",
			align: "center",
			sideOffset: 16,
			collisionPadding: 20,
			avoidCollisions: true,
			className: "z-[71] border-0 bg-transparent p-0 shadow-none",
			onOpenAutoFocus: (e) => e.preventDefault(),
			onInteractOutside: (e) => e.preventDefault(),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OnboardingTooltip, { ...tooltipProps })
		})]
	})] });
}
function MobileShell({ tooltipProps }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FullDim, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-x-4 bottom-4 z-[71] flex justify-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OnboardingTooltip, { ...tooltipProps })
	})] });
}
function FullDim() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		"aria-hidden": true,
		className: "fixed inset-0 z-[70] bg-black/55 backdrop-blur-[1px] animate-fade-in"
	});
}
function CenterTooltip({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-[71] grid place-items-center p-4",
		children
	});
}
function Spotlight({ rect }) {
	const x = Math.max(0, rect.left - SPOTLIGHT_PADDING);
	const y = Math.max(0, rect.top - SPOTLIGHT_PADDING);
	const w = rect.width + SPOTLIGHT_PADDING * 2;
	const h = rect.height + SPOTLIGHT_PADDING * 2;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		"aria-hidden": true,
		className: "pointer-events-none fixed inset-0 z-[70] h-full w-full animate-fade-in motion-reduce:animate-none",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("mask", {
			id: "produktive-onboarding-cutout",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				width: "100%",
				height: "100%",
				fill: "white"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x,
				y,
				width: w,
				height: h,
				rx: SPOTLIGHT_RADIUS,
				ry: SPOTLIGHT_RADIUS,
				fill: "black",
				style: { transition: "x 220ms ease-out, y 220ms ease-out, width 220ms ease-out, height 220ms ease-out" }
			})]
		}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			width: "100%",
			height: "100%",
			fill: "rgba(0, 0, 0, 0.55)",
			mask: "url(#produktive-onboarding-cutout)"
		})]
	});
}
//#endregion
//#region src/components/ui/sonner.tsx
function Toaster(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toaster$1, {
		theme: "dark",
		position: "bottom-right",
		toastOptions: { classNames: {
			toast: "border border-border bg-surface text-fg shadow-xl rounded-[8px]",
			title: "text-fg text-[13px]",
			description: "text-fg-muted text-[12px]",
			actionButton: "bg-fg text-bg",
			cancelButton: "bg-surface-3 text-fg",
			closeButton: "bg-surface border-border text-fg"
		} },
		...props
	});
}
//#endregion
//#region src/components/chat/icons.tsx
function Icon({ strokeWidth = 1.8, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HugeiconsIcon, {
		"aria-hidden": "true",
		strokeWidth,
		...props
	});
}
function PlusIcon({ size = 14, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: R,
		size,
		...rest
	});
}
function InboxIcon({ size = 14, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: hE,
		size,
		...rest
	});
}
function IssuesIcon({ size = 14, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: Tlr,
		size,
		...rest
	});
}
function SparkleIcon({ size = 14, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: Tar,
		size,
		...rest
	});
}
function ProjectsIcon({ size = 14, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: cT,
		size,
		...rest
	});
}
function SendIcon({ size = 13, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: osr,
		size,
		...rest
	});
}
function StarIcon({ size = 13, filled = false, strokeWidth, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: vLr,
		size,
		strokeWidth: strokeWidth ?? (filled ? 2.25 : 1.8),
		...rest
	});
}
function PlayIcon({ size = 9, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: l6,
		size,
		...rest
	});
}
function StopIcon({ size = 11, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: nhr,
		size,
		...rest
	});
}
function AttachIcon({ size = 13, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: $C,
		size,
		...rest
	});
}
function HashIcon({ size = 13, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: uv,
		size,
		...rest
	});
}
function AtIcon({ size = 13, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: EC,
		size,
		...rest
	});
}
function ChangesIcon({ size = 13, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: KD,
		size,
		...rest
	});
}
function GithubIcon({ size = 14, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: rR,
		size,
		...rest
	});
}
function ExpandIcon({ size = 13, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: gn,
		size,
		...rest
	});
}
function CheckIcon$1({ size = 13, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: my,
		size,
		...rest
	});
}
function CaretIcon({ size = 11, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: HugeiconsCaretDownIcon,
		size,
		...rest
	});
}
function CopyIcon({ size = 13, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: WI,
		size,
		...rest
	});
}
function RefreshIcon({ size = 13, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: Ser,
		size,
		...rest
	});
}
function ThumbsUpIcon({ size = 13, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: wWr,
		size,
		...rest
	});
}
function DotsIcon({ size = 13, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: K1,
		size,
		...rest
	});
}
function SettingsIcon({ size = 14, ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		icon: Msr,
		size,
		...rest
	});
}
var HugeiconsCaretDownIcon = [["path", {
	d: "M6 9L12 15L18 9",
	key: "0"
}]];
//#endregion
//#region src/components/chat/chat-markdown.tsx
var mediaClass = "my-3 max-h-[520px] max-w-full rounded-[7px] border border-border-subtle bg-surface object-contain";
var sanitizeSchema = {
	...defaultSchema,
	tagNames: [
		...defaultSchema.tagNames ?? [],
		"video",
		"source"
	],
	attributes: {
		...defaultSchema.attributes,
		a: [
			...defaultSchema.attributes?.a ?? [],
			"href",
			"title",
			"target",
			"rel"
		],
		img: [
			...defaultSchema.attributes?.img ?? [],
			"src",
			"alt",
			"title",
			"width",
			"height"
		],
		video: [
			"src",
			"poster",
			"title",
			"width",
			"height",
			"controls",
			"loop",
			"muted",
			"playsinline",
			"preload"
		],
		source: ["src", "type"]
	},
	protocols: {
		...defaultSchema.protocols,
		href: [
			"http",
			"https",
			"mailto"
		],
		src: ["http", "https"],
		poster: ["http", "https"]
	}
};
var components = {
	a({ children, href, ...props }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
			...props,
			href,
			target: href?.startsWith("#") ? void 0 : "_blank",
			rel: href?.startsWith("#") ? void 0 : "noreferrer",
			className: "text-accent underline decoration-accent/40 underline-offset-3 transition-colors hover:text-accent-hover",
			children
		});
	},
	blockquote({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("blockquote", {
			className: "my-3 border-l border-border pl-3 text-fg-muted",
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
			className: "rounded-[4px] border border-border-subtle bg-surface px-1.5 py-0.5 font-mono text-[0.92em] text-fg",
			children
		});
	},
	h1({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
			className: "mb-2 mt-4 text-xl font-semibold",
			children
		});
	},
	h2({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
			className: "mb-2 mt-4 text-lg font-semibold",
			children
		});
	},
	h3({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
			className: "mb-1.5 mt-3 text-base font-semibold",
			children
		});
	},
	hr() {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("hr", { className: "my-4 border-border-subtle" });
	},
	img({ src, alt, className, ...props }) {
		const safeSrc = safeMediaUrl(src);
		if (!safeSrc) return null;
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
			...props,
			src: safeSrc,
			alt: typeof alt === "string" ? alt : "",
			loading: "lazy",
			className: cn(mediaClass, "block", className)
		});
	},
	li({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
			className: "my-1 pl-1",
			children
		});
	},
	ol({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
			className: "my-3 list-decimal space-y-1 pl-5 marker:text-fg-muted",
			children
		});
	},
	p({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "my-2 first:mt-0 last:mb-0",
			children
		});
	},
	pre({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
			className: "my-3 overflow-x-auto rounded-[7px] border border-border bg-[#101012] p-3 font-mono text-[12px] leading-relaxed text-fg",
			children
		});
	},
	table({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "my-3 overflow-x-auto rounded-[7px] border border-border-subtle",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("table", {
				className: "w-full border-collapse text-left text-[13px]",
				children
			})
		});
	},
	th({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
			className: "border-b border-border-subtle bg-surface px-2.5 py-2 font-medium text-fg",
			children
		});
	},
	td({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
			className: "border-b border-border-subtle px-2.5 py-2 text-fg-muted",
			children
		});
	},
	ul({ children }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
			className: "my-3 list-disc space-y-1 pl-5 marker:text-fg-muted",
			children
		});
	},
	video({ children, src, poster, className, ...props }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
			...props,
			src: safeMediaUrl(src),
			poster: safeMediaUrl(poster),
			controls: true,
			playsInline: true,
			preload: "metadata",
			className: cn(mediaClass, "block w-full", className),
			children
		});
	},
	source({ src, type, ...props }) {
		const safeSrc = safeMediaUrl(src);
		if (!safeSrc) return null;
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("source", {
			...props,
			src: safeSrc,
			type: typeof type === "string" ? type : void 0
		});
	}
};
function ChatMarkdown({ content }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Markdown, {
		remarkPlugins: [remarkGfm],
		rehypePlugins: [rehypeRaw, [rehypeSanitize, sanitizeSchema]],
		components,
		children: content
	});
}
function safeMediaUrl(value) {
	if (typeof value !== "string") return void 0;
	try {
		const origin = globalThis.location?.origin ?? "http://localhost";
		const url = new URL(value, origin);
		if (url.protocol === "http:" || url.protocol === "https:") return value;
	} catch {
		return;
	}
}
//#endregion
//#region src/components/ui/dialog.tsx
function Dialog({ open, onClose, children, className, style }) {
	(0, import_react.useEffect)(() => {
		if (!open) return;
		const onKey = (event) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.removeEventListener("keydown", onKey);
			document.body.style.overflow = previousOverflow;
		};
	}, [open, onClose]);
	if (!open) return null;
	return (0, import_react_dom.createPortal)(/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "fixed inset-0 bg-black/60 animate-fade-in",
			onClick: onClose,
			"aria-hidden": "true"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			role: "dialog",
			"aria-modal": "true",
			className: cn("relative z-10 mt-[8vh] w-full max-w-lg rounded-lg border border-border bg-surface shadow-2xl animate-fade-in", className),
			style,
			children
		})]
	}), document.body);
}
function DialogHeader({ children, className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("flex items-center justify-between gap-4 border-b border-border-subtle px-4 py-3", className),
		...props,
		children
	});
}
function DialogTitle({ children, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
		className: cn("text-sm font-medium text-fg", className),
		children
	});
}
function DialogContent({ children, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("p-4", className),
		children
	});
}
function DialogFooter({ children, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("flex items-center justify-end gap-2 border-t border-border-subtle px-4 py-3", className),
		children
	});
}
function DialogClose({ onClose }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		onClick: onClose,
		className: "grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg",
		"aria-label": "Close",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
			width: "14",
			height: "14",
			viewBox: "0 0 14 14",
			fill: "none",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M3 3l8 8M11 3l-8 8",
				stroke: "currentColor",
				strokeWidth: "1.5",
				strokeLinecap: "round"
			})
		})
	});
}
//#endregion
//#region src/components/ui/confirm-dialog.tsx
function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Confirm", cancelLabel = "Cancel", destructive = false }) {
	const [submitting, setSubmitting] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		if (!open) setSubmitting(false);
	}, [open]);
	const handleConfirm = async () => {
		if (submitting) return;
		setSubmitting(true);
		try {
			await onConfirm();
		} finally {
			setSubmitting(false);
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Dialog, {
		open,
		onClose,
		className: "max-w-md",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: title }) }),
			description ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogContent, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "m-0 text-[13px] leading-relaxed text-fg-muted",
				children: description
			}) }) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				type: "button",
				variant: "outline",
				size: "sm",
				onClick: onClose,
				disabled: submitting,
				children: cancelLabel
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				type: "button",
				variant: destructive ? "danger" : "default",
				size: "sm",
				onClick: () => void handleConfirm(),
				disabled: submitting,
				children: submitting ? "…" : confirmLabel
			})] })
		]
	});
}
function useConfirmDialog() {
	const [state, setState] = (0, import_react.useState)({
		open: false,
		props: null
	});
	const confirm = (props) => {
		setState({
			open: true,
			props
		});
	};
	const close = () => setState((current) => ({
		...current,
		open: false
	}));
	return {
		confirm,
		dialog: state.props ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConfirmDialog, {
			open: state.open,
			onClose: close,
			onConfirm: async () => {
				await state.props.onConfirm();
				close();
			},
			title: state.props.title,
			description: state.props.description,
			confirmLabel: state.props.confirmLabel,
			cancelLabel: state.props.cancelLabel,
			destructive: state.props.destructive
		}) : null
	};
}
//#endregion
//#region src/components/issue/avatar.tsx
function Avatar({ name, image }) {
	if (image) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
		src: image,
		alt: "",
		className: "size-5 shrink-0 rounded-full border border-border-subtle object-cover"
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "grid size-5 shrink-0 place-items-center rounded-full border border-border-subtle bg-surface-2 text-[9px] font-medium text-fg-muted",
		children: initialsFromName(name)
	});
}
function initialsFromName(name) {
	const tokens = (name ?? "").trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return "?";
	if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
	return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
}
//#endregion
//#region src/components/issue/editable-description.tsx
function EditableDescription({ value, onSave, className }) {
	const [editing, setEditing] = (0, import_react.useState)(false);
	const [draft, setDraft] = (0, import_react.useState)(value ?? "");
	const taRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		if (!editing) setDraft(value ?? "");
	}, [value, editing]);
	(0, import_react.useEffect)(() => {
		if (!editing) return;
		requestAnimationFrame(() => {
			const el = taRef.current;
			if (!el) return;
			el.focus();
			el.setSelectionRange(el.value.length, el.value.length);
			autoresize(el);
		});
	}, [editing]);
	const commit = async () => {
		const trimmed = draft.trim();
		setEditing(false);
		const original = value ?? "";
		if (trimmed === original) {
			setDraft(original);
			return;
		}
		await onSave(trimmed);
	};
	const cancel = () => {
		setDraft(value ?? "");
		setEditing(false);
	};
	if (editing) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
		ref: taRef,
		value: draft,
		onChange: (event) => {
			setDraft(event.target.value);
			autoresize(event.target);
		},
		onBlur: () => void commit(),
		onKeyDown: (event) => {
			if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				commit();
			} else if (event.key === "Escape") {
				event.preventDefault();
				cancel();
			}
		},
		placeholder: "Add a description…",
		className: cn("block min-h-[96px] w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-[1.7] text-fg outline-none placeholder:text-fg-faint", className)
	});
	if (!value) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		onClick: () => setEditing(true),
		className: cn("block w-full cursor-text border-0 bg-transparent p-0 text-left text-[15px] leading-[1.7] text-fg-faint transition-colors hover:text-fg-muted", className),
		children: "Add a description…"
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		role: "textbox",
		tabIndex: 0,
		onClick: () => setEditing(true),
		onKeyDown: (event) => {
			if (event.key === "Enter" && !event.shiftKey) {
				event.preventDefault();
				setEditing(true);
			}
		},
		className: cn("cursor-text text-[15px] leading-[1.7] text-fg outline-none", className),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatMarkdown, { content: value })
	});
}
function autoresize(el) {
	el.style.height = "auto";
	el.style.height = `${Math.min(el.scrollHeight, 720)}px`;
}
//#endregion
//#region src/components/issue/editable-title.tsx
function EditableTitle({ value, onSave, className }) {
	const [editing, setEditing] = (0, import_react.useState)(false);
	const [draft, setDraft] = (0, import_react.useState)(value);
	const inputRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		if (!editing) setDraft(value);
	}, [value, editing]);
	(0, import_react.useEffect)(() => {
		if (!editing) return;
		requestAnimationFrame(() => {
			inputRef.current?.focus();
			inputRef.current?.select();
		});
	}, [editing]);
	const commit = async () => {
		const trimmed = draft.trim();
		setEditing(false);
		if (!trimmed || trimmed === value) {
			setDraft(value);
			return;
		}
		await onSave(trimmed);
	};
	const cancel = () => {
		setDraft(value);
		setEditing(false);
	};
	const sharedTypography = "text-[44px] font-semibold leading-[1.04] tracking-[-0.03em] text-fg text-balance";
	if (editing) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
		ref: inputRef,
		value: draft,
		onChange: (event) => setDraft(event.target.value),
		onBlur: () => void commit(),
		onKeyDown: (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				commit();
			} else if (event.key === "Escape") {
				event.preventDefault();
				cancel();
			}
		},
		className: cn("block w-full border-0 bg-transparent p-0 outline-none", sharedTypography, className)
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
		role: "textbox",
		tabIndex: 0,
		onClick: () => setEditing(true),
		onKeyDown: (event) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				setEditing(true);
			}
		},
		className: cn("m-0 cursor-text outline-none", sharedTypography, className),
		children: value || /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-fg-faint",
			children: "Untitled"
		})
	});
}
//#endregion
//#region src/components/ui/loading-tip.tsx
var LOADING_TIPS = [
	"Tip: press / in chat to open commands.",
	"Tip: attach screenshots when the context matters.",
	"Tip: pin important chats so they stay in the sidebar.",
	"Tip: use markdown in issues for cleaner specs.",
	"Tip: open changes to review what the agent edited.",
	"Tip: keep issue titles short and searchable.",
	"Tip: mention an issue in chat to keep work connected.",
	"Tip: use priorities sparingly. The queue gets quieter."
];
function LoadingTip({ compact = false, className }) {
	const [tipIndex, setTipIndex] = (0, import_react.useState)(() => Math.floor(Math.random() * LOADING_TIPS.length));
	(0, import_react.useEffect)(() => {
		const interval = window.setInterval(() => {
			setTipIndex((current) => (current + 1) % LOADING_TIPS.length);
		}, 3600);
		return () => window.clearInterval(interval);
	}, []);
	if (compact) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("flex min-w-0 items-center gap-2 text-[12px] text-fg-faint", className),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "inline-block size-2.5 shrink-0 animate-spin rounded-full border border-border border-t-fg-muted" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "min-w-0 truncate",
			children: LOADING_TIPS[tipIndex]
		})]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("flex w-full max-w-[420px] flex-col items-center", className),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative mb-5 grid size-12 place-items-center rounded-[14px] border border-border bg-surface",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "absolute inset-[-1px] animate-pulse rounded-[15px] border border-fg/10" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "inline-block size-4 animate-spin rounded-full border-2 border-border border-t-fg" })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-[14px] font-medium tracking-[-0.01em] text-fg",
				children: "Loading Produktive"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-2 min-h-5 text-center text-[13px] leading-5 text-fg-muted transition-opacity",
				children: LOADING_TIPS[tipIndex]
			})
		]
	});
}
//#endregion
//#region src/components/issue/member-picker.tsx
var POPOVER_WIDTH$2 = 280;
var TRIGGER_GAP$2 = 6;
var VIEWPORT_PADDING$2 = 8;
function MemberPicker({ trigger, selectedId, onSelect }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [query, setQuery] = (0, import_react.useState)("");
	const [members, setMembers] = (0, import_react.useState)([]);
	const [isLoading, setIsLoading] = (0, import_react.useState)(false);
	const [coords, setCoords] = (0, import_react.useState)(null);
	const triggerRef = (0, import_react.useRef)(null);
	const popoverRef = (0, import_react.useRef)(null);
	const inputRef = (0, import_react.useRef)(null);
	const loadedRef = (0, import_react.useRef)(false);
	(0, import_react.useEffect)(() => {
		if (!open || loadedRef.current) return;
		loadedRef.current = true;
		setIsLoading(true);
		listMembers().then((response) => setMembers(response.members)).catch(() => {
			loadedRef.current = false;
		}).finally(() => setIsLoading(false));
	}, [open]);
	(0, import_react.useLayoutEffect)(() => {
		if (!open) return;
		const update = () => {
			const rect = triggerRef.current?.getBoundingClientRect();
			if (!rect) return;
			const maxLeft = window.innerWidth - POPOVER_WIDTH$2 - VIEWPORT_PADDING$2;
			setCoords({
				left: Math.min(Math.max(rect.left, VIEWPORT_PADDING$2), maxLeft),
				top: rect.bottom + TRIGGER_GAP$2
			});
		};
		update();
		window.addEventListener("resize", update);
		window.addEventListener("scroll", update, true);
		return () => {
			window.removeEventListener("resize", update);
			window.removeEventListener("scroll", update, true);
		};
	}, [open]);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		const onPointerDown = (event) => {
			const target = event.target;
			if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
			setOpen(false);
		};
		const onKey = (event) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);
	(0, import_react.useEffect)(() => {
		if (!open) {
			setQuery("");
			return;
		}
		requestAnimationFrame(() => inputRef.current?.focus());
	}, [open]);
	const filtered = (0, import_react.useMemo)(() => {
		const trimmed = query.trim().toLowerCase();
		if (!trimmed) return members;
		return members.filter((member) => {
			return member.name.toLowerCase().includes(trimmed) || member.email.toLowerCase().includes(trimmed);
		});
	}, [members, query]);
	const close = () => setOpen(false);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		ref: triggerRef,
		className: "inline-block",
		children: trigger({
			open,
			onClick: () => setOpen((value) => !value)
		})
	}), open && coords ? (0, import_react_dom.createPortal)(/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		ref: popoverRef,
		role: "dialog",
		style: {
			position: "fixed",
			left: coords.left,
			top: coords.top,
			width: POPOVER_WIDTH$2
		},
		className: "z-50 overflow-hidden rounded-[10px] border border-border bg-surface shadow-[0_18px_40px_rgba(0,0,0,0.45)] animate-fade-up",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "border-b border-border-subtle p-2",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				ref: inputRef,
				type: "text",
				value: query,
				onChange: (event) => setQuery(event.target.value),
				placeholder: "Search members…",
				className: "h-8 w-full rounded-[7px] border border-border bg-bg px-2.5 text-[12px] text-fg placeholder:text-fg-faint outline-none focus:border-fg-muted"
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex max-h-[280px] flex-col overflow-auto py-1",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				onClick: () => {
					onSelect(null);
					close();
				},
				className: cn("flex h-9 items-center gap-2.5 px-3 text-left text-[13px] transition-colors", selectedId === null ? "text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"),
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "grid size-5 place-items-center rounded-full border border-border-subtle text-fg-faint",
						children: "×"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "flex-1 truncate",
						children: "Unassigned"
					}),
					selectedId === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-fg",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CheckIcon$1, { size: 12 })
					}) : null
				]
			}), isLoading && members.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "px-3 py-2",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoadingTip, { compact: true })
			}) : filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "px-3 py-2 text-[12px] text-fg-faint",
				children: "No matching members"
			}) : filtered.map((member) => {
				const isSelected = selectedId === member.id;
				return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => {
						onSelect(member.id);
						close();
					},
					className: cn("flex h-9 items-center gap-2.5 px-3 text-left text-[13px] transition-colors", isSelected ? "text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, {
							name: member.name,
							image: member.image
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "flex min-w-0 flex-1 flex-col",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "truncate",
								children: member.name
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "truncate text-[10.5px] text-fg-faint",
								children: member.email
							})]
						}),
						isSelected ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-fg",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CheckIcon$1, { size: 12 })
						}) : null
					]
				}, member.id);
			})]
		})]
	}), document.body) : null] });
}
//#endregion
//#region src/components/issue/priority-icon.tsx
function PriorityIcon({ priority, className }) {
	const base = cn("shrink-0", className);
	if (priority === "urgent") return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: "14",
		height: "14",
		viewBox: "0 0 14 14",
		className: cn(base, "text-danger"),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "1.5",
				y: "1.5",
				width: "11",
				height: "11",
				rx: "2",
				fill: "currentColor"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "6.25",
				y: "3.5",
				width: "1.5",
				height: "5",
				fill: "white",
				rx: "0.5"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "6.25",
				y: "9.5",
				width: "1.5",
				height: "1.5",
				fill: "white",
				rx: "0.5"
			})
		]
	});
	const level = priority === "high" ? 3 : priority === "medium" ? 2 : 1;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: "14",
		height: "14",
		viewBox: "0 0 14 14",
		className: cn(base, "text-fg"),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "1",
				y: "9",
				width: "2.5",
				height: "4",
				rx: "0.5",
				fill: level >= 1 ? "currentColor" : "var(--color-border)"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "5.75",
				y: "5.5",
				width: "2.5",
				height: "7.5",
				rx: "0.5",
				fill: level >= 2 ? "currentColor" : "var(--color-border)"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "10.5",
				y: "2",
				width: "2.5",
				height: "11",
				rx: "0.5",
				fill: level >= 3 ? "currentColor" : "var(--color-border)"
			})
		]
	});
}
//#endregion
//#region src/components/issue/status-icon.tsx
function StatusIcon({ status, statuses, className }) {
	const base = cn("shrink-0", className);
	switch (statuses ? statusCategory(statuses, status) : status) {
		case "done": return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
			width: "14",
			height: "14",
			viewBox: "0 0 14 14",
			className: cn(base, "text-success"),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "7",
				cy: "7",
				r: "6",
				fill: "currentColor"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M4.3 7.1l1.9 1.9 3.5-3.5",
				stroke: "white",
				strokeWidth: "1.6",
				fill: "none",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			})]
		});
		case "active":
		case "in-progress": return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
			width: "14",
			height: "14",
			viewBox: "0 0 14 14",
			className: cn(base, "text-accent"),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "7",
				cy: "7",
				r: "6",
				stroke: "currentColor",
				strokeWidth: "1.5",
				fill: "none"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M7 1.5 A5.5 5.5 0 0 1 7 12.5 Z",
				fill: "currentColor"
			})]
		});
		case "todo": return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
			width: "14",
			height: "14",
			viewBox: "0 0 14 14",
			className: cn(base, "text-fg-muted"),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "7",
				cy: "7",
				r: "6",
				stroke: "currentColor",
				strokeWidth: "1.5",
				fill: "none"
			})
		});
		case "canceled": return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
			width: "14",
			height: "14",
			viewBox: "0 0 14 14",
			className: cn(base, "text-danger"),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "7",
				cy: "7",
				r: "6",
				stroke: "currentColor",
				strokeWidth: "1.5",
				fill: "none"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M4.6 4.6l4.8 4.8M9.4 4.6L4.6 9.4",
				stroke: "currentColor",
				strokeWidth: "1.4",
				strokeLinecap: "round"
			})]
		});
		default: return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
			width: "14",
			height: "14",
			viewBox: "0 0 14 14",
			className: cn(base, "text-fg-faint"),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "7",
				cy: "7",
				r: "6",
				stroke: "currentColor",
				strokeWidth: "1.5",
				fill: "none",
				strokeDasharray: "2.4 1.8"
			})
		});
	}
}
//#endregion
//#region src/components/label/label-chip.tsx
var sizeClass$1 = {
	sm: "h-4 gap-1 rounded-[3px] px-1.5 text-[10.5px]",
	md: "h-5 gap-1.5 rounded-[4px] px-1.5 text-[11.5px]"
};
var dotSize = {
	sm: "size-1.5",
	md: "size-2"
};
function LabelChip({ name, color, size = "sm", className, onRemove }) {
	const fg = labelColorHex[color] ?? labelColorHex.gray;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: cn("inline-flex shrink-0 items-center border border-border-subtle bg-surface/40 text-fg-muted", sizeClass$1[size], className),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				"aria-hidden": true,
				className: cn("rounded-full", dotSize[size]),
				style: { backgroundColor: fg }
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "truncate",
				children: name
			}),
			onRemove ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: (event) => {
					event.stopPropagation();
					onRemove();
				},
				"aria-label": `Remove ${name}`,
				className: "grid size-3 place-items-center text-fg-faint transition-colors hover:text-fg",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
					width: "7",
					height: "7",
					viewBox: "0 0 12 12",
					fill: "none",
					"aria-hidden": true,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
						d: "M3 3l6 6M9 3l-6 6",
						stroke: "currentColor",
						strokeWidth: "1.4",
						strokeLinecap: "round"
					})
				})
			}) : null
		]
	});
}
//#endregion
//#region src/components/label/label-picker.tsx
var POPOVER_WIDTH$1 = 280;
var TRIGGER_GAP$1 = 6;
var VIEWPORT_PADDING$1 = 8;
function LabelPicker({ trigger, selectedIds, onChange, onLabelAttached }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [query, setQuery] = (0, import_react.useState)("");
	const [labels, setLabels] = (0, import_react.useState)([]);
	const [isLoading, setIsLoading] = (0, import_react.useState)(false);
	const [creating, setCreating] = (0, import_react.useState)(false);
	const [coords, setCoords] = (0, import_react.useState)(null);
	const triggerRef = (0, import_react.useRef)(null);
	const popoverRef = (0, import_react.useRef)(null);
	const inputRef = (0, import_react.useRef)(null);
	const reload = async () => {
		setIsLoading(true);
		try {
			setLabels((await listLabels(false)).labels);
		} catch {} finally {
			setIsLoading(false);
		}
	};
	(0, import_react.useEffect)(() => {
		if (!open) return;
		reload();
	}, [open]);
	(0, import_react.useEffect)(() => {
		const handler = () => void reload();
		window.addEventListener("produktive:label-created", handler);
		window.addEventListener("produktive:label-updated", handler);
		return () => {
			window.removeEventListener("produktive:label-created", handler);
			window.removeEventListener("produktive:label-updated", handler);
		};
	}, []);
	(0, import_react.useLayoutEffect)(() => {
		if (!open) return;
		const update = () => {
			const rect = triggerRef.current?.getBoundingClientRect();
			if (!rect) return;
			const maxLeft = window.innerWidth - POPOVER_WIDTH$1 - VIEWPORT_PADDING$1;
			setCoords({
				left: Math.min(Math.max(rect.left, VIEWPORT_PADDING$1), maxLeft),
				top: rect.bottom + TRIGGER_GAP$1
			});
		};
		update();
		window.addEventListener("resize", update);
		window.addEventListener("scroll", update, true);
		return () => {
			window.removeEventListener("resize", update);
			window.removeEventListener("scroll", update, true);
		};
	}, [open]);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		const onPointerDown = (event) => {
			const target = event.target;
			if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
			setOpen(false);
		};
		const onKey = (event) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);
	(0, import_react.useEffect)(() => {
		if (!open) {
			setQuery("");
			return;
		}
		requestAnimationFrame(() => inputRef.current?.focus());
	}, [open]);
	const filtered = (0, import_react.useMemo)(() => {
		const trimmed = query.trim().toLowerCase();
		if (!trimmed) return labels;
		return labels.filter((label) => label.name.toLowerCase().includes(trimmed));
	}, [labels, query]);
	const exactMatch = (0, import_react.useMemo)(() => {
		const trimmed = query.trim().toLowerCase();
		if (!trimmed) return false;
		return labels.some((label) => label.name.toLowerCase() === trimmed);
	}, [labels, query]);
	const toggle = (labelId) => {
		if (selectedIds.includes(labelId)) onChange(selectedIds.filter((id) => id !== labelId));
		else onChange([...selectedIds, labelId]);
	};
	const inlineCreate = async () => {
		const name = query.trim();
		if (!name || creating) return;
		setCreating(true);
		try {
			const response = await createLabel({ name });
			onLabelAttached?.({
				id: response.label.id,
				name: response.label.name,
				color: response.label.color
			});
			onChange([...selectedIds, response.label.id]);
			window.dispatchEvent(new CustomEvent("produktive:label-created", { detail: { id: response.label.id } }));
			setQuery("");
			reload();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to create label");
		} finally {
			setCreating(false);
		}
	};
	const handleKeyDown = (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			const trimmed = query.trim().toLowerCase();
			if (!trimmed) return;
			const match = labels.find((l) => l.name.toLowerCase() === trimmed);
			if (match) {
				toggle(match.id);
				setQuery("");
			} else inlineCreate();
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		ref: triggerRef,
		className: "inline-block",
		children: trigger({
			open,
			onClick: () => setOpen((value) => !value)
		})
	}), open && coords ? (0, import_react_dom.createPortal)(/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		ref: popoverRef,
		role: "dialog",
		style: {
			position: "fixed",
			left: coords.left,
			top: coords.top,
			width: POPOVER_WIDTH$1
		},
		className: "z-50 overflow-hidden rounded-[10px] border border-border bg-surface shadow-[0_18px_40px_rgba(0,0,0,0.45)] animate-fade-up",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "border-b border-border-subtle p-2",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					ref: inputRef,
					type: "text",
					value: query,
					onChange: (event) => setQuery(event.target.value),
					onKeyDown: handleKeyDown,
					placeholder: "Search or create…",
					className: "h-8 w-full rounded-[7px] border border-border bg-bg px-2.5 text-[12px] text-fg placeholder:text-fg-faint outline-none focus:border-fg-muted"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex max-h-[280px] flex-col overflow-auto py-1",
				children: [isLoading && labels.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "px-3 py-2 text-[12px] text-fg-faint",
					children: "Loading…"
				}) : filtered.length === 0 && !query.trim() ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "px-3 py-2 text-[12px] text-fg-faint",
					children: "No labels yet — type to create one."
				}) : filtered.map((label) => {
					const selected = selectedIds.includes(label.id);
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => toggle(label.id),
						className: cn("flex h-8 items-center gap-2.5 px-3 text-left text-[12.5px] transition-colors", selected ? "text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"),
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: cn("grid size-3.5 place-items-center rounded-[3px] border transition-colors", selected ? "border-accent bg-accent text-bg" : "border-border-subtle bg-transparent"),
								children: selected ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CheckIcon$1, { size: 9 }) : null
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								"aria-hidden": true,
								className: "size-2 shrink-0 rounded-full",
								style: { backgroundColor: labelColorHex[label.color] ?? labelColorHex.gray }
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "flex-1 truncate",
								children: label.name
							}),
							label.issueCount > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[10.5px] tabular-nums text-fg-faint",
								children: label.issueCount
							}) : null
						]
					}, label.id);
				}), query.trim() && !exactMatch ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => void inlineCreate(),
					disabled: creating,
					className: "flex h-8 items-center gap-2.5 border-t border-border-subtle px-3 text-left text-[12.5px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-60",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "grid size-3.5 place-items-center text-fg-faint",
						children: "+"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "flex-1 truncate",
						children: [
							"Create",
							" ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "text-fg",
								children: [
									"\"",
									query.trim(),
									"\""
								]
							})
						]
					})]
				}) : null]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "border-t border-border-subtle",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => {
						setOpen(false);
						window.dispatchEvent(new CustomEvent("produktive:new-label", { detail: { name: query.trim() || void 0 } }));
					},
					className: "flex h-8 w-full items-center gap-2.5 px-3 text-left text-[11.5px] text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg",
					children: "Create new label with options…"
				})
			})
		]
	}), document.body) : null] });
}
//#endregion
//#region src/components/project/project-icon.tsx
var sizeClass = {
	sm: "size-4 text-[10px] rounded-[3px]",
	md: "size-5 text-[11px] rounded-[4px]",
	lg: "size-7 text-[14px] rounded-[6px]"
};
function ProjectIcon({ color, icon, name, size = "md", className }) {
	const fg = projectColorHex[color] ?? projectColorHex.blue;
	const bg = projectColorBackground(color);
	const display = (icon ?? name?.charAt(0) ?? "•").trim() || "•";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("grid shrink-0 place-items-center font-medium leading-none", sizeClass[size], className),
		style: {
			backgroundColor: bg,
			color: fg
		},
		"aria-hidden": true,
		children: display
	});
}
//#endregion
//#region src/components/project/project-picker.tsx
var POPOVER_WIDTH = 280;
var TRIGGER_GAP = 6;
var VIEWPORT_PADDING = 8;
function ProjectPicker({ trigger, selectedId, onSelect, onCreateNew }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [query, setQuery] = (0, import_react.useState)("");
	const [projects, setProjects] = (0, import_react.useState)([]);
	const [isLoading, setIsLoading] = (0, import_react.useState)(false);
	const [coords, setCoords] = (0, import_react.useState)(null);
	const triggerRef = (0, import_react.useRef)(null);
	const popoverRef = (0, import_react.useRef)(null);
	const inputRef = (0, import_react.useRef)(null);
	const loadedRef = (0, import_react.useRef)(false);
	(0, import_react.useEffect)(() => {
		if (!open || loadedRef.current) return;
		loadedRef.current = true;
		setIsLoading(true);
		listProjects().then((response) => setProjects(response.projects)).catch(() => {
			loadedRef.current = false;
		}).finally(() => setIsLoading(false));
	}, [open]);
	(0, import_react.useLayoutEffect)(() => {
		if (!open) return;
		const update = () => {
			const rect = triggerRef.current?.getBoundingClientRect();
			if (!rect) return;
			const maxLeft = window.innerWidth - POPOVER_WIDTH - VIEWPORT_PADDING;
			setCoords({
				left: Math.min(Math.max(rect.left, VIEWPORT_PADDING), maxLeft),
				top: rect.bottom + TRIGGER_GAP
			});
		};
		update();
		window.addEventListener("resize", update);
		window.addEventListener("scroll", update, true);
		return () => {
			window.removeEventListener("resize", update);
			window.removeEventListener("scroll", update, true);
		};
	}, [open]);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		const onPointerDown = (event) => {
			const target = event.target;
			if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
			setOpen(false);
		};
		const onKey = (event) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);
	(0, import_react.useEffect)(() => {
		if (!open) {
			setQuery("");
			return;
		}
		requestAnimationFrame(() => inputRef.current?.focus());
	}, [open]);
	const filtered = (0, import_react.useMemo)(() => {
		const trimmed = query.trim().toLowerCase();
		const active = projects.filter((p) => p.archivedAt === null);
		if (!trimmed) return active;
		return active.filter((project) => project.name.toLowerCase().includes(trimmed));
	}, [projects, query]);
	const close = () => setOpen(false);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		ref: triggerRef,
		className: "inline-block",
		children: trigger({
			open,
			onClick: () => setOpen((value) => !value)
		})
	}), open && coords ? (0, import_react_dom.createPortal)(/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		ref: popoverRef,
		role: "dialog",
		style: {
			position: "fixed",
			left: coords.left,
			top: coords.top,
			width: POPOVER_WIDTH
		},
		className: "z-50 overflow-hidden rounded-[10px] border border-border bg-surface shadow-[0_18px_40px_rgba(0,0,0,0.45)] animate-fade-up",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "border-b border-border-subtle p-2",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					ref: inputRef,
					type: "text",
					value: query,
					onChange: (event) => setQuery(event.target.value),
					placeholder: "Search projects…",
					className: "h-8 w-full rounded-[7px] border border-border bg-bg px-2.5 text-[12px] text-fg placeholder:text-fg-faint outline-none focus:border-fg-muted"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex max-h-[280px] flex-col overflow-auto py-1",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => {
						onSelect(null);
						close();
					},
					className: cn("flex h-9 items-center gap-2.5 px-3 text-left text-[13px] transition-colors", selectedId === null ? "text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-5 shrink-0 rounded-[4px] border border-dashed border-border opacity-60" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "flex-1 truncate",
							children: "No project"
						}),
						selectedId === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-fg",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CheckIcon$1, { size: 12 })
						}) : null
					]
				}), isLoading && projects.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "px-3 py-2",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoadingTip, { compact: true })
				}) : filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "px-3 py-2 text-[12px] text-fg-faint",
					children: "No matching projects"
				}) : filtered.map((project) => {
					const isSelected = selectedId === project.id;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => {
							onSelect(project.id);
							close();
						},
						className: cn("flex h-9 items-center gap-2.5 px-3 text-left text-[13px] transition-colors", isSelected ? "text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"),
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectIcon, {
								color: project.color,
								icon: project.icon,
								name: project.name,
								size: "md"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "min-w-0 flex-1 truncate",
								children: project.name
							}),
							isSelected ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-fg",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CheckIcon$1, { size: 12 })
							}) : null
						]
					}, project.id);
				})]
			}),
			onCreateNew ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "border-t border-border-subtle",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => {
						close();
						onCreateNew();
					},
					className: "flex h-9 w-full items-center gap-2.5 px-3 text-left text-[13px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "grid size-5 place-items-center text-fg-faint",
						children: "+"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Create new project…" })]
				})
			}) : null
		]
	}), document.body) : null] });
}
//#endregion
//#region src/components/ui/select.tsx
var Select = Root2$1;
var SelectValue = Value;
function SelectTrigger({ className, children, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Trigger$1, {
		className: cn("flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border-subtle bg-bg px-2 text-left text-[12px] text-fg outline-none transition-colors hover:border-border focus:border-accent disabled:cursor-not-allowed disabled:opacity-60", className),
		...props,
		children: [children, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon$1, {
			asChild: true,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDownIcon, { className: "size-3.5 shrink-0 text-fg-faint" })
		})]
	});
}
function SelectContent({ className, children, position = "popper", sideOffset = 4, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Portal$1, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Content2$1, {
		position,
		sideOffset,
		className: cn("relative z-50 max-h-72 min-w-[8rem] overflow-hidden rounded-md border border-border bg-bg text-fg shadow-xl shadow-black/20", "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95", className),
		...props,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Viewport, {
			className: "p-1",
			children
		})
	}) });
}
function SelectItem({ className, children, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Item, {
		className: cn("relative flex h-8 cursor-default select-none items-center rounded px-2 pl-7 text-[12px] outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-surface data-[highlighted]:text-fg data-[disabled]:opacity-50", className),
		...props,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "absolute left-2 flex size-3.5 items-center justify-center",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ItemIndicator, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CheckIcon, { className: "size-3.5" }) })
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ItemText, { children })]
	});
}
function ChevronDownIcon({ className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		"aria-hidden": true,
		viewBox: "0 0 16 16",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "1.7",
		className,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M4 6.25 8 10l4-3.75",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function CheckIcon({ className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		"aria-hidden": true,
		viewBox: "0 0 16 16",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "1.8",
		className,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "m3.5 8.5 3 3 6-7",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
//#endregion
//#region src/components/issue/issue-properties.tsx
function IssueProperties({ status, statuses, priority, assignee, project, labels, onChangeStatus, onChangePriority, onChangeAssignee, onChangeProject, onChangeLabels }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PropertyRow, {
				label: "Status",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NativeSelectTrigger, {
					ariaLabel: "Status",
					icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusIcon, {
						status,
						statuses
					}),
					label: statusName(statuses, status),
					value: status,
					options: sortedStatuses(statuses).map((entry) => ({
						value: entry.key,
						label: entry.name
					})),
					onChange: onChangeStatus
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				"data-tour": "issue-fields",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PropertyRow, {
					label: "Priority",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NativeSelectTrigger, {
						ariaLabel: "Priority",
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PriorityIcon, { priority }),
						label: priorityLabels[priority] ?? priority,
						value: priority,
						options: priorityOptions.map((value) => ({
							value,
							label: priorityLabels[value] ?? value
						})),
						onChange: onChangePriority
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PropertyRow, {
					label: "Assignee",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MemberPicker, {
						selectedId: assignee?.id ?? null,
						onSelect: onChangeAssignee,
						trigger: ({ onClick }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PickerTrigger, {
							onClick,
							children: assignee ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, {
								name: assignee.name,
								image: assignee.image
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "min-w-0 flex-1 truncate",
								children: assignee.name
							})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-fg-faint",
								children: "Unassigned"
							})
						})
					})
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PropertyRow, {
				label: "Project",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectPicker, {
					selectedId: project?.id ?? null,
					onSelect: onChangeProject,
					trigger: ({ onClick }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PickerTrigger, {
						onClick,
						children: project ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProjectIcon, {
							color: project.color,
							icon: project.icon,
							name: project.name,
							size: "sm"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "min-w-0 flex-1 truncate",
							children: project.name
						})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-fg-faint",
							children: "No project"
						})
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PropertyRow, {
				label: "Labels",
				align: "start",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LabelPicker, {
					selectedIds: labels.map((l) => l.id),
					onChange: onChangeLabels,
					trigger: ({ onClick }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick,
						className: "flex min-h-7 w-full flex-wrap items-center gap-1 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
						children: labels.length > 0 ? labels.map((label) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LabelChip, {
							name: label.name,
							color: label.color,
							size: "sm"
						}, label.id)) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-fg-faint",
							children: "+ Add label"
						})
					})
				})
			})
		]
	});
}
function PropertyRow({ label, children, align = "center" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: align === "start" ? "grid grid-cols-[64px_minmax(0,1fr)] items-start gap-2 py-1 text-[12.5px]" : "grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2 py-1 text-[12.5px]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: align === "start" ? "pt-2 text-fg-faint" : "text-fg-faint",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "min-w-0 text-fg",
			children
		})]
	});
}
function PickerTrigger({ children, onClick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		onClick,
		className: "flex h-7 w-full items-center gap-2 rounded-md px-1.5 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
		children
	});
}
function NativeSelectTrigger({ ariaLabel, icon, label, value, options, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
		value,
		onValueChange: onChange,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectTrigger, {
			"aria-label": ariaLabel,
			className: "h-7 border-0 bg-transparent px-1.5 hover:border-transparent hover:bg-surface [&>svg]:ml-auto",
			children: [icon, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "min-w-0 flex-1 truncate",
				children: label
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, {
			align: "start",
			children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
				value: option.value,
				children: option.label
			}, option.value))
		})]
	});
}
//#endregion
export { useOnboarding as $, CheckIcon$1 as A, ProjectsIcon as B, DialogHeader as C, AttachIcon as D, AtIcon as E, HashIcon as F, StarIcon as G, SendIcon as H, InboxIcon as I, Toaster as J, StopIcon as K, IssuesIcon as L, DotsIcon as M, ExpandIcon as N, CaretIcon as O, GithubIcon as P, OnboardingProvider as Q, PlayIcon as R, DialogFooter as S, ChatMarkdown as T, SettingsIcon as U, RefreshIcon as V, SparkleIcon as W, Button as X, OnboardingOverlay as Y, ONBOARDING_SKIP_FLAG as Z, Avatar as _, SelectTrigger as a, DialogClose as b, ProjectIcon as c, StatusIcon as d, Popover as et, PriorityIcon as f, EditableDescription as g, EditableTitle as h, SelectItem as i, CopyIcon as j, ChangesIcon as k, LabelPicker as l, LoadingTip as m, Select as n, PopoverTrigger as nt, SelectValue as o, MemberPicker as p, ThumbsUpIcon as q, SelectContent as r, ProjectPicker as s, IssueProperties as t, PopoverContent as tt, LabelChip as u, useConfirmDialog as v, DialogTitle as w, DialogContent as x, Dialog as y, PlusIcon as z };

//# sourceMappingURL=initial-BWSisseh.js.map