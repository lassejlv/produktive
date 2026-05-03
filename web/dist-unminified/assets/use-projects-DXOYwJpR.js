import { a as useQueryClient } from "./initial-BUIQ08st.js";
import { W as useProjectsQuery, at as queryKeys } from "./initial-BOT0Y-sv.js";
//#region src/lib/use-projects.ts
function useProjects(includeArchived = false) {
	const qc = useQueryClient();
	const query = useProjectsQuery(includeArchived);
	const refresh = async () => {
		await qc.invalidateQueries({ queryKey: queryKeys.projects.all });
	};
	const addProject = (project) => {
		qc.setQueryData(queryKeys.projects.list(includeArchived), (old) => old ? [project, ...old] : [project]);
	};
	const updateProjectLocal = (id, patch) => {
		qc.setQueryData(queryKeys.projects.list(includeArchived), (old) => old?.map((p) => p.id === id ? {
			...p,
			...patch
		} : p));
	};
	const removeProjectLocal = (id) => {
		qc.setQueryData(queryKeys.projects.list(includeArchived), (old) => old?.filter((p) => p.id !== id));
	};
	return {
		projects: query.data ?? [],
		isLoading: query.isPending,
		error: query.error?.message ?? null,
		refresh,
		addProject,
		updateProjectLocal,
		removeProjectLocal
	};
}
//#endregion
export { useProjects as t };

//# sourceMappingURL=use-projects-DXOYwJpR.js.map