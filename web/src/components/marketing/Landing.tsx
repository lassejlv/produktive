import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Box, Check, Database, Radio, Rocket, ScrollText } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { Button } from "#/components/ui/button";
import { AnimatedIcon } from "#/components/AnimatedIcon";
import { BRAND_TAGLINE } from "#/lib/brand";
import { STATUS_COLOR } from "#/lib/status";
import type { MonitorStatus } from "#/lib/types";

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

export function Landing() {
  const revealRef = useRevealOnScroll();

  return (
    <div ref={revealRef}>
      <section className="mx-auto grid max-w-[1080px] grid-cols-1 gap-12 px-6 pb-16 pt-16 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="pricing-rise max-w-[560px]">
          <h1 className="text-[40px] font-medium leading-[1.02] tracking-[-0.04em] text-[var(--color-fg)] sm:text-[52px]">
            {BRAND_TAGLINE}
          </h1>

          <p className="mt-5 max-w-[460px] text-[15px] leading-[1.65] text-[var(--color-fg-muted)]">
            Deploy Docker services, watch them from regions worldwide, ship logs, and store objects
            — one platform for everything you run in production.
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
                  style={{ background: "var(--color-fg-dim)" }}
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

      <PillarsSection />
      <CodeSection />
      <CapabilitiesSection />
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

const PILLARS: Array<{ icon: LucideIcon; title: string; tag: string; body: string }> = [
  {
    icon: Rocket,
    title: "Deploy",
    tag: "Docker · Fly",
    body: "Push a Docker image and get an HTTP service on a Fly-backed runtime — logs, metrics, rollbacks, and scaling, arranged on a canvas.",
  },
  {
    icon: Radio,
    title: "Monitor",
    tag: "6 protocols",
    body: "Probe HTTP, TCP, ICMP, Postgres, Redis, and SSH from regions worldwide. Define checks as code and publish status pages.",
  },
  {
    icon: ScrollText,
    title: "Logs",
    tag: "Ingest API",
    body: "Ship structured logs to dedicated projects with full-text search, an ingest API, retention windows, and alerts.",
  },
  {
    icon: Database,
    title: "Object storage",
    tag: "S3 · Tigris",
    body: "S3-compatible buckets powered by Tigris, plus persistent volumes you can attach to any deployment.",
  },
  {
    icon: Box,
    title: "Sandboxes",
    tag: "Isolated",
    body: "Persistent sandbox environments built for running agents and untrusted code, safely isolated from the rest.",
  },
];

function PillarsSection() {
  return (
    <section className="reveal border-t border-[var(--color-border)]">
      <div className="mx-auto max-w-[1080px] px-6 py-16">
        <p className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-fg-dim)]">
          Platform
        </p>
        <h2 className="mt-3 max-w-[560px] text-[26px] font-medium leading-[1.1] tracking-[-0.03em] text-[var(--color-fg)] sm:text-[32px]">
          Everything you run, in one place.
        </h2>

        <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((pillar) => (
            <PillarCard key={pillar.title} {...pillar} />
          ))}
          <div className="hidden bg-[var(--color-bg)] lg:block" />
        </div>
      </div>
    </section>
  );
}

function PillarCard({
  icon: Icon,
  title,
  tag,
  body,
}: {
  icon: LucideIcon;
  title: string;
  tag: string;
  body: string;
}) {
  return (
    <div className="group bg-[var(--color-bg)] p-5 transition-colors hover:bg-[var(--color-bg-elev)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] text-[var(--color-fg-muted)] transition-colors group-hover:border-[var(--color-border-strong)] group-hover:text-[var(--color-fg)]">
          <Icon size={15} />
        </div>
        <span className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
          {tag}
        </span>
      </div>
      <h3 className="mt-4 text-[15px] font-medium tracking-tight text-[var(--color-fg)]">
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
  return <span style={{ color: STATUS_COLOR.up }}>{children}</span>;
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

const CAPABILITIES: Array<{ title: string; body: string }> = [
  { title: "Multi-region probes", body: "Run checks from several regions at once." },
  { title: "Monitor-as-code", body: "A versioned DSL for requests, thresholds, and rules." },
  { title: "Status pages", body: "Branded and public, on your own domain." },
  { title: "Incidents", body: "Manual or automatic, with a public timeline." },
  { title: "Custom domains", body: "Bring your hostname; TLS renews itself." },
  { title: "Alerting", body: "Webhook, Slack, and Discord on incidents." },
  { title: "Persistent volumes", body: "Durable disks attached to your services." },
  { title: "Metrics & rollbacks", body: "CPU, memory, requests, one-click rollback." },
  { title: "Team & roles", body: "Invite teammates and scope access by role." },
  { title: "Usage-based billing", body: "Pay for what you actually run." },
];

function CapabilitiesSection() {
  return (
    <section className="reveal border-t border-[var(--color-border)]">
      <div className="mx-auto max-w-[1080px] px-6 py-16">
        <p className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-fg-dim)]">
          And the rest
        </p>
        <h2 className="mt-3 max-w-[520px] text-[26px] font-medium leading-[1.1] tracking-[-0.03em] text-[var(--color-fg)] sm:text-[32px]">
          The details that add up.
        </h2>

        <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2">
          {CAPABILITIES.map((cap) => (
            <div
              key={cap.title}
              className="flex items-start gap-3 border-t border-[var(--color-border)] pt-4"
            >
              <Check size={15} className="mt-0.5 shrink-0 text-[var(--color-fg-dim)]" />
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium tracking-tight text-[var(--color-fg)]">
                  {cap.title}
                </div>
                <div className="mt-0.5 text-[13px] leading-[1.5] text-[var(--color-fg-muted)]">
                  {cap.body}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="reveal border-t border-[var(--color-border)]">
      <div className="mx-auto max-w-[1080px] px-6 py-20 text-center">
        <h2 className="mx-auto max-w-[460px] text-[28px] font-medium leading-[1.08] tracking-[-0.03em] text-[var(--color-fg)] sm:text-[36px]">
          Ship it, then watch it.
        </h2>
        <p className="mx-auto mt-4 max-w-[400px] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Free to start. Self-host it, or run it on our cloud — your services, your domain, your
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
