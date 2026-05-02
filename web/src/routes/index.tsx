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
        <img
          src="https://cdn.produktive.app/assets/landing.webp"
          alt=""
          decoding="async"
          fetchPriority="high"
          className="animate-ken-burns absolute inset-0 h-full w-full object-cover object-[center_65%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-bg/0 via-bg/15 to-bg" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 50%, transparent 0%, rgba(13,13,15,0.55) 100%)",
          }}
        />
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
              to={isLoggedIn ? "/issues" : "/login"}
              className="rounded-full px-3 py-1 text-[12.5px] text-fg/70 transition-colors hover:text-fg"
            >
              {isLoggedIn ? "Open app" : "Sign in"}
            </Link>
          </div>
        </nav>
      </header>

      <section className="relative z-10 flex flex-1 items-center justify-center px-6 pb-12 pt-24">
        <div className="w-full max-w-[760px] text-center lg:-translate-y-[3%]">
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
            className="animate-fade-up mx-auto mt-5 max-w-[420px] text-pretty text-[16px] leading-[1.55] text-fg/80"
            style={{ animationDelay: "240ms" }}
          >
            The issue tracker that gets out of your way.
          </p>

          <div
            className="animate-fade-up mt-8 flex flex-wrap items-center justify-center gap-2.5"
            style={{ animationDelay: "320ms" }}
          >
            <Link
              to={isLoggedIn ? "/issues" : "/login"}
              className={cn(
                "inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-fg px-6 text-[13px] font-medium text-bg transition-colors",
                "hover:bg-white",
              )}
            >
              {isLoggedIn ? "Open app" : "Get started"}
              <span aria-hidden>↗</span>
            </Link>
          </div>

          <p
            className="animate-fade-up mt-4 text-[12px] text-fg/55"
            style={{ animationDelay: "400ms" }}
          >
            Built for focused teams.
          </p>
        </div>
      </section>

      <footer className="relative z-10 px-7 pb-4 text-center text-[11px] text-fg/40">
        © 2026 Produktive
      </footer>
    </main>
  );
}
