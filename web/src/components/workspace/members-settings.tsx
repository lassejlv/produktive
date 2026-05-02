import { type Dispatch, type FormEvent, type SetStateAction, useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/issue/avatar";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type Invitation,
  type Member,
  type PermissionInfo,
  type Role,
  createInvitation,
  createRole,
  deleteRole,
  removeMember,
  resendInvitation,
  revokeInvitation,
  updateMemberRole,
  updateRole,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export function MembersSettings({
  loading,
  members,
  setMembers,
  invitations,
  setInvitations,
  roles,
  setRoles,
  permissions,
  currentUserEmail,
  currentRole,
  currentPermissions,
}: {
  loading: boolean;
  members: Member[];
  setMembers: Dispatch<SetStateAction<Member[]>>;
  invitations: Invitation[];
  setInvitations: Dispatch<SetStateAction<Invitation[]>>;
  roles: Role[];
  setRoles: Dispatch<SetStateAction<Role[]>>;
  permissions: PermissionInfo[];
  currentUserEmail: string | null;
  currentRole: string | null;
  currentPermissions: Set<string>;
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  const roleByKey = useMemo(() => new Map(roles.map((role) => [role.key, role])), [roles]);
  const canInvite = currentPermissions.has("members.invite");
  const canRemove = currentPermissions.has("members.remove");
  const canAssignRole = currentPermissions.has("members.assign_role");
  const canManageRoles = currentRole === "owner";

  const onInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inviteSubmitting || !canInvite) return;
    const email = inviteEmail.trim();
    if (!email) return;
    setInviteSubmitting(true);
    try {
      const invitation = await createInvitation(email, inviteRole);
      setInvitations((current) => [invitation, ...current]);
      setInviteEmail("");
      toast.success(`Invite sent to ${invitation.email}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send invite");
    } finally {
      setInviteSubmitting(false);
    }
  };

  const onRevoke = (invitationId: string, email: string) => {
    confirm({
      title: "Revoke invitation?",
      description: `${email} will no longer be able to accept this invite.`,
      confirmLabel: "Revoke invite",
      destructive: true,
      onConfirm: async () => {
        try {
          const response = await revokeInvitation(invitationId);
          setInvitations(response.invitations);
          toast.success("Invitation revoked");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to revoke");
        }
      },
    });
  };

  const onResend = async (invitationId: string) => {
    try {
      const updated = await resendInvitation(invitationId);
      setInvitations((current) => current.map((inv) => (inv.id === updated.id ? updated : inv)));
      toast.success(`Invitation resent to ${updated.email}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resend");
    }
  };

  const onChangeMemberRole = async (member: Member, role: string) => {
    const previous = member.role;
    setMembers((current) =>
      current.map((item) => (item.id === member.id ? { ...item, role } : item)),
    );
    try {
      await updateMemberRole(member.id, role);
      toast.success("Member role updated");
    } catch (error) {
      setMembers((current) =>
        current.map((item) => (item.id === member.id ? { ...item, role: previous } : item)),
      );
      toast.error(error instanceof Error ? error.message : "Failed to update role");
    }
  };

  const onRemoveMember = (member: Member) => {
    confirm({
      title: "Remove member?",
      description: `${member.name} will lose access to this workspace.`,
      confirmLabel: "Remove member",
      destructive: true,
      onConfirm: async () => {
        try {
          await removeMember(member.id);
          setMembers((current) => current.filter((item) => item.id !== member.id));
          toast.success("Member removed");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to remove member");
        }
      },
    });
  };

  return (
    <div className="flex flex-col gap-8">
      {dialog}
      <section>
        <h3 className="m-0 text-[13px] font-medium text-fg">Invite a teammate</h3>
        <form
          onSubmit={onInvite}
          className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]"
        >
          <Input
            type="email"
            required
            placeholder="alice@example.com"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            disabled={inviteSubmitting || !canInvite}
          />
          <RoleSelect
            value={inviteRole}
            roles={roles}
            disabled={inviteSubmitting || !canInvite}
            currentRole={currentRole}
            onChange={setInviteRole}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!inviteEmail.trim() || inviteSubmitting || !canInvite}
          >
            {inviteSubmitting ? "Sending..." : "Send invite"}
          </Button>
        </form>
      </section>

      {invitations.length > 0 ? (
        <section>
          <h3 className="m-0 text-[13px] font-medium text-fg">
            Pending invitations
            <span className="ml-2 text-[11px] tabular-nums text-fg-faint">
              {invitations.length}
            </span>
          </h3>
          <ul className="mt-3 overflow-hidden rounded-md border border-border-subtle">
            {invitations.map((invitation, index) => (
              <li
                key={invitation.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 text-[13px]",
                  index !== invitations.length - 1 && "border-b border-border-subtle",
                )}
              >
                <span className="grid size-6 place-items-center rounded-full border border-dashed border-border text-[10px] text-fg-faint">
                  ?
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-fg">{invitation.email}</div>
                  <div className="truncate text-[11px] text-fg-faint">
                    {roleByKey.get(invitation.role)?.name ?? invitation.role} · invited{" "}
                    {formatRelative(invitation.createdAt)} · expires{" "}
                    {formatRelative(invitation.expiresAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void onResend(invitation.id)}
                  className="rounded-md border border-border-subtle bg-bg px-2 py-1 text-[11px] text-fg-muted transition-colors hover:border-border hover:text-fg"
                >
                  Resend
                </button>
                <button
                  type="button"
                  onClick={() => onRevoke(invitation.id, invitation.email)}
                  className="rounded-md px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3 className="m-0 text-[13px] font-medium text-fg">
          Members
          <span className="ml-2 text-[11px] tabular-nums text-fg-faint">{members.length}</span>
        </h3>
        <MembersList
          loading={loading}
          members={members}
          roles={roles}
          currentRole={currentRole}
          currentUserEmail={currentUserEmail}
          canAssignRole={canAssignRole}
          canRemove={canRemove}
          onChangeRole={onChangeMemberRole}
          onRemove={onRemoveMember}
        />
      </section>

      <RoleManager
        roles={roles}
        setRoles={setRoles}
        permissions={permissions}
        canManageRoles={canManageRoles}
      />
    </div>
  );
}

function MembersList({
  loading,
  members,
  roles,
  currentRole,
  currentUserEmail,
  canAssignRole,
  canRemove,
  onChangeRole,
  onRemove,
}: {
  loading: boolean;
  members: Member[];
  roles: Role[];
  currentRole: string | null;
  currentUserEmail: string | null;
  canAssignRole: boolean;
  canRemove: boolean;
  onChangeRole: (member: Member, role: string) => void;
  onRemove: (member: Member) => void;
}) {
  const roleByKey = useMemo(() => new Map(roles.map((role) => [role.key, role])), [roles]);
  if (loading) {
    return (
      <ul aria-hidden className="mt-3 overflow-hidden rounded-md border border-border-subtle">
        {Array.from({ length: 3 }).map((_, index) => (
          <li
            key={index}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5",
              index !== 2 && "border-b border-border-subtle",
            )}
          >
            <Skeleton className="size-7 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-7 w-28" />
          </li>
        ))}
      </ul>
    );
  }
  if (members.length === 0)
    return <p className="mt-3 text-[12px] text-fg-faint">No members yet.</p>;
  return (
    <ul className="mt-3 overflow-hidden rounded-md border border-border-subtle">
      {members.map((member, index) => {
        const isSelf = currentUserEmail === member.email;
        const isOwner = member.role === "owner";
        const canTouchOwner = currentRole === "owner";
        return (
          <li
            key={member.id}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 text-[13px]",
              index !== members.length - 1 && "border-b border-border-subtle",
            )}
          >
            <Avatar name={member.name} image={member.image} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-fg">{member.name}</div>
              <div className="truncate text-[11px] text-fg-muted">{member.email}</div>
            </div>
            {canAssignRole && (!isOwner || canTouchOwner) ? (
              <RoleSelect
                value={member.role}
                roles={roles}
                currentRole={currentRole}
                onChange={(role) => onChangeRole(member, role)}
              />
            ) : (
              <span className="text-[11px] text-fg-faint">
                {roleByKey.get(member.role)?.name ?? member.role}
              </span>
            )}
            {canRemove && !isSelf && (!isOwner || canTouchOwner) ? (
              <button
                type="button"
                onClick={() => onRemove(member)}
                className="rounded-md px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-danger/10 hover:text-danger"
              >
                Remove
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function RoleManager({
  roles,
  setRoles,
  permissions,
  canManageRoles,
}: {
  roles: Role[];
  setRoles: Dispatch<SetStateAction<Role[]>>;
  permissions: PermissionInfo[];
  canManageRoles: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const customRoles = roles.filter((role) => !role.isSystem);

  const reset = () => {
    setName("");
    setDescription("");
    setSelectedPermissions([]);
    setEditingId(null);
  };

  const editRole = (role: Role) => {
    setName(role.name);
    setDescription(role.description ?? "");
    setSelectedPermissions(role.permissions);
    setEditingId(role.id);
  };

  const togglePermission = (permission: string) => {
    setSelectedPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    );
  };

  const saveRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageRoles || saving) return;
    setSaving(true);
    try {
      const payload = { name, description, permissions: selectedPermissions };
      const response = editingId ? await updateRole(editingId, payload) : await createRole(payload);
      setRoles((current) => {
        if (!editingId) return [...current, response.role];
        return current.map((role) => (role.id === response.role.id ? response.role : role));
      });
      reset();
      toast.success(editingId ? "Role updated" : "Role created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save role");
    } finally {
      setSaving(false);
    }
  };

  const archiveRole = async (role: Role) => {
    try {
      await deleteRole(role.id);
      setRoles((current) => current.filter((item) => item.id !== role.id));
      toast.success("Role archived");
      if (editingId === role.id) reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to archive role");
    }
  };

  return (
    <section>
      <h3 className="m-0 text-[13px] font-medium text-fg">Roles</h3>
      <div className="mt-3 grid gap-4">
        <div className="overflow-hidden rounded-md border border-border-subtle">
          {roles.map((role, index) => (
            <div
              key={role.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 text-[13px]",
                index !== roles.length - 1 && "border-b border-border-subtle",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-fg">{role.name}</div>
                <div className="truncate text-[11px] text-fg-faint">
                  {role.isSystem ? "System role" : `${role.permissions.length} permissions`}
                </div>
              </div>
              {!role.isSystem && canManageRoles ? (
                <>
                  <button
                    type="button"
                    onClick={() => editRole(role)}
                    className="rounded-md px-2 py-1 text-[11px] text-fg-muted hover:bg-surface-2 hover:text-fg"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void archiveRole(role)}
                    className="rounded-md px-2 py-1 text-[11px] text-fg-muted hover:bg-danger/10 hover:text-danger"
                  >
                    Archive
                  </button>
                </>
              ) : null}
            </div>
          ))}
          {customRoles.length === 0 ? (
            <div className="border-t border-border-subtle px-3 py-2 text-[12px] text-fg-faint">
              No custom roles yet.
            </div>
          ) : null}
        </div>

        {canManageRoles ? (
          <form onSubmit={saveRole} className="rounded-md border border-border-subtle p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Role name"
                required
              />
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Description"
              />
            </div>
            <div className="mt-3 grid gap-1 sm:grid-cols-2">
              {permissions.map((permission) => (
                <label
                  key={permission.key}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-fg-muted hover:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    checked={selectedPermissions.includes(permission.key)}
                    onChange={() => togglePermission(permission.key)}
                  />
                  <span className="min-w-0 flex-1 truncate">{permission.label}</span>
                  <span className="text-[10px] text-fg-faint">{permission.group}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button type="submit" size="sm" disabled={saving || !name.trim()}>
                {saving ? "Saving..." : editingId ? "Save role" : "Create role"}
              </Button>
              {editingId ? (
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-md px-2 py-1 text-[12px] text-fg-muted hover:bg-surface-2 hover:text-fg"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );
}

function RoleSelect({
  value,
  roles,
  currentRole,
  disabled,
  onChange,
}: {
  value: string;
  roles: Role[];
  currentRole: string | null;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 rounded-md border border-border-subtle bg-bg px-2 text-[12px] text-fg outline-none transition-colors hover:border-border focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      {roles.map((role) => (
        <option
          key={role.key}
          value={role.key}
          disabled={role.key === "owner" && currentRole !== "owner"}
        >
          {role.name}
        </option>
      ))}
    </select>
  );
}

function formatRelative(value: string) {
  const then = new Date(value).getTime();
  const diffMs = then - Date.now();
  const absMin = Math.abs(Math.floor(diffMs / 60_000));
  const future = diffMs > 0;
  if (absMin < 1) return "just now";
  if (absMin < 60) return future ? `in ${absMin}m` : `${absMin}m ago`;
  const hours = Math.floor(absMin / 60);
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return future ? `in ${days}d` : `${days}d ago`;
  return new Date(value).toLocaleDateString();
}
