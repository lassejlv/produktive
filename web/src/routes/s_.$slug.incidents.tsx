import { createFileRoute } from "@tanstack/react-router";
import { usePublicStatus } from "../lib/queries";
import { DEFAULT_STATUS_STYLE } from "../lib/types";
import { FullPageSpinner } from "#/components/FullPageSpinner";
import { IncidentsView } from "../components/status/IncidentsView";
import { PublicStatusError } from "../components/status/PublicStatusError";

export const Route = createFileRoute("/s_/$slug/incidents")({
  component: PublicIncidentsPage,
});

function PublicIncidentsPage() {
  const { slug } = Route.useParams();
  const { data, isLoading, isError, error } = usePublicStatus(slug);

  if (isLoading) {
    return <FullPageSpinner label="Loading incidents…" />;
  }

  if (isError) {
    return <PublicStatusError error={error} />;
  }

  if (!data) {
    return <PublicStatusError error={null} />;
  }

  return (
    <IncidentsView
      title={data.title ?? data.workspace_name}
      incidents={data.incidents ?? []}
      statusHref={`/s/${slug}`}
      style={data.style ?? DEFAULT_STATUS_STYLE}
      generatedAt={data.generated_at}
    />
  );
}
