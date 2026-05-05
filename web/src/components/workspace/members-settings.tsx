import { type Dispatch, type FormEvent, type SetStateAction, useMemo, useState } from "react";
import { toast } from "sonner";
import { AtIcon, DotsIcon } from "@/components/chat/icons";
import { Avatar } from "@/components/issue/avatar";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  resetMemberTwoFactor,
  resendInvitation,
  revokeInvitation,
  updateMemberRole,
  updateRole,
} from "@/lib/api";
import { requestFreshTwoFactorIfNeeded } from "@/lib/fresh-two-factor";
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
  currentUserTwoFactorEnabled,
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
  currentUserTwoFactorEnabled: boolean;
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [memberSecurityFilter, setMemberSecurityFilter] = useState<"all" | "missing2fa">("all");
  const { confirm, dialog } = useConfirmDialog();

  const roleByKey = useMemo(() => new Map(roles.map((role) => [role.key, role])), [roles]);
  const membersMissingTwoFactor = useMemo(
    () => members.filter((member) => !member.twoFactorEnabled),
    [members],
  );
  const visibleMembers =
    memberSecurityFilter === "missing2fa" ? membersMissingTwoFactor : members;
  const canInvite = currentPermissions.has("members.invite");
  const canRemove = currentPermissions.has("members.remove");
  const canAssignRole = currentPermissions.has("members.assign_role");
  const canManageRoles = currentRole === "owner";
  const canResetMemberTwoFactor = currentRole === "owner";

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
      await requestFreshTwoFactorIfNeeded(currentUserTwoFactorEnabled);
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
          await requestFreshTwoFactorIfNeeded(currentUserTwoFactorEnabled);
          await removeMember(member.id);
          setMembers((current) => current.filter((item) => item.id !== member.id));
          toast.success("Member removed");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to remove member");
        }
      },
    });
  };

  const onResetMemberTwoFactor = (member: Member) => {
    confirm({
      title: "Reset member 2FA?",
      description: `${member.name} will be signed out and must set up two-factor authentication again before using protected workspaces.`,
      confirmLabel: "Reset 2FA",
      destructive: true,
      onConfirm: async () => {
        try {
          await requestFreshTwoFactorIfNeeded(currentUserTwoFactorEnabled);
          await resetMemberTwoFactor(member.id);
          setMembers((current) =>
            current.map((item) =>
              item.id === member.id ? { ...item, twoFactorEnabled: false } : item,
            ),
          );
          toast.success("Member 2FA reset");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to reset member 2FA");
        }
      },
    });
  };

  return (
    <div>
      {dialog}

      <SectionEyebrow label="Members" count={members.length} />
      <MemberSecurityFilterBar
        active={memberSecurityFilter}
        totalCount={members.length}
        missingCount={membersMissingTwoFactor.length}
        onChange={setMemberSecurityFilter}
      />
      {canInvite ? (
        <form
          onSubmit={onInvite}
          className="flex flex-wrap items-center gap-2 border-b border-border-subtle pb-3 pt-3"
        >
          <Input
            type="email"
            required
            placeholder="alice@example.com"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            disabled={inviteSubmitting}
            className="h-8 min-w-0 flex-1 basis-[220px]"
          />
          <RoleSelect
            value={inviteRole}
            roles={roles}
            disabled={inviteSubmitting}
            currentRole={currentRole}
            onChange={setInviteRole}
          />
          <Button type="submit" size="sm" disabled={!inviteEmail.trim() || inviteSubmitting}>
            {inviteSubmitting ? "Sending…" : "Send invite"}
          </Button>
        </form>
      ) : null}
      <MembersList
        loading={loading}
        members={visibleMembers}
        emptyText={
          memberSecurityFilter === "missing2fa"
            ? "Every member has two-factor authentication enabled."
            : "No members yet."
        }
        roles={roles}
        currentRole={currentRole}
        currentUserEmail={currentUserEmail}
        canAssignRole={canAssignRole}
        canRemove={canRemove}
        canResetTwoFactor={canResetMemberTwoFactor}
        onChangeRole={onChangeMemberRole}
        onRemove={onRemoveMember}
        onResetTwoFactor={onResetMemberTwoFactor}
      />

      {invitations.length > 0 ? (
        <>
          <SectionEyebrow label="Pending" count={invitations.length} className="mt-8" />
          <ul className="flex flex-col">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="group flex items-center gap-3 border-b border-border-subtle/60 px-2 py-2.5 last:border-b-0 hover:bg-surface/50"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full border border-border-subtle text-fg-faint">
                  <AtIcon size={11} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[13px] text-fg">{invitation.email}</p>
                  <p className="m-0 mt-0.5 truncate text-[11px] text-fg-faint">
                    {roleByKey.get(invitation.role)?.name ?? invitation.role} · invited{" "}
                    {formatRelative(invitation.createdAt)} · expires{" "}
                    {formatRelative(invitation.expiresAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onResend(invitation.id)}
                  className="rounded px-1.5 py-1 text-[11px] text-fg-muted opacity-0 transition-colors hover:text-fg group-hover:opacity-100 focus-visible:opacity-100"
                >
                  Resend
                </button>
                <button
                  type="button"
                  onClick={() => onRevoke(invitation.id, invitation.email)}
                  className="rounded px-1.5 py-1 text-[11px] text-fg-muted opacity-0 transition-colors hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <RoleManager
        roles={roles}
        setRoles={setRoles}
        permissions={permissions}
        canManageRoles={canManageRoles}
      />
    </div>
  );
}

function MemberSecurityFilterBar({
  active,
  totalCount,
  missingCount,
  onChange,
}: {
  active: "all" | "missing2fa";
  totalCount: number;
  missingCount: number;
  onChange: (filter: "all" | "missing2fa") => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface/35 px-2 py-2">
      <p className="m-0 text-[11.5px] text-fg-muted">
        {missingCount === 0
          ? "All current members are 2FA-ready."
          : `${missingCount} member${missingCount === 1 ? "" : "s"} missing 2FA.`}
      </p>
      <div className="inline-flex rounded-md border border-border-subtle bg-bg p-0.5">
        <MemberFilterButton active={active === "all"} onClick={() => onChange("all")}>
          All {totalCount}
        </MemberFilterButton>
        <MemberFilterButton
          active={active === "missing2fa"}
          onClick={() => onChange("missing2fa")}
        >
          Missing 2FA {missingCount}
        </MemberFilterButton>
      </div>
    </div>
  );
}

function MemberFilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-6 rounded px-2 text-[11px] transition-colors",
        active ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function SectionEyebrow({
  label,
  count,
  className,
}: {
  label: string;
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("mb-2 flex items-baseline gap-2", className)}>
      <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-faint">
        {label}
      </span>
      {typeof count === "number" ? (
        <span className="font-mono text-[10.5px] tabular-nums text-fg-faint">{count}</span>
      ) : null}
    </div>
  );
}

function MembersList({
  loading,
  members,
  emptyText,
  roles,
  currentRole,
  currentUserEmail,
  canAssignRole,
  canRemove,
  canResetTwoFactor,
  onChangeRole,
  onRemove,
  onResetTwoFactor,
}: {
  loading: boolean;
  members: Member[];
  emptyText: string;
  roles: Role[];
  currentRole: string | null;
  currentUserEmail: string | null;
  canAssignRole: boolean;
  canRemove: boolean;
  canResetTwoFactor: boolean;
  onChangeRole: (member: Member, role: string) => void;
  onRemove: (member: Member) => void;
  onResetTwoFactor: (member: Member) => void;
}) {
  const roleByKey = useMemo(() => new Map(roles.map((role) => [role.key, role])), [roles]);
  if (loading) {
    return (
      <ul aria-hidden className="flex flex-col">
        {Array.from({ length: 3 }).map((_, index) => (
          <li
            key={index}
            className="flex items-center gap-3 border-b border-border-subtle/60 px-2 py-2.5 last:border-b-0"
          >
            <Skeleton className="size-7 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-7 w-24" />
          </li>
        ))}
      </ul>
    );
  }
  if (members.length === 0)
    return <p className="px-2 py-3 text-[12px] text-fg-faint">{emptyText}</p>;
  return (
    <ul className="flex flex-col">
      {members.map((member) => {
        const isSelf = currentUserEmail === member.email;
        const isPrivileged = isPrivilegedRole(member.role);
        const canTouchPrivileged = currentRole === "owner";
        const canEditThisRole = canAssignRole && (!isPrivileged || canTouchPrivileged);
        const canRemoveThis = canRemove && !isSelf && (!isPrivileged || canTouchPrivileged);
        const canResetThisTwoFactor = canResetTwoFactor && !isSelf && member.twoFactorEnabled;
        return (
          <li
            key={member.id}
            className="group flex items-center gap-3 border-b border-border-subtle/60 px-2 py-2.5 last:border-b-0 hover:bg-surface/50"
          >
            <Avatar name={member.name} image={member.image} />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[13px] text-fg">
                {member.name}
                {isSelf ? <span className="ml-1.5 text-fg-faint">(you)</span> : null}
              </p>
              <p className="m-0 mt-0.5 truncate text-[11px] text-fg-muted">{member.email}</p>
            </div>
            <TwoFactorBadge enabled={member.twoFactorEnabled} />
            {canEditThisRole ? (
              <RoleSelect
                value={member.role}
                roles={roles}
                currentRole={currentRole}
                onChange={(role) => onChangeRole(member, role)}
              />
            ) : (
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-fg-faint">
                {roleByKey.get(member.role)?.name ?? member.role}
              </span>
            )}
            {canRemoveThis || canResetThisTwoFactor ? (
              <MemberRowMenu
                canResetTwoFactor={canResetThisTwoFactor}
                canRemove={canRemoveThis}
                onResetTwoFactor={() => onResetTwoFactor(member)}
                onRemove={() => onRemove(member)}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function TwoFactorBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={cn(
        "hidden shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] sm:inline-flex",
        enabled
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
          : "border-amber-500/20 bg-amber-500/10 text-amber-700",
      )}
    >
      {enabled ? "2FA on" : "2FA off"}
    </span>
  );
}

function MemberRowMenu({
  canResetTwoFactor,
  canRemove,
  onResetTwoFactor,
  onRemove,
}: {
  canResetTwoFactor: boolean;
  canRemove: boolean;
  onResetTwoFactor: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Member actions"
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-md text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
            open
              ? "bg-surface-2 text-fg opacity-100"
              : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          <DotsIcon size={13} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        className="w-44 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl"
      >
        {canResetTwoFactor ? (
          <RowMenuItem
            onClick={() => {
              setOpen(false);
              onResetTwoFactor();
            }}
          >
            Reset 2FA
          </RowMenuItem>
        ) : null}
        {canRemove ? (
          <RowMenuItem
            danger
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
          >
            Remove member
          </RowMenuItem>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function RowMenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-8 w-full items-center px-2.5 text-left text-[12.5px] transition-colors hover:bg-surface-2",
        danger ? "text-danger" : "text-fg",
      )}
      onClick={onClick}
    >
      {children}
    </button>
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
    <section className="mt-8">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-faint">
          Roles
        </span>
        <span className="font-mono text-[10.5px] tabular-nums text-fg-faint">{roles.length}</span>
      </div>
      <ul className="flex flex-col">
        {roles.map((role) => (
          <li
            key={role.id}
            className="group flex items-center gap-3 border-b border-border-subtle/60 px-2 py-2.5 last:border-b-0 hover:bg-surface/50"
          >
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[13px] text-fg">{role.name}</p>
              <p className="m-0 mt-0.5 truncate font-mono text-[11px] text-fg-faint">
                {role.isSystem
                  ? "system role"
                  : `${role.permissions.length} permission${role.permissions.length === 1 ? "" : "s"}`}
              </p>
            </div>
            {!role.isSystem && canManageRoles ? (
              <RoleRowMenu onEdit={() => editRole(role)} onArchive={() => void archiveRole(role)} />
            ) : null}
          </li>
        ))}
      </ul>
      {customRoles.length === 0 ? (
        <p className="px-2 py-2 text-[12px] text-fg-faint">No custom roles yet.</p>
      ) : null}

      {canManageRoles ? (
        <form onSubmit={saveRole} className="mt-4 border-t border-border-subtle pt-4">
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
          <div className="mt-3 grid gap-px sm:grid-cols-2">
            {permissions.map((permission) => (
              <label
                key={permission.key}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-fg-muted hover:bg-surface/50"
              >
                <input
                  type="checkbox"
                  checked={selectedPermissions.includes(permission.key)}
                  onChange={() => togglePermission(permission.key)}
                  className="h-3.5 w-3.5 accent-fg"
                />
                <span className="min-w-0 flex-1 truncate text-fg">{permission.label}</span>
                <span className="font-mono text-[10px] text-fg-faint">{permission.group}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            {editingId ? (
              <button
                type="button"
                onClick={reset}
                className="rounded-md px-2 py-1 text-[12px] text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                Cancel
              </button>
            ) : null}
            <Button type="submit" size="sm" disabled={saving || !name.trim()}>
              {saving ? "Saving…" : editingId ? "Save role" : "Create role"}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function RoleRowMenu({ onEdit, onArchive }: { onEdit: () => void; onArchive: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Role actions"
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-md text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
            open
              ? "bg-surface-2 text-fg opacity-100"
              : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          <DotsIcon size={13} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        className="w-40 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl"
      >
        <RowMenuItem
          onClick={() => {
            setOpen(false);
            onEdit();
          }}
        >
          Edit
        </RowMenuItem>
        <div className="my-1 h-px bg-border-subtle" />
        <RowMenuItem
          danger
          onClick={() => {
            setOpen(false);
            onArchive();
          }}
        >
          Archive
        </RowMenuItem>
      </PopoverContent>
    </Popover>
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
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-7 w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {roles.map((role) => (
          <SelectItem
            key={role.key}
            value={role.key}
            disabled={isPrivilegedRole(role.key) && currentRole !== "owner"}
          >
            {role.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function isPrivilegedRole(role: string) {
  return role === "owner" || role === "admin";
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
