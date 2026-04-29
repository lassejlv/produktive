import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { SettingRow } from "@/components/workspace/setting-row";
import {
  deleteActiveOrganization,
  leaveActiveOrganization,
  refreshSession,
} from "@/lib/auth-client";

export function DangerSettings({
  organization,
  canEdit,
}: {
  organization: { id: string; name: string };
  canEdit: boolean;
}) {
  return canEdit ? (
    <DeleteWorkspace organization={organization} />
  ) : (
    <LeaveWorkspace organization={organization} />
  );
}

function DeleteWorkspace({
  organization,
}: {
  organization: { name: string };
}) {
  const navigate = useNavigate();
  const [confirmName, setConfirmName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const matches = confirmName.trim() === organization.name;
  const canDelete = matches && !submitting;

  const onDelete = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canDelete) return;
    setSubmitting(true);
    try {
      await deleteActiveOrganization({ confirm: confirmName.trim() });
      await refreshSession();
      toast.success("Workspace deleted");
      void navigate({ to: "/issues" });
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
          Permanently delete{" "}
          <strong className="text-fg">{organization.name}</strong> and everything
          in it — issues, projects, chats, members, and connected MCP servers.
          This cannot be undone.
        </p>
        <p className="mt-2 text-[12px] text-fg-faint">
          Type the workspace name to confirm.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={confirmName}
            onChange={(event) => setConfirmName(event.target.value)}
            placeholder={organization.name}
            disabled={submitting}
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

function LeaveWorkspace({
  organization,
}: {
  organization: { name: string };
}) {
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirmDialog();
  const [submitting, setSubmitting] = useState(false);

  const onLeave = () => {
    confirm({
      title: `Leave ${organization.name}?`,
      description:
        "You'll lose access to this workspace's issues, projects, and chats. An owner can re-invite you later.",
      confirmLabel: "Leave workspace",
      destructive: true,
      onConfirm: async () => {
        setSubmitting(true);
        try {
          await leaveActiveOrganization();
          await refreshSession();
          toast.success("Left workspace");
          void navigate({ to: "/issues" });
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Failed to leave workspace",
          );
          setSubmitting(false);
        }
      },
    });
  };

  return (
    <div className="rounded-md border border-danger/30 bg-danger/[0.04]">
      {dialog}
      <SettingRow label="Leave workspace">
        <p className="m-0 text-[12.5px] leading-relaxed text-fg-muted">
          Remove yourself from{" "}
          <strong className="text-fg">{organization.name}</strong>. Your account
          stays active and you keep any other workspaces you belong to.
        </p>
        <div className="mt-3 flex justify-start">
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={submitting}
            onClick={onLeave}
          >
            {submitting ? "Leaving…" : "Leave workspace"}
          </Button>
        </div>
      </SettingRow>
    </div>
  );
}
