import {
  DiscordIcon,
  FigmaIcon,
  GithubIcon,
  GitlabIcon,
  LoomIcon,
  Notion01Icon,
  SlackIcon,
  StripeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { type RefObject, useEffect, useRef } from "react";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

export { LandingPage };

function useScrollVar(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = rect.height + vh;
      const traveled = vh - rect.top;
      const p = Math.max(0, Math.min(1, traveled / total));
      el.style.setProperty("--p", String(p));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref]);
}

function LandingPage() {
  const session = useSession();
  const isLoggedIn = Boolean(session.data);
  const heroRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  useScrollVar(heroRef);
  useScrollVar(featuresRef);
  useScrollVar(stackRef);
  useScrollVar(ctaRef);

  return (
    <main className="relative isolate flex min-h-screen flex-col overflow-x-hidden bg-bg">
      <header className="fixed inset-x-0 top-4 z-30 px-4">
        <nav
          className={cn(
            "animate-fade-up mx-auto flex max-w-[680px] items-center justify-between rounded-full border border-white/10 bg-bg/40 px-5 py-2.5 backdrop-blur-xl",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
          )}
        >
          <div className="flex items-center gap-2.5">
            <div className="grid size-6 place-items-center rounded-md bg-fg text-[11px] font-semibold tracking-tight text-bg">
              P
            </div>
            <span className="text-[13px] font-medium tracking-tight text-fg">
              Produktive
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Link
              to={isLoggedIn ? "/" : "/login"}
              className="rounded-full px-3 py-1 text-[12.5px] text-fg/70 transition-colors hover:text-fg"
            >
              {isLoggedIn ? "Open app" : "Sign in"}
            </Link>
          </div>
        </nav>
      </header>

      <section
        ref={heroRef}
        className="relative isolate flex min-h-screen flex-col overflow-hidden"
      >
        <div aria-hidden className="absolute inset-0 -z-10">
          <img
            src="https://cdn.produktive.app/assets/landing.webp"
            alt=""
            decoding="async"
            fetchPriority="high"
            className="animate-ken-burns absolute inset-0 h-full w-full object-cover object-[center_65%]"
            style={{
              transform:
                "translateY(calc(var(--p, 0) * 80px)) scale(calc(1 + var(--p, 0) * 0.06))",
              willChange: "transform",
            }}
          />
          <div className="absolute inset-0 bg-linear-to-b from-bg/0 via-bg/15 to-bg" />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 50% 50%, transparent 0%, rgba(13,13,15,0.55) 100%)",
            }}
          />
        </div>

        <div
          className="relative z-10 flex flex-1 items-center justify-center px-6 pb-12 pt-24"
          style={{
            transform: "translateY(calc(var(--p, 0) * -90px))",
            opacity: "calc(1 - max(var(--p, 0) * 2 - 0.3, 0))",
            willChange: "transform, opacity",
          }}
        >
          <div className="w-full max-w-[760px] text-center lg:-translate-y-[3%]">
            <div
              className="animate-fade-up mb-9 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg/70 backdrop-blur-sm"
              style={{ animationDelay: "40ms" }}
            >
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#d99a78] opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-[#d99a78]" />
              </span>
              Public beta
            </div>

            <h1 className="text-balance text-[clamp(48px,8.5vw,108px)] font-semibold leading-[0.95] tracking-[-0.04em] text-fg">
              <span
                className="animate-fade-up block"
                style={{ animationDelay: "80ms" }}
              >
                Ship faster.
              </span>
              <span
                className="animate-fade-up block bg-[linear-gradient(180deg,#ffffff_0%,#f0c5a8_70%,#d99a78_100%)] bg-clip-text text-transparent"
                style={{ animationDelay: "160ms" }}
              >
                Track less.
              </span>
            </h1>

            <p
              className="animate-fade-up mx-auto mt-6 max-w-[420px] text-pretty text-[16px] leading-[1.55] text-fg/80"
              style={{ animationDelay: "240ms" }}
            >
              The issue tracker that gets out of your way.
            </p>

            <div
              className="animate-fade-up mt-9 flex flex-wrap items-center justify-center gap-2"
              style={{ animationDelay: "320ms" }}
            >
              <Link
                to={isLoggedIn ? "/" : "/login"}
                className={cn(
                  "group inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-fg px-5 text-[13px] font-medium text-bg transition-colors",
                  "hover:bg-white",
                )}
              >
                {isLoggedIn ? "Open app" : "Get started"}
                <span
                  aria-hidden
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                >
                  →
                </span>
              </Link>
            </div>

            <p
              className="animate-fade-up mt-10 font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg/40"
              style={{ animationDelay: "400ms" }}
            >
              Built for focused teams
            </p>
          </div>
        </div>

        <div
          aria-hidden
          className="absolute inset-x-0 bottom-7 z-10 flex justify-center"
          style={{ opacity: "calc(1 - var(--p, 0) * 5)" }}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg/45">
            <span className="inline-block animate-bounce">↓</span>
            <span className="ml-2">Scroll</span>
          </span>
        </div>
      </section>

      <FeaturesSection sectionRef={featuresRef} />
      <StackSection sectionRef={stackRef} />
      <ClosingCTA sectionRef={ctaRef} isLoggedIn={isLoggedIn} />

      <footer className="relative z-10 px-7 pb-5 pt-14 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-fg/35">
        © 2026 — Produktive
      </footer>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Features section                                                            */
/* -------------------------------------------------------------------------- */

type Feature = {
  eyebrow: string;
  title: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    eyebrow: "AI agents",
    title: "Chat that ships work",
    body: "Wire MCP tools to agents that read issues, draft PRs, and keep the queue moving.",
  },
  {
    eyebrow: "Notes",
    title: "Docs with a commit log",
    body: "Roll back any change. Inspect real diffs. Notes that remember every shift.",
  },
  {
    eyebrow: "Issues",
    title: "A tracker out of the way",
    body: "Side-pane preview, keyboard nav, real-time updates. A queue you actually want to clear.",
  },
  {
    eyebrow: "Projects",
    title: "Health written by the model",
    body: "Briefs that summarize blockers, risk, and momentum across each project.",
  },
  {
    eyebrow: "Realtime",
    title: "Live across the workspace",
    body: "Comments, status changes, and edits stream in instantly. No refresh, no stale state.",
  },
  {
    eyebrow: "Integrations",
    title: "Where your team already is",
    body: "Two-way sync with GitHub, Slack, Discord, and the rest of the stack.",
  },
];

function FeaturesSection({
  sectionRef,
}: {
  sectionRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <section
      ref={sectionRef}
      className="relative isolate flex min-h-screen items-center justify-center overflow-hidden py-32"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ opacity: "calc(min(max((var(--p, 0) - 0.05) * 3, 0), 1))" }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            maskImage:
              "radial-gradient(ellipse 70% 70% at 50% 45%, black 0%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 70% 70% at 50% 45%, black 0%, transparent 80%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1100px] px-6">
        <div className="max-w-[640px]">
          <span
            className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-fg/45"
            style={{
              opacity: "calc(min(max((var(--p, 0) - 0.16) * 5, 0), 1))",
              transform:
                "translateY(calc((1 - min(max((var(--p, 0) - 0.16) * 5, 0), 1)) * 18px))",
            }}
          >
            Inside the workspace
          </span>
          <h2
            className="mt-5 text-balance text-[clamp(40px,6.2vw,68px)] font-semibold leading-[1.02] tracking-[-0.035em] text-fg"
            style={{
              opacity: "calc(min(max((var(--p, 0) - 0.2) * 5, 0), 1))",
              transform:
                "translateY(calc((1 - min(max((var(--p, 0) - 0.2) * 5, 0), 1)) * 60px))",
            }}
          >
            Everything for shipping fast
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-px rounded-[16px] border border-white/10 bg-white/[0.04] overflow-hidden md:mt-20 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, idx) => (
            <FeatureCard key={feature.title} feature={feature} stagger={idx} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature, stagger }: { feature: Feature; stagger: number }) {
  const threshold = 0.28 + stagger * 0.03;
  const reveal = `min(max((var(--p, 0) - ${threshold}) * 6, 0), 1)`;

  return (
    <article
      className="group relative flex flex-col bg-bg/70 p-7 backdrop-blur-xl transition-colors hover:bg-bg/90"
      style={{
        opacity: `calc(${reveal})`,
        transform: `translateY(calc((1 - ${reveal}) * 24px))`,
      }}
    >
      <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[#d99a78]/80">
        {feature.eyebrow}
      </span>
      <h3 className="mt-4 text-[20px] font-semibold leading-[1.2] tracking-[-0.02em] text-fg">
        {feature.title}
      </h3>
      <p className="mt-3 text-[13.5px] leading-[1.6] text-fg/60">{feature.body}</p>
    </article>
  );
}

const STACK_TILES: Array<{
  icon: IconSvgElement | null;
  label: string;
  stagger: number;
}> = [
  { icon: GithubIcon, label: "GitHub", stagger: 0 },
  { icon: SlackIcon, label: "Slack", stagger: 1 },
  { icon: Notion01Icon, label: "Notion", stagger: 2 },
  { icon: DiscordIcon, label: "Discord", stagger: 3 },
  { icon: null, label: "Produktive", stagger: 8 },
  { icon: GitlabIcon, label: "GitLab", stagger: 4 },
  { icon: LoomIcon, label: "Loom", stagger: 5 },
  { icon: StripeIcon, label: "Stripe", stagger: 6 },
  { icon: FigmaIcon, label: "Figma", stagger: 7 },
];

function StackSection({
  sectionRef,
}: {
  sectionRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <section
      ref={sectionRef}
      className="relative flex min-h-screen items-center justify-center overflow-hidden py-32"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          opacity: "calc(min(max((var(--p, 0) - 0.1) * 3, 0), 1))",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
            maskImage:
              "radial-gradient(ellipse 70% 60% at 50% 50%, black 0%, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 70% 60% at 50% 50%, black 0%, transparent 75%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 55% at 50% 60%, rgba(217,154,120,0.22) 0%, transparent 70%)",
            transform:
              "scale(calc(0.7 + var(--p, 0) * 0.6)) translateY(calc(60px - var(--p, 0) * 120px))",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[1100px] flex-col items-center px-6">
        <span
          className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-fg/45"
          style={{
            opacity: "calc(min(max((var(--p, 0) - 0.18) * 5, 0), 1))",
            transform:
              "translateY(calc((1 - min(max((var(--p, 0) - 0.18) * 5, 0), 1)) * 20px))",
          }}
        >
          Built to fit in
        </span>
        <h2
          className="mt-5 text-balance text-center text-[clamp(40px,6.5vw,76px)] font-semibold leading-[1.02] tracking-[-0.035em] text-fg"
          style={{
            opacity: "calc(min(max((var(--p, 0) - 0.2) * 5, 0), 1))",
            transform:
              "translateY(calc((1 - min(max((var(--p, 0) - 0.2) * 5, 0), 1)) * 80px))",
          }}
        >
          At the center of your stack
        </h2>
        <p
          className="mx-auto mt-5 max-w-[440px] text-center text-[15px] leading-[1.55] text-fg/65"
          style={{
            opacity: "calc(min(max((var(--p, 0) - 0.26) * 5, 0), 1))",
            transform:
              "translateY(calc((1 - min(max((var(--p, 0) - 0.26) * 5, 0), 1)) * 50px))",
          }}
        >
          Two-way sync with the tools your team already uses.
        </p>

        <div className="mt-16 sm:mt-20" style={{ perspective: "1400px" }}>
          <div
            className="grid grid-cols-3 gap-7 sm:gap-10"
            style={{
              transformStyle: "preserve-3d",
              transform:
                "rotateX(calc(86deg - var(--p, 0) * 32deg)) rotateZ(-45deg) scale(calc(0.62 + var(--p, 0) * 0.42))",
            }}
          >
            {STACK_TILES.map((tile) => (
              <StackTile
                key={tile.label}
                icon={tile.icon}
                label={tile.label}
                stagger={tile.stagger}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StackTile({
  icon,
  label,
  stagger,
}: {
  icon: IconSvgElement | null;
  label: string;
  stagger: number;
}) {
  const isCenter = icon === null;
  const threshold = 0.22 + stagger * 0.025;
  const reveal = `min(max((var(--p, 0) - ${threshold}) * 7, 0), 1)`;

  return (
    <div
      className="relative size-[88px] sm:size-[104px]"
      style={{
        transformStyle: "preserve-3d",
        opacity: `calc(${reveal})`,
        transform: `scale(calc(0.85 + ${reveal} * 0.15))`,
      }}
      aria-label={label}
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="absolute inset-0 rounded-[18px] border border-white/10"
          style={{
            transform: `translateZ(${-(i + 1) * 7}px)`,
            opacity: 0.55 - i * 0.06,
          }}
        />
      ))}
      <div
        className={cn(
          "relative grid size-full place-items-center rounded-[18px] border backdrop-blur-md",
          isCenter
            ? "border-[#d99a78]/40 bg-[radial-gradient(ellipse_at_center,rgba(217,154,120,0.22)_0%,rgba(217,154,120,0.04)_70%)] shadow-[0_0_36px_rgba(217,154,120,0.3),inset_0_1px_0_rgba(255,255,255,0.08)]"
            : "border-white/[0.12] bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
        )}
      >
        {isCenter ? (
          <span className="bg-[linear-gradient(180deg,#ffffff_0%,#f0c5a8_70%,#d99a78_100%)] bg-clip-text text-[32px] font-semibold tracking-tight text-transparent">
            P
          </span>
        ) : (
          <HugeiconsIcon
            icon={icon}
            size={36}
            strokeWidth={1.5}
            className="text-fg/85"
          />
        )}
      </div>
    </div>
  );
}

function ClosingCTA({
  sectionRef,
  isLoggedIn,
}: {
  sectionRef: RefObject<HTMLDivElement | null>;
  isLoggedIn: boolean;
}) {
  return (
    <section
      ref={sectionRef}
      className="relative flex min-h-screen items-center justify-center overflow-hidden py-32"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          opacity: "calc(min(max((var(--p, 0) - 0.1) * 3, 0), 1))",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 55% 45% at 50% 55%, rgba(217,154,120,0.2) 0%, transparent 70%)",
            transform:
              "translateY(calc(60px - var(--p, 0) * 100px)) scale(calc(0.85 + var(--p, 0) * 0.25))",
          }}
        />
        <div
          className="absolute inset-x-[12%] top-1/2 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)",
            opacity: "calc(min(max((var(--p, 0) - 0.2) * 4, 0), 1))",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[760px] flex-col items-center px-6 text-center">
        <span
          className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-fg/45"
          style={{
            opacity: "calc(min(max((var(--p, 0) - 0.18) * 5, 0), 1))",
            transform:
              "translateY(calc((1 - min(max((var(--p, 0) - 0.18) * 5, 0), 1)) * 16px))",
          }}
        >
          Get started
        </span>

        <h2 className="mt-5 text-balance text-[clamp(44px,8vw,96px)] font-semibold leading-[0.98] tracking-[-0.04em] text-fg">
          <span
            className="block"
            style={{
              opacity: "calc(min(max((var(--p, 0) - 0.2) * 5, 0), 1))",
              transform:
                "translateY(calc((1 - min(max((var(--p, 0) - 0.2) * 5, 0), 1)) * 60px))",
            }}
          >
            Stop tracking.
          </span>
          <span
            className="block bg-[linear-gradient(180deg,#ffffff_0%,#f0c5a8_70%,#d99a78_100%)] bg-clip-text text-transparent"
            style={{
              opacity: "calc(min(max((var(--p, 0) - 0.28) * 5, 0), 1))",
              transform:
                "translateY(calc((1 - min(max((var(--p, 0) - 0.28) * 5, 0), 1)) * 60px))",
            }}
          >
            Start shipping.
          </span>
        </h2>

        <div
          className="mt-10 flex flex-wrap items-center justify-center gap-2"
          style={{
            opacity: "calc(min(max((var(--p, 0) - 0.36) * 5, 0), 1))",
            transform:
              "translateY(calc((1 - min(max((var(--p, 0) - 0.36) * 5, 0), 1)) * 40px))",
          }}
        >
          <Link
            to={isLoggedIn ? "/" : "/login"}
            className={cn(
              "group inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-fg px-6 text-[13px] font-medium text-bg transition-colors",
              "hover:bg-white",
            )}
          >
            {isLoggedIn ? "Open app" : "Get started"}
            <span
              aria-hidden
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            >
              →
            </span>
          </Link>
        </div>

        <p
          className="mt-8 font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg/40"
          style={{
            opacity: "calc(min(max((var(--p, 0) - 0.42) * 5, 0), 1))",
          }}
        >
          It takes 30 seconds
        </p>
      </div>
    </section>
  );
}
