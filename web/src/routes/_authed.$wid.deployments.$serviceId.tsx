import { createFileRoute } from "@tanstack/react-router";
import { deployAccessQuery } from "../lib/queries";
import { DeploymentsRoute, type DeployDetailTab } from "./_authed.$wid.deployments";

const DETAIL_TABS = [
  "deployments",
  "events",
  "logs",
  "metrics",
  "domains",
  "settings",
] as const satisfies readonly DeployDetailTab[];

export const Route = createFileRoute("/_authed/$wid/deployments/$serviceId")({
  staticData: {
    title: "Deployment service",
    layout: "bare",
    parent: { label: "Deployments", to: "/$wid/deployments" },
  },
  validateSearch: (search: Record<string, unknown>): { tab?: DeployDetailTab } => {
    const tab = typeof search.tab === "string" ? search.tab : undefined;
    return tab && (DETAIL_TABS as readonly string[]).includes(tab)
      ? { tab: tab as DeployDetailTab }
      : {};
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(deployAccessQuery(params.wid)),
  component: DeploymentServicePage,
});

function DeploymentServicePage() {
  const { wid, serviceId } = Route.useParams();
  const { tab } = Route.useSearch();
  return <DeploymentsRoute wid={wid} serviceId={serviceId} tab={tab} />;
}
