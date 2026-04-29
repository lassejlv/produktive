import { type Dispatch, type FormEvent, type SetStateAction, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/issue/avatar";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type Invitation,
  type Member,
  createInvitation,
  resendInvitation,
  revokeInvitation,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export function MembersSettings({
  loading,
  members,
  invitations,
  setInvitations,
}: {
  loading: boolean;
  members: Member[];
  invitations: Invitation[];
  setInvitations: Dispatch<SetStateAction<Invitation[]>>;
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  const onInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inviteSubmitting) return;
    const email = inviteEmail.trim();
    if (!email) return;
    setInviteSubmitting(true);
    try {
      const invitation = await createInvitation(email);
      setInvitations((current) => [invitation, ...current]);
      setInviteEmail("");
      toast.success(`Invite sent to ${invitation.email}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send invite",
      );
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
          toast.error(
            error instanceof Error ? error.message : "Failed to revoke",
          );
        }
      },
    });
  };

  const onResend = async (invitationId: string) => {
    try {
      const updated = await resendInvitation(invitationId);
      setInvitations((current) =>
        current.map((inv) => (inv.id === updated.id ? updated : inv)),
      );
      toast.success(`Invitation resent to ${updated.email}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to resend",
      );
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {dialog}
      <section>
        <h3 className="m-0 text-[13px] font-medium text-fg">
          Invite a teammate
        </h3>
        <form onSubmit={onInvite} className="mt-3 flex gap-2">
          <Input
            type="email"
            required
            placeholder="alice@example.com"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            disabled={inviteSubmitting}
            className="flex-1"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!inviteEmail.trim() || inviteSubmitting}
          >
            {inviteSubmitting ? "Sending…" : "Send invite"}
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
                  index !== invitations.length - 1 &&
                    "border-b border-border-subtle",
                )}
              >
                <span className="grid size-6 place-items-center rounded-full border border-dashed border-border text-[10px] text-fg-faint">
                  ?
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-fg">{invitation.email}</div>
                  <div className="truncate text-[11px] text-fg-faint">
                    Invited {formatRelative(invitation.createdAt)}
                    {invitation.invitedByName ? (
                      <> by {invitation.invitedByName}</>
                    ) : null}{" "}
                    · expires {formatRelative(invitation.expiresAt)}
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
          <span className="ml-2 text-[11px] tabular-nums text-fg-faint">
            {members.length}
          </span>
        </h3>
        {loading ? (
          <ul
            aria-hidden
            className="mt-3 overflow-hidden rounded-md border border-border-subtle"
          >
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
                <Skeleton className="h-4 w-12" />
              </li>
            ))}
          </ul>
        ) : members.length === 0 ? (
          <p className="mt-3 text-[12px] text-fg-faint">No members yet.</p>
        ) : (
          <ul className="mt-3 overflow-hidden rounded-md border border-border-subtle">
            {members.map((member, index) => (
              <li
                key={member.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 text-[13px]",
                  index !== members.length - 1 &&
                    "border-b border-border-subtle",
                )}
              >
                <Avatar name={member.name} image={member.image} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-fg">{member.name}</div>
                  <div className="truncate text-[11px] text-fg-muted">
                    {member.email}
                  </div>
                </div>
                {member.role === "owner" ? (
                  <span className="rounded-full border border-border-subtle bg-bg px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-fg-muted">
                    Owner
                  </span>
                ) : (
                  <span className="text-[11px] text-fg-faint">Member</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
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
