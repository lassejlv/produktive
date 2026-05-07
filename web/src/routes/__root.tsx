import { Outlet, createRootRouteWithContext, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { OnboardingOverlay } from "@/components/onboarding/onboarding-overlay";
import { OnboardingProvider } from "@/components/onboarding/onboarding-context";
import { Toaster } from "@/components/ui/sonner";
import { useSession } from "@/lib/auth-client";

/**
 * Old top-level paths that pre-date workspace-slug routing.
 * Visiting one of these redirects to /<slug>/<rest> when the user has an
 * active workspace, otherwise to /login.
 */
const LEGACY_PREFIXES = [
  "/inbox",
  "/issues",
  "/projects",
  "/notes",
  "/labels",
  "/chat",
  "/chats",
  "/favorites",
  "/account",
  "/members",
  "/workspace",
] as const;

function looksLegacyAppPath(pathname: string): boolean {
  if (pathname === "/workspace/settings") return true;
  return LEGACY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
  notFoundComponent: NotFoundRedirect,
});

function RootLayout() {
  return (
    <OnboardingProvider>
      <RouteRedirector />
      <Outlet />
      <OnboardingOverlay />
      <Toaster />
    </OnboardingProvider>
  );
}

function legacyToWorkspacePath(slug: string, pathname: string): string | null {
  if (pathname === "/workspace") return `/${slug}`;
  if (pathname === "/workspace/settings") return `/${slug}/settings`;
  if (looksLegacyAppPath(pathname)) return `/${slug}${pathname}`;
  return null;
}

/**
 * Redirects logged-in users hitting "/" to their workspace home, and
 * silently rewrites legacy app paths (e.g. /issues) into slug-prefixed
 * equivalents (/<slug>/issues).
 */
function RouteRedirector() {
  const navigate = useNavigate();
  const session = useSession();
  const slug = session.data?.organization.slug ?? null;

  useEffect(() => {
    if (typeof window === "undefined" || !slug) return;
    const pathname = window.location.pathname;
    if (pathname === "/") {
      void navigate({
        to: "/$workspaceSlug",
        params: { workspaceSlug: slug },
        replace: true,
      });
      return;
    }
    const target = legacyToWorkspacePath(slug, pathname);
    if (target) {
      window.location.replace(`${target}${window.location.search}${window.location.hash}`);
    }
  }, [slug, navigate]);

  return null;
}

function NotFoundRedirect() {
  const navigate = useNavigate();
  const session = useSession();
  const slug = session.data?.organization.slug ?? null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pathname = window.location.pathname;
    if (!slug) {
      void navigate({ to: "/login", replace: true });
      return;
    }
    const target = legacyToWorkspacePath(slug, pathname);
    if (target) {
      window.location.replace(`${target}${window.location.search}${window.location.hash}`);
      return;
    }
    void navigate({
      to: "/$workspaceSlug",
      params: { workspaceSlug: slug },
      replace: true,
    });
  }, [slug, navigate]);

  return null;
}
