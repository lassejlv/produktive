import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "#/components/ui/button";
import { auth } from "../../lib/api";
import { BRAND_NAME } from "../../lib/brand";
import { useMe, useWorkspaces } from "../../lib/queries";
import { cn } from "#/lib/cn";

const GITHUB_URL = "https://github.com/lassejlv/unstatus";

export function MarketingWordmark({
  linked = true,
  dot = true,
}: {
  linked?: boolean;
  dot?: boolean;
}) {
  const inner = (
    <>
      {dot && (
        <span
          className="inline-block h-2 w-2 rounded-full transition-shadow duration-300 group-hover:shadow-[0_0_10px_color-mix(in_srgb,var(--color-accent)_55%,transparent)]"
          style={{ background: "var(--color-accent)" }}
        />
      )}
      <span className="text-[15px] font-semibold tracking-tight text-[var(--color-fg)]">
        {BRAND_NAME}
      </span>
    </>
  );

  if (!linked) {
    return <div className="flex items-center gap-2">{inner}</div>;
  }

  return (
    <Link to="/" className="group flex items-center gap-2 no-underline">
      {inner}
    </Link>
  );
}

export function MarketingShell({
  children,
  gridMask = "hero",
}: {
  children: ReactNode;
  gridMask?: "hero" | "pricing";
}) {
  const nav = useNavigate();
  const authed = !!auth.token;
  const me = useMe();
  const workspaces = useWorkspaces();
  const workspace =
    workspaces.data?.find((w) => w.is_personal) ?? workspaces.data?.[0] ?? null;
  const signedIn = authed && me.isSuccess;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[var(--color-bg)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0 31px, color-mix(in srgb, var(--color-border) 60%, transparent) 31px 32px), repeating-linear-gradient(90deg, transparent 0 31px, color-mix(in srgb, var(--color-border) 60%, transparent) 31px 32px)",
          maskImage:
            gridMask === "pricing"
              ? "radial-gradient(65% 50% at 50% 0%, black, transparent 82%)"
              : "radial-gradient(70% 55% at 50% 12%, black, transparent 78%)",
        }}
      />
      {gridMask === "pricing" && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(50% 40% at 50% -5%, color-mix(in srgb, var(--color-accent) 14%, transparent), transparent 70%)",
          }}
        />
      )}

      <header className="relative z-10">
        <div className="mx-auto flex h-16 max-w-[1080px] items-center justify-between px-6">
          <MarketingWordmark dot={false} />
          <div className="flex items-center gap-2">
            {signedIn && workspace ? (
              <Button
                variant="default"
                size="sm"
                onClick={() => nav({ to: "/$wid/monitors", params: { wid: workspace.slug } })}
              >
                Dashboard
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => nav({ to: "/login" })}>
                  Sign in
                </Button>
                <Button variant="default" size="sm" onClick={() => nav({ to: "/signup" })}>
                  Get started
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1">{children}</main>

      <footer className="relative z-10 border-t border-[var(--color-border)]">
        <div className="mx-auto flex h-14 max-w-[1080px] items-center justify-between px-6 text-[12px] text-[var(--color-fg-dim)]">
          <MarketingWordmark linked={false} />
          <div className="flex items-center gap-4">
            <a href={GITHUB_URL} className="link" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link to="/pricing" className="link">
              Pricing
            </Link>
            <Link to="/" className="link hidden sm:inline">
              Home
            </Link>
            <span className="tabular">© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function MarketingHero({
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "mx-auto flex max-w-[1080px] flex-col items-center px-6 pb-14 pt-20 text-center sm:pt-24",
        className,
      )}
    >
      {eyebrow && (
        <p className="mb-4 text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)]">
          {eyebrow}
        </p>
      )}
      <h1 className="max-w-[640px] text-[36px] font-medium leading-[1.05] tracking-[-0.03em] text-[var(--color-fg)] sm:text-[48px]">
        {title}
      </h1>
      <p className="mt-4 max-w-[520px] text-[15px] leading-relaxed text-[var(--color-fg-muted)]">
        {description}
      </p>
      {children}
    </section>
  );
}
