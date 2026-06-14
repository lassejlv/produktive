import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "../components/Button";
import { PublicStatusByDomain } from "../components/status/PublicStatusByDomain";
import { MarketingShell } from "../components/marketing/MarketingShell";
import { auth } from "../lib/api";
import { customStatusDomain } from "../lib/custom-domain";
import { workspacesQuery } from "../lib/queries";
import { STATUS_COLOR } from "../lib/status";
import type { MonitorStatus } from "../lib/types";

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
  const nav = useNavigate();

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
      <section className="max-w-[1080px] mx-auto px-6 pt-20 pb-16 sm:pt-24 flex flex-col items-center text-center">
          <h1 className="text-[36px] sm:text-[48px] leading-[1.05] tracking-[-0.02em] font-medium text-[var(--color-fg)] max-w-[680px]">
            Health checks you can version.
          </h1>

          <p className="mt-4 text-[15px] leading-relaxed text-[var(--color-fg-muted)] max-w-[520px]">
            Probe HTTP, TCP, ICMP, Postgres, Redis, and SSH. Map probe results to up, degraded, or
            down in a small DSL. Publish a status page when you are ready.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <Button
              variant="primary"
              size="lg"
              onClick={() => nav({ to: "/signup" })}
              className="gap-2"
            >
              Get started
              <ArrowRight size={15} />
            </Button>
            <Link to="/login" className="link text-[13px]">
              Sign in
            </Link>
          </div>

          <PreviewCard />
        </section>

        <section className="max-w-[1080px] mx-auto px-6 pb-20">
          <div className="grid gap-10 sm:grid-cols-2 sm:gap-12 items-start">
            <div>
              <h2 className="text-[15px] font-medium text-[var(--color-fg)]">Monitor-as-code</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
                Each monitor can carry a DSL source that sets probe config, schedule, and rules.
                Rules run after every check and decide the reported status.
              </p>
            </div>
            <pre className="mono overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-sunken)] p-4 text-[11.5px] leading-[1.55] text-[var(--color-fg)]">
              {DSL_EXAMPLE}
            </pre>
          </div>
        </section>

        <section className="max-w-[1080px] mx-auto px-6 pb-24">
          <div className="grid gap-px sm:grid-cols-3 rounded-[var(--radius-lg)] overflow-hidden border border-[var(--color-border)] bg-[var(--color-border)]">
            <Feature
              title="Six probe types"
              body="HTTP, TCP, ICMP, Postgres, Redis, and SSH. Each monitor runs on its own interval; results land in a time-series store."
            />
            <Feature
              title="Rules after every check"
              body="The DSL maps latency, status codes, and errors to up, degraded, or down — without a separate alert builder."
            />
            <Feature
              title="Status pages"
              body="Group monitors, theme the page, share a slug, or serve it from a verified custom domain."
            />
          </div>
        </section>
      </MarketingShell>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-[var(--color-bg-elev)] p-6">
      <h3 className="text-[14px] font-medium text-[var(--color-fg)]">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">{body}</p>
    </div>
  );
}

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
    <div className="mt-14 w-full max-w-[760px] text-left">
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-md)] overflow-hidden">
        <div className="flex items-center justify-between px-5 h-11 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2.5">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: "var(--color-ok)" }}
            />
            <span className="text-[13px] font-medium text-[var(--color-fg)]">acme · monitors</span>
          </div>
          <span className="text-[11px] text-[var(--color-fg-dim)] tabular">checked 5s ago</span>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {PREVIEW_ROWS.map((row) => (
            <PreviewRow key={row.name} {...row} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewRow({ name, kind, status, latency }: (typeof PREVIEW_ROWS)[number]) {
  const color = STATUS_COLOR[status];
  return (
    <div className="flex items-center gap-4 px-5 h-14">
      <span
        className="inline-block w-2 h-2 rounded-full shrink-0"
        style={{
          background: color,
          boxShadow: `0 0 8px color-mix(in srgb, ${color} 55%, transparent)`,
        }}
      />
      <div className="min-w-0 w-[150px]">
        <div className="text-[13px] font-medium text-[var(--color-fg)] truncate">{name}</div>
        <div className="text-[11px] text-[var(--color-fg-dim)] mono">{kind}</div>
      </div>
      <UptimeBar status={status} className="hidden sm:flex flex-1" />
      <span
        className="ml-auto sm:ml-0 text-[12px] tabular w-[56px] text-right"
        style={{ color: status === "up" ? "var(--color-fg-muted)" : color }}
      >
        {latency}
      </span>
    </div>
  );
}

function UptimeBar({ status, className }: { status: MonitorStatus; className?: string }) {
  return (
    <div className={`items-center gap-[2px] ${className ?? ""}`}>
      {Array.from({ length: 44 }).map((_, i) => {
        const s: MonitorStatus =
          status === "degraded" && i === 38
            ? "down"
            : status === "degraded" && i >= 40
              ? "degraded"
              : "up";
        return (
          <span
            key={i}
            className="flex-1 h-[20px] rounded-[1px]"
            style={{
              background: `color-mix(in srgb, ${STATUS_COLOR[s]} ${
                s === "up" ? 55 : 100
              }%, transparent)`,
            }}
          />
        );
      })}
    </div>
  );
}
