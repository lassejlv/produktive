import { createFileRoute } from "@tanstack/react-router";
import { usePublicStatus } from "../lib/queries";
import { DEFAULT_STATUS_STYLE } from "../lib/types";
import { FullPageSpinner } from "#/components/FullPageSpinner";
import { PublicStatusError } from "../components/status/PublicStatusError";
import { StatusView } from "../components/status/StatusView";

export const Route = createFileRoute("/s_/$slug/")({
  component: PublicStatusPage,
});

function PublicStatusPage() {
  const { slug } = Route.useParams();
  const { data, isLoading, isError, error } = usePublicStatus(slug);

  if (isLoading) {
    return <FullPageSpinner label="Loading status…" />;
  }

  if (isError) {
    return <PublicStatusError error={error} />;
  }

  if (!data) {
    return <PublicStatusError error={null} />;
  }

  return (
    <StatusView
      title={data.title ?? data.workspace_name}
      description={data.description}
      overall={data.overall}
      groups={data.groups}
      incidents={data.incidents ?? []}
      incidentsHref={`/s/${slug}/incidents`}
      style={data.style ?? DEFAULT_STATUS_STYLE}
    />
  );
}
