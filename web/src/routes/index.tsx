import { Link, createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { joinWaitlist } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: ComingSoonPage,
});

function ComingSoonPage() {
  return (
    <main className="relative isolate flex min-h-screen flex-col">
      <div className="bg-dotgrid" aria-hidden />

      <header className="flex items-center justify-between px-7 py-5">
        <div className="flex items-center gap-2.5">
          <div className="grid size-6 place-items-center rounded-md bg-fg text-[11px] font-semibold tracking-tight text-bg">
            P
          </div>
          <span className="text-[13px] font-medium tracking-tight text-fg">
            Produktive
          </span>
        </div>
        <Link
          to="/login"
          className="text-[12.5px] text-fg-muted transition-colors hover:text-fg"
        >
          Sign in
        </Link>
      </header>

      <section className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-[520px] text-center">
          <h1
            className="animate-fade-up text-balance text-[clamp(36px,6.2vw,60px)] font-semibold leading-[1.04] tracking-[-0.035em] text-fg"
            style={{ animationDelay: "60ms" }}
          >
            Ship faster.{" "}
            <span className="bg-gradient-to-b from-white to-[#b8b8be] bg-clip-text text-transparent">
              Track less.
            </span>
          </h1>

          <p
            className="animate-fade-up mx-auto mt-4 max-w-[400px] text-pretty text-[15px] leading-[1.55] text-fg-muted"
            style={{ animationDelay: "120ms" }}
          >
            The issue tracker that gets out of your way. Coming soon.
          </p>

          <div className="animate-fade-up" style={{ animationDelay: "180ms" }}>
            <EmailForm />
          </div>
        </div>
      </section>

      <footer className="px-7 py-5 text-center text-[11.5px] text-fg-faint">
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
        className="mx-auto mt-8 flex max-w-[400px] flex-col gap-2 sm:flex-row"
      >
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={cn(
            "h-[38px] w-full flex-1 rounded-lg border border-border bg-surface px-3.5 text-[13.5px] text-fg outline-none transition-colors",
            "placeholder:text-fg-faint focus:border-[#3a4d8a] focus:bg-surface-2",
          )}
        />
        <button
          type="submit"
          disabled={submitting}
          className={cn(
            "h-[38px] whitespace-nowrap rounded-lg bg-fg px-4 text-[13.5px] font-medium text-bg transition-colors",
            "hover:bg-white disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {submitting ? "Adding…" : "Notify me"}
        </button>
      </form>
      <div
        role={status.type === "error" ? "alert" : "status"}
        aria-live="polite"
        className={cn(
          "mt-3 min-h-4 text-center text-xs",
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
