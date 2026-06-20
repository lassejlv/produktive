import { createFileRoute, redirect } from "@tanstack/react-router";

/** Log access administration moved to the Admin panel — keep the old URL working. */
export const Route = createFileRoute("/_authed/$wid/settings/log-access")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$wid/admin/log-access", params: { wid: params.wid } });
  },
});
