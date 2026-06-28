import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { BRAND_NAME, BRAND_TAGLINE } from "../lib/brand";
import { useVerifyEmail } from "../lib/queries";

export const Route = createFileRoute("/verify-email")({
  component: VerifyEmailPage,
  validateSearch: (s: Record<string, unknown>): { token?: string } => {
    const token = typeof s.token === "string" ? s.token : undefined;
    return token ? { token } : {};
  },
});

function VerifyEmailPage() {
  const nav = useNavigate();
  const search = useSearch({ from: "/verify-email" });
  // Capture the token once, then strip it from the URL so it does not linger in
  // browser history or get captured by access logs on later navigations.
  const [token] = useState(() => search.token);
  const verify = useVerifyEmail();
  const fired = useRef(false);

  useEffect(() => {
    if (search.token) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
  }, [search.token]);

  // Verification is a single action — run it automatically on mount (guarded so
  // React's strict-mode double-invoke does not fire it twice).
  useEffect(() => {
    if (!token || fired.current) return;
    fired.current = true;
    verify.mutate(token);
  }, [token, verify]);

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
              Invalid verification link
            </h1>
            <p className="mb-6 text-[13px] text-[var(--color-fg-muted)]">
              This email verification link is missing or invalid. Sign in and request a new one.
            </p>
            <div className="mt-8 text-center text-[13px] text-[var(--color-fg-muted)]">
              <Link to="/login" className="link">
                Back to sign in
              </Link>
            </div>
          </>
        ) : verify.isSuccess ? (
          <>
            <h1 className="mb-1 text-[20px] font-semibold tracking-tight text-[var(--color-fg)]">
              Email verified
            </h1>
            <p className="mb-6 text-[13px] text-[var(--color-fg-muted)]">
              Your email address is confirmed. You can continue to your dashboard.
            </p>
            <Button
              variant="default"
              size="lg"
              type="button"
              className="w-full"
              onClick={() => nav({ href: "/", replace: true })}
            >
              Continue
            </Button>
          </>
        ) : verify.isError ? (
          <>
            <h1 className="mb-1 text-[20px] font-semibold tracking-tight text-[var(--color-fg)]">
              Verification failed
            </h1>
            <p className="mb-6 text-[13px] text-[var(--color-fg-muted)]">
              {(verify.error as Error).message}. The link may have expired — sign in to request a
              new one.
            </p>
            <div className="mt-8 text-center text-[13px] text-[var(--color-fg-muted)]">
              <Link to="/login" className="link">
                Back to sign in
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-[20px] font-semibold tracking-tight text-[var(--color-fg)]">
              Verifying your email…
            </h1>
            <p className="mb-6 text-[13px] text-[var(--color-fg-muted)]">
              Hang tight while we confirm your email address.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
