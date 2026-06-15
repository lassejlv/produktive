import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "#/lib/toast";
import { Button } from "#/components/ui/button";
import { Input } from "../components/Input";
import { auth } from "../lib/api";
import { BRAND_NAME, BRAND_TAGLINE } from "../lib/brand";
import { parseLoginRedirect } from "../lib/redirect";
import { useLogin } from "../lib/queries";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (s: Record<string, unknown>): { redirect?: string; oauth_token?: string } => {
    const path = parseLoginRedirect(s.redirect);
    const token = typeof s.oauth_token === "string" ? s.oauth_token : undefined;
    return {
      ...(path === "/" ? {} : { redirect: path }),
      ...(token ? { oauth_token: token } : {}),
    };
  },
});

function LoginPage() {
  const nav = useNavigate();
  const { redirect: redirectTo = "/", oauth_token: oauthToken } = useSearch({ from: "/login" });
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!oauthToken) return;
    auth.set(oauthToken);
    toast.success("Signed in");
    nav({ href: redirectTo, replace: true });
  }, [nav, oauthToken, redirectTo]);

  const githubLoginHref = `/api/auth/github/start${
    redirectTo === "/" ? "" : `?redirect=${encodeURIComponent(redirectTo)}`
  }`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-6">
      <div className="w-full max-w-[360px]">
        <div className="mb-8">
          <Link
            to="/"
            className="text-[15px] font-semibold tracking-tight text-[var(--color-fg)] no-underline"
          >
            {BRAND_NAME}
          </Link>
          <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">{BRAND_TAGLINE}</p>
        </div>

        <h1 className="mb-6 text-[20px] font-semibold tracking-tight text-[var(--color-fg)]">
          Sign in
        </h1>

        <Button
          render={<a href={githubLoginHref} />}
          variant="secondary"
          size="lg"
          className="w-full"
        >
          <GitHubMark />
          Continue with GitHub
        </Button>

        <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
          <span className="h-px flex-1 bg-[var(--color-border)]" />
          <span>Email</span>
          <span className="h-px flex-1 bg-[var(--color-border)]" />
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
            variant="default"
            size="lg"
            type="submit"
            loading={login.isPending}
            className="w-full mt-3"
          >
            {login.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="mt-8 text-center text-[13px] text-[var(--color-fg-muted)]">
          No account?{" "}
          <Link
            to="/signup"
            search={redirectTo === "/" ? {} : { redirect: redirectTo }}
            className="link"
          >
            Create one
          </Link>
        </div>
      </div>
    </div>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-current">
      <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.49c-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.45 7.45 0 0 1 8 3.86c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z" />
    </svg>
  );
}
