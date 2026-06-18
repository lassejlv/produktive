import { FullPageSpinner } from "#/components/FullPageSpinner";
import { usePublicStatusByDomain } from "../../lib/queries";
import { DEFAULT_STATUS_STYLE } from "../../lib/types";
import { IncidentsView } from "./IncidentsView";
import { PublicStatusError } from "./PublicStatusError";
import { StatusView } from "./StatusView";

export function PublicStatusByDomain({
  domain,
  view = "status",
  missingMessage = "Missing custom domain.",
  notFoundMessage = "The domain you requested is not connected or is disabled.",
}: {
  domain: string;
  /** Custom-domain status pages serve incidents from the sibling `/incidents` path. */
  view?: "status" | "incidents";
  missingMessage?: string;
  notFoundMessage?: string;
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
