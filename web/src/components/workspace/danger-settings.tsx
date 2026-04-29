import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingRow } from "@/components/workspace/setting-row";
import { deleteActiveOrganization } from "@/lib/auth-client";

export function DangerSettings({
  organization,
  canEdit,
}: {
  organization: { id: string; name: string };
  canEdit: boolean;
}) {
  const [confirmName, setConfirmName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const matches = confirmName.trim() === organization.name;
  const canDelete = canEdit && matches && !submitting;

  const onDelete = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canDelete) return;
    setSubmitting(true);
    try {
      await deleteActiveOrganization({ confirm: confirmName.trim() });
      toast.success("Workspace deleted");
      window.location.assign("/issues");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete workspace",
      );
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={onDelete}
      className="rounded-md border border-danger/30 bg-danger/[0.04]"
    >
      <SettingRow label="Delete workspace">
        <p className="m-0 text-[12.5px] leading-relaxed text-fg-muted">
          Permanently delete <strong className="text-fg">{organization.name}</strong> and
          everything in it — issues, projects, chats, members, and connected MCP servers.
          This cannot be undone.
        </p>
        <p className="mt-2 text-[12px] text-fg-faint">
          {canEdit
            ? "Type the workspace name to confirm."
            : "Only owners can delete the workspace."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={confirmName}
            onChange={(event) => setConfirmName(event.target.value)}
            placeholder={organization.name}
            disabled={!canEdit || submitting}
            autoComplete="off"
            spellCheck={false}
            className="flex-1 min-w-[180px]"
          />
          <Button
            type="submit"
            variant="danger"
            size="sm"
            disabled={!canDelete}
          >
            {submitting ? "Deleting…" : "Delete workspace"}
          </Button>
        </div>
      </SettingRow>
    </form>
  );
}
