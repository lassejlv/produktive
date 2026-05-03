import { r as __toESM } from "./rolldown-runtime-B_qr_iJn.js";
import { n as require_react, t as require_jsx_runtime } from "./initial-DqBeajiO.js";
import { t as require_client } from "./initial-DwS9pZ8K.js";
import { i as QueryClientProvider, l as RouterProvider, o as QueryClient, u as createRouter } from "./initial-BUIQ08st.js";
import { n as applyTheme, r as readStoredTheme } from "./initial-BOT0Y-sv.js";
import { t as routeTree } from "./initial-Cbvcoh8y.js";
//#region src/main.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_client = /* @__PURE__ */ __toESM(require_client(), 1);
var import_jsx_runtime = require_jsx_runtime();
window.addEventListener("vite:preloadError", (event) => {
	event.preventDefault();
	const storageKey = "produktive-preload-reload";
	const lastReload = Number(window.sessionStorage.getItem(storageKey) ?? "0");
	const now = Date.now();
	if (now - lastReload > 1e4) {
		window.sessionStorage.setItem(storageKey, String(now));
		window.location.reload();
	}
});
applyTheme(readStoredTheme());
var queryClient = new QueryClient({ defaultOptions: { queries: {
	staleTime: 6e4,
	gcTime: 5 * 6e4,
	refetchOnWindowFocus: false,
	retry: 1
} } });
var router = createRouter({
	routeTree,
	context: { queryClient }
});
var rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");
import_client.createRoot(rootElement).render(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.StrictMode, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(QueryClientProvider, {
	client: queryClient,
	children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RouterProvider, { router }), null]
}) }));
//#endregion

//# sourceMappingURL=initial-BqaPBVxe.js.map