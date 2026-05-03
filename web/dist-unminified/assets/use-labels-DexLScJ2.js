import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react } from "./initial-DqBeajiO.js";
import { a as useQueryClient } from "./initial-BUIQ08st.js";
import { a as useLabelsQuery, at as queryKeys } from "./initial-BOT0Y-sv.js";
//#region src/lib/use-labels.ts
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
function useLabels(includeArchived = false) {
	const qc = useQueryClient();
	const query = useLabelsQuery(includeArchived);
	const refresh = async () => {
		await qc.invalidateQueries({ queryKey: queryKeys.labels.all });
	};
	(0, import_react.useEffect)(() => {
		const handler = () => {
			qc.invalidateQueries({ queryKey: queryKeys.labels.all });
		};
		window.addEventListener("produktive:label-created", handler);
		window.addEventListener("produktive:label-updated", handler);
		return () => {
			window.removeEventListener("produktive:label-created", handler);
			window.removeEventListener("produktive:label-updated", handler);
		};
	}, [qc]);
	const addLabel = (label) => {
		qc.setQueryData(queryKeys.labels.list(includeArchived), (old) => old ? [...old, label].sort((a, b) => a.name.localeCompare(b.name)) : [label]);
	};
	const updateLabelLocal = (id, patch) => {
		qc.setQueryData(queryKeys.labels.list(includeArchived), (old) => old?.map((l) => l.id === id ? {
			...l,
			...patch
		} : l));
	};
	const removeLabelLocal = (id) => {
		qc.setQueryData(queryKeys.labels.list(includeArchived), (old) => old?.filter((l) => l.id !== id));
	};
	return {
		labels: query.data ?? [],
		isLoading: query.isPending,
		error: query.error?.message ?? null,
		refresh,
		addLabel,
		updateLabelLocal,
		removeLabelLocal
	};
}
//#endregion
export { useLabels as t };

//# sourceMappingURL=use-labels-DexLScJ2.js.map