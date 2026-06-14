import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Clock3, Copy, MailPlus, Trash2, UserRound, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Dialog, DialogClose, DialogContent } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { Input } from "../components/Input";
import { Spinner } from "../components/Spinner";
import { cn } from "../lib/cn";
import {
  useCreateInvite,
  useInvites,
  useMe,
  useMembers,
  useRemoveMember,
  useRevokeInvite,
  useUpdateMemberRole,
  useWorkspaces,
} from "../lib/queries";
import type { InviteCreated, WorkspaceInvite, WorkspaceMember, WorkspaceRole } from "../lib/types";

export const Route = createFileRoute("/_authed/$wid/settings/members")({
  staticData: {
    title: "Settings",
    description: "Invite teammates, assign roles, and manage workspace access.",
  },
  component: MembersSettingsPage,
});

function MembersSettingsPage() {
  const { wid } = Route.useParams();
  const navigate = useNavigate();
  const me = useMe();
  const workspaces = useWorkspaces();
  const current = workspaces.data?.find(
    (workspace) => workspace.id === wid || workspace.slug === wid,
  );
  const members = useMembers(wid);
  const isOwner = current?.role === "owner";
  const invites = useInvites(wid, !!isOwner);
  const updateRole = useUpdateMemberRole(wid);
  const removeMember = useRemoveMember(wid);
  const revokeInvite = useRevokeInvite(wid);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<WorkspaceMember | null>(null);

  const loading = members.isLoading || workspaces.isLoading;

  function remove(target: WorkspaceMember) {
    removeMember.mutate(target.user_id, {
      onSuccess: () => {
        const self = target.user_id === me.data?.id;
        toast.success(self ? "You left the workspace" : "Member removed");
        setRemoveTarget(null);
        if (self) void navigate({ to: "/", replace: true });
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-[12px] text-[var(--color-fg-muted)]">
        <Spinner size={14} /> <span className="ml-2">Loading members...</span>
      </div>
    );
  }

  if (members.error) {
    return (
      <EmptyState
        icon={Users}
        title="Could not load members"
        description={(members.error as Error).message}
      />
    );
  }

  return (
    <div className="flex max-w-[860px] flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-medium tracking-tight text-[var(--color-fg)]">Members</h2>
          <p className="mt-1 text-[12.5px] text-[var(--color-fg-muted)]">
            Manage who can access {current?.name ?? "this workspace"}.
          </p>
        </div>
        {isOwner && !current?.is_personal && (
          <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
            <MailPlus size={13} /> Invite member
          </Button>
        )}
      </div>

      {current?.is_personal && (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] px-3 py-2 text-[12px] text-[var(--color-fg-muted)]">
          Personal workspaces cannot invite additional members. Create a team workspace from the
          workspace switcher to collaborate.
        </div>
      )}

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-[var(--shadow-xs)]">
        {(members.data ?? []).map((member) => {
          const self = member.user_id === me.data?.id;
          const canRemove = self ? !current?.is_personal : isOwner;
          return (
            <div
              key={member.user_id}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-[var(--color-border)] px-4 py-3 last:border-b-0 max-sm:grid-cols-1"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] text-[12px] font-medium text-[var(--color-fg-muted)]">
                  {member.email[0]?.toUpperCase() ?? <UserRound size={14} />}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-[var(--color-fg)]">
                    {member.email}
                    {self && (
                      <span className="ml-2 text-[11px] font-normal text-[var(--color-fg-dim)]">
                        you
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-[var(--color-fg-dim)]">
                    Joined {formatDate(member.created_at)}
                  </div>
                </div>
              </div>

              <select
                value={member.role}
                disabled={!isOwner || updateRole.isPending}
                onChange={(event) => {
                  const role = event.target.value as WorkspaceRole;
                  if (role === member.role) return;
                  updateRole.mutate(
                    { userId: member.user_id, role },
                    {
                      onSuccess: () => toast.success("Role updated"),
                      onError: (err) => toast.error((err as Error).message),
                    },
                  );
                }}
                className={cn(fieldControlClass, "h-8 w-[112px] text-[12px] capitalize")}
              >
                <option value="owner">Owner</option>
                <option value="member">Member</option>
              </select>

              <Button
                variant={self ? "secondary" : "danger"}
                size="xs"
                disabled={!canRemove || removeMember.isPending}
                onClick={() => setRemoveTarget(member)}
              >
                <Trash2 size={12} /> {self ? "Leave" : "Remove"}
              </Button>
            </div>
          );
        })}
      </div>

      {isOwner && !current?.is_personal && (
        <PendingInvites
          invites={invites.data ?? []}
          loading={invites.isLoading}
          pending={revokeInvite.isPending}
          onRevoke={(invite) =>
            revokeInvite.mutate(invite.id, {
              onSuccess: () => toast.success("Invite revoked"),
              onError: (err) => toast.error((err as Error).message),
            })
          }
        />
      )}

      <InviteMemberDialog wid={wid} open={inviteOpen} onOpenChange={setInviteOpen} />

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title={
          removeTarget?.user_id === me.data?.id
            ? "Leave this workspace?"
            : `Remove ${removeTarget?.email ?? "member"}?`
        }
        description={
          removeTarget?.user_id === me.data?.id
            ? "You will lose access to this workspace until another owner invites you again."
            : "They will lose access immediately. Existing monitors, incidents, and history stay in the workspace."
        }
        confirmLabel={removeTarget?.user_id === me.data?.id ? "Leave workspace" : "Remove member"}
        destructive={removeTarget?.user_id !== me.data?.id}
        pending={removeMember.isPending}
        onConfirm={() => {
          if (removeTarget) remove(removeTarget);
        }}
      />
    </div>
  );
}

function PendingInvites({
  invites,
  loading,
  pending,
  onRevoke,
}: {
  invites: WorkspaceInvite[];
  loading: boolean;
  pending: boolean;
  onRevoke: (invite: WorkspaceInvite) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5 shadow-[var(--shadow-xs)]">
      <div>
        <div className="text-[13.5px] font-medium text-[var(--color-fg)]">Pending invites</div>
        <div className="mt-0.5 text-[12.5px] text-[var(--color-fg-muted)]">
          Invites expire after 7 days. Invite links are shown only when created.
        </div>
      </div>

      {loading ? (
        <div className="flex h-16 items-center justify-center text-[12px] text-[var(--color-fg-muted)]">
          <Spinner size={14} /> <span className="ml-2">Loading invites...</span>
        </div>
      ) : invites.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-3 py-4 text-center text-[12px] text-[var(--color-fg-dim)]">
          No pending invites.
        </div>
      ) : (
        <div className="flex flex-col">
          {invites.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] py-3 first:border-t-0 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-[var(--color-fg)]">
                  {invite.email}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-[var(--color-fg-dim)]">
                  <Clock3 size={11} /> {roleLabel(invite.role)} · expires{" "}
                  {formatDate(invite.expires_at)}
                </div>
              </div>
              <Button
                variant="danger"
                size="xs"
                disabled={pending}
                onClick={() => onRevoke(invite)}
              >
                Revoke
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InviteMemberDialog({
  wid,
  open,
  onOpenChange,
}: {
  wid: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createInvite = useCreateInvite(wid);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [createdInvite, setCreatedInvite] = useState<InviteCreated | null>(null);

  function reset() {
    setEmail("");
    setRole("member");
    setCreatedInvite(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    createInvite.mutate(
      { email, role },
      {
        onSuccess: (invite) => {
          setCreatedInvite(invite);
          toast.success(invite.email_sent ? "Invite sent" : "Invite created");
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && createInvite.isPending) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        title="Invite member"
        description="Send an invite to a teammate. The invite link is valid for 7 days."
        footer={
          <>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm" disabled={createInvite.isPending}>
                {createdInvite ? "Done" : "Cancel"}
              </Button>
            </DialogClose>
            <Button
              type="submit"
              form="invite-member-form"
              variant="primary"
              size="sm"
              disabled={createInvite.isPending}
            >
              {createInvite.isPending && <Spinner size={12} thickness={2} />}
              Send invite
            </Button>
          </>
        }
      >
        <form id="invite-member-form" onSubmit={submit} className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            placeholder="teammate@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium tracking-wide text-[var(--color-fg-muted)]">
              Role
            </span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as WorkspaceRole)}
              className={cn(fieldControlClass, "h-9")}
            >
              <option value="member">Member</option>
              <option value="owner">Owner</option>
            </select>
          </label>

          {createdInvite && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-row)] p-3">
              <div className="text-[12px] font-medium text-[var(--color-fg)]">
                {createdInvite.email_sent ? "Email sent" : "Copy invite link"}
              </div>
              <div className="mt-1 text-[12px] text-[var(--color-fg-muted)]">
                The invite token is shown only once.
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input
                  value={createdInvite.accept_url}
                  readOnly
                  className={cn(fieldControlClass, "h-8 min-w-0 flex-1 font-mono text-[11px]")}
                />
                <Button
                  type="button"
                  size="xs"
                  onClick={() => copyInvite(createdInvite.accept_url)}
                >
                  <Copy size={12} /> Copy
                </Button>
              </div>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function roleLabel(role: WorkspaceRole): string {
  return role === "owner" ? "Owner" : "Member";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(value));
}

async function copyInvite(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  } catch {
    toast.error("Could not copy invite link");
  }
}

const fieldControlClass = cn(
  "rounded-[var(--radius-md)] border border-[var(--color-border-hi)] bg-[var(--color-bg-elev)]",
  "px-3 text-[13px] text-[var(--color-fg)] shadow-[var(--shadow-xs)] outline-none",
  "transition-[border-color,box-shadow,background-color] duration-150 ease-out",
  "focus:border-[var(--color-accent)] focus:shadow-[var(--ring-accent)]",
  "disabled:cursor-not-allowed disabled:opacity-55",
);
