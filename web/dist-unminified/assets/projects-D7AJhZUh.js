import { t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { a as useQueryClient, t as useMutation } from "./initial-BUIQ08st.js";
import { In as updateProject, Vn as cn, Wt as deleteProject, at as queryKeys } from "./initial-BOT0Y-sv.js";
//#region src/components/project/project-status-icon.tsx
var import_jsx_runtime = require_jsx_runtime();
var dimensions = {
	sm: {
		box: 14,
		stroke: 1.5,
		r: 5
	},
	md: {
		box: 18,
		stroke: 1.6,
		r: 6.5
	}
};
function ProjectStatusIcon({ status, progress = 0, size = "md", className }) {
	const { box, stroke, r } = dimensions[size];
	const cx = box / 2;
	const cy = box / 2;
	const circumference = 2 * Math.PI * r;
	const filled = Math.max(0, Math.min(1, progress)) * circumference;
	if (status === "completed") return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: box,
		height: box,
		viewBox: `0 0 ${box} ${box}`,
		className: cn("text-success", className),
		"aria-hidden": true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx,
			cy,
			r,
			fill: "currentColor"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: `M${cx - 2.5} ${cy} l1.7 1.8 3.3 -3.5`,
			stroke: "white",
			strokeWidth: "1.5",
			strokeLinecap: "round",
			strokeLinejoin: "round",
			fill: "none"
		})]
	});
	if (status === "cancelled") return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: box,
		height: box,
		viewBox: `0 0 ${box} ${box}`,
		className: cn("text-fg-faint", className),
		"aria-hidden": true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx,
			cy,
			r,
			stroke: "currentColor",
			strokeWidth: stroke,
			fill: "none"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: `M${cx - 2} ${cy - 2} l4 4 M${cx + 2} ${cy - 2} l-4 4`,
			stroke: "currentColor",
			strokeWidth: "1.4",
			strokeLinecap: "round"
		})]
	});
	if (status === "in-progress") return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: box,
		height: box,
		viewBox: `0 0 ${box} ${box}`,
		className: cn("text-accent", className),
		"aria-hidden": true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx,
			cy,
			r,
			stroke: "currentColor",
			strokeWidth: stroke,
			fill: "none",
			opacity: "0.35"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx,
			cy,
			r,
			stroke: "currentColor",
			strokeWidth: stroke,
			fill: "none",
			strokeDasharray: `${filled} ${circumference}`,
			strokeLinecap: "round",
			transform: `rotate(-90 ${cx} ${cy})`
		})]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		width: box,
		height: box,
		viewBox: `0 0 ${box} ${box}`,
		className: cn("text-fg-faint", className),
		"aria-hidden": true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx,
			cy,
			r,
			stroke: "currentColor",
			strokeWidth: stroke,
			strokeDasharray: "2 2",
			fill: "none"
		})
	});
}
//#endregion
//#region src/lib/mutations/projects.ts
function useUpdateProject() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, patch }) => updateProject(id, patch).then((r) => r.project),
		onMutate: async ({ id, patch }) => {
			const projectListKey = ["projects", "list"];
			await qc.cancelQueries({ queryKey: projectListKey });
			const prevLists = qc.getQueriesData({ queryKey: projectListKey });
			const { archived, ...rest } = patch;
			const projectPatch = { ...rest };
			if (archived !== void 0) projectPatch.archivedAt = archived ? (/* @__PURE__ */ new Date()).toISOString() : null;
			for (const [key, list] of prevLists) {
				if (!list) continue;
				qc.setQueryData(key, list.map((p) => p.id === id ? {
					...p,
					...projectPatch
				} : p));
			}
			return { prevLists };
		},
		onError: (_err, _vars, ctx) => {
			if (!ctx?.prevLists) return;
			for (const [key, list] of ctx.prevLists) qc.setQueryData(key, list);
		},
		onSuccess: (project) => {
			qc.setQueryData(queryKeys.projects.detail(project.id), project);
			qc.invalidateQueries({ queryKey: queryKeys.projects.all });
		}
	});
}
function useDeleteProject() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id) => deleteProject(id),
		onSettled: () => {
			qc.invalidateQueries({ queryKey: queryKeys.projects.all });
		}
	});
}
//#endregion
export { useUpdateProject as n, ProjectStatusIcon as r, useDeleteProject as t };

//# sourceMappingURL=projects-D7AJhZUh.js.map