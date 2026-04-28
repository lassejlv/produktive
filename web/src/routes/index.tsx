import { Link, createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { joinWaitlist } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: ComingSoonPage,
});

function ComingSoonPage() {
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
          <Link
            to={isLoggedIn ? "/issues" : "/login"}
            className="text-[12.5px] text-fg/70 transition-colors hover:text-fg"
          >
            {isLoggedIn ? "Open app" : "Sign in"}
          </Link>
        </nav>
      </header>

      <section className="relative z-10 flex flex-1 items-center justify-center px-6 pb-12 pt-24">
        <div className="w-full max-w-[760px] text-center lg:-translate-y-[3%]">
          <div
            className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[12px] tracking-tight text-fg/85 backdrop-blur-md"
            style={{ animationDelay: "80ms" }}
          >
            <span
              aria-hidden
              className="animate-pulse-glow size-1.5 rounded-full bg-[#f0c5a8]"
            />
            <span>Coming soon · Join the waitlist</span>
          </div>

          <h1 className="mt-6 text-balance text-[clamp(48px,8.5vw,108px)] font-semibold leading-[0.95] tracking-[-0.04em] text-fg">
            <span
              className="animate-fade-up block"
              style={{ animationDelay: "160ms" }}
            >
              Ship faster.
            </span>
            <span
              className="animate-fade-up block bg-[linear-gradient(180deg,#ffffff_0%,#f0c5a8_70%,#d99a78_100%)] bg-clip-text text-transparent"
              style={{ animationDelay: "240ms" }}
            >
              Track less.
            </span>
          </h1>

          <p
            className="animate-fade-up mx-auto mt-5 max-w-[420px] text-pretty text-[16px] leading-[1.55] text-fg/80"
            style={{ animationDelay: "320ms" }}
          >
            The issue tracker that gets out of your way.
          </p>

          <div
            className="animate-fade-up"
            style={{ animationDelay: "400ms" }}
          >
            <EmailForm />
          </div>

          <p
            className="animate-fade-up mt-3 text-[12px] text-fg/55"
            style={{ animationDelay: "480ms" }}
          >
            No card. We'll only email you when we launch.
          </p>
        </div>
      </section>

      <footer className="relative z-10 px-7 pb-4 text-center text-[11px] text-fg/40">
        © 2026 Produktive
      </footer>
    </main>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EmailForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{
    type: "idle" | "success" | "error";
    msg: string;
  }>({ type: "idle", msg: "" });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = email.trim();
    if (!trimmed || !EMAIL_RE.test(trimmed)) {
      setStatus({ type: "error", msg: "Enter a valid email address." });
      return;
    }
    setSubmitting(true);
    setStatus({ type: "idle", msg: "" });
    try {
      await joinWaitlist(trimmed);
      setEmail("");
      setStatus({ type: "success", msg: "You're on the list." });
    } catch (error) {
      setStatus({
        type: "error",
        msg: error instanceof Error ? error.message : "Something went wrong.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form
        onSubmit={onSubmit}
        className={cn(
          "mx-auto mt-7 flex w-full max-w-[440px] items-center gap-1.5 rounded-[14px] border border-white/10 bg-bg/40 p-1.5 backdrop-blur-xl",
          "shadow-[0_8px_30px_rgba(0,0,0,0.35)]",
        )}
      >
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 flex-1 border-0 bg-transparent px-3 text-[14px] text-fg outline-none placeholder:text-fg/40"
        />
        <button
          type="submit"
          disabled={submitting}
          className={cn(
            "inline-flex h-11 items-center gap-1 whitespace-nowrap rounded-[10px] bg-fg px-5 text-[13px] font-medium text-bg transition-colors",
            "hover:bg-white disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {submitting ? (
            "Adding…"
          ) : (
            <>
              Notify me <span aria-hidden>↗</span>
            </>
          )}
        </button>
      </form>
      <div
        role={status.type === "error" ? "alert" : "status"}
        aria-live="polite"
        className={cn(
          "mt-2.5 min-h-4 text-center text-[12px]",
          status.type === "success" && "text-success",
          status.type === "error" && "text-danger",
          status.type === "idle" && "text-fg-muted",
        )}
      >
        {status.msg}
      </div>
    </>
  );
}
