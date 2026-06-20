import { createFileRoute } from "@tanstack/react-router";
import { deployAccessQuery } from "../lib/queries";
import { DeploymentsRoute } from "./_authed.$wid.deployments";

export const Route = createFileRoute("/_authed/$wid/deployments/$serviceId")({
  staticData: {
    title: "Deployment service",
    layout: "bare",
    parent: { label: "Deployments", to: "/$wid/deployments" },
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(deployAccessQuery(params.wid)),
  component: DeploymentServicePage,
});

function DeploymentServicePage() {
  const { wid, serviceId } = Route.useParams();
  return <DeploymentsRoute wid={wid} serviceId={serviceId} />;
}
