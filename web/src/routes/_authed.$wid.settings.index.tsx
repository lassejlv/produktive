import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Input } from "../components/Input";
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

  // Sync form fields once the workspace resolves (or when switching workspaces).
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
          // URL uses the old slug — move to the new one.
          void nav({ to: "/$wid/settings", params: { wid: updated.slug } });
        }
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  return (
    <div className="flex max-w-[640px] flex-col gap-5">
      <form
        onSubmit={onSave}
        className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5 shadow-[var(--shadow-xs)]"
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
        <div className="flex items-center justify-between gap-3">
          {!isOwner ? (
            <span className="text-[12px] text-[var(--color-fg-dim)]">
              Only the workspace owner can change these.
            </span>
          ) : (
            <span />
          )}
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!isOwner || !dirty || update.isPending}
          >
            {update.isPending && <Spinner size={12} thickness={2} />}
            Save changes
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5 shadow-[var(--shadow-xs)]">
        <div>
          <div className="text-[13.5px] font-medium text-[var(--color-fg)]">Danger zone</div>
          <div className="mt-0.5 text-[12.5px] text-[var(--color-fg-muted)]">
            {current?.is_personal
              ? "Personal workspaces cannot be deleted."
              : "Permanently delete this workspace, its monitors, and all check history."}
          </div>
        </div>
        <div>
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
    </div>
  );
}
