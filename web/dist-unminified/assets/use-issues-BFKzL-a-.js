import { a as useQueryClient } from "./initial-BUIQ08st.js";
import { $ as useIssuesQuery, at as queryKeys } from "./initial-BOT0Y-sv.js";
//#region src/lib/use-issues.ts
function useIssues() {
	const qc = useQueryClient();
	const query = useIssuesQuery();
	const addIssue = (issue) => {
		qc.setQueryData(queryKeys.issues.list(), (old) => old ? [issue, ...old] : [issue]);
	};
	const updateIssueLocal = (id, patch) => {
		qc.setQueryData(queryKeys.issues.list(), (old) => old?.map((issue) => issue.id === id ? {
			...issue,
			...patch
		} : issue));
	};
	const removeIssueLocal = (id) => {
		qc.setQueryData(queryKeys.issues.list(), (old) => old?.filter((issue) => issue.id !== id));
	};
	const dismissError = () => {
		qc.invalidateQueries({ queryKey: queryKeys.issues.list() });
	};
	return {
		issues: query.data ?? [],
		isLoading: query.isPending,
		error: query.error?.message ?? null,
		dismissError,
		addIssue,
		updateIssueLocal,
		removeIssueLocal
	};
}
//#endregion
export { useIssues as t };

//# sourceMappingURL=use-issues-BFKzL-a-.js.map