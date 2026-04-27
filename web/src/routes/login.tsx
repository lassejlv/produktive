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

    await navigate({ to: "/chat" });
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
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="grid size-9 place-items-center rounded-md bg-fg text-sm font-semibold text-bg">
            P
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-fg">
            {mode === "signin" ? "Sign in to Produktive" : "Create your account"}
          </h1>
          <p className="mt-1.5 text-sm text-fg-muted">
            {mode === "signin"
              ? "Welcome back."
              : "Get started in less than a minute."}
          </p>
        </div>

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
              placeholder="you@company.com"
              required
            />
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

          {error ? (
            <p className="text-xs text-danger" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="text-xs text-fg-muted" role="status">
              {message}
            </p>
          ) : null}

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
