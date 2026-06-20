import { createFileRoute } from "@tanstack/react-router";
import { PublicStatusByDomain } from "../components/status/PublicStatusByDomain";
import { customStatusDomain } from "../lib/custom-domain";

// Custom-domain status pages serve incident detail from `/incidents/:id`.
export const Route = createFileRoute("/incidents/$id")({
  component: PublicStatusIncidentDetailByDomainPage,
});

function PublicStatusIncidentDetailByDomainPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch() as { domain?: string };
  const browserDomain = customStatusDomain();
  const queryDomain = (search.domain ?? "").trim().toLowerCase();

  return (
    <PublicStatusByDomain
      domain={queryDomain || browserDomain || ""}
      view="incident-detail"
      incidentId={id}
    />
  );
}
