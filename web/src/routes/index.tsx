import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Bell, Code, Globe, Link2, Network, Radio } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { Button } from "#/components/ui/button";
import { AnimatedIcon } from "../components/AnimatedIcon";
import { MarketingShell } from "../components/marketing/MarketingShell";
import { PublicStatusByDomain } from "../components/status/PublicStatusByDomain";
import { auth } from "../lib/api";
import { BRAND_TAGLINE } from "../lib/brand";
import { customStatusDomain } from "../lib/custom-domain";
import { workspacesQuery } from "../lib/queries";
import { STATUS_COLOR } from "../lib/status";
import type { MonitorStatus } from "../lib/types";

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

/** Reveal `.reveal` descendants as they scroll into view (CSS handles reduced-motion). */
function useRevealOnScroll() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("reveal-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-in");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

function Landing() {
  const revealRef = useRevealOnScroll();

  return (
    <div ref={revealRef}>
      <section className="mx-auto grid max-w-[1080px] grid-cols-1 gap-12 px-6 pb-16 pt-16 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
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

          <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-[var(--color-fg-dim)]">
            {["Open source", "Self-host or cloud", "Free to start"].map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <span
                  className="h-1 w-1 rounded-full"
                  style={{ background: "var(--color-accent)" }}
                />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="pricing-rise-2">
          <HeroMonitor />
        </div>
      </section>

      <FeaturesSection />
      <CodeSection />
      <ClosingCta />
    </div>
  );
}

/* 90-day uptime history — a calm operational field with a couple of incident marks. */
const UPTIME: MonitorStatus[] = Array.from({ length: 56 }, (_, i) => {
  if (i === 17 || i === 18) return "degraded";
  if (i === 36) return "down";
  if (i === 47) return "degraded";
  return "up";
});

const STATUS_OPACITY: Record<MonitorStatus, number> = {
  up: 0.5,
  degraded: 0.95,
  down: 1,
  unknown: 0.4,
};

function HeroMonitor() {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="pulse-dot inline-block h-2.5 w-2.5 rounded-full"
            style={{
              background: STATUS_COLOR.up,
              boxShadow: `0 0 10px color-mix(in srgb, ${STATUS_COLOR.up} 55%, transparent)`,
            }}
          />
          <span className="text-[14px] font-medium text-[var(--color-fg)]">Operational</span>
        </div>
        <span className="mono text-[12px] text-[var(--color-fg-dim)]">api.acme.com</span>
      </div>

      <div className="mt-5 flex h-9 items-end gap-[3px]">
        {UPTIME.map((status, i) => {
          const isNow = i === UPTIME.length - 1;
          return (
            <span
              key={i}
              className={`min-w-0 flex-1 rounded-[1px] ${isNow ? "ticker-pulse" : ""}`}
              style={{
                height: status === "up" ? "70%" : "100%",
                background: isNow ? STATUS_COLOR.up : STATUS_COLOR[status],
                opacity: isNow ? 1 : STATUS_OPACITY[status],
              }}
            />
          );
        })}
      </div>
      <div className="mono mt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.1em] text-[var(--color-fg-dim)]">
        <span>90 days ago</span>
        <span>now</span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-[var(--color-border)] pt-4">
        <HeroStat label="Uptime" value="99.98%" />
        <HeroStat label="p50 latency" value="142ms" />
        <HeroStat label="Regions" value="iad · ams · sfo" mono />
      </div>
    </div>
  );
}

function HeroStat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
        {label}
      </div>
      <div
        className={`mt-1 text-[14px] font-medium tracking-tight text-[var(--color-fg)] ${mono ? "mono text-[12px]" : "tabular"}`}
      >
        {value}
      </div>
    </div>
  );
}

const FEATURES: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: Globe,
    title: "Multi-region probes",
    body: "Check from regions around the world and catch outages that only one network can see.",
  },
  {
    icon: Code,
    title: "Monitor as code",
    body: "Define the request, schedule, and up / warn / down rules in a typed DSL — versioned with your config.",
  },
  {
    icon: Radio,
    title: "Status pages",
    body: "Publish a branded status page with live history and uptime your users can check anytime.",
  },
  {
    icon: Bell,
    title: "Incidents",
    body: "Open, update, and resolve incidents on a public timeline that keeps subscribers in the loop.",
  },
  {
    icon: Network,
    title: "Six protocols",
    body: "HTTP, TCP, ICMP, Postgres, Redis, and SSH — watch the services you actually run.",
  },
  {
    icon: Link2,
    title: "Custom domains",
    body: "Serve your status page from your own hostname with automatically renewed TLS.",
  },
];

function FeaturesSection() {
  return (
    <section className="reveal border-t border-[var(--color-border)]">
      <div className="mx-auto max-w-[1080px] px-6 py-16">
        <p className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-fg-dim)]">
          Platform
        </p>
        <h2 className="mt-3 max-w-[520px] text-[26px] font-medium leading-[1.1] tracking-[-0.03em] text-[var(--color-fg)] sm:text-[32px]">
          Everything you need to watch uptime — and prove it.
        </h2>

        <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="group bg-[var(--color-bg)] p-5 transition-colors hover:bg-[var(--color-bg-elev)]">
      <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] text-[var(--color-fg-muted)] transition-colors group-hover:border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-border))] group-hover:text-[var(--color-accent)]">
        <Icon size={15} />
      </div>
      <h3 className="mt-4 text-[14px] font-medium tracking-tight text-[var(--color-fg)]">
        {title}
      </h3>
      <p className="mt-1.5 text-[13px] leading-[1.6] text-[var(--color-fg-muted)]">{body}</p>
    </div>
  );
}

function CodeSection() {
  return (
    <section className="reveal border-t border-[var(--color-border)]">
      <div className="mx-auto grid max-w-[1080px] grid-cols-1 gap-10 px-6 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div className="max-w-[440px]">
          <p className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-fg-dim)]">
            Monitor as code
          </p>
          <h2 className="mt-3 text-[26px] font-medium leading-[1.1] tracking-[-0.03em] text-[var(--color-fg)] sm:text-[32px]">
            Checks that read like your intent.
          </h2>
          <p className="mt-4 text-[14px] leading-[1.65] text-[var(--color-fg-muted)]">
            Every monitor can carry a small, typed program. Set the request, the schedule, and the
            rules that decide up, warn, or down — then let it run from every region, on every check.
          </p>
        </div>

        <DslCard />
      </div>
    </section>
  );
}

function DslCard() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-border-hi)]" />
        <span className="mono text-[11px] text-[var(--color-fg-dim)]">health.monitor</span>
      </div>
      <pre className="mono overflow-x-auto px-4 py-4 text-[12px] leading-[1.7] text-[var(--color-fg-muted)]">
        <Kw>type</Kw> http{"\n"}
        {"\n"}
        <Kw>set</Kw> params.config {"{"}
        {"\n"}
        {"  url: "}
        <Str>"https://api.acme.com/health"</Str>
        {"\n"}
        {"  timeout: "}
        <Lit>5s</Lit>
        {"\n"}
        {"}"}
        {"\n"}
        {"\n"}
        <Kw>set</Kw> schedule.interval <Lit>60s</Lit>
        {"\n"}
        {"\n"}
        <Kw>rules</Kw> {"{"}
        {"\n"}
        {"  "}
        <Kw>if</Kw> result.status == <Lit>200</Lit>
        {" -> "}
        <Out status="up">ok</Out>
        {"\n"}
        {"  "}
        <Kw>if</Kw> result.status {">="} <Lit>500</Lit>
        {" -> "}
        <Out status="down">down</Out> with <Str>"5xx response"</Str>
        {"\n"}
        {"  "}
        <Kw>if</Kw> result.latency_ms {">"} <Lit>2000</Lit>
        {" -> "}
        <Out status="degraded">warn</Out> with <Str>"slow"</Str>
        {"\n"}
        {"  "}
        <Kw>else</Kw>
        {" -> "}
        <Out status="up">ok</Out>
        {"\n"}
        {"}"}
      </pre>
    </div>
  );
}

function Kw({ children }: { children: string }) {
  return <span className="text-[var(--color-fg)]">{children}</span>;
}

function Str({ children }: { children: string }) {
  return <span style={{ color: "var(--color-accent)" }}>{children}</span>;
}

function Lit({ children }: { children: string }) {
  return <span className="text-[var(--color-fg)]">{children}</span>;
}

function Out({ children, status }: { children: string; status: MonitorStatus }) {
  return (
    <span style={{ color: STATUS_COLOR[status] }} className="font-medium">
      {children}
    </span>
  );
}

function ClosingCta() {
  return (
    <section className="reveal border-t border-[var(--color-border)]">
      <div className="mx-auto max-w-[1080px] px-6 py-20 text-center">
        <h2 className="mx-auto max-w-[460px] text-[28px] font-medium leading-[1.08] tracking-[-0.03em] text-[var(--color-fg)] sm:text-[36px]">
          Start watching in minutes.
        </h2>
        <p className="mx-auto mt-4 max-w-[400px] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Free to start. Self-host it, or run it on our cloud — your monitors, your domain, your
          data.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/signup">
            <Button variant="default" size="lg">
              <motion.span
                initial="rest"
                animate="rest"
                whileHover="hover"
                className="inline-flex items-center gap-1.5"
              >
                Get started
                <AnimatedIcon icon={ArrowRight} animation="slideX" trigger="group" size={15} />
              </motion.span>
            </Button>
          </Link>
          <Link to="/pricing">
            <Button variant="ghost" size="lg">
              See pricing
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
