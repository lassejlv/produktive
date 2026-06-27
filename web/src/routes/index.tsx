import { createFileRoute, redirect } from "@tanstack/react-router";
import { MarketingShell } from "../components/marketing/MarketingShell";
import { Landing } from "../components/marketing/Landing";
import { PublicStatusByDomain } from "../components/status/PublicStatusByDomain";
import { auth } from "../lib/api";
import { customStatusDomain } from "../lib/custom-domain";
import { workspacesQuery } from "../lib/queries";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    if (customStatusDomain()) return;
    if (!auth.token) return;
    let target;
    try {
      const list = await context.queryClient.ensureQueryData(workspacesQuery);
      target = list.find((w) => w.is_personal) ?? list[0];
    } catch {
      auth.clear();
      return;
    }
    if (target) {
      throw redirect({
        to: "/$wid",
        params: { wid: target.slug },
        search: { q: undefined, status: undefined },
      });
    }
  },
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
