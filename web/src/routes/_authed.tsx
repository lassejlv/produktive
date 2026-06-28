import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { EmailVerificationGate } from "#/components/EmailVerificationGate";
import { LegalTermsGate } from "#/components/LegalTermsGate";
import { auth } from "../lib/api";
import { authRedirectTarget } from "../lib/redirect";
import { meQuery } from "../lib/queries";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context, location }) => {
    if (!auth.token) {
      throw redirect({
        to: "/login",
        search: { redirect: authRedirectTarget(location) },
      });
    }
    try {
      await context.queryClient.ensureQueryData(meQuery);
    } catch {
      auth.clear();
      throw redirect({
        to: "/login",
        search: { redirect: authRedirectTarget(location) },
      });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <>
      <Outlet />
      <LegalTermsGate />
      <EmailVerificationGate />
    </>
  );
}
