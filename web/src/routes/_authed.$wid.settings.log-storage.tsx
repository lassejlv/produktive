import { createFileRoute, redirect } from "@tanstack/react-router";

/** Log storage administration moved to the Admin panel — keep the old URL working. */
export const Route = createFileRoute("/_authed/$wid/settings/log-storage")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$wid/admin/log-storage", params: { wid: params.wid } });
  },
});
