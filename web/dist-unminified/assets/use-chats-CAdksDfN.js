import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react } from "./initial-DqBeajiO.js";
import { a as useQueryClient } from "./initial-BUIQ08st.js";
import { V as useChatsQuery, at as queryKeys } from "./initial-BOT0Y-sv.js";
//#region src/lib/use-chats.ts
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
function useChats() {
	const qc = useQueryClient();
	const query = useChatsQuery();
	const refresh = (0, import_react.useCallback)(async () => {
		await qc.invalidateQueries({ queryKey: queryKeys.chats });
	}, [qc]);
	const prependChat = (0, import_react.useCallback)((chat) => {
		qc.setQueryData(queryKeys.chats, (old) => {
			if (!old) return [chat];
			const existingIdx = old.findIndex((c) => c.id === chat.id);
			if (existingIdx >= 0) {
				const next = old.slice();
				next.splice(existingIdx, 1);
				return [chat, ...next];
			}
			return [chat, ...old];
		});
	}, [qc]);
	const removeChat = (0, import_react.useCallback)((id) => {
		qc.setQueryData(queryKeys.chats, (old) => old?.filter((c) => c.id !== id));
	}, [qc]);
	return {
		chats: query.data ?? [],
		isLoading: query.isPending,
		error: query.error?.message ?? null,
		refresh,
		prependChat,
		removeChat
	};
}
//#endregion
export { useChats as t };

//# sourceMappingURL=use-chats-CAdksDfN.js.map