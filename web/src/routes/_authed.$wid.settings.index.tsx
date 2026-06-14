import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Input } from "../components/Input";
import { PageActions } from "../components/PageLayout";
import { Spinner } from "../components/Spinner";
import { useDeleteWorkspace, useUpdateWorkspace, useWorkspaces } from "../lib/queries";

export const Route = createFileRoute("/_authed/$wid/settings/")({
  staticData: {
    title: "Settings",
    description: "Workspace name, slug, and danger zone.",
  },
  component: GeneralSettingsPage,
});

function GeneralSettingsPage() {
  const { wid } = Route.useParams();
  const nav = useNavigate();
  const ws = useWorkspaces();
  const current = ws.data?.find((w) => w.id === wid || w.slug === wid);
  const update = useUpdateWorkspace(wid);
  const del = useDeleteWorkspace(wid);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!current) return;
    setName(current.name);
    setSlug(current.slug);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOwner = current?.role === "owner";
  const dirty = !!current && (name.trim() !== current.name || slug.trim() !== current.slug);

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!current || !dirty) return;
    const patch: { name?: string; slug?: string } = {};
    if (name.trim() !== current.name) patch.name = name.trim();
    if (slug.trim() !== current.slug) patch.slug = slug.trim();
    update.mutate(patch, {
      onSuccess: (updated) => {
        toast.success("Workspace updated");
        if (updated.slug !== wid && current.id !== wid) {
          void nav({ to: "/$wid/settings", params: { wid: updated.slug } });
        }
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  return (
    <>
      <PageActions>
        {isOwner && (
          <Button
            type="submit"
            form="general-settings"
            variant="primary"
            size="sm"
            disabled={!dirty || update.isPending}
          >
            {update.isPending && <Spinner size={12} thickness={2} />}
            Save changes
          </Button>
        )}
      </PageActions>

      <div className="flex max-w-[640px] flex-col gap-7">
        <section>
          <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
            Workspace
          </h3>
          <form
            id="general-settings"
            onSubmit={onSave}
            className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 shadow-[var(--shadow-xs)]"
          >
            <Input
              label="Workspace name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={!isOwner}
            />
            <Input
              label="Workspace slug"
              className="mono"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              hint="Used in URLs. Lowercase letters, digits, and hyphens."
              required
              minLength={3}
              disabled={!isOwner}
            />
            {!isOwner && (
              <p className="text-[12px] text-[var(--color-fg-dim)]">
                Only the workspace owner can change these.
              </p>
            )}
          </form>
        </section>

        <section>
          <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-dim)]">
            Danger zone
          </h3>
          <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--color-err)_35%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-err)_4%,var(--color-bg-elev))] p-4">
            <div className="text-[13px] font-medium text-[var(--color-fg)]">Delete workspace</div>
            <p className="mt-1 text-[12px] text-[var(--color-fg-muted)]">
              {current?.is_personal
                ? "Personal workspaces cannot be deleted."
                : "Permanently delete this workspace, its monitors, and all check history."}
            </p>
            <div className="mt-4">
              <Button
                variant="danger"
                size="sm"
                disabled={!isOwner || current?.is_personal}
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 size={13} /> Delete workspace
              </Button>
            </div>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${current?.name ?? "workspace"}"?`}
        description="All monitors, incidents, and check history in this workspace will be permanently removed. This cannot be undone."
        confirmLabel="Delete workspace"
        destructive
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(undefined, {
            onSuccess: () => {
              toast.success("Workspace deleted");
              setConfirmOpen(false);
              window.location.href = "/";
            },
            onError: (err) => toast.error((err as Error).message),
          })
        }
      />
    </>
  );
}
