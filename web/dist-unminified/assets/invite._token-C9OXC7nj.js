import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { g as useNavigate, h as Link } from "./initial-BUIQ08st.js";
import { v as toast } from "./initial-BjZJRI-E.js";
import { Ct as acceptInvitation, St as useSession, Vn as cn, gt as signOut, un as lookupInvitation } from "./initial-BOT0Y-sv.js";
import { d as Route } from "./initial-Cbvcoh8y.js";
//#region src/routes/invite.$token.tsx?tsr-split=component
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function InvitePage() {
	const { token } = Route.useParams();
	const navigate = useNavigate();
	const session = useSession();
	const [lookup, setLookup] = (0, import_react.useState)(null);
	const [loading, setLoading] = (0, import_react.useState)(true);
	const [busy, setBusy] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		let mounted = true;
		setLoading(true);
		lookupInvitation(token).then((response) => {
			if (mounted) setLookup(response);
		}).catch(() => {
			if (mounted) setLookup(null);
		}).finally(() => {
			if (mounted) setLoading(false);
		});
		return () => {
			mounted = false;
		};
	}, [token]);
	const accept = async () => {
		setBusy(true);
		try {
			await acceptInvitation(token);
			toast.success("Welcome to the workspace");
			window.location.assign("/issues");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not accept invitation");
			setBusy(false);
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "grid min-h-screen place-items-center bg-bg px-6",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "bg-dotgrid",
			"aria-hidden": true
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: cn("w-full max-w-[440px] rounded-[14px] border border-border-subtle bg-bg/80 p-8 backdrop-blur-md", "shadow-[0_18px_60px_rgba(0,0,0,0.45)] animate-fade-up"),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-5 flex items-center gap-2.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid size-7 place-items-center rounded-md bg-fg text-[12px] font-semibold tracking-tight text-bg",
					children: "P"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[14px] font-medium tracking-tight text-fg",
					children: "Produktive"
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Body, {
				loading,
				lookup,
				token,
				session,
				busy,
				onAccept: accept,
				onNavigate: navigate
			})]
		})]
	});
}
function Body({ loading, lookup, token, session, busy, onAccept }) {
	if (loading) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-[13px] text-fg-faint",
		children: "Looking up invitation…"
	});
	if (!lookup) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ErrorState, { message: "We couldn't find this invitation." });
	if (lookup.revoked) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ErrorState, { message: "This invitation was revoked." });
	if (lookup.accepted) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ErrorState, { message: "This invitation has already been accepted." });
	if (lookup.expired) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ErrorState, { message: "This invitation has expired. Ask the workspace owner to send a new one." });
	const inviteEmail = lookup.email ?? "";
	const orgName = lookup.organizationName ?? "this workspace";
	const inviterName = lookup.inviterName ?? "A teammate";
	const sessionUser = session.data?.user;
	if (!sessionUser) {
		const params = new URLSearchParams({
			invite: token,
			email: inviteEmail
		});
		return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", {
				className: "m-0 text-[20px] font-semibold tracking-[-0.01em] text-fg",
				children: ["Join ", orgName]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-2 text-[13px] text-fg-muted",
				children: [
					inviterName,
					" invited ",
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-fg",
						children: inviteEmail
					}),
					" ",
					"to join ",
					orgName,
					" on Produktive."
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-6 flex flex-col gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: "/login",
					search: Object.fromEntries(params.entries()),
					className: "inline-flex h-10 items-center justify-center rounded-md bg-fg px-4 text-[13px] font-medium text-bg transition-colors hover:bg-white",
					children: "Create your account"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: "/login",
					search: Object.fromEntries(new URLSearchParams({
						invite: token,
						email: inviteEmail,
						mode: "signin"
					}).entries()),
					className: "inline-flex h-10 items-center justify-center rounded-md border border-border-subtle bg-transparent px-4 text-[13px] text-fg-muted transition-colors hover:border-border hover:text-fg",
					children: "I already have an account"
				})]
			})
		] });
	}
	if (!(sessionUser.email.toLowerCase() === inviteEmail.toLowerCase())) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
			className: "m-0 text-[20px] font-semibold tracking-[-0.01em] text-fg",
			children: "Wrong account"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "mt-2 text-[13px] text-fg-muted",
			children: [
				"You're signed in as",
				" ",
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-fg",
					children: sessionUser.email
				}),
				", but this invitation is for ",
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-fg",
					children: inviteEmail
				}),
				"."
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-6 flex flex-col gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: async () => {
					await signOut();
					window.location.reload();
				},
				className: "inline-flex h-10 items-center justify-center rounded-md bg-fg px-4 text-[13px] font-medium text-bg transition-colors hover:bg-white",
				children: "Sign out"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
				to: "/issues",
				className: "inline-flex h-10 items-center justify-center rounded-md border border-border-subtle bg-transparent px-4 text-[13px] text-fg-muted transition-colors hover:border-border hover:text-fg",
				children: "Back to my workspace"
			})]
		})
	] });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", {
			className: "m-0 text-[20px] font-semibold tracking-[-0.01em] text-fg",
			children: ["Join ", orgName]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "mt-2 text-[13px] text-fg-muted",
			children: [
				inviterName,
				" invited you to join ",
				orgName,
				" on Produktive."
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-6",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: onAccept,
				disabled: busy,
				className: "inline-flex h-10 w-full items-center justify-center rounded-md bg-fg px-4 text-[13px] font-medium text-bg transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60",
				children: busy ? "Joining…" : "Accept and open workspace"
			})
		})
	] });
}
function ErrorState({ message }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
			className: "m-0 text-[18px] font-medium text-fg",
			children: "Invitation unavailable"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-2 text-[13px] text-fg-muted",
			children: message
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
			to: "/",
			className: "mt-6 inline-flex h-9 items-center justify-center rounded-md border border-border-subtle bg-transparent px-4 text-[12.5px] text-fg-muted transition-colors hover:border-border hover:text-fg",
			children: "Back to home"
		})
	] });
}
//#endregion
export { InvitePage as component };

//# sourceMappingURL=invite._token-C9OXC7nj.js.map