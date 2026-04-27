import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    const token = new URLSearchParams(window.location.search).get("token");

    if (!token) {
      setError("Reset token is missing.");
      setIsSubmitting(false);
      return;
    }

    const result = await authClient.resetPassword({ token, password });
    setIsSubmitting(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setMessage("Password updated. Redirecting…");
    window.setTimeout(() => {
      void navigate({ to: "/login" });
    }, 800);
  };

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="grid size-9 place-items-center rounded-md bg-fg text-sm font-semibold text-bg">
            P
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-fg">
            Reset your password
          </h1>
          <p className="mt-1.5 text-sm text-fg-muted">
            Choose a new password for your account.
          </p>
        </div>

        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-1.5">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              minLength={8}
              autoComplete="new-password"
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
                Updating…
              </span>
            ) : (
              "Update password"
            )}
          </Button>
        </form>

        <div className="mt-6 text-center text-xs text-fg-faint">
          <Link to="/login" className="hover:text-fg-muted transition-colors">
            ← Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
