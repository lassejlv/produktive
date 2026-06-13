import { createFileRoute, redirect } from "@tanstack/react-router";

/** Members moved into the Settings hub — keep the old URL working. */
export const Route = createFileRoute("/_authed/$wid/members")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$wid/settings/members", params: { wid: params.wid } });
  },
});
