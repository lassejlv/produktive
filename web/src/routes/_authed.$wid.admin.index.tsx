import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/$wid/admin/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$wid/admin/workers", params: { wid: params.wid } });
  },
});
