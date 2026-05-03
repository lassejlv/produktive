import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { a as useQueryClient, g as useNavigate } from "./initial-BUIQ08st.js";
import { v as toast } from "./initial-BjZJRI-E.js";
import { Fn as updateMyPreferences, St as useSession, Vn as cn, Xt as getMyPreferences, ct as deleteAccount, dt as listAccountSessions, et as useUserPreferences, ht as revokeOtherAccountSessions, mt as revokeAccountSession, n as applyTheme, pn as markOnboarding, pt as refreshSession, r as readStoredTheme, t as THEMES, yt as uploadAccountIcon } from "./initial-BOT0Y-sv.js";
import { $ as useOnboarding, X as Button, Z as ONBOARDING_SKIP_FLAG, m as LoadingTip } from "./initial-BWSisseh.js";
import { t as Input } from "./input-DAlWfusE.js";
//#region src/routes/_app.account.tsx?tsr-split=component
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var accountSections = [
	{
		id: "profile",
		label: "Profile",
		description: "Icon, name, and email.",
		group: "main"
	},
	{
		id: "appearance",
		label: "Appearance",
		description: "Theme and tab bar.",
		group: "main"
	},
	{
		id: "notifications",
		label: "Notifications",
		description: "Email for assignments, comments, and recap. Inbox alerts stay on.",
		group: "main"
	},
	{
		id: "sessions",
		label: "Sessions",
		description: "Active sign-ins across workspaces.",
		group: "main"
	},
	{
		id: "tour",
		label: "Product tour",
		description: "Replay the welcome walkthrough.",
		group: "main"
	},
	{
		id: "danger",
		label: "Danger zone",
		description: "Irreversible account actions.",
		group: "danger"
	}
];
var isAccountSectionId = (value) => accountSections.some((item) => item.id === value);
var accountNavGroups = [{
	label: "Settings",
	ids: [
		"profile",
		"appearance",
		"notifications",
		"sessions"
	]
}, {
	label: "Help",
	ids: ["tour"]
}];
function sectionById(id) {
	return accountSections.find((item) => item.id === id);
}
function AccountPaneSections({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex flex-col [&>section+section]:border-t [&>section+section]:border-border-subtle [&>section+section]:pt-9",
		children
	});
}
function AccountSectionBlock({ title, description, children }) {
	const headingId = `${(0, import_react.useId)()}-heading`;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-labelledby": headingId,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				id: headingId,
				className: "m-0 text-[11px] font-medium uppercase tracking-[0.1em] text-fg-faint",
				children: title
			}),
			description ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1.5 max-w-xl text-[12px] leading-relaxed text-fg-muted",
				children: description
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: description ? "mt-4" : "mt-3",
				children
			})
		]
	});
}
function AccountPage() {
	const session = useSession();
	const navigate = useNavigate();
	const user = session.data?.user;
	const [activeSection, setActiveSection] = (0, import_react.useState)("profile");
	const [confirm, setConfirm] = (0, import_react.useState)("");
	const [busy, setBusy] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		const section = new URLSearchParams(window.location.search).get("section");
		if (section && isAccountSectionId(section)) setActiveSection(section);
	}, []);
	const onSelectSection = (id) => {
		setActiveSection(id);
		navigate({
			to: "/account",
			search: { section: id },
			replace: true
		});
	};
	const handleBack = () => {
		if (typeof window !== "undefined" && window.history.length > 1) {
			window.history.back();
			return;
		}
		navigate({ to: "/issues" });
	};
	const canDelete = !!user && confirm.trim() === user.email && !busy;
	const handleDelete = async () => {
		if (!user || !canDelete) return;
		setBusy(true);
		try {
			await deleteAccount(confirm.trim());
			toast.success("Account deleted");
			window.location.assign("/");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to delete account");
			setBusy(false);
		}
	};
	const activeMeta = accountSections.find((item) => item.id === activeSection);
	const dangerSections = accountSections.filter((section) => section.group === "danger");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto w-full max-w-[880px] px-6 py-10",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "mb-8",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: handleBack,
					className: "mb-4 inline-flex items-center gap-1 rounded-[3px] text-[12px] text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
					children: "← Back"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "m-0 text-[22px] font-semibold tracking-[-0.02em] text-fg",
					children: "Account"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-[13px] text-fg-muted",
					children: "Profile, preferences, and sessions."
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-8 md:grid-cols-[180px_minmax(0,1fr)] md:gap-12",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
				role: "tablist",
				"aria-label": "Account sections",
				"aria-orientation": "vertical",
				className: "flex flex-col gap-0.5 md:sticky md:top-10 md:self-start",
				children: [accountNavGroups.map((group, groupIndex) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: cn(groupIndex > 0 && "mt-4"),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mb-1 px-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-fg-faint",
						children: group.label
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountSectionGroup, { children: group.ids.map((id) => {
						return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountSectionNavButton, {
							section: sectionById(id),
							active: activeSection === id,
							onSelect: onSelectSection
						}, id);
					}) })]
				}, group.label)), dangerSections.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "my-1 h-px bg-border-subtle" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountSectionGroup, { children: dangerSections.map((section) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountSectionNavButton, {
					section,
					active: activeSection === section.id,
					onSelect: onSelectSection,
					danger: true
				}, section.id)) })] }) : null]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
				className: "min-w-0",
				children: [
					activeMeta ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
						className: "mb-5 border-b border-border-subtle pb-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "m-0 text-[15px] font-medium text-fg",
							children: activeMeta.label
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-[12.5px] text-fg-faint",
							children: activeMeta.description
						})]
					}) : null,
					activeSection === "profile" ? !user ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoadingTip, { compact: true }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AccountPaneSections, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountSectionBlock, {
						title: "Photo",
						description: "Shown next to your name in the workspace.",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProfileIconUpload, { user })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountSectionBlock, {
						title: "Account",
						description: "Name and email from your sign-in.",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
							className: "m-0 grid grid-cols-[100px_minmax(0,1fr)] gap-y-2 text-[13px]",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
									className: "text-[11px] uppercase tracking-[0.08em] text-fg-faint",
									children: "Name"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
									className: "text-fg",
									children: user.name
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
									className: "text-[11px] uppercase tracking-[0.08em] text-fg-faint",
									children: "Email"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dd", {
									className: "text-fg",
									children: [user.email, user.emailVerified ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "ml-2 rounded-[4px] border border-warning/40 bg-warning/10 px-1.5 py-px text-[10px] uppercase tracking-[0.06em] text-warning",
										children: "Unverified"
									})]
								})
							]
						})
					})] }) : null,
					activeSection === "appearance" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppearanceSectionBody, {}) : null,
					activeSection === "notifications" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NotificationPrefsSectionBody, {}) : null,
					activeSection === "sessions" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SessionsSectionBody, {}) : null,
					activeSection === "tour" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProductTourSectionBody, {}) : null,
					activeSection === "danger" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountPaneSections, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AccountSectionBlock, {
						title: "Confirmation",
						description: "Permanently removes this account, its sessions and memberships, and pinned items. This cannot be undone.",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "mb-1.5 block text-[12px] text-fg-muted",
								children: [
									"Type ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-mono text-fg",
										children: user?.email ?? "…"
									}),
									" to confirm"
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								type: "email",
								autoComplete: "off",
								value: confirm,
								onChange: (event) => setConfirm(event.target.value),
								disabled: busy || !user,
								placeholder: user?.email ?? "",
								className: cn("max-w-[360px]", confirm.length > 0 && confirm.trim() !== user?.email && "border-danger/50 focus-visible:border-danger focus-visible:ring-danger")
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-4",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "danger",
								size: "sm",
								disabled: !canDelete,
								onClick: () => void handleDelete(),
								children: busy ? "Deleting…" : "Delete my account"
							})
						})]
					}) }) : null
				]
			})]
		})]
	});
}
function AccountSectionGroup({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex flex-col gap-0.5",
		children
	});
}
function AccountSectionNavButton({ section, active, onSelect, danger = false }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		role: "tab",
		"aria-selected": active,
		onClick: () => onSelect(section.id),
		className: cn("flex h-8 items-center justify-between gap-2 rounded-md px-2.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent", active ? danger ? "bg-danger/10 text-danger" : "bg-surface text-fg" : `${danger ? "text-danger/80 hover:text-danger" : "text-fg-muted hover:text-fg"} hover:bg-surface/60`),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "truncate",
			children: section.label
		})
	});
}
function ProfileIconUpload({ user }) {
	const [uploading, setUploading] = (0, import_react.useState)(false);
	const onFile = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file || uploading) return;
		setUploading(true);
		try {
			await uploadAccountIcon(file);
			await refreshSession();
			toast.success("Profile icon updated");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to upload icon");
		} finally {
			setUploading(false);
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-center gap-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProfileIcon, {
			name: user.name,
			image: user.image
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
			className: "inline-flex h-8 cursor-pointer items-center rounded-md border border-border-subtle bg-bg px-3 text-[12px] text-fg transition-colors hover:border-border disabled:opacity-60",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				type: "file",
				accept: "image/png,image/jpeg,image/webp,image/gif",
				className: "sr-only",
				disabled: uploading,
				onChange: (event) => void onFile(event)
			}), uploading ? "Uploading..." : "Upload icon"]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-1 text-[11.5px] text-fg-faint",
			children: "PNG, JPEG, WebP, or GIF. Max 2 MB."
		})] })]
	});
}
function ProfileIcon({ name, image }) {
	if (image) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
		src: image,
		alt: "",
		className: "size-10 rounded-full border border-border object-cover"
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "grid size-10 place-items-center rounded-full border border-border bg-surface-2 text-[13px] font-medium text-fg",
		children: name.slice(0, 2).toUpperCase() || "U"
	});
}
function SessionsSectionBody() {
	const [sessions, setSessions] = (0, import_react.useState)([]);
	const [loading, setLoading] = (0, import_react.useState)(true);
	const [busy, setBusy] = (0, import_react.useState)(null);
	const load = async () => {
		setLoading(true);
		try {
			setSessions((await listAccountSessions()).sessions);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to load sessions");
		} finally {
			setLoading(false);
		}
	};
	(0, import_react.useEffect)(() => {
		let mounted = true;
		setLoading(true);
		listAccountSessions().then((response) => {
			if (mounted) setSessions(response.sessions);
		}).catch((error) => {
			toast.error(error instanceof Error ? error.message : "Failed to load sessions");
		}).finally(() => {
			if (mounted) setLoading(false);
		});
		return () => {
			mounted = false;
		};
	}, []);
	const revoke = async (sessionId) => {
		setBusy(sessionId);
		try {
			await revokeAccountSession(sessionId);
			setSessions((items) => items.filter((item) => item.id !== sessionId));
			toast.success("Session revoked");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to revoke session");
		} finally {
			setBusy(null);
		}
	};
	const revokeOthers = async () => {
		setBusy("others");
		try {
			await revokeOtherAccountSessions();
			await load();
			toast.success("Other sessions revoked");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to revoke sessions");
		} finally {
			setBusy(null);
		}
	};
	const otherSessions = sessions.filter((session) => !session.current);
	const sortedSessions = (0, import_react.useMemo)(() => [...sessions].sort((a, b) => {
		if (a.current === b.current) return 0;
		return a.current ? -1 : 1;
	}), [sessions]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoadingTip, { compact: true }) : sessions.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "m-0 text-[12.5px] text-fg-muted",
		children: "No active sessions."
	}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AccountPaneSections, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountSectionBlock, {
		title: "Overview",
		description: "End every session except this browser.",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-center justify-between gap-x-6 gap-y-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "m-0 text-[12px] tabular-nums tracking-tight text-fg-muted",
				children: [
					sessions.length,
					" session",
					sessions.length === 1 ? "" : "s"
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				type: "button",
				variant: "outline",
				size: "sm",
				disabled: otherSessions.length === 0 || busy !== null,
				onClick: () => void revokeOthers(),
				children: busy === "others" ? "Revoking…" : "Sign out others"
			})]
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountSectionBlock, {
		title: "Signed in",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
			className: "m-0 list-none divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle p-0",
			"aria-label": "Sessions",
			children: sortedSessions.map((session) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SessionListItem, {
				session,
				busy,
				onRevoke: revoke
			}, session.id))
		})
	})] }) });
}
function SessionListItem({ session, busy, onRevoke }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
		className: "px-4 py-4",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(78px,max-content)] sm:gap-8",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-baseline gap-x-2 gap-y-0.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[13px] font-medium tracking-[-0.01em] text-fg",
						children: session.activeOrganizationName ?? "Unknown workspace"
					}), session.current ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[10px] font-medium uppercase tracking-[0.12em] text-fg-faint",
						children: "Current"
					}) : null]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-2 mb-0 font-mono text-[11px] leading-relaxed tracking-tight text-fg-muted",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "tabular-nums",
							children: ["created ", formatDateTime(session.createdAt)]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetaSep, {}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "tabular-nums",
							children: ["expires ", formatDateTime(session.expiresAt)]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetaSep, {}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							title: session.id,
							className: "text-fg-faint tabular-nums",
							children: ["id ", sessionIdShort(session.id)]
						})
					]
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex items-start pt-px sm:justify-end",
				children: session.current ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "min-h-8 sm:min-w-[4rem]",
					"aria-hidden": true
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					variant: "ghost",
					size: "sm",
					disabled: busy !== null,
					className: "-mr-2 h-8 px-2 text-[12px] font-medium text-fg-muted hover:bg-transparent hover:text-danger",
					onClick: () => void onRevoke(session.id),
					children: busy === session.id ? "Revoking…" : "Revoke"
				})
			})]
		})
	});
}
function MetaSep() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		"aria-hidden": true,
		className: "text-fg-faint",
		children: "\xA0·\xA0"
	});
}
function sessionIdShort(id) {
	if (id.length <= 12) return id;
	return `${id.slice(0, 8)}…`;
}
function ProductTourSectionBody() {
	const navigate = useNavigate();
	const onboarding = useOnboarding();
	const [busy, setBusy] = (0, import_react.useState)(false);
	const replay = async () => {
		setBusy(true);
		try {
			await markOnboarding({
				completed: false,
				step: "welcome"
			});
			await refreshSession();
			if (typeof window !== "undefined") window.sessionStorage.removeItem(ONBOARDING_SKIP_FLAG);
			await navigate({ to: "/issues" });
			onboarding.start("welcome");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to restart tour");
		} finally {
			setBusy(false);
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountPaneSections, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountSectionBlock, {
		title: "Walkthrough",
		description: "Rebuilds onboarding on the Issues view whenever you replay it.",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
			type: "button",
			variant: "outline",
			size: "sm",
			disabled: busy,
			onClick: () => void replay(),
			children: busy ? "Starting…" : "Replay product tour"
		})
	}) });
}
function AppearanceSectionBody() {
	const [current, setCurrent] = (0, import_react.useState)(() => readStoredTheme());
	const qc = useQueryClient();
	const { prefs } = useUserPreferences();
	const [tabsEnabledLocal, setTabsEnabledLocal] = (0, import_react.useState)(null);
	(0, import_react.useEffect)(() => {
		if (prefs && tabsEnabledLocal === null) setTabsEnabledLocal(prefs.tabsEnabled);
	}, [prefs, tabsEnabledLocal]);
	const choose = (next) => {
		setCurrent(next);
		applyTheme(next);
	};
	const toggleTabs = async (next) => {
		const previous = tabsEnabledLocal;
		setTabsEnabledLocal(next);
		try {
			const updated = await updateMyPreferences({ tabsEnabled: next });
			qc.setQueryData(["user-preferences"], updated);
		} catch (error) {
			setTabsEnabledLocal(previous);
			toast.error(error instanceof Error ? error.message : "Failed to update");
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AccountPaneSections, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountSectionBlock, {
		title: "Color theme",
		description: "Stored in this browser; does not sync to other devices.",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
			role: "radiogroup",
			"aria-label": "Color theme choices",
			className: "m-0 list-none divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle p-0",
			children: THEMES.map((theme) => {
				const active = current === theme.id;
				return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					role: "radio",
					"aria-checked": active,
					onClick: () => choose(theme.id),
					className: cn("flex w-full items-start gap-3 px-3 py-4 text-left transition-colors", "hover:bg-surface/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						"aria-hidden": true,
						className: "mt-[6px] size-2 shrink-0 rounded-full",
						style: { backgroundColor: theme.swatchAccent }
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "flex flex-wrap items-baseline gap-x-2 gap-y-0.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[13px] font-medium tracking-[-0.01em] text-fg",
								children: theme.label
							}), active ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[10px] font-medium uppercase tracking-[0.12em] text-fg-faint",
								children: "Current"
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono text-[10px] leading-none tracking-tight text-fg-faint",
								"aria-hidden": true,
								children: theme.id
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "mt-0.5 block text-[11.5px] leading-snug text-fg-muted",
							children: theme.hint
						})]
					})]
				}) }, theme.id);
			})
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountSectionBlock, {
		title: "Bottom tab bar",
		description: "Keeps Issues, Projects, and Chats reachable while you work.",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex justify-end",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
				checked: tabsEnabledLocal ?? prefs?.tabsEnabled ?? true,
				disabled: tabsEnabledLocal === null && !prefs,
				onChange: (value) => void toggleTabs(value),
				ariaLabel: "Bottom tab bar"
			})
		})
	})] });
}
function NotificationPrefsSectionBody() {
	const [prefs, setPrefs] = (0, import_react.useState)(null);
	const [loading, setLoading] = (0, import_react.useState)(true);
	(0, import_react.useEffect)(() => {
		let mounted = true;
		getMyPreferences().then((response) => {
			if (mounted) setPrefs(response);
		}).catch(() => {}).finally(() => {
			if (mounted) setLoading(false);
		});
		return () => {
			mounted = false;
		};
	}, []);
	const apply = async (patch) => {
		if (!prefs) return;
		const previous = prefs;
		setPrefs({
			...prefs,
			...patch
		});
		try {
			setPrefs(await updateMyPreferences(patch));
		} catch (error) {
			setPrefs(previous);
			toast.error(error instanceof Error ? error.message : "Failed to update");
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: loading || !prefs ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoadingTip, { compact: true }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AccountPaneSections, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountSectionBlock, {
			title: "Quiet mode",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "overflow-hidden rounded-md border border-border-subtle",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
					label: "Pause all",
					hint: "Hold every outbound email notification until unpaused.",
					checked: prefs.emailPaused,
					className: "px-4 py-3.5",
					onChange: (value) => void apply({ emailPaused: value })
				})
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountSectionBlock, {
			title: "Issue activity",
			description: "Emails for events on issues tied to your account.",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
					label: "Assignments",
					hint: "Someone assigns an issue to you.",
					checked: prefs.emailAssignments,
					disabled: prefs.emailPaused,
					className: "px-4 py-3.5",
					onChange: (value) => void apply({ emailAssignments: value })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
					label: "Comments",
					hint: "Someone comments on an issue you follow.",
					checked: prefs.emailComments,
					disabled: prefs.emailPaused,
					className: "px-4 py-3.5",
					onChange: (value) => void apply({ emailComments: value })
				})]
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountSectionBlock, {
			title: "Digest",
			description: "One weekly recap of what moved and what's left.",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "overflow-hidden rounded-md border border-border-subtle",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
					label: "Progress recap",
					hint: "Queued on different weekdays so mail never feels scripted.",
					checked: prefs.emailProgress,
					disabled: prefs.emailPaused,
					className: "px-4 py-3.5",
					onChange: (value) => void apply({ emailProgress: value })
				})
			})
		})
	] }) });
}
function ToggleRow({ label, hint, checked, disabled, className, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("flex items-center justify-between gap-4 py-3", disabled && "opacity-60", className),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "min-w-0",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-[13px] text-fg",
				children: label
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-[12px] text-fg-muted",
				children: hint
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
			checked,
			onChange,
			disabled,
			ariaLabel: label
		})]
	});
}
function Toggle({ checked, disabled, onChange, ariaLabel }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		role: "switch",
		"aria-checked": checked,
		"aria-label": ariaLabel,
		disabled,
		onClick: () => onChange(!checked),
		className: cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors", checked ? "bg-accent" : "bg-surface-2", disabled && "cursor-not-allowed"),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			"aria-hidden": true,
			className: cn("block size-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-[2px]")
		})
	});
}
function formatDateTime(value) {
	return new Intl.DateTimeFormat(void 0, {
		dateStyle: "medium",
		timeStyle: "short"
	}).format(new Date(value));
}
//#endregion
export { AccountPage as component };

//# sourceMappingURL=_app.account-Ch8vRBdp.js.map