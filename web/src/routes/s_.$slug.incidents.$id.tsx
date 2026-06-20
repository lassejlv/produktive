import { createFileRoute } from "@tanstack/react-router";
import { FullPageSpinner } from "#/components/FullPageSpinner";
import { IncidentDetailView } from "../components/status/IncidentDetailView";
import { PublicStatusError } from "../components/status/PublicStatusError";
import { usePublicStatus } from "../lib/queries";
import { DEFAULT_STATUS_STYLE, type PublicIncident } from "../lib/types";

export const Route = createFileRoute("/s_/$slug/incidents/$id")({
  component: PublicIncidentDetailPage,
});

function findPublicIncident(incidents: PublicIncident[], id: string) {
  return incidents.find((i) => i.id === id) ?? null;
}

function PublicIncidentDetailPage() {
  const { slug, id } = Route.useParams();
  const { data, isLoading, isError, error } = usePublicStatus(slug);

  if (isLoading) {
    return <FullPageSpinner label="Loading incident…" />;
  }

  if (isError) {
    return <PublicStatusError error={error} />;
  }

  if (!data) {
    return <PublicStatusError error={null} />;
  }

  const incident = findPublicIncident(data.incidents ?? [], id);
  if (!incident) {
    return (
      <PublicStatusError
        error={null}
        notFoundMessage="This incident was not found or is no longer available."
      />
    );
  }

  return (
    <IncidentDetailView
      title={data.title ?? data.workspace_name}
      incident={incident}
      incidentsHref={`/s/${slug}/incidents`}
      style={data.style ?? DEFAULT_STATUS_STYLE}
      showBranding={data.show_branding}
    />
  );
}
