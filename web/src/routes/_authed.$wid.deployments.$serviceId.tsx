import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  parseDeployDetailTab,
  parseDeploySettingsSection,
  type DeployDetailTab,
  type DeploySettingsSection,
} from "#/lib/deployments";

export const Route = createFileRoute("/_authed/$wid/deployments/$serviceId")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: DeployDetailTab; section?: DeploySettingsSection } => ({
    tab: parseDeployDetailTab(search.tab),
    section: parseDeploySettingsSection(search.section),
  }),
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/$wid/deployments",
      params: { wid: params.wid },
      search: {
        service: params.serviceId,
        tab: search.tab,
        section: search.section,
      },
    });
  },
});
