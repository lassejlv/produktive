import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react } from "./initial-DqBeajiO.js";
import { a as useQueryClient, n as queryOptions, r as useQuery } from "./initial-BUIQ08st.js";
import { at as queryKeys, dn as markAllNotificationsRead, fn as markNotificationRead, tn as listInbox } from "./initial-BOT0Y-sv.js";
//#region src/lib/queries/inbox.ts
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var inboxQueryOptions = () => queryOptions({
	queryKey: queryKeys.inbox,
	queryFn: listInbox,
	staleTime: 1e4,
	refetchOnWindowFocus: true
});
var useInboxQuery = () => useQuery(inboxQueryOptions());
//#endregion
//#region src/lib/use-inbox.ts
function useInbox() {
	const qc = useQueryClient();
	const query = useInboxQuery();
	const notifications = query.data?.notifications ?? [];
	const unreadCount = query.data?.unreadCount ?? 0;
	const refresh = (0, import_react.useCallback)(async () => {
		await qc.invalidateQueries({ queryKey: queryKeys.inbox });
	}, [qc]);
	const markRead = (0, import_react.useCallback)(async (id) => {
		try {
			const response = await markNotificationRead(id);
			qc.setQueryData(queryKeys.inbox, response);
		} catch {}
	}, [qc]);
	const markAll = (0, import_react.useCallback)(async () => {
		try {
			const response = await markAllNotificationsRead();
			qc.setQueryData(queryKeys.inbox, response);
		} catch {}
	}, [qc]);
	return {
		notifications,
		unreadCount,
		isLoading: query.isPending,
		refresh,
		markRead,
		markAll
	};
}
//#endregion
export { useInbox as t };

//# sourceMappingURL=use-inbox-Dl6a-9M-.js.map