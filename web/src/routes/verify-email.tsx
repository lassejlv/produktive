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
      setMessage("Email verified. Returning you to the workshop…");
      window.setTimeout(() => {
        void navigate({ to: "/dashboard" });
      }, 900);
    };

    void verify();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const headline =
    status === "success"
      ? { lead: "Verified", flourish: "indeed" }
      : status === "error"
      ? { lead: "Verification", flourish: "halted" }
      : { lead: "One quiet", flourish: "moment" };

  const accentColor =
    status === "error" ? "text-vermilion" : status === "success" ? "text-moss" : "text-ink";

  return (
    <main className="grid min-h-screen place-items-center px-6 text-ink">
      <div className="animate-ink-bleed relative w-full max-w-md border border-ink bg-paper-soft">
        {/* corner brackets */}
        <span className="absolute -left-px -top-px h-3 w-3 border-l-2 border-t-2 border-vermilion" />
        <span className="absolute -right-px -top-px h-3 w-3 border-r-2 border-t-2 border-vermilion" />
        <span className="absolute -bottom-px -left-px h-3 w-3 border-b-2 border-l-2 border-vermilion" />
        <span className="absolute -bottom-px -right-px h-3 w-3 border-b-2 border-r-2 border-vermilion" />

        <div className="border-b border-ink/15 px-7 py-5">
          <div className="flex items-center justify-between">
            <span className="eyebrow-ink">Workshop · Form 04</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
              Verification
            </span>
          </div>
        </div>

        <div className="px-7 py-8 text-center">
          <div className="mb-6 inline-flex items-center justify-center">
            {status === "loading" ? (
              <span className="inline-block size-4 animate-mark-spin border-2 border-ink/30 border-t-vermilion" />
            ) : status === "success" ? (
              <svg width="36" height="36" viewBox="0 0 36 36" className="text-moss">
                <path
                  d="M9 18.5 L15 24.5 L27 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                />
              </svg>
            ) : (
              <svg width="36" height="36" viewBox="0 0 36 36" className="text-vermilion">
                <path
                  d="M11 11 L25 25 M25 11 L11 25"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                />
              </svg>
            )}
          </div>
          <h1
            className="serif-tight text-[40px] font-medium leading-[0.98] tracking-tight text-ink"
            style={{ fontWeight: 500 }}
          >
            {headline.lead}{" "}
            <span className={`serif-italic ${accentColor}`}>{headline.flourish}</span>.
          </h1>
          <p className="mt-4 font-serif text-[14px] italic leading-relaxed text-ink-muted">
            {message}
          </p>
          {status === "error" ? (
            <Button className="mt-7" asChild>
              <Link to="/login">Back to sign in →</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </main>
  );
}
