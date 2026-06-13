import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sidebar } from "../components/Sidebar";
import { Topbar } from "../components/Topbar";
import { PageContent } from "../components/PageLayout";
import { workspacesQuery } from "../lib/queries";

export const Route = createFileRoute("/_authed/$wid")({
  loader: ({ context }) => context.queryClient.ensureQueryData(workspacesQuery),
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setNavOpen(true)} />
        <PageContent />
      </div>
    </div>
  );
}
