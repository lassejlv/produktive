import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { PublicStatusByDomain } from "../components/status/PublicStatusByDomain";
import { MarketingShell } from "../components/marketing/MarketingShell";
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
      throw redirect({ to: "/$wid/monitors", params: { wid: target.slug } });
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
      <ComingSoon />
    </MarketingShell>
  );
}

function ComingSoon() {
  const [email, setEmail] = useState("");

  return (
    <section className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col items-center justify-center px-6 py-20 text-center">
      <h1 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
        Coming soon
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Monitor-as-code uptime checks and status pages. Join the waitlist to hear when we launch.
      </p>

      <form
        className="mt-8 flex w-full flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <Input
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          className="h-10 flex-1"
        />
        <Button type="submit" className="h-10 shrink-0 sm:px-5">
          Join waitlist
        </Button>
      </form>
    </section>
  );
}
