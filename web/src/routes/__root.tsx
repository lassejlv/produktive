import { Suspense, lazy } from "react";
import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { ToastProvider } from "#/components/ui/toast";

import "../styles.css";

const Devtools = import.meta.env.DEV
  ? lazy(() =>
      Promise.all([
        import("@tanstack/react-devtools"),
        import("@tanstack/react-router-devtools"),
        import("@tanstack/react-query-devtools"),
      ]).then(([d, router, query]) => ({
        default: () => (
          <d.TanStackDevtools
            config={{ position: "bottom-right" }}
            plugins={[
              { name: "TanStack Router", render: <router.TanStackRouterDevtoolsPanel /> },
              { name: "TanStack Query", render: <query.ReactQueryDevtoolsPanel /> },
            ]}
          />
        ),
      })),
    )
  : null;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
});

function RootComponent() {
  return (
    <ToastProvider position="bottom-right">
      <Outlet />
      {Devtools && (
        <Suspense fallback={null}>
          <Devtools />
        </Suspense>
      )}
    </ToastProvider>
  );
}
