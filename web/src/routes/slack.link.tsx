import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { completeSlackLink, previewSlackLink, type SlackLinkPreview } from "@/lib/api";
import { useSession } from "@/lib/auth-client";

type SlackLinkSearch = {
  state?: string;
};

export const Route = createFileRoute("/slack/link")({
  component: SlackLinkPage,
  validateSearch: (search: Record<string, unknown>): SlackLinkSearch => ({
    state: typeof search.state === "string" ? search.state : undefined,
  }),
});

function SlackLinkPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const session = useSession();
  const [preview, setPreview] = useState<SlackLinkPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [linkedName, setLinkedName] = useState<string | null>(null);
  const state = search.state ?? "";

  useEffect(() => {
    if (!state) {
      setLoading(false);
      return;
    }
    if (!session.isPending && !session.data) {
      void navigate({
        to: "/login",
        search: { redirect: `/slack/link?state=${encodeURIComponent(state)}` },
      });
      return;
    }
    if (!session.data) return;

    let mounted = true;
    void previewSlackLink(state)
      .then((response) => {
        if (!mounted) return;
        setPreview(response);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Slack link expired");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [navigate, session.data, session.isPending, state]);

  const onLink = async () => {
    if (!state) return;
    setBusy(true);
    try {
      const response = await completeSlackLink(state);
      setLinkedName(response.organization.name);
      toast.success("Slack user linked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to link Slack");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col justify-center px-6 py-12">
      <div className="border border-border-subtle bg-bg p-5">
        <p className="m-0 text-[12px] font-medium uppercase tracking-[0.08em] text-fg-faint">
          Slack
        </p>
        <h1 className="mt-2 text-[22px] font-semibold text-fg">Link user</h1>
        {loading || session.isPending ? (
          <p className="mt-4 text-[13px] text-fg-muted">Loading link details...</p>
        ) : linkedName ? (
          <div className="mt-5 grid gap-3">
            <p className="m-0 text-[13px] text-fg-muted">
              Your Slack user is now linked to <span className="text-fg">{linkedName}</span>.
            </p>
            <Button type="button" onClick={() => window.close()}>
              Done
            </Button>
          </div>
        ) : !state || !preview ? (
          <p className="mt-4 text-[13px] text-fg-muted">This Slack link is invalid or expired.</p>
        ) : (
          <div className="mt-5 grid gap-4">
            <p className="m-0 text-[13px] text-fg-muted">
              Link Slack user <span className="font-mono text-fg">{preview.slackUserId}</span> to{" "}
              <span className="text-fg">{preview.linkedOrganization.name}</span>.
            </p>
            <p className="m-0 text-[12.5px] text-fg-muted">
              You must be a member of this Produktive workspace.
            </p>
            <Button type="button" onClick={onLink} disabled={busy}>
              {busy ? "Linking..." : "Link Slack user"}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
