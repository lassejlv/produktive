import { createFileRoute, redirect } from "@tanstack/react-router";
import { parseDeployDetailTab, type DeployDetailTab } from "#/lib/deployments";

export const Route = createFileRoute("/_authed/$wid/deployments/$serviceId")({
  validateSearch: (search: Record<string, unknown>): { tab?: DeployDetailTab } => ({
    tab: parseDeployDetailTab(search.tab),
  }),
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/$wid/deployments",
      params: { wid: params.wid },
      search: {
        service: params.serviceId,
        tab: search.tab,
      },
    });
  },
});
