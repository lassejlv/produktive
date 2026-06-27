import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Billing was consolidated into the dedicated Usage tab. Keep this URL working
 * (deep links, the Polar checkout return) by redirecting and preserving the
 * `checkout` search param so the post-checkout toast still fires.
 */
export const Route = createFileRoute("/_authed/$wid/settings/billing")({
  validateSearch: (search: Record<string, unknown>) => ({
    checkout: typeof search.checkout === "string" ? search.checkout : undefined,
  }),
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/$wid/settings/usage",
      params: { wid: params.wid },
      search,
    });
  },
});
