import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { PublicStatusByDomain } from "../components/status/PublicStatusByDomain";
import { customStatusDomain } from "../lib/custom-domain";

export const Route = createFileRoute("/s")({
  component: PublicStatusByDomainPage,
});

function PublicStatusByDomainPage() {
  const search = Route.useSearch() as { domain?: string };
  const browserDomain = customStatusDomain();
  const queryDomain = (search.domain ?? "").trim().toLowerCase();

  useEffect(() => {
    if (browserDomain && queryDomain === browserDomain && window.location.pathname === "/s") {
      window.history.replaceState(window.history.state, "", "/");
    }
  }, [browserDomain, queryDomain]);

  return <PublicStatusByDomain domain={queryDomain || browserDomain || ""} />;
}
