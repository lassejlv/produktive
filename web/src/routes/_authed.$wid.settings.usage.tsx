import { createFileRoute, redirect } from "@tanstack/react-router";

/** Usage administration moved to the Admin panel — keep the old URL working. */
export const Route = createFileRoute("/_authed/$wid/settings/usage")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$wid/admin/usage", params: { wid: params.wid } });
  },
});
