import { createFileRoute } from "@tanstack/react-router";
import { AppSidebar } from "../components/Sidebar";
import { Topbar } from "../components/Topbar";
import { PageContent } from "../components/PageLayout";
import { SidebarProvider } from "../components/ui/sidebar";
import { workspacesQuery } from "../lib/queries";

export const Route = createFileRoute("/_authed/$wid")({
  loader: ({ context }) => context.queryClient.ensureQueryData(workspacesQuery),
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Topbar />
        <PageContent />
      </div>
    </SidebarProvider>
  );
}
