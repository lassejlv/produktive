import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

type AuthMode = "signin" | "signup";

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

  return (
    <main className="grid min-h-screen grid-cols-1 items-center gap-12 bg-background p-7 md:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] md:p-14">
      <section className="max-w-[760px]">
        <p className="font-mono text-[10px] text-muted-foreground">Produktive.app</p>
        <h1 className="my-4 max-w-[720px] text-[clamp(42px,6vw,88px)] font-semibold leading-[0.94] tracking-[-0.055em] text-white">
          Run product work without the enterprise theatre.
        </h1>
        <p className="max-w-[520px] text-sm leading-relaxed text-muted-foreground">
          A focused, open-source Linear alternative for issues, ownership, and
          small team momentum.
        </p>
      </section>

      <Card className="rounded-none border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base font-medium text-white">
            {mode === "signin" ? "Sign in" : "Create account"}
          </CardTitle>
          <CardDescription className="text-xs">
            {mode === "signin"
              ? "Use your email and password to continue."
              : "Create a workspace account. Email verification is required."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3.5" onSubmit={onSubmit}>
            {mode === "signup" ? (
              <div className="grid gap-2.5">
                <Label className="text-[11px] font-normal text-neutral-300" htmlFor="name">Name</Label>
                <Input
                  className="h-8 rounded-none bg-black text-xs"
                  id="name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
            ) : null}

            <div className="grid gap-2.5">
              <Label className="text-[11px] font-normal text-neutral-300" htmlFor="email">Email</Label>
              <Input
                className="h-8 rounded-none bg-black text-xs"
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="grid gap-2.5">
              <Label className="text-[11px] font-normal text-neutral-300" htmlFor="password">Password</Label>
              <Input
                className="h-8 rounded-none bg-black text-xs"
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            {error ? (
              <p className="border border-border bg-red-950/30 px-2.5 py-2 text-xs text-red-200">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="border border-border bg-green-950/30 px-2.5 py-2 text-xs text-green-200">
                {message}
              </p>
            ) : null}

            <Button className="h-8 w-full text-xs" type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Working..."
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>

          <div className="mt-4 flex justify-between gap-3.5 text-xs text-muted-foreground">
            {mode === "signin" ? (
              <button className="text-foreground underline underline-offset-4" type="button" onClick={() => setMode("signup")}>
                Need an account?
              </button>
            ) : (
              <button className="text-foreground underline underline-offset-4" type="button" onClick={() => setMode("signin")}>
                Already have an account?
              </button>
            )}
            <Link className="text-foreground underline underline-offset-4" to="/dashboard">
              Go to dashboard
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
