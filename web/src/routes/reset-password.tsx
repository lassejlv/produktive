import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "#/lib/toast";
import { Button } from "#/components/ui/button";
import { Input } from "../components/Input";
import { BRAND_NAME, BRAND_TAGLINE } from "../lib/brand";
import { useResetPassword } from "../lib/queries";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  validateSearch: (s: Record<string, unknown>): { token?: string } => {
    const token = typeof s.token === "string" ? s.token : undefined;
    return token ? { token } : {};
  },
});

function ResetPasswordPage() {
  const nav = useNavigate();
  const search = useSearch({ from: "/reset-password" });
  // Capture the token once, then strip it from the URL so it does not linger in
  // browser history or get captured by access logs on later navigations.
  const [token] = useState(() => search.token);
  const reset = useResetPassword();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);

  useEffect(() => {
    if (search.token) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
  }, [search.token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-6">
      <div className="fade-in w-full max-w-[360px]">
        <div className="mb-8">
          <Link
            to="/"
            className="text-[15px] font-semibold tracking-tight text-[var(--color-fg)] no-underline"
          >
            {BRAND_NAME}
          </Link>
          <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">{BRAND_TAGLINE}</p>
        </div>

        {!token ? (
          <>
            <h1 className="mb-1 text-[20px] font-semibold tracking-tight text-[var(--color-fg)]">
              Invalid reset link
            </h1>
            <p className="mb-6 text-[13px] text-[var(--color-fg-muted)]">
              This password reset link is missing or invalid. Request a new one to continue.
            </p>

            <div className="mt-8 text-center text-[13px] text-[var(--color-fg-muted)]">
              <Link to="/forgot-password" className="link">
                Request a new link
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-[20px] font-semibold tracking-tight text-[var(--color-fg)]">
              Set a new password
            </h1>
            <p className="mb-6 text-[13px] text-[var(--color-fg-muted)]">
              Choose a new password for your account.
            </p>

            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (password !== confirm) {
                  setMismatch(true);
                  return;
                }
                setMismatch(false);
                reset.mutate(
                  { token, password },
                  {
                    onSuccess: () => {
                      toast.success("Password updated");
                      nav({ href: "/", replace: true });
                    },
                    onError: (err) => toast.error((err as Error).message),
                  },
                );
              }}
            >
              <Input
                label="New password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                hint="At least 8 characters."
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (mismatch) setMismatch(false);
                }}
              />
              <Input
                label="Confirm password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="••••••••"
                value={confirm}
                error={mismatch ? "Passwords do not match." : undefined}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  if (mismatch) setMismatch(false);
                }}
              />

              <Button
                variant="default"
                size="lg"
                type="submit"
                loading={reset.isPending}
                className="mt-3 w-full"
              >
                {reset.isPending ? "Updating…" : "Update password"}
              </Button>
            </form>

            <div className="mt-8 text-center text-[13px] text-[var(--color-fg-muted)]">
              <Link to="/login" className="link">
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
