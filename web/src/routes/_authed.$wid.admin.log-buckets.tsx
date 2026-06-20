import { createFileRoute, redirect } from "@tanstack/react-router";

/** Log bucket administration lives in the Admin panel — keep the old URL available. */
export const Route = createFileRoute("/_authed/$wid/admin/log-buckets")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$wid/admin/log-storage", params: { wid: params.wid } });
  },
});
