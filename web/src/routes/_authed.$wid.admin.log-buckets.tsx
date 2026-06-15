import { createFileRoute, redirect } from "@tanstack/react-router";

/** Log bucket administration lives in Settings; keep the admin URL available. */
export const Route = createFileRoute("/_authed/$wid/admin/log-buckets")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$wid/settings/log-storage", params: { wid: params.wid } });
  },
});
