import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type OAuthAuthorizePreview,
  decideOAuthAuthorization,
  previewOAuthAuthorization,
} from "@/lib/api";

export const Route = createFileRoute("/oauth/authorize")({
  component: OAuthAuthorizePage,
});

function OAuthAuthorizePage() {
  const [preview, setPreview] = useState<OAuthAuthorizePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const search = useMemo(() => window.location.search, []);

  useEffect(() => {
    let mounted = true;
    void previewOAuthAuthorization(search)
      .then((result) => {
        if (mounted) setPreview(result);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "OAuth request failed";
        if (message === "Unauthorized") {
          const redirect = `${window.location.pathname}${window.location.search}`;
          window.location.assign(`/login?redirect=${encodeURIComponent(redirect)}`);
          return;
        }
        if (mounted) setError(message);
      });
    return () => {
      mounted = false;
    };
  }, [search]);

  const decide = async (approve: boolean) => {
    setBusy(approve ? "approve" : "deny");
    setError(null);
    try {
      const response = await decideOAuthAuthorization(search, approve);
      window.location.assign(response.redirectUrl);
    } catch (error) {
      setError(error instanceof Error ? error.message : "OAuth request failed");
      setBusy(null);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-12 text-fg">
      <div className="w-full max-w-sm rounded-[12px] border border-white/10 bg-bg/72 p-5 backdrop-blur-xl">
        <h1 className="text-lg font-medium">Authorize access</h1>

        {error ? (
          <p className="mt-4 border-t border-danger/25 pt-3 text-xs text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {!preview && !error ? (
          <p className="mt-4 text-sm text-fg-muted">Loading…</p>
        ) : null}

        {preview ? (
          <div className="mt-4 grid gap-4 text-sm">
            <p className="text-fg-muted">
              <span className="font-medium text-fg">{preview.clientName}</span> requests access to
              your workspace <span className="font-medium text-fg">{preview.organization.name}</span>.
            </p>

            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-border-subtle pt-3 text-xs">
              <span className="text-fg-faint">Account</span>
              <span className="text-fg-muted">{preview.user.email}</span>
              <span className="text-fg-faint">Scope</span>
              <span className="text-fg-muted">{preview.scope}</span>
              <span className="text-fg-faint">Resource</span>
              <span className="break-all font-mono text-[11px] text-fg-muted">{preview.resource}</span>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border-subtle pt-4">
              <Button asChild variant="ghost" size="sm">
                <Link to="/chat">Cancel</Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => void decide(false)}
              >
                {busy === "deny" ? "Denying…" : "Deny"}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy !== null}
                onClick={() => void decide(true)}
              >
                {busy === "approve" ? "Approving…" : "Approve"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}


