import { t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { c as useRouterState } from "./initial-BUIQ08st.js";
import { t as ChatPane } from "./chat-pane-Dg35kO0v.js";
//#region src/routes/_app.chat.tsx?tsr-split=component
var import_jsx_runtime = require_jsx_runtime();
function ChatIndex() {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatPane, { chatId: pathname.startsWith("/chat/") ? decodeURIComponent(pathname.slice(6)) : null });
}
//#endregion
export { ChatIndex as component };

//# sourceMappingURL=_app.chat-IX3PqKji.js.map