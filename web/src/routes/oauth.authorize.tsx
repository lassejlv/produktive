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
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl shadow-black/20">
        <div className="mb-5">
          <div className="text-[12px] uppercase tracking-[0.14em] text-fg-faint">Produktive OAuth</div>
          <h1 className="mt-2 text-xl font-medium">Connect MCP client</h1>
        </div>

        {error ? (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        ) : null}

        {!preview && !error ? (
          <div className="text-sm text-fg-muted">Loading authorization request...</div>
        ) : null}

        {preview ? (
          <div className="grid gap-4 text-sm">
            <p className="m-0 text-fg-muted">
              <span className="font-medium text-fg">{preview.clientName}</span> wants access to
              Produktive MCP as {preview.user.email}.
            </p>
            <div className="grid gap-2 rounded-md border border-border-subtle bg-bg p-3">
              <Row label="Workspace" value={preview.organization.name} />
              <Row label="Scope" value={preview.scope} />
              <Row label="Resource" value={preview.resource} mono />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Button asChild variant="ghost">
                <Link to="/chat">Cancel</Link>
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void decide(false)}
                >
                  {busy === "deny" ? "Denying..." : "Deny"}
                </Button>
                <Button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void decide(true)}
                >
                  {busy === "approve" ? "Approving..." : "Approve"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-1">
      <span className="text-[11px] uppercase tracking-[0.1em] text-fg-faint">{label}</span>
      <span className={mono ? "break-all font-mono text-[12px] text-fg-muted" : "text-fg"}>
        {value}
      </span>
    </div>
  );
}
