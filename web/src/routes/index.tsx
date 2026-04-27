import { Link, createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { joinWaitlist } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: ComingSoonPage,
});

type RoadmapState = "done" | "now" | "next";
type RoadmapItem = { state: RoadmapState; label: string; when: string };

const ROADMAP: RoadmapItem[] = [
  { state: "done", label: "Auth + email verification (Resend)", when: "Done" },
  { state: "done", label: "Issues, statuses, priorities", when: "Done" },
  { state: "now", label: "Keyboard-first command palette", when: "In progress" },
  { state: "next", label: "Self-hosted Docker image", when: "Q2 26" },
  { state: "next", label: "Public beta", when: "Q2 26" },
];

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
        <nav className="flex items-center gap-[22px]">
          <a
            href="https://github.com/lassejlv/produktive"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12.5px] text-fg-muted transition-colors hover:text-fg"
          >
            GitHub
          </a>
          <Link
            to="/login"
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-[12.5px] text-fg transition-colors hover:border-[#33333a] hover:bg-surface-2"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <section className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-[640px] text-center">
          <h1
            className="animate-fade-up text-balance text-[clamp(36px,6.2vw,60px)] font-semibold leading-[1.04] tracking-[-0.035em] text-fg"
            style={{ animationDelay: "60ms" }}
          >
            Ship faster.
            <br />
            <span className="bg-gradient-to-b from-white to-[#b8b8be] bg-clip-text text-transparent">
              Track less.
            </span>
          </h1>

          <p
            className="animate-fade-up mx-auto mt-[18px] max-w-[480px] text-pretty text-[15.5px] leading-[1.55] text-fg-muted"
            style={{ animationDelay: "120ms" }}
          >
            Produktive is the issue tracker that gets out of your way. Coming
            soon.
          </p>

          <div className="animate-fade-up" style={{ animationDelay: "180ms" }}>
            <EmailForm ctaLabel="Notify me" />
          </div>

          <div
            className="animate-fade-up mt-[44px]"
            style={{ animationDelay: "300ms" }}
          >
            <Roadmap items={ROADMAP} />
          </div>
        </div>
      </section>

      <footer className="flex flex-col items-center justify-between gap-2.5 px-7 py-5 text-[11.5px] text-fg-faint sm:flex-row">
        <span>© 2026 Produktive</span>
        <div className="flex gap-[18px]">
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="transition-colors hover:text-fg-muted"
          >
            Privacy
          </a>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="transition-colors hover:text-fg-muted"
          >
            Terms
          </a>
          <a
            href="mailto:hello@produktive.app"
            className="transition-colors hover:text-fg-muted"
          >
            hello@produktive.app
          </a>
        </div>
      </footer>
    </main>
  );
}

type FormStatus =
  | { type: "idle"; msg: "" }
  | { type: "success"; msg: string }
  | { type: "error"; msg: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EmailForm({ ctaLabel }: { ctaLabel: string }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<FormStatus>({ type: "idle", msg: "" });

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
      setStatus({
        type: "success",
        msg: "Thanks — you're on the list. We'll be in touch.",
      });
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
        className="mx-auto mt-8 flex max-w-[420px] flex-col items-stretch gap-2 sm:flex-row sm:items-center"
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
            "placeholder:text-fg-faint",
            "focus:border-[#3a4d8a] focus:bg-surface-2",
          )}
        />
        <button
          type="submit"
          disabled={submitting}
          className={cn(
            "inline-flex h-[38px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-fg px-4 text-[13.5px] font-medium text-bg transition-colors",
            "hover:bg-white active:translate-y-px",
            "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-fg",
            "sm:w-auto",
          )}
        >
          {submitting ? "Adding…" : ctaLabel}
          {!submitting && (
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12,5 19,12 12,19" />
            </svg>
          )}
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

function Roadmap({ items }: { items: RoadmapItem[] }) {
  return (
    <div className="mx-auto max-w-[560px] text-left">
      <div className="mb-3.5 text-center text-[11.5px] font-medium uppercase tracking-[0.08em] text-fg-faint">
        Roadmap
      </div>
      <div className="grid gap-px overflow-hidden rounded-[10px] border border-border-subtle bg-border-subtle">
        {items.map((it, i) => (
          <div
            key={i}
            className="flex items-center gap-3.5 bg-surface px-4 py-[13px] text-[13.5px]"
          >
            <RoadmapDot state={it.state} />
            <span
              className={cn(
                "flex-1",
                it.state === "done" ? "text-fg-muted" : "text-fg",
              )}
            >
              {it.label}
            </span>
            <span className="font-mono text-[11px] text-fg-faint">
              {it.when}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoadmapDot({ state }: { state: RoadmapState }) {
  if (state === "done") {
    return (
      <span className="relative grid size-3.5 shrink-0 place-items-center rounded border-[1.5px] border-success bg-success">
        <svg
          width="9"
          height="9"
          viewBox="0 0 14 14"
          fill="none"
          stroke="#0d0d0f"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="3,7.5 6,10.5 11,4.5" />
        </svg>
      </span>
    );
  }
  if (state === "now") {
    return (
      <span
        className="size-3.5 shrink-0 rounded border-[1.5px] border-warning"
        style={{
          background:
            "conic-gradient(var(--color-warning) 60%, transparent 0)",
        }}
        aria-hidden
      />
    );
  }
  return (
    <span
      className="size-3.5 shrink-0 rounded border-[1.5px] border-fg-muted"
      aria-hidden
    />
  );
}
