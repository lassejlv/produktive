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
  github?: "oauth_error";
  twoFactor?: "1";
};

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    invite: typeof search.invite === "string" ? search.invite : undefined,
    email: typeof search.email === "string" ? search.email : undefined,
    mode: search.mode === "signin" || search.mode === "signup" ? search.mode : undefined,
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    github: search.github === "oauth_error" ? search.github : undefined,
    twoFactor: search.twoFactor === "1" ? "1" : undefined,
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
  const [twoFactorPending, setTwoFactorPending] = useState(search.twoFactor === "1");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [error, setError] = useState<string | null>(
    search.github === "oauth_error" ? "Could not sign in with GitHub." : null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const startGithubAuth = () => {
    setError(null);
    setMessage(null);

    if (mode === "signup" && !acceptedLegal) {
      setError("Accept the terms to continue.");
      return;
    }

    window.location.assign(
      authClient.signIn.githubUrl({
        invite: inviteToken,
        redirect: search.redirect,
      }),
    );
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (twoFactorPending) {
      if (!twoFactorCode.trim()) {
        setError("Enter your authentication code.");
        return;
      }

      setIsSubmitting(true);
      const result = await authClient.verifyTwoFactorLogin({
        code: twoFactorCode,
        rememberDevice,
      });
      setIsSubmitting(false);

      if (result.error) {
        setError("Invalid authentication code.");
        return;
      }

      await finishSignIn();
      return;
    }

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

    if ("twoFactorRequired" in result && result.twoFactorRequired) {
      setTwoFactorPending(true);
      setTwoFactorCode("");
      setMessage("Enter the code from your authenticator app.");
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

    await finishSignIn();
  };

  const finishSignIn = async () => {
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
    setTwoFactorPending(false);
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
          {twoFactorPending ? (
            <>
              <div>
                <h1 className="text-sm font-medium text-fg">Two-factor authentication</h1>
                <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                  {useBackupCode
                    ? "Use one of your saved recovery codes."
                    : "Enter the 6-digit code from your authenticator app."}
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="two-factor-code">
                  {useBackupCode ? "Backup code" : "Authentication code"}
                </Label>
                <Input
                  id="two-factor-code"
                  inputMode={useBackupCode ? "text" : "numeric"}
                  autoComplete="one-time-code"
                  value={twoFactorCode}
                  onChange={(event) => setTwoFactorCode(event.target.value)}
                  placeholder={useBackupCode ? "ABCD-1234" : "123456"}
                  required
                  autoFocus
                />
              </div>
              <button
                type="button"
                className="w-fit text-xs text-fg-muted transition-colors hover:text-fg"
                onClick={() => {
                  setUseBackupCode((value) => !value);
                  setTwoFactorCode("");
                }}
              >
                {useBackupCode ? "Use authenticator code" : "Use backup code"}
              </button>
              <label className="flex items-start gap-2 text-xs text-fg-muted">
                <input
                  type="checkbox"
                  className="mt-0.5 size-3.5 rounded border-border-subtle"
                  checked={rememberDevice}
                  onChange={(event) => setRememberDevice(event.target.checked)}
                />
                <span>Trust this device for 30 days</span>
              </label>
            </>
          ) : mode === "signup" ? (
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

          {!twoFactorPending ? (
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
          ) : null}

          {!twoFactorPending ? (
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
          ) : null}

          {!twoFactorPending && mode === "signup" ? (
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

          {!twoFactorPending ? (
            <button
              type="button"
              onClick={startGithubAuth}
              disabled={isSubmitting}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border-subtle bg-transparent px-4 text-[13px] font-medium text-fg transition-colors hover:border-border hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GitHubIcon />
              Continue with GitHub
            </button>
          ) : null}

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="inline-block size-3 animate-spin rounded-full border-2 border-bg/30 border-t-bg" />
                {twoFactorPending
                  ? "Verifying…"
                  : mode === "signin"
                    ? "Signing in…"
                    : "Creating account…"}
              </span>
            ) : twoFactorPending ? (
              "Verify"
            ) : mode === "signin" ? (
              "Sign in"
            ) : (
              "Create account"
            )}
          </Button>
        </form>

        <div className="mt-6 text-center text-xs text-fg-muted">
          {twoFactorPending ? (
            <button
              type="button"
              className="text-fg hover:underline underline-offset-4"
              onClick={() => {
                setTwoFactorPending(false);
                setTwoFactorCode("");
                setMessage(null);
              }}
            >
              Back to sign in
            </button>
          ) : mode === "signin" ? (
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

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.67 0 8.2c0 3.62 2.29 6.7 5.47 7.79.4.08.55-.18.55-.4 0-.2-.01-.86-.01-1.56-2.01.38-2.53-.5-2.69-.96-.09-.23-.48-.96-.82-1.15-.28-.16-.68-.55-.01-.56.63-.01 1.08.59 1.23.83.72 1.24 1.87.89 2.33.68.07-.53.28-.89.51-1.1-1.78-.21-3.64-.91-3.64-4.04 0-.89.31-1.62.82-2.2-.08-.2-.36-1.04.08-2.16 0 0 .67-.22 2.2.84A7.43 7.43 0 0 1 8 3.94c.68 0 1.36.09 2 .27 1.53-1.06 2.2-.84 2.2-.84.44 1.12.16 1.96.08 2.16.51.58.82 1.31.82 2.2 0 3.14-1.87 3.83-3.65 4.04.29.26.54.75.54 1.52 0 1.1-.01 1.98-.01 2.25 0 .22.15.48.55.4A8.12 8.12 0 0 0 16 8.2C16 3.67 12.42 0 8 0Z" />
    </svg>
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
