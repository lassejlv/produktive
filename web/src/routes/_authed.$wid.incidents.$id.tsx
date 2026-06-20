import { Link, createFileRoute } from "@tanstack/react-router";
import { FullPageSpinner } from "#/components/FullPageSpinner";
import { WorkspaceIncidentDetail } from "#/components/incidents/WorkspaceIncidentDetail";
import { findIncident } from "#/lib/incidents";
import { incidentsQuery, useIncidents } from "#/lib/queries";

export const Route = createFileRoute("/_authed/$wid/incidents/$id")({
  staticData: {
    title: "Incident",
    layout: "bare",
    parent: { label: "Incidents", to: "/$wid/incidents" },
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(incidentsQuery(params.wid, "all")),
  component: IncidentDetailPage,
});

function IncidentDetailPage() {
  const { wid, id } = Route.useParams();
  const { data: incidents = [], isLoading } = useIncidents(wid, "all");

  if (isLoading) {
    return <FullPageSpinner label="Loading incident…" />;
  }

  const incident = findIncident(incidents, id);
  if (!incident) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="text-[15px] font-medium text-[var(--color-fg)]">Incident not found</div>
        <div className="max-w-sm text-[13px] text-[var(--color-fg-muted)]">
          This incident may have been deleted or the link is incorrect.
        </div>
        <Link
          to="/$wid/incidents"
          params={{ wid }}
          className="mt-2 text-[13px] text-[var(--color-link)] no-underline hover:underline"
        >
          Back to incidents
        </Link>
      </div>
    );
  }

  return <WorkspaceIncidentDetail wid={wid} incident={incident} />;
}
