import { Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { OnboardingOverlay } from "@/components/onboarding/onboarding-overlay";
import { OnboardingProvider } from "@/components/onboarding/onboarding-context";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <OnboardingProvider>
      <Outlet />
      <OnboardingOverlay />
      <Toaster />
    </OnboardingProvider>
  );
}
