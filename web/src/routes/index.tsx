import { Link, createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  const session = useSession();
  const isLoggedIn = Boolean(session.data);

  return (
    <main className="relative isolate flex min-h-screen flex-col overflow-hidden bg-bg">
      <div aria-hidden className="absolute inset-0 -z-10">
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            maskImage:
              "radial-gradient(ellipse 75% 60% at 50% 40%, black 0%, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 75% 60% at 50% 40%, black 0%, transparent 75%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 55% 45% at 50% 58%, rgba(217,154,120,0.22) 0%, rgba(217,154,120,0.07) 38%, transparent 72%)",
          }}
        />
        <div
          className="absolute inset-x-0 bottom-[18%] h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)",
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-b from-transparent to-bg" />
      </div>

      <header className="absolute inset-x-0 top-4 z-20 px-4">
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
              to={isLoggedIn ? "/workspace" : "/login"}
              className="rounded-full px-3 py-1 text-[12.5px] text-fg/70 transition-colors hover:text-fg"
            >
              {isLoggedIn ? "Open app" : "Sign in"}
            </Link>
          </div>
        </nav>
      </header>

      <section className="relative z-10 flex flex-1 items-center justify-center px-6 pb-12 pt-24">
        <div className="w-full max-w-[760px] text-center lg:-translate-y-[3%]">
          <div
            className="animate-fade-up mb-9 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg/70 backdrop-blur-sm"
            style={{ animationDelay: "40ms" }}
          >
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#d99a78] opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-[#d99a78]" />
            </span>
            Now in private beta
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
            className="animate-fade-up mx-auto mt-6 max-w-[420px] text-pretty text-[16px] leading-[1.55] text-fg/70"
            style={{ animationDelay: "240ms" }}
          >
            The issue tracker that gets out of your way.
          </p>

          <div
            className="animate-fade-up mt-9 flex flex-wrap items-center justify-center gap-2"
            style={{ animationDelay: "320ms" }}
          >
            <Link
              to={isLoggedIn ? "/workspace" : "/login"}
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
      </section>

      <footer className="relative z-10 px-7 pb-5 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-fg/35">
        © 2026 — Produktive
      </footer>
    </main>
  );
}
