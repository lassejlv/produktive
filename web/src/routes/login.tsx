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
    <main className="login-page">
      <section className="login-copy">
        <p className="eyebrow">Produktive.app</p>
        <h1>Run product work without the enterprise theatre.</h1>
        <p>
          A focused, open-source Linear alternative for issues, ownership, and
          small team momentum.
        </p>
      </section>

      <Card className="login-card">
        <CardHeader>
          <CardTitle>{mode === "signin" ? "Sign in" : "Create account"}</CardTitle>
          <CardDescription>
            {mode === "signin"
              ? "Use your email and password to continue."
              : "Create a workspace account. Email verification is required."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="auth-form" onSubmit={onSubmit}>
            {mode === "signup" ? (
              <div className="field">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
            ) : null}

            <div className="field">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="field">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            {error ? <p className="form-error">{error}</p> : null}
            {message ? <p className="form-message">{message}</p> : null}

            <Button className="w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Working..."
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>

          <div className="auth-switch">
            {mode === "signin" ? (
              <button type="button" onClick={() => setMode("signup")}>
                Need an account?
              </button>
            ) : (
              <button type="button" onClick={() => setMode("signin")}>
                Already have an account?
              </button>
            )}
            <Link to="/dashboard">Go to dashboard</Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
