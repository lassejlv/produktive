import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Bell,
  Boxes,
  Check,
  Code2,
  Database,
  Globe2,
  Layers,
  LineChart,
  type LucideIcon,
  Network,
  Radio,
  Server,
  Terminal,
  Workflow,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "../components/Button";
import { PublicStatusByDomain } from "../components/status/PublicStatusByDomain";
import { MarketingShell } from "../components/marketing/MarketingShell";
import { auth } from "../lib/api";
import { customStatusDomain } from "../lib/custom-domain";
import { workspacesQuery } from "../lib/queries";
import { STATUS_COLOR } from "../lib/status";
import type { MonitorStatus } from "../lib/types";
import { cn } from "#/lib/cn";

const GITHUB_URL = "https://github.com/lassejlv/unstatus";

const DSL_EXAMPLE = `type http

set params.config {
  url: "https://api.acme.com/health"
  timeout: 5s
}

set schedule.interval 60s

rules {
  if result.status == 200     -> ok
  if result.status >= 500     -> down with "5xx response"
  if result.latency_ms > 2000 -> warn
  else                         -> ok
}`;

export const Route = createFileRoute("/")({
  // Signed-in visitors skip the landing page and go straight to their workspace.
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
      <Hero />
      <ProbeStrip />
      <MonitorAsCode />
      <FeatureGrid />
      <HowItWorks />
      <StatusPagePreview />
      <CtaBand />
    </MarketingShell>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero() {
  const nav = useNavigate();

  return (
    <section className="mx-auto flex max-w-[1080px] flex-col items-center px-6 pb-16 pt-20 text-center sm:pt-24">
      <div className="pricing-rise pricing-rise-1 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elev)] py-1 pl-2 pr-3 shadow-[var(--shadow-xs)]">
        <span className="relative flex h-1.5 w-1.5">
          <span
            className="pulse-dot absolute inline-flex h-full w-full rounded-full"
            style={{ background: "var(--color-accent)" }}
          />
          <span
            className="relative inline-flex h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--color-accent)" }}
          />
        </span>
        <span className="text-[12px] font-medium tracking-tight text-[var(--color-fg-muted)]">
          Open-source, monitor-as-code uptime
        </span>
      </div>

      <h1 className="pricing-rise pricing-rise-1 mt-6 max-w-[720px] text-[40px] font-medium leading-[1.02] tracking-[-0.035em] text-[var(--color-fg)] sm:text-[58px]">
        Health checks you can <span className="text-[var(--color-accent)]">version</span>.
      </h1>

      <p className="pricing-rise pricing-rise-2 mt-5 max-w-[560px] text-[15px] leading-relaxed text-[var(--color-fg-muted)] sm:text-[16px]">
        Probe HTTP, TCP, ICMP, Postgres, Redis, and SSH from multiple regions. Map every result to{" "}
        <Status>up</Status>, <Status tone="degraded">degraded</Status>, or{" "}
        <Status tone="down">down</Status> in a small DSL — then publish a status page when you are
        ready.
      </p>

      <div className="pricing-rise pricing-rise-3 mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button variant="primary" size="lg" onClick={() => nav({ to: "/signup" })} className="gap-2">
          Get started
          <ArrowRight size={15} />
        </Button>
        <Button variant="secondary" size="lg" onClick={() => nav({ to: "/pricing" })}>
          View pricing
        </Button>
      </div>

      <div className="pricing-rise pricing-rise-3 mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12px] text-[var(--color-fg-dim)]">
        <span>No credit card</span>
        <Dot />
        <span>6 probe types</span>
        <Dot />
        <span>Multi-region</span>
        <Dot />
        <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="link">
          Source on GitHub
        </a>
      </div>

      <div className="pricing-rise pricing-rise-4 mt-16 w-full">
        <PreviewCard />
      </div>
    </section>
  );
}

function Dot() {
  return <span className="text-[var(--color-border-strong)]">·</span>;
}

function Status({ children, tone = "up" }: { children: ReactNode; tone?: MonitorStatus }) {
  return (
    <span className="font-medium" style={{ color: STATUS_COLOR[tone] }}>
      {children}
    </span>
  );
}

/* ----------------------------------------------------- hero preview card */

const PREVIEW_ROWS: {
  name: string;
  kind: string;
  status: MonitorStatus;
  latency: string;
}[] = [
  { name: "api.acme.com", kind: "HTTP", status: "up", latency: "142ms" },
  { name: "postgres-primary", kind: "Postgres", status: "up", latency: "6ms" },
  { name: "checkout-worker", kind: "HTTP", status: "degraded", latency: "1.2s" },
  { name: "edge.acme.dev", kind: "TCP", status: "up", latency: "28ms" },
];

function PreviewCard() {
  return (
    <div className="mx-auto w-full max-w-[820px] text-left">
      <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-lg)]">
        {/* title bar */}
        <div className="flex h-12 items-center justify-between border-b border-[var(--color-border)] px-5">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span
                className="pulse-dot absolute inline-flex h-full w-full rounded-full"
                style={{ background: "var(--color-ok)" }}
              />
              <span
                className="relative inline-flex h-2 w-2 rounded-full"
                style={{ background: "var(--color-ok)" }}
              />
            </span>
            <span className="text-[13px] font-medium text-[var(--color-fg)]">acme · monitors</span>
          </div>
          <span className="tabular text-[11px] text-[var(--color-fg-dim)]">checked 5s ago</span>
        </div>

        {/* mini stats */}
        <div className="grid grid-cols-3 divide-x divide-[var(--color-border)] border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-bg-row)_45%,var(--color-bg-elev))]">
          <MiniStat label="Uptime · 30d" value="99.98%" />
          <MiniStat label="Avg latency" value="142ms" />
          <MiniStat label="Monitors" value="12" />
        </div>

        {/* rows */}
        <div className="divide-y divide-[var(--color-border)]">
          {PREVIEW_ROWS.map((row) => (
            <PreviewRow key={row.name} {...row} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-3">
      <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
        {label}
      </div>
      <div className="tabular mt-0.5 text-[16px] font-medium tracking-[-0.01em] text-[var(--color-fg)]">
        {value}
      </div>
    </div>
  );
}

function PreviewRow({ name, kind, status, latency }: (typeof PREVIEW_ROWS)[number]) {
  const color = STATUS_COLOR[status];
  return (
    <div className="flex h-14 items-center gap-4 px-5">
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{
          background: color,
          boxShadow: `0 0 8px color-mix(in srgb, ${color} 55%, transparent)`,
        }}
      />
      <div className="w-[150px] min-w-0">
        <div className="truncate text-[13px] font-medium text-[var(--color-fg)]">{name}</div>
        <div className="mono text-[11px] text-[var(--color-fg-dim)]">{kind}</div>
      </div>
      <UptimeBar status={status} className="hidden flex-1 sm:flex" />
      <span
        className="tabular ml-auto w-[56px] text-right text-[12px] sm:ml-0"
        style={{ color: status === "up" ? "var(--color-fg-muted)" : color }}
      >
        {latency}
      </span>
    </div>
  );
}

function UptimeBar({ status, className }: { status: MonitorStatus; className?: string }) {
  const COUNT = 44;
  return (
    <div className={`items-center gap-[2px] ${className ?? ""}`}>
      {Array.from({ length: COUNT }).map((_, i) => {
        const s: MonitorStatus =
          status === "degraded" && i === 38
            ? "down"
            : status === "degraded" && i >= 40
              ? "degraded"
              : "up";
        const isNow = i === COUNT - 1;
        return (
          <span
            key={i}
            className={cn("h-[20px] flex-1 rounded-[1px]", isNow && "ticker-pulse")}
            style={{
              background: `color-mix(in srgb, ${STATUS_COLOR[s]} ${s === "up" ? 55 : 100}%, transparent)`,
            }}
          />
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------- probe type strip */

const PROBES: { label: string; icon: LucideIcon }[] = [
  { label: "HTTP", icon: Globe2 },
  { label: "TCP", icon: Network },
  { label: "ICMP", icon: Radio },
  { label: "Postgres", icon: Database },
  { label: "Redis", icon: Boxes },
  { label: "SSH", icon: Terminal },
];

function ProbeStrip() {
  return (
    <section className="border-y border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-bg-elev)_60%,var(--color-bg))]">
      <Reveal className="mx-auto flex max-w-[1080px] flex-col items-center gap-5 px-6 py-8">
        <p className="mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-fg-dim)]">
          One agent, six protocols
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {PROBES.map(({ label, icon: Icon }) => (
            <span
              key={label}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--color-fg)] shadow-[var(--shadow-xs)]"
            >
              <Icon size={14} />
              {label}
            </span>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

/* ----------------------------------------------------- monitor-as-code */

const DSL_KEYWORDS = "type|set|rules|if|else|with";
const DSL_STATUS_COLOR: Record<string, string> = {
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  down: "var(--color-err)",
};
const DSL_TOKEN_RE = new RegExp(
  [
    `("(?:[^"\\\\]|\\\\.)*")`, // strings
    `\\b(ok|down|warn)\\b`, // rule outcomes
    `\\b(${DSL_KEYWORDS})\\b`, // keywords
    `\\b(\\d+(?:\\.\\d+)?(?:ms|s|m|h)?)\\b`, // numbers + durations
    `(->|==|>=|<=|!=|>|<|:)`, // operators
  ].join("|"),
  "g",
);

/** Tiny, dependency-free highlighter for the marketing DSL sample. */
function highlightDsl(src: string): { text: string; style?: CSSProperties }[] {
  const out: { text: string; style?: CSSProperties }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  DSL_TOKEN_RE.lastIndex = 0;
  while ((m = DSL_TOKEN_RE.exec(src)) !== null) {
    if (m.index > last) out.push({ text: src.slice(last, m.index) });
    const [full, str, status, kw, num, op] = m;
    let style: CSSProperties | undefined;
    if (str) style = { color: "var(--color-warn)" };
    else if (status) style = { color: DSL_STATUS_COLOR[status], fontWeight: 600 };
    else if (kw) style = { color: "var(--color-accent)", fontWeight: 600 };
    else if (num) style = { color: "var(--color-link)" };
    else if (op) style = { color: "var(--color-fg-dim)" };
    out.push({ text: full, style });
    last = m.index + full.length;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return out;
}

const DSL_HIGHLIGHTED = highlightDsl(DSL_EXAMPLE);
const DSL_LINE_COUNT = DSL_EXAMPLE.split("\n").length;

const CODE_BULLETS = [
  "Commit it next to your service — review and roll back like any other code.",
  'env("KEY") secrets resolve on the worker that runs the probe, never in git.',
  "Rules run after every check, so status reflects the latest probe — no alert builder.",
];

function MonitorAsCode() {
  return (
    <section className="mx-auto max-w-[1080px] px-6 py-20 sm:py-24">
      <Reveal className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-14">
        <div>
          <p className="mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            Monitor-as-code
          </p>
          <h2 className="mt-4 text-[28px] font-medium leading-[1.1] tracking-[-0.03em] text-[var(--color-fg)] sm:text-[34px]">
            Your checks are a file, not a form.
          </h2>
          <p className="mt-4 max-w-[460px] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
            Each monitor can carry a DSL source that sets its probe config, schedule, and the rules
            that decide the reported status. It lexes, parses, validates, and evaluates as a pure
            pipeline.
          </p>
          <ul className="mt-6 space-y-3">
            {CODE_BULLETS.map((body) => (
              <li key={body} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                  <Check size={11} strokeWidth={2.5} />
                </span>
                <span className="text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
                  {body}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <DslEditor />
      </Reveal>
    </section>
  );
}

function DslEditor() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-sunken)] shadow-[var(--shadow-lg)]">
      {/* chrome */}
      <div className="flex h-10 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4">
        <div className="flex items-center gap-1.5">
          {[STATUS_COLOR.down, STATUS_COLOR.degraded, STATUS_COLOR.up].map((c) => (
            <span
              key={c}
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: `color-mix(in srgb, ${c} 65%, transparent)` }}
            />
          ))}
        </div>
        <span className="mono text-[11.5px] text-[var(--color-fg-muted)]">checkout.monitor</span>
        <span className="mono ml-auto flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-fg-dim)]">
          <Code2 size={12} />
          DSL
        </span>
      </div>

      {/* code */}
      <div className="flex overflow-x-auto">
        <div
          aria-hidden
          className="mono select-none border-r border-[var(--color-border)] px-3 py-4 text-right text-[11.5px] leading-[1.7] text-[var(--color-fg-dim)]"
        >
          {Array.from({ length: DSL_LINE_COUNT }).map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <pre className="mono flex-1 px-4 py-4 text-[11.5px] leading-[1.7] text-[color-mix(in_srgb,var(--color-fg)_82%,var(--color-fg-muted))]">
          <code>
            {DSL_HIGHLIGHTED.map((tok, i) => (
              <span key={i} style={tok.style}>
                {tok.text}
              </span>
            ))}
          </code>
        </pre>
      </div>

      {/* evaluated result */}
      <div className="flex items-center gap-2 border-t border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-2.5">
        <span
          className="h-2 w-2 rounded-full"
          style={{
            background: STATUS_COLOR.up,
            boxShadow: `0 0 8px color-mix(in srgb, ${STATUS_COLOR.up} 55%, transparent)`,
          }}
        />
        <span className="mono text-[11.5px] font-medium" style={{ color: STATUS_COLOR.up }}>
          ok
        </span>
        <span className="mono text-[11px] text-[var(--color-fg-dim)]">
          · evaluated after every check · 142ms · status 200
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- feature grid */

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Workflow,
    title: "Rules after every check",
    body: "The DSL maps latency, status codes, and errors to up, degraded, or down — no separate alert builder.",
  },
  {
    icon: Globe2,
    title: "Multi-region probing",
    body: "Run checks from distributed regional workers and see per-region status and latency.",
  },
  {
    icon: LineChart,
    title: "Time-series history",
    body: "Every result lands in a TimescaleDB hypertable, so uptime and latency are queryable over time.",
  },
  {
    icon: Layers,
    title: "Status pages",
    body: "Group monitors, theme the page, share a slug, or serve it from a verified custom domain.",
  },
  {
    icon: Bell,
    title: "Incidents & alerts",
    body: "Incidents open automatically when a monitor goes down and notify Slack, Discord, or webhooks.",
  },
  {
    icon: Server,
    title: "Open & self-hostable",
    body: "A Rust workspace and a Bun/React frontend. Run it yourself — billing is entirely optional.",
  },
];

function FeatureGrid() {
  return (
    <section className="mx-auto max-w-[1080px] px-6 pb-20 sm:pb-24">
      <Reveal>
        <div className="mb-8 max-w-[560px]">
          <h2 className="text-[28px] font-medium leading-[1.1] tracking-[-0.03em] text-[var(--color-fg)] sm:text-[34px]">
            Everything between a probe and a status page.
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
            Checks, rules, history, incidents, and pages — one system, no glue code.
          </p>
        </div>
        <div className="grid gap-px overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Feature key={f.title} {...f} />
          ))}
        </div>
      </Reveal>
    </section>
  );
}

function Feature({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="bg-[var(--color-bg-elev)] p-6 transition-colors hover:bg-[color-mix(in_srgb,var(--color-bg-row)_45%,var(--color-bg-elev))]">
      <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
        <Icon size={16} />
      </span>
      <h3 className="mt-4 text-[14px] font-medium text-[var(--color-fg)]">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">{body}</p>
    </div>
  );
}

/* ----------------------------------------------------------- how it works */

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "01",
    title: "Define your monitors",
    body: "Pick a probe type and target, or write the DSL. Set an interval and the regions to run from.",
  },
  {
    n: "02",
    title: "Probe from regions",
    body: "Workers claim due checks, probe on schedule, and stream results into the time-series store.",
  },
  {
    n: "03",
    title: "Publish a status page",
    body: "Rules decide up / degraded / down. Group monitors and share a page on your own domain.",
  },
];

function HowItWorks() {
  return (
    <section className="border-t border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-bg-elev)_55%,var(--color-bg))]">
      <Reveal className="mx-auto max-w-[1080px] px-6 py-20 sm:py-24">
        <p className="mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
          How it works
        </p>
        <h2 className="mt-4 max-w-[520px] text-[28px] font-medium leading-[1.1] tracking-[-0.03em] text-[var(--color-fg)] sm:text-[34px]">
          From zero to a shared status page.
        </h2>

        <div className="mt-10 grid gap-px overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-[var(--color-bg-elev)] p-6">
              <span className="mono tabular text-[13px] font-medium text-[var(--color-accent)]">
                {s.n}
              </span>
              <h3 className="mt-3 text-[15px] font-medium text-[var(--color-fg)]">{s.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------ status page preview */

const STATUS_GROUPS: {
  name: string;
  monitors: { name: string; kind: string; status: MonitorStatus; uptime: string }[];
}[] = [
  {
    name: "API",
    monitors: [
      { name: "api.acme.com", kind: "HTTP", status: "up", uptime: "100.00%" },
      { name: "auth.acme.com", kind: "HTTP", status: "up", uptime: "99.98%" },
    ],
  },
  {
    name: "Data",
    monitors: [
      { name: "postgres-primary", kind: "Postgres", status: "up", uptime: "99.99%" },
      { name: "redis-cache", kind: "Redis", status: "degraded", uptime: "99.41%" },
    ],
  },
];

/** Deterministic ~45-day history so the preview is stable across renders. */
function historyFor(status: MonitorStatus): MonitorStatus[] {
  return Array.from({ length: 45 }).map((_, i) => {
    if (status === "degraded") {
      if (i === 41) return "down";
      if (i >= 42) return "degraded";
    }
    if (status === "up" && i === 19) return "degraded";
    return "up";
  });
}

function StatusPagePreview() {
  return (
    <section className="mx-auto max-w-[1080px] px-6 py-20 sm:py-24">
      <Reveal className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-14">
        <div>
          <p className="mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            Status pages
          </p>
          <h2 className="mt-4 text-[28px] font-medium leading-[1.1] tracking-[-0.03em] text-[var(--color-fg)] sm:text-[34px]">
            A page your users will trust.
          </h2>
          <p className="mt-4 max-w-[420px] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
            Every monitor rolls up into a clean public page with day-by-day history, grouped
            sections, and your own branding — on a slug or a verified custom domain.
          </p>
        </div>

        <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-lg)]">
          {/* page header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: "var(--color-accent)" }}
              />
              <span className="text-[14px] font-semibold tracking-tight text-[var(--color-fg)]">
                Acme Status
              </span>
            </div>
            <span className="tabular text-[11px] text-[var(--color-fg-dim)]">updated just now</span>
          </div>

          {/* operational banner */}
          <div
            className="flex items-center gap-2.5 px-5 py-3.5"
            style={{
              background: "color-mix(in srgb, var(--color-ok) 9%, transparent)",
              borderBottom: "1px solid color-mix(in srgb, var(--color-ok) 22%, var(--color-border))",
            }}
          >
            <span className="relative flex h-2 w-2">
              <span
                className="pulse-dot absolute inline-flex h-full w-full rounded-full"
                style={{ background: "var(--color-ok)" }}
              />
              <span
                className="relative inline-flex h-2 w-2 rounded-full"
                style={{ background: "var(--color-ok)" }}
              />
            </span>
            <span className="text-[13px] font-medium" style={{ color: "var(--color-ok)" }}>
              All systems operational
            </span>
          </div>

          {/* groups */}
          <div className="px-5 py-4">
            {STATUS_GROUPS.map((group) => (
              <div key={group.name} className="mb-5 last:mb-0">
                <div className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
                  {group.name}
                </div>
                <div className="space-y-3">
                  {group.monitors.map((m) => (
                    <StatusRow key={m.name} {...m} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function StatusRow({
  name,
  kind,
  status,
  uptime,
}: {
  name: string;
  kind: string;
  status: MonitorStatus;
  uptime: string;
}) {
  const color = STATUS_COLOR[status];
  const history = historyFor(status);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate text-[13px] font-medium text-[var(--color-fg)]">{name}</span>
          <span className="mono shrink-0 text-[10px] text-[var(--color-fg-dim)]">{kind}</span>
        </div>
        <span className="tabular shrink-0 text-[11px]" style={{ color }}>
          {uptime}
        </span>
      </div>
      <div className="flex items-center gap-[2px]">
        {history.map((s, i) => (
          <span
            key={i}
            className="h-[22px] flex-1 rounded-[1px]"
            style={{
              background: `color-mix(in srgb, ${STATUS_COLOR[s]} ${s === "up" ? 50 : 100}%, transparent)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- cta band */

function CtaBand() {
  const nav = useNavigate();
  return (
    <section className="mx-auto max-w-[1080px] px-6 pb-24">
      <Reveal>
        <div className="relative overflow-hidden rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--color-accent)_30%,var(--color-border))] bg-[var(--color-bg-elev)] px-6 py-12 text-center shadow-[var(--shadow-md)] sm:px-10 sm:py-16">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(60% 80% at 50% 0%, color-mix(in srgb, var(--color-accent) 12%, transparent), transparent 72%)",
            }}
          />
          <div className="relative">
            <h2 className="mx-auto max-w-[440px] text-[26px] font-medium leading-[1.1] tracking-[-0.03em] text-[var(--color-fg)] sm:text-[32px]">
              Start monitoring in minutes.
            </h2>
            <p className="mx-auto mt-3 max-w-[420px] text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
              Spin up your first monitor on the free tier — no credit card, no agent to install.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="primary"
                size="lg"
                onClick={() => nav({ to: "/signup" })}
                className="gap-2"
              >
                Get started
                <ArrowRight size={15} />
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => window.open(GITHUB_URL, "_blank", "noopener,noreferrer")}
              >
                View on GitHub
              </Button>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------ scroll reveal */

function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn("reveal", shown && "reveal-in", className)}>
      {children}
    </div>
  );
}
