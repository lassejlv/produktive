import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { completeDiscordLink, previewDiscordLink, type DiscordLinkPreview } from "@/lib/api";
import { listOrganizations, useSession, type OrganizationMembership } from "@/lib/auth-client";

type DiscordLinkSearch = {
  state?: string;
};

export const Route = createFileRoute("/discord/link")({
  component: DiscordLinkPage,
  validateSearch: (search: Record<string, unknown>): DiscordLinkSearch => ({
    state: typeof search.state === "string" ? search.state : undefined,
  }),
});

function DiscordLinkPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const session = useSession();
  const [preview, setPreview] = useState<DiscordLinkPreview | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationMembership[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
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
        search: { redirect: `/discord/link?state=${encodeURIComponent(state)}` },
      });
      return;
    }
    if (!session.data) return;

    let mounted = true;
    void Promise.all([previewDiscordLink(state), listOrganizations()])
      .then(([previewResponse, orgsResponse]) => {
        if (!mounted) return;
        setPreview(previewResponse);
        setOrganizations(orgsResponse.organizations);
        setSelectedOrganizationId(
          previewResponse.linkedOrganization?.id ??
            orgsResponse.activeOrganizationId ??
            orgsResponse.organizations[0]?.id ??
            "",
        );
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Discord link expired");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [navigate, session.data, session.isPending, state]);

  const selectedOrganization = useMemo(
    () => organizations.find((org) => org.id === selectedOrganizationId) ?? null,
    [organizations, selectedOrganizationId],
  );

  const onLink = async () => {
    if (!state || !selectedOrganizationId) return;
    setBusy(true);
    try {
      const response = await completeDiscordLink(state, selectedOrganizationId);
      setLinkedName(response.organization.name);
      toast.success("Discord server linked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to link Discord");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col justify-center px-6 py-12">
      <div className="border border-border-subtle bg-bg p-5">
        <p className="m-0 text-[12px] font-medium uppercase tracking-[0.08em] text-fg-faint">
          Discord
        </p>
        <h1 className="mt-2 text-[22px] font-semibold text-fg">Link server</h1>
        {loading || session.isPending ? (
          <p className="mt-4 text-[13px] text-fg-muted">Loading link details...</p>
        ) : linkedName ? (
          <div className="mt-5 grid gap-3">
            <p className="m-0 text-[13px] text-fg-muted">
              This Discord server is now linked to <span className="text-fg">{linkedName}</span>.
            </p>
            <Button type="button" onClick={() => window.close()}>
              Done
            </Button>
          </div>
        ) : !state || !preview ? (
          <p className="mt-4 text-[13px] text-fg-muted">This Discord link is invalid or expired.</p>
        ) : organizations.length === 0 ? (
          <p className="mt-4 text-[13px] text-fg-muted">
            You need to belong to a workspace to link Discord.
          </p>
        ) : (
          <div className="mt-5 grid gap-4">
            <label className="grid gap-1.5 text-[13px] text-fg">
              Workspace
              <select
                value={selectedOrganizationId}
                onChange={(event) => setSelectedOrganizationId(event.target.value)}
                className="h-9 border border-border-subtle bg-bg px-2 text-[13px] text-fg outline-none focus:border-accent"
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="m-0 text-[12.5px] text-fg-muted">
              Server ID <span className="font-mono">{preview.guildId}</span> will use{" "}
              <span className="text-fg">{selectedOrganization?.name ?? "this workspace"}</span>.
            </p>
            {preview.linkedOrganization ? (
              <p className="m-0 text-[12.5px] text-fg-muted">
                Already linked to{" "}
                <span className="text-fg">{preview.linkedOrganization.name}</span>. Selecting a
                different workspace requires owner access.
              </p>
            ) : null}
            <Button type="button" onClick={onLink} disabled={busy || !selectedOrganizationId}>
              {busy ? "Linking..." : "Link Discord server"}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
