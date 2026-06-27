import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "../components/marketing/MarketingShell";
import { Landing } from "../components/marketing/Landing";
import { PublicStatusByDomain } from "../components/status/PublicStatusByDomain";
import { customStatusDomain } from "../lib/custom-domain";

/**
 * The marketing landing page, reachable even while signed in. The index route
 * redirects authenticated users to their workspace; `/home` never does, so the
 * platform overview stays viewable from inside the app.
 */
export const Route = createFileRoute("/home")({
  staticData: { title: "Home" },
  component: HomePage,
});

function HomePage() {
  const customDomain = customStatusDomain();

  if (customDomain) {
    return (
      <PublicStatusByDomain
        domain={customDomain}
        notFoundMessage="This custom domain is not connected, verified, or enabled."
      />
    );
  }

  return (
    <MarketingShell gridMask="hero">
      <Landing />
    </MarketingShell>
  );
}
