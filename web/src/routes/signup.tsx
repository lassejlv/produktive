import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "#/lib/toast";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "../components/Input";
import { BRAND_NAME, BRAND_TAGLINE } from "../lib/brand";
import { parseLoginRedirect } from "../lib/redirect";
import { useLogin, useRegister } from "../lib/queries";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => {
    const path = parseLoginRedirect(s.redirect);
    return path === "/" ? {} : { redirect: path };
  },
});

function SignupPage() {
  const nav = useNavigate();
  const { redirect: redirectTo = "/" } = useSearch({ from: "/signup" });
  const register = useRegister();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedLegalTerms, setAcceptedLegalTerms] = useState(false);

  const submitting = register.isPending || login.isPending;

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

        <h1 className="mb-1 text-[20px] font-semibold tracking-tight text-[var(--color-fg)]">
          Create your account
        </h1>
        <p className="mb-6 text-[13px] text-[var(--color-fg-muted)]">
          Free to start. Personal workspace included.
        </p>

        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!acceptedLegalTerms) {
              toast.error("Accept the Terms of Service and Privacy Policy to continue");
              return;
            }
            let registered = false;
            try {
              await register.mutateAsync({
                email,
                password,
                accepted_legal_terms: acceptedLegalTerms,
              });
              registered = true;
              await login.mutateAsync({ email, password });
              toast.success("Account created");
              nav({ href: redirectTo, replace: true });
            } catch (err) {
              const message = (err as Error).message;
              if (registered) {
                toast.error("Account created but sign-in failed", {
                  description: message,
                });
              } else {
                toast.error(message);
              }
            }
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
            autoComplete="new-password"
            required
            minLength={8}
            hint="At least 8 characters."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <label className="flex items-start gap-2 text-[13px] leading-5 text-[var(--color-fg-muted)]">
            <Checkbox
              aria-label="Accept Terms of Service and Privacy Policy"
              checked={acceptedLegalTerms}
              className="mt-0.5"
              onCheckedChange={(checked) => setAcceptedLegalTerms(checked === true)}
            />
            <span>
              I agree to the{" "}
              <a className="link" href="/TERMS.md" rel="noreferrer" target="_blank">
                Terms of Service
              </a>{" "}
              and{" "}
              <a className="link" href="/PRIVACY.md" rel="noreferrer" target="_blank">
                Privacy Policy
              </a>
              .
            </span>
          </label>

          {(register.error || login.error) && (
            <div className="-mt-1 text-[12px] text-[var(--color-err)]">
              {((register.error || login.error) as Error).message}
            </div>
          )}

          <Button
            variant="default"
            size="lg"
            type="submit"
            loading={submitting}
            disabled={!acceptedLegalTerms || submitting}
            className="mt-3 w-full"
          >
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <div className="mt-8 text-center text-[13px] text-[var(--color-fg-muted)]">
          Already have an account?{" "}
          <Link
            to="/login"
            search={redirectTo === "/" ? {} : { redirect: redirectTo }}
            className="link"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
