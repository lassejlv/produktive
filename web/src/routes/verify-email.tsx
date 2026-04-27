import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/verify-email")({
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email…");

  useEffect(() => {
    let isMounted = true;
    const token = new URLSearchParams(window.location.search).get("token");

    const verify = async () => {
      if (!token) {
        setStatus("error");
        setMessage("Verification token is missing.");
        return;
      }

      const result = await authClient.verifyEmail({ token });

      if (!isMounted) {
        return;
      }

      if (result.error) {
        setStatus("error");
        setMessage(result.error.message);
        return;
      }

      setStatus("success");
      setMessage("Email verified. Redirecting…");
      window.setTimeout(() => {
        void navigate({ to: "/chat" });
      }, 800);
    };

    void verify();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-sm text-center animate-fade-in">
        <div className="mx-auto grid size-9 place-items-center rounded-md bg-fg text-sm font-semibold text-bg">
          P
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-fg">
          {status === "loading"
            ? "Verifying email"
            : status === "success"
            ? "Email verified"
            : "Verification failed"}
        </h1>
        <p className="mt-2 text-sm text-fg-muted">{message}</p>
        {status === "error" ? (
          <Button className="mt-6" asChild>
            <Link to="/login">Back to sign in</Link>
          </Button>
        ) : null}
      </div>
    </main>
  );
}
