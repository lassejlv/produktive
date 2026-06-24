import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "#/components/ui/button";
import { AnimatedIcon } from "../components/AnimatedIcon";
import { MarketingShell } from "../components/marketing/MarketingShell";
import { PublicStatusByDomain } from "../components/status/PublicStatusByDomain";
import { auth } from "../lib/api";
import { BRAND_TAGLINE } from "../lib/brand";
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

const PLATFORM = ["Uptime", "Monitors", "Status pages"];

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

function Landing() {
  return (
    <section className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-[1080px] flex-col justify-between px-6 pb-10 pt-16 sm:pt-24">
      <div className="pricing-rise max-w-[560px]">
        <h1 className="text-[40px] font-medium leading-[1.02] tracking-[-0.04em] text-[var(--color-fg)] sm:text-[52px]">
          {BRAND_TAGLINE}
        </h1>

        <p className="mt-5 max-w-[440px] text-[15px] leading-[1.65] text-[var(--color-fg-muted)]">
          Monitor endpoints from distributed regions, define checks as code, and publish status
          pages your users can trust.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link to="/signup">
            <Button variant="default" size="default">
              <motion.span
                initial="rest"
                animate="rest"
                whileHover="hover"
                className="inline-flex items-center gap-1.5"
              >
                Get started
                <AnimatedIcon icon={ArrowRight} animation="slideX" trigger="group" size={14} />
              </motion.span>
            </Button>
          </Link>
          <Link to="/pricing">
            <Button variant="ghost" size="default">
              Pricing
            </Button>
          </Link>
        </div>
      </div>

      <div className="pricing-rise-2 mt-20 border-t border-[var(--color-border)] pt-8 sm:mt-0">
        <p className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-fg-dim)]">
          Platform
        </p>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {PLATFORM.map((item) => (
            <li
              key={item}
              className="text-[13px] tracking-tight text-[var(--color-fg-muted)]"
            >
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
