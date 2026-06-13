import { createFileRoute } from "@tanstack/react-router";
import { PublicStatusByDomain } from "../components/status/PublicStatusByDomain";
import { customStatusDomain } from "../lib/custom-domain";

// Custom-domain status pages serve their incident history from `/incidents`.
export const Route = createFileRoute("/incidents")({
  component: PublicStatusIncidentsByDomainPage,
});

function PublicStatusIncidentsByDomainPage() {
  const search = Route.useSearch() as { domain?: string };
  const browserDomain = customStatusDomain();
  const queryDomain = (search.domain ?? "").trim().toLowerCase();

  return <PublicStatusByDomain domain={queryDomain || browserDomain || ""} view="incidents" />;
}
