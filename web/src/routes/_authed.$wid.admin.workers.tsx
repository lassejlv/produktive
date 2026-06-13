import { createFileRoute, redirect } from "@tanstack/react-router";

/** Workers moved into the Settings hub — keep the old URL working. */
export const Route = createFileRoute("/_authed/$wid/admin/workers")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$wid/settings/workers", params: { wid: params.wid } });
  },
});
