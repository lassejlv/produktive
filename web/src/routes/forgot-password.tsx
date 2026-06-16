import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "#/lib/toast";
import { Button } from "#/components/ui/button";
import { Input } from "../components/Input";
import { BRAND_NAME, BRAND_TAGLINE } from "../lib/brand";
import { useForgotPassword } from "../lib/queries";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

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

        {sent ? (
          <>
            <h1 className="mb-1 text-[20px] font-semibold tracking-tight text-[var(--color-fg)]">
              Check your inbox
            </h1>
            <p className="mb-6 text-[13px] text-[var(--color-fg-muted)]">
              If an account exists for that email, we have sent a password reset link. Check your
              inbox.
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
              Reset your password
            </h1>
            <p className="mb-6 text-[13px] text-[var(--color-fg-muted)]">
              Enter your email and we'll send you a reset link.
            </p>

            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                forgot.mutate(
                  { email },
                  {
                    onSuccess: () => setSent(true),
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

              <Button
                variant="default"
                size="lg"
                type="submit"
                loading={forgot.isPending}
                className="mt-3 w-full"
              >
                {forgot.isPending ? "Sending…" : "Send reset link"}
              </Button>
            </form>

            <div className="mt-8 text-center text-[13px] text-[var(--color-fg-muted)]">
              Remembered it?{" "}
              <Link to="/login" className="link">
                Sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
