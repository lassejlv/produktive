import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

type AuthMode = "signin" | "signup";

function AuthError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-red-900/30 bg-red-950/20 px-3 py-2.5 text-xs text-red-200 animate-fade-in">
      <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      <span className="leading-relaxed">{message}</span>
    </div>
  );
}

function AuthSuccess({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-emerald-900/30 bg-emerald-950/20 px-3 py-2.5 text-xs text-emerald-200 animate-fade-in">
      <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="leading-relaxed">{message}</span>
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
      setMessage("Account created. Check your email to verify your address.");
      return;
    }

    await navigate({ to: "/dashboard" });
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError(null);
    setMessage(null);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 size-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/[0.06] blur-[140px]" />
        <div className="absolute bottom-1/4 right-1/4 size-[500px] rounded-full bg-blue-500/[0.04] blur-[120px]" />
        <div className="absolute left-1/4 top-1/2 size-[300px] rounded-full bg-violet-500/[0.03] blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-[420px] animate-fade-in-scale">
        {/* Logo */}
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-5 grid size-12 place-items-center rounded-2xl border border-neutral-800 bg-neutral-900/60 backdrop-blur-sm shadow-lg shadow-black/20">
            <span className="text-lg font-bold text-white">P</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to continue to your workspace"
              : "Get started with your new workspace"}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-neutral-800/80 bg-card/80 backdrop-blur-xl shadow-2xl shadow-black/30">
          <div className="p-6">
            <form className="grid gap-4" onSubmit={onSubmit}>
              {mode === "signup" ? (
                <div className="grid gap-2 animate-fade-in">
                  <Label className="text-[11px] font-medium text-neutral-300" htmlFor="name">
                    Full name
                  </Label>
                  <Input
                    className="h-10 text-sm bg-neutral-950/50"
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
                <Label className="text-[11px] font-medium text-neutral-300" htmlFor="email">
                  Email address
                </Label>
                <Input
                  className="h-10 text-sm bg-neutral-950/50"
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  required
                />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-medium text-neutral-300" htmlFor="password">
                    Password
                  </Label>
                  {mode === "signin" ? (
                    <button
                      type="button"
                      className="text-[11px] text-indigo-400 transition-colors hover:text-indigo-300"
                      onClick={() => setMessage("Contact support to reset your password.")}
                    >
                      Forgot password?
                    </button>
                  ) : null}
                </div>
                <Input
                  className="h-10 text-sm bg-neutral-950/50"
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

              {error ? <AuthError message={error} /> : null}
              {message ? <AuthSuccess message={message} /> : null}

              <Button
                className="mt-1 h-10 w-full text-sm font-medium shadow-lg shadow-indigo-500/10 transition-all hover:shadow-indigo-500/20"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-neutral-400 border-t-white" />
                    {mode === "signin" ? "Signing in..." : "Creating account..."}
                  </span>
                ) : mode === "signin" ? (
                  "Sign in"
                ) : (
                  "Create account"
                )}
              </Button>
            </form>
          </div>

          {/* Footer */}
          <div className="border-t border-border px-6 py-4">
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              {mode === "signin" ? (
                <>
                  <span>Don't have an account?</span>
                  <button
                    className="font-medium text-indigo-400 transition-colors hover:text-indigo-300"
                    type="button"
                    onClick={() => switchMode("signup")}
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  <span>Already have an account?</span>
                  <button
                    className="font-medium text-indigo-400 transition-colors hover:text-indigo-300"
                    type="button"
                    onClick={() => switchMode("signin")}
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Bottom links */}
        <div className="mt-6 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
          <Link className="transition-colors hover:text-foreground" to="/">
            Back to home
          </Link>
          <span className="h-3 w-px bg-border" />
          <Link className="transition-colors hover:text-foreground" to="/dashboard">
            Go to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
