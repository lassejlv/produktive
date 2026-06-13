import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Spinner } from "../components/Spinner";
import { parseLoginRedirect } from "../lib/redirect";
import { useLogin } from "../lib/queries";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => {
    const path = parseLoginRedirect(s.redirect);
    return path === "/" ? {} : { redirect: path };
  },
});

function LoginPage() {
  const nav = useNavigate();
  const { redirect: redirectTo = "/" } = useSearch({ from: "/login" });
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden bg-[var(--color-bg)]">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(60% 50% at 50% 0%, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.35]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0 23px, color-mix(in srgb, var(--color-border) 60%, transparent) 23px 24px), repeating-linear-gradient(90deg, transparent 0 23px, color-mix(in srgb, var(--color-border) 60%, transparent) 23px 24px)",
          maskImage: "radial-gradient(60% 50% at 50% 30%, black, transparent 80%)",
        }}
      />
      <div className="w-full max-w-[380px] relative">
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-10">
            <span
              className="inline-block w-2 h-2 rounded-full pulse-dot"
              style={{
                background: "var(--color-accent)",
                boxShadow: "0 0 12px color-mix(in srgb, var(--color-accent) 60%, transparent)",
              }}
            />
            <span className="text-[15px] font-semibold tracking-tight text-[var(--color-fg)]">
              unstatus
            </span>
          </div>
          <h1 className="text-[26px] leading-[1.15] tracking-tight font-medium text-[var(--color-fg)]">
            Welcome back
          </h1>
          <p className="text-[var(--color-fg-muted)] text-[13.5px] mt-2">
            Sign in to continue to your workspace.
          </p>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate(
              { email, password },
              {
                onSuccess: () => {
                  toast.success("Signed in");
                  nav({ href: redirectTo, replace: true });
                },
                onError: (err) => toast.error((err as Error).message),
              },
            );
          }}
        >
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {login.error && (
            <div className="text-[var(--color-err)] text-[12px] -mt-1">
              {(login.error as Error).message}
            </div>
          )}

          <Button
            variant="primary"
            size="lg"
            type="submit"
            disabled={login.isPending}
            className="w-full mt-3"
          >
            {login.isPending && <Spinner size={13} thickness={2} />}
            {login.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="mt-8 text-[13px] text-[var(--color-fg-muted)] text-center">
          No account?{" "}
          <Link to="/signup" className="link">
            Create one
          </Link>
        </div>
      </div>
    </div>
  );
}
