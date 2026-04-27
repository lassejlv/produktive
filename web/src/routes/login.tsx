import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

type AuthMode = "signin" | "signup";

const cardNumber = String(Math.floor(10000 + Math.random() * 89999));

function FormNotice({
  tone,
  children,
}: {
  tone: "error" | "info";
  children: React.ReactNode;
}) {
  const isError = tone === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      className="animate-ink-bleed flex items-start gap-3 border-l-2 px-3 py-2.5 text-[12px] leading-relaxed"
      style={{
        borderLeftColor: isError ? "var(--color-vermilion)" : "var(--color-moss)",
        background: isError
          ? "rgba(192, 48, 28, 0.06)"
          : "rgba(79, 98, 64, 0.08)",
        color: isError ? "var(--color-vermilion)" : "var(--color-moss)",
      }}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
        {isError ? "Note" : "OK"}
      </span>
      <span className="font-serif italic text-ink-soft">{children}</span>
    </div>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    const result =
      mode === "signin"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name });

    setIsSubmitting(false);

    if (result.error) {
      setError(result.error.message ?? "Authentication failed");
      return;
    }

    if (mode === "signup") {
      setMessage("Check your email to verify your address.");
      return;
    }

    await navigate({ to: "/dashboard" });
  };

  const onForgotPassword = async () => {
    setError(null);
    setMessage(null);

    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }

    const result = await authClient.requestPasswordReset({ email });

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setMessage("If that email exists, a reset link is on the way.");
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError(null);
    setMessage(null);
  };

  return (
    <main className="relative grid min-h-screen w-full grid-cols-1 lg:grid-cols-[1.1fr_minmax(440px,1fr)]">
      {/* Left — editorial column */}
      <section className="relative hidden flex-col justify-between border-r border-ink bg-paper-deep p-10 lg:flex lg:p-16">
        <div className="flex items-center justify-between">
          <Link to="/" className="ink-link font-mono text-[10px] uppercase tracking-[0.2em]">
            ← Produktive
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
            Members' Entrance
          </span>
        </div>

        <div className="animate-type-rise">
          <p className="eyebrow mb-6">A note from the editors</p>
          <h2
            className="serif-tight text-[60px] font-medium leading-[0.92] text-ink xl:text-[78px]"
            style={{ fontWeight: 500 }}
          >
            Pick up the
            <br />
            <span className="serif-italic text-vermilion">key</span>, leave
            <br />
            the door propped.
          </h2>
          <p
            className="mt-8 max-w-[420px] font-serif text-[18px] leading-[1.55] text-ink-soft"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80' }}
          >
            We keep the workshop quiet on purpose. Your account is the latch
            that turns notes into shipped work — nothing more, nothing less.
          </p>
        </div>

        <div className="flex items-end justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
            Card · {cardNumber}
          </div>
          <svg width="60" height="20" viewBox="0 0 60 20" className="text-ink/30">
            <path
              d="M0 10 H22 M38 10 H60 M26 10 L30 4 L34 10 L30 16 Z"
              stroke="currentColor"
              strokeWidth="1"
              fill="none"
            />
          </svg>
        </div>
      </section>

      {/* Right — auth form, designed like a library card */}
      <section className="relative flex items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-[440px] animate-ink-bleed">
          {/* Card border with corner brackets */}
          <div className="relative border border-ink bg-paper-soft">
            {/* corner brackets */}
            <span className="absolute -left-px -top-px h-3 w-3 border-l-2 border-t-2 border-vermilion" />
            <span className="absolute -right-px -top-px h-3 w-3 border-r-2 border-t-2 border-vermilion" />
            <span className="absolute -bottom-px -left-px h-3 w-3 border-b-2 border-l-2 border-vermilion" />
            <span className="absolute -bottom-px -right-px h-3 w-3 border-b-2 border-r-2 border-vermilion" />

            {/* Card header */}
            <div className="border-b border-ink/15 px-7 py-6">
              <div className="mb-4 flex items-center justify-between">
                <span className="eyebrow-ink">Workshop · Form 02</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                  Rev. 04 · 26
                </span>
              </div>
              <h1
                className="serif-tight text-[34px] font-medium leading-[1] tracking-tight text-ink"
                style={{ fontWeight: 500 }}
              >
                {mode === "signin" ? (
                  <>
                    Welcome <span className="serif-italic text-vermilion">back</span>.
                  </>
                ) : (
                  <>
                    Open an <span className="serif-italic text-vermilion">account</span>.
                  </>
                )}
              </h1>
              <p className="mt-2 font-serif text-[14px] italic leading-snug text-ink-muted">
                {mode === "signin"
                  ? "Slide your credentials across the counter."
                  : "Tell us where to send the keys."}
              </p>
            </div>

            {/* Form */}
            <form className="grid gap-5 p-7" onSubmit={onSubmit}>
              {mode === "signup" ? (
                <div className="grid gap-2 animate-ink-bleed">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ada Lovelace"
                    required
                  />
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="email">Correspondence address</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@studio.com"
                  required
                />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Pass phrase</Label>
                  {mode === "signin" ? (
                    <button
                      type="button"
                      className="font-mono text-[10px] uppercase tracking-[0.16em] text-vermilion underline-offset-4 hover:underline"
                      onClick={() => void onForgotPassword()}
                    >
                      Forgot
                    </button>
                  ) : null}
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  required
                />
              </div>

              {error ? <FormNotice tone="error">{error}</FormNotice> : null}
              {message ? <FormNotice tone="info">{message}</FormNotice> : null}

              <Button
                className="mt-2 w-full"
                size="lg"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2.5">
                    <span className="inline-block size-3 animate-mark-spin border-2 border-paper-soft/40 border-t-paper-soft" />
                    {mode === "signin" ? "Opening…" : "Issuing card…"}
                  </span>
                ) : mode === "signin" ? (
                  "Sign in →"
                ) : (
                  "Issue my card →"
                )}
              </Button>
            </form>

            <div className="border-t border-ink/15 px-7 py-4">
              <div className="flex items-center justify-between">
                <span className="font-serif italic text-[13px] text-ink-muted">
                  {mode === "signin"
                    ? "First time at the workshop?"
                    : "Already a card-holder?"}
                </span>
                <button
                  className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink underline underline-offset-4 hover:text-vermilion hover:decoration-vermilion"
                  type="button"
                  onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
                >
                  {mode === "signin" ? "Open account →" : "Sign in →"}
                </button>
              </div>
            </div>
          </div>

          {/* Footer links beneath the card */}
          <div className="mt-6 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted lg:hidden">
            <Link className="ink-link" to="/">
              ← Home
            </Link>
            <Link className="ink-link" to="/dashboard">
              Dashboard →
            </Link>
          </div>
          <p className="mt-6 hidden text-center font-serif text-[12px] italic text-ink-muted lg:block">
            By signing in you agree to keep the door propped for the next reader.
          </p>
        </div>
      </section>
    </main>
  );
}
