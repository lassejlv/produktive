import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "#/lib/toast";
import { Button } from "#/components/ui/button";
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

  const submitting = register.isPending || login.isPending;

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* brand panel */}
      <aside className="hidden flex-col items-center justify-center border-r border-[var(--color-border)] bg-[var(--color-bg-sunken)] p-14 lg:flex">
        <Brand />
      </aside>

      {/* form */}
      <div className="flex items-center justify-center p-6">
        <div className="fade-in w-full max-w-[360px]">
          <div className="mb-8 lg:hidden">
            <Brand />
          </div>
          <div className="mb-6 flex flex-col gap-1">
            <h2 className="text-[20px] font-semibold tracking-tight text-[var(--color-fg)]">
              Create your account
            </h2>
            <p className="text-[13px] text-[var(--color-fg-muted)]">
              Free to start. Personal workspace included.
            </p>
          </div>

          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              let registered = false;
              try {
                await register.mutateAsync({ email, password });
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
    </div>
  );
}

function Brand() {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span
          className="pulse-dot inline-block h-2 w-2 rounded-full"
          style={{
            background: "var(--color-accent)",
            boxShadow: "0 0 12px color-mix(in srgb, var(--color-accent) 60%, transparent)",
          }}
        />
        <span className="text-[15px] font-semibold tracking-tight text-[var(--color-fg)]">
          {BRAND_NAME}
        </span>
      </div>
      <p className="mt-2 text-[13px] text-[var(--color-fg-muted)]">{BRAND_TAGLINE}</p>
    </div>
  );
}
