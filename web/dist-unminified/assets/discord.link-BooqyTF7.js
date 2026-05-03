import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { g as useNavigate } from "./initial-BUIQ08st.js";
import { v as toast } from "./initial-BjZJRI-E.js";
import { St as useSession, Tt as completeDiscordLink, ft as listOrganizations, mn as previewDiscordLink } from "./initial-BOT0Y-sv.js";
import { X as Button, a as SelectTrigger, i as SelectItem, n as Select, o as SelectValue, r as SelectContent } from "./initial-BWSisseh.js";
import { u as Route } from "./initial-Cbvcoh8y.js";
//#region src/routes/discord.link.tsx?tsr-split=component
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function DiscordLinkPage() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const session = useSession();
	const [preview, setPreview] = (0, import_react.useState)(null);
	const [organizations, setOrganizations] = (0, import_react.useState)([]);
	const [selectedOrganizationId, setSelectedOrganizationId] = (0, import_react.useState)("");
	const [loading, setLoading] = (0, import_react.useState)(true);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [linkedName, setLinkedName] = (0, import_react.useState)(null);
	const state = search.state ?? "";
	(0, import_react.useEffect)(() => {
		if (!state) {
			setLoading(false);
			return;
		}
		if (!session.isPending && !session.data) {
			navigate({
				to: "/login",
				search: { redirect: `/discord/link?state=${encodeURIComponent(state)}` }
			});
			return;
		}
		if (!session.data) return;
		let mounted = true;
		Promise.all([previewDiscordLink(state), listOrganizations()]).then(([previewResponse, orgsResponse]) => {
			if (!mounted) return;
			setPreview(previewResponse);
			setOrganizations(orgsResponse.organizations);
			setSelectedOrganizationId(previewResponse.linkedOrganization?.id ?? orgsResponse.activeOrganizationId ?? orgsResponse.organizations[0]?.id ?? "");
		}).catch((error) => {
			toast.error(error instanceof Error ? error.message : "Discord link expired");
		}).finally(() => {
			if (mounted) setLoading(false);
		});
		return () => {
			mounted = false;
		};
	}, [
		navigate,
		session.data,
		session.isPending,
		state
	]);
	const selectedOrganization = (0, import_react.useMemo)(() => organizations.find((org) => org.id === selectedOrganizationId) ?? null, [organizations, selectedOrganizationId]);
	const onLink = async () => {
		if (!state || !selectedOrganizationId) return;
		setBusy(true);
		try {
			setLinkedName((await completeDiscordLink(state, selectedOrganizationId)).organization.name);
			toast.success("Discord server linked");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to link Discord");
		} finally {
			setBusy(false);
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "mx-auto flex min-h-screen w-full max-w-[520px] flex-col justify-center px-6 py-12",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "border border-border-subtle bg-bg p-5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "m-0 text-[12px] font-medium uppercase tracking-[0.08em] text-fg-faint",
					children: "Discord"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "mt-2 text-[22px] font-semibold text-fg",
					children: "Link server"
				}),
				loading || session.isPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-4 text-[13px] text-fg-muted",
					children: "Loading link details..."
				}) : linkedName ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-5 grid gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "m-0 text-[13px] text-fg-muted",
						children: [
							"This Discord server is now linked to ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-fg",
								children: linkedName
							}),
							"."
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						onClick: () => window.close(),
						children: "Done"
					})]
				}) : !state || !preview ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-4 text-[13px] text-fg-muted",
					children: "This Discord link is invalid or expired."
				}) : organizations.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-4 text-[13px] text-fg-muted",
					children: "You need to belong to a workspace to link Discord."
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-5 grid gap-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "grid gap-1.5 text-[13px] text-fg",
							children: ["Workspace", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
								value: selectedOrganizationId,
								onValueChange: setSelectedOrganizationId,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
									className: "text-[13px]",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "Select workspace" })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: organizations.map((org) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
									value: org.id,
									children: org.name
								}, org.id)) })]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "m-0 text-[12.5px] text-fg-muted",
							children: [
								"Server ID ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono",
									children: preview.guildId
								}),
								" will use",
								" ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-fg",
									children: selectedOrganization?.name ?? "this workspace"
								}),
								"."
							]
						}),
						preview.linkedOrganization ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "m-0 text-[12.5px] text-fg-muted",
							children: [
								"Already linked to ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-fg",
									children: preview.linkedOrganization.name
								}),
								". Selecting a different workspace requires owner access."
							]
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							onClick: onLink,
							disabled: busy || !selectedOrganizationId,
							children: busy ? "Linking..." : "Link Discord server"
						})
					]
				})
			]
		})
	});
}
//#endregion
export { DiscordLinkPage as component };

//# sourceMappingURL=discord.link-BooqyTF7.js.map