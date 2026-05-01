import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

type LoginSearch = {
  invite?: string;
  email?: string;
  mode?: "signin" | "signup";
  redirect?: string;
};

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    invite: typeof search.invite === "string" ? search.invite : undefined,
    email: typeof search.email === "string" ? search.email : undefined,
    mode: search.mode === "signin" || search.mode === "signup" ? search.mode : undefined,
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
});

type AuthMode = "signin" | "signup";
type NoticeVariant = "error" | "info";

function LoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const inviteToken = search.invite ?? null;
  const [mode, setMode] = useState<AuthMode>(search.mode ?? (inviteToken ? "signup" : "signin"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState(search.email ?? "");
  const [password, setPassword] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (mode === "signup" && !acceptedLegal) {
      setError("Accept the terms to continue.");
      return;
    }

    setIsSubmitting(true);

    const result =
      mode === "signin"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name });

    setIsSubmitting(false);

    if (result.error) {
      setError(formatAuthError(result.error.message, mode));
      return;
    }

    if (mode === "signup") {
      setMessage(
        inviteToken
          ? "Check your email, then return to accept the invite."
          : "Check your email to verify your account.",
      );
      return;
    }

    if (inviteToken) {
      await navigate({
        to: "/invite/$token",
        params: { token: inviteToken },
      });
      return;
    }

    if (search.redirect?.startsWith("/") && !search.redirect.startsWith("//")) {
      window.location.assign(search.redirect);
      return;
    }

    await navigate({ to: "/chat" });
  };

  const onForgotPassword = async () => {
    setError(null);
    setMessage(null);

    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }

    const result = await authClient.requestPasswordReset({ email });

    if (result.error) {
      setError("Could not send reset link.");
      return;
    }

    setMessage("If the email exists, a reset link was sent.");
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError(null);
    setMessage(null);
  };

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-bg px-6 py-12">
      <div aria-hidden className="absolute inset-0 -z-10">
        <img
          src="https://cdn.produktive.app/assets/landing.webp"
          alt=""
          decoding="async"
          fetchPriority="high"
          className="animate-ken-burns absolute inset-0 h-full w-full object-cover object-[center_65%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-bg/10 via-bg/55 to-bg" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 55% at 50% 50%, rgba(13,13,15,0.2) 0%, rgba(13,13,15,0.76) 100%)",
          }}
        />
      </div>

      <div className="w-full max-w-sm animate-fade-in rounded-[12px] border border-white/10 bg-bg/72 p-5 backdrop-blur-xl">
        <form className="grid gap-4" onSubmit={onSubmit}>
          {mode === "signup" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="name">Name</Label>
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

          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="john@doe.gg"
              required
              readOnly={Boolean(inviteToken && mode === "signup")}
            />
            {inviteToken && mode === "signup" ? (
              <p className="text-[11px] text-fg-faint">The invitation is for this email.</p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              {mode === "signin" ? (
                <button
                  type="button"
                  className="text-xs text-fg-muted hover:text-fg transition-colors"
                  onClick={() => void onForgotPassword()}
                >
                  Forgot password?
                </button>
              ) : null}
            </div>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              required
            />
          </div>

          {mode === "signup" ? (
            <div className="flex gap-3 border-y border-border-subtle py-3">
              <Label htmlFor="legal-acceptance" className="sr-only">
                Legal agreement
              </Label>
              <input
                id="legal-acceptance"
                type="checkbox"
                checked={acceptedLegal}
                onChange={(event) => setAcceptedLegal(event.target.checked)}
                required
                className="mt-0.5 size-3.5 shrink-0 accent-fg"
              />
              <p className="text-[11.5px] leading-[1.65] text-fg-muted">
                I agree to the{" "}
                <Link
                  to="/legal/$type"
                  params={{ type: "terms" }}
                  className="text-fg transition-colors hover:text-accent"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  to="/legal/$type"
                  params={{ type: "privacy" }}
                  className="text-fg transition-colors hover:text-accent"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          ) : null}

          {error ? <LoginNotice variant="error" message={error} /> : null}
          {message ? <LoginNotice variant="info" message={message} /> : null}

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="inline-block size-3 animate-spin rounded-full border-2 border-bg/30 border-t-bg" />
                {mode === "signin" ? "Signing in…" : "Creating account…"}
              </span>
            ) : mode === "signin" ? (
              "Sign in"
            ) : (
              "Create account"
            )}
          </Button>
        </form>

        <div className="mt-6 text-center text-xs text-fg-muted">
          {mode === "signin" ? (
            <>
              Don't have an account?{" "}
              <button
                type="button"
                className="text-fg hover:underline underline-offset-4"
                onClick={() => switchMode("signup")}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="text-fg hover:underline underline-offset-4"
                onClick={() => switchMode("signin")}
              >
                Sign in
              </button>
            </>
          )}
        </div>

        <div className="mt-6 text-center text-xs text-fg-faint">
          <Link to="/" className="hover:text-fg-muted transition-colors">
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}

function LoginNotice({ variant, message }: { variant: NoticeVariant; message: string }) {
  return (
    <p
      className={
        variant === "error"
          ? "border-t border-danger/25 pt-2 text-xs text-danger"
          : "border-t border-border-subtle pt-2 text-xs text-fg-muted"
      }
      role={variant === "error" ? "alert" : "status"}
    >
      {message}
    </p>
  );
}

function formatAuthError(message: string | undefined, mode: AuthMode): string {
  if (message?.toLowerCase().includes("verify your email")) {
    return "Verify your email before signing in.";
  }

  return mode === "signin" ? "Could not sign in." : "Could not create account.";
}
