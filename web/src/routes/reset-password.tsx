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

    setMessage("Phrase rewritten. Sending you back to the counter…");
    window.setTimeout(() => {
      void navigate({ to: "/login" });
    }, 900);
  };

  return (
    <main className="grid min-h-screen place-items-center px-6 text-ink">
      <div className="animate-ink-bleed relative w-full max-w-md border border-ink bg-paper-soft">
        {/* corner brackets */}
        <span className="absolute -left-px -top-px h-3 w-3 border-l-2 border-t-2 border-vermilion" />
        <span className="absolute -right-px -top-px h-3 w-3 border-r-2 border-t-2 border-vermilion" />
        <span className="absolute -bottom-px -left-px h-3 w-3 border-b-2 border-l-2 border-vermilion" />
        <span className="absolute -bottom-px -right-px h-3 w-3 border-b-2 border-r-2 border-vermilion" />

        <div className="border-b border-ink/15 px-7 py-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="eyebrow-ink">Workshop · Form 03</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
              Pass-phrase reset
            </span>
          </div>
          <h1
            className="serif-tight text-[34px] font-medium leading-[1] tracking-tight text-ink"
            style={{ fontWeight: 500 }}
          >
            Choose a new <span className="serif-italic text-vermilion">phrase</span>.
          </h1>
          <p className="mt-2 font-serif text-[14px] italic leading-snug text-ink-muted">
            Eight characters or more. Make it the kind you can hum.
          </p>
        </div>

        <form className="grid gap-5 p-7" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="password">New pass phrase</Label>
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
            <div
              role="alert"
              className="animate-ink-bleed flex items-start gap-3 border-l-2 border-vermilion bg-vermilion/[0.06] px-3 py-2.5 text-[12px]"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-vermilion">
                Note
              </span>
              <span className="font-serif italic text-ink-soft">{error}</span>
            </div>
          ) : null}
          {message ? (
            <div
              role="status"
              className="animate-ink-bleed flex items-start gap-3 border-l-2 border-moss bg-moss/[0.08] px-3 py-2.5 text-[12px]"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-moss">
                OK
              </span>
              <span className="font-serif italic text-ink-soft">{message}</span>
            </div>
          ) : null}

          <Button size="lg" type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="flex items-center gap-2.5">
                <span className="inline-block size-3 animate-mark-spin border-2 border-paper-soft/40 border-t-paper-soft" />
                Updating…
              </span>
            ) : (
              "Set new phrase →"
            )}
          </Button>
        </form>

        <div className="border-t border-ink/15 px-7 py-4 text-center">
          <Link
            to="/login"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted underline underline-offset-4 hover:text-vermilion hover:decoration-vermilion"
          >
            ← Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
