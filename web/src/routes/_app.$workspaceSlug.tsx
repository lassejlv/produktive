import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { switchOrganization, useOrganizations, useSession } from "@/lib/auth-client";

export const Route = createFileRoute("/_app/$workspaceSlug")({
  component: WorkspaceSlugLayout,
});

function WorkspaceSlugLayout() {
  const { workspaceSlug } = Route.useParams();
  const session = useSession();
  const navigate = useNavigate();
  const orgs = useOrganizations(Boolean(session.data));
  const sessionSlug = session.data?.organization.slug ?? null;
  const switchingForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session.data) return;
    if (sessionSlug === workspaceSlug) {
      switchingForRef.current = null;
      return;
    }

    if (switchingForRef.current === workspaceSlug) return;
    if (orgs.isLoading) return;

    const target = orgs.organizations.find((m) => m.slug === workspaceSlug);
    if (target) {
      switchingForRef.current = workspaceSlug;
      void switchOrganization(target.id)
        .then(() => session.refresh())
        .catch(() => {
          switchingForRef.current = null;
        });
      return;
    }

    if (sessionSlug) {
      void navigate({
        to: "/$workspaceSlug",
        params: { workspaceSlug: sessionSlug },
        replace: true,
      });
    }
  }, [
    workspaceSlug,
    session.data,
    sessionSlug,
    orgs.isLoading,
    orgs.organizations,
    navigate,
    session.refresh,
  ]);

  if (sessionSlug && sessionSlug !== workspaceSlug) {
    return null;
  }

  return <Outlet />;
}
