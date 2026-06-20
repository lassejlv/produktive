import { FullPageSpinner } from "#/components/FullPageSpinner";
import { usePublicStatusByDomain } from "../../lib/queries";
import { DEFAULT_STATUS_STYLE, type PublicIncident } from "../../lib/types";
import { IncidentDetailView } from "./IncidentDetailView";
import { IncidentsView } from "./IncidentsView";
import { PublicStatusError } from "./PublicStatusError";
import { StatusView } from "./StatusView";

function findPublicIncident(incidents: PublicIncident[], id: string) {
  return incidents.find((i) => i.id === id) ?? null;
}

export function PublicStatusByDomain({
  domain,
  view = "status",
  incidentId,
  missingMessage = "Missing custom domain.",
  notFoundMessage = "The domain you requested is not connected or is disabled.",
  incidentNotFoundMessage = "This incident was not found or is no longer available.",
}: {
  domain: string;
  /** Custom-domain status pages serve incidents from the sibling `/incidents` path. */
  view?: "status" | "incidents" | "incident-detail";
  /** Required when `view` is `incident-detail`. */
  incidentId?: string;
  missingMessage?: string;
  notFoundMessage?: string;
  incidentNotFoundMessage?: string;
}) {
  const normalizedDomain = domain.trim().toLowerCase();
  const { data, isLoading, isError, error } = usePublicStatusByDomain(normalizedDomain);

  if (!normalizedDomain) {
    return <PublicStatusError error={null} notFoundMessage={missingMessage} />;
  }

  if (isLoading) {
    return <FullPageSpinner label="Loading status..." />;
  }

  if (isError) {
    return <PublicStatusError error={error} notFoundMessage={notFoundMessage} />;
  }

  if (!data) {
    return <PublicStatusError error={null} notFoundMessage={notFoundMessage} />;
  }

  const title = data.title ?? data.workspace_name;

  if (view === "incidents") {
    return (
      <IncidentsView
        title={title}
        incidents={data.incidents ?? []}
        statusHref="/"
        style={data.style ?? DEFAULT_STATUS_STYLE}
        showBranding={data.show_branding}
      />
    );
  }

  if (view === "incident-detail") {
    if (!incidentId) {
      return <PublicStatusError error={null} notFoundMessage={incidentNotFoundMessage} />;
    }

    const incident = findPublicIncident(data.incidents ?? [], incidentId);
    if (!incident) {
      return <PublicStatusError error={null} notFoundMessage={incidentNotFoundMessage} />;
    }

    return (
      <IncidentDetailView
        title={title}
        incident={incident}
        incidentsHref="/incidents"
        style={data.style ?? DEFAULT_STATUS_STYLE}
        showBranding={data.show_branding}
      />
    );
  }

  return (
    <StatusView
      title={title}
      description={data.description}
      overall={data.overall}
      groups={data.groups}
      incidents={data.incidents ?? []}
      incidentsHref="/incidents"
      style={data.style ?? DEFAULT_STATUS_STYLE}
      showBranding={data.show_branding}
    />
  );
}
